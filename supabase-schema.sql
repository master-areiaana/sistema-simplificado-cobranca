-- =====================================================================
-- SISTEMA DE COBRANÇA — SCHEMA DO SUPABASE
-- ---------------------------------------------------------------------
-- Como usar:
--   1. No painel do Supabase: SQL Editor -> New query
--   2. Cole TODO este arquivo e clique em "Run".
--   3. Pronto. As tabelas, a chave única e as permissões são criadas.
--
-- Requer Postgres 15+ (padrão no Supabase) por causa de NULLS NOT DISTINCT.
-- =====================================================================

-- ============================ TABELA: titles =========================
-- Nome preservado para compatibilidade com o banco Supabase existente.
create table if not exists public.titles (
  id                       text primary key default gen_random_uuid()::text,

  -- Origem do relatório (imutável após criação)
  source                   text,          -- 'FINR1253' | 'RPT_7007_CONS_CAR_EB'

  -- Identificação do cliente
  client_code              text,
  client_name              text,
  client_group_key         text,
  primary_client_code      text,
  erp_client_codes         text[],
  record_origin            text default 'ERP',   -- 'ERP' | 'Manual'
  client_category          text,

  -- Identificação do título (compõem a chave oficial)
  doc_type                 text,
  serie                    text,
  title_number             text,
  seq                      text,
  nf_servico               text,

  -- Datas (o cliente envia ISO YYYY-MM-DD)
  issue_date               date,
  due_date                 date,

  -- Valores
  original_value           numeric default 0,
  received_value           numeric default 0,
  open_value               numeric default 0,
  erp_balance              numeric default 0,
  partial_payment_detected boolean default false,
  -- Colunas legadas mantidas sincronizadas para compatibilidade
  acrescimo                numeric default 0,
  recebido_parcial         numeric default 0,
  calculado                numeric default 0,
  current_value            numeric default 0,
  atraso_dias_importado    integer default 0,

  portador                 text,
  active                   boolean default true,
  import_file              text,
  import_batch_id          text,

  -- Campos de cobrança (preenchidos manualmente / pelo fluxo)
  current_status           text default 'Não Contatado',
  current_motive           text,
  current_contact_type     text,
  promise_date             date,
  last_contact_date        date,
  last_note                text,
  action_to_do             text,
  contact_count            integer default 0,
  protest_requested_by     text,
  workflow_status          text default 'normal',

  -- Perdas
  loss_status              boolean default false,
  loss_date                date,
  loss_reason              text,

  updated_by               text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ***** A CHAVE QUE MATA OS DUPLICADOS *****
-- Um título é único pela combinação origem + cliente + tipo + número +
-- sequência + vencimento. NULLS NOT DISTINCT faz campos vazios (null)
-- contarem como iguais, evitando duplicatas quando seq/vencimento faltam.
create unique index if not exists titles_chave_oficial
  on public.titles (source, client_code, doc_type, title_number, seq, due_date)
  nulls not distinct;

-- Índices de apoio para as telas
create index if not exists titles_active_idx        on public.titles (active);
create index if not exists titles_workflow_idx      on public.titles (workflow_status);
create index if not exists titles_client_name_idx   on public.titles (client_name);
create index if not exists titles_updated_at_idx    on public.titles (updated_at desc);

-- ======================= TABELA: charge_events =======================
create table if not exists public.charge_events (
  id                    uuid primary key default gen_random_uuid(),
  title_id              text not null references public.titles(id) on delete cascade,
  client_code           text,
  client_name           text,
  event_type            text,
  event_subtype         text,
  event_date            date,
  status                text,
  motive                text,
  contact_type          text,
  promise_date          date,
  note                  text,
  protest_requested_by  text,
  event_user            text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index if not exists charge_events_title_idx on public.charge_events (title_id);
create index if not exists charge_events_date_idx  on public.charge_events (created_at desc);

-- ========================= TABELA: import_logs =======================
create table if not exists public.import_logs (
  id                 uuid primary key default gen_random_uuid(),
  file_name          text,
  source             text,
  total_read         numeric,
  inserted_count     numeric,
  updated_count      numeric,
  deactivated_count  numeric,
  imported_at        timestamptz default now()
);

-- ============ Trigger: manter updated_at sempre atualizado =============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_titles_updated_at on public.titles;
create trigger trg_titles_updated_at before update on public.titles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_charge_events_updated_at on public.charge_events;
create trigger trg_charge_events_updated_at before update on public.charge_events
  for each row execute function public.set_updated_at();

-- =====================================================================
-- PERMISSÕES (RLS)
-- ---------------------------------------------------------------------
-- Modo abaixo = ABERTO (qualquer um com a URL do app e a anon key pode
-- ler/gravar). É o que faz o sistema FUNCIONAR de imediato para uma
-- ferramenta interna. Simples e sem quebra.
--
-- ⚠️  ATENÇÃO DE SEGURANÇA: a anon key vai no navegador. Se o endereço do
-- app for público, os dados ficam acessíveis. Para uma empresa, o ideal
-- é ativar login (Supabase Auth) e trocar as políticas pelo "MODO SEGURO"
-- comentado no final. Enquanto isso, mantenha a URL do app restrita.
-- =====================================================================
alter table public.titles        enable row level security;
alter table public.charge_events enable row level security;
alter table public.import_logs   enable row level security;

-- MODO ABERTO (padrão) --------------------------------------------------
drop policy if exists titles_open        on public.titles;
drop policy if exists charge_events_open on public.charge_events;
drop policy if exists import_logs_open   on public.import_logs;

create policy titles_open        on public.titles
  for all to anon, authenticated using (true) with check (true);
create policy charge_events_open on public.charge_events
  for all to anon, authenticated using (true) with check (true);
create policy import_logs_open   on public.import_logs
  for all to anon, authenticated using (true) with check (true);

-- MODO SEGURO (quando ativar login Supabase Auth) -----------------------
-- Descomente e rode para exigir usuário autenticado:
--
-- drop policy if exists titles_open        on public.titles;
-- drop policy if exists charge_events_open on public.charge_events;
-- drop policy if exists import_logs_open   on public.import_logs;
--
-- create policy titles_auth        on public.titles
--   for all to authenticated using (true) with check (true);
-- create policy charge_events_auth on public.charge_events
--   for all to authenticated using (true) with check (true);
-- create policy import_logs_auth   on public.import_logs
--   for all to authenticated using (true) with check (true);
