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

-- =========================== TABELA: titulos =========================
create table if not exists public.titulos (
  id                       uuid primary key default gen_random_uuid(),

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

  -- Datas (armazenadas como texto 'YYYY-MM-DD' para casar com o app)
  issue_date               text,
  due_date                 text,

  -- Valores
  original_value           numeric default 0,
  received_value           numeric default 0,
  open_value               numeric default 0,
  erp_balance              numeric default 0,
  partial_payment_detected boolean default false,

  portador                 text,
  active                   boolean default true,
  import_file              text,
  import_batch_id          text,

  -- Campos de cobrança (preenchidos manualmente / pelo fluxo)
  current_status           text default 'Não Contatado',
  current_motive           text,
  current_contact_type     text,
  promise_date             text,
  last_contact_date        text,
  last_note                text,
  action_to_do             text,
  contact_count            integer default 0,
  protest_requested_by     text,
  workflow_status          text default 'normal',

  -- Perdas
  loss_status              boolean default false,
  loss_date                text,
  loss_reason              text,

  updated_by               text,
  created_date             timestamptz default now(),
  updated_date             timestamptz default now()
);

-- ***** A CHAVE QUE MATA OS DUPLICADOS *****
-- Um título é único pela combinação origem + cliente + tipo + número +
-- sequência + vencimento. NULLS NOT DISTINCT faz campos vazios (null)
-- contarem como iguais, evitando duplicatas quando seq/vencimento faltam.
create unique index if not exists titulos_chave_oficial
  on public.titulos (source, client_code, doc_type, title_number, seq, due_date)
  nulls not distinct;

-- Índices de apoio para as telas
create index if not exists titulos_active_idx        on public.titulos (active);
create index if not exists titulos_workflow_idx      on public.titulos (workflow_status);
create index if not exists titulos_client_name_idx   on public.titulos (client_name);
create index if not exists titulos_updated_date_idx  on public.titulos (updated_date desc);

-- ======================= TABELA: charge_events =======================
create table if not exists public.charge_events (
  id                    uuid primary key default gen_random_uuid(),
  titulo_id             text,
  client_code           text,
  client_name           text,
  event_type            text,
  event_subtype         text,
  event_date            text,
  status                text,
  motive                text,
  contact_type          text,
  promise_date          text,
  note                  text,
  protest_requested_by  text,
  event_user            text,
  created_date          timestamptz default now(),
  updated_date          timestamptz default now()
);
create index if not exists charge_events_titulo_idx on public.charge_events (titulo_id);
create index if not exists charge_events_date_idx   on public.charge_events (created_date desc);

-- ========================= TABELA: import_logs =======================
create table if not exists public.import_logs (
  id                 uuid primary key default gen_random_uuid(),
  file_name          text,
  source             text,
  total_read         numeric,
  inserted_count     numeric,
  updated_count      numeric,
  deactivated_count  numeric,
  created_date       timestamptz default now(),
  updated_date       timestamptz default now()
);

-- ============ Trigger: manter updated_date sempre atualizado ==========
create or replace function public.set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists trg_titulos_updated on public.titulos;
create trigger trg_titulos_updated before update on public.titulos
  for each row execute function public.set_updated_date();

drop trigger if exists trg_charge_events_updated on public.charge_events;
create trigger trg_charge_events_updated before update on public.charge_events
  for each row execute function public.set_updated_date();

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
alter table public.titulos       enable row level security;
alter table public.charge_events enable row level security;
alter table public.import_logs   enable row level security;

-- MODO ABERTO (padrão) --------------------------------------------------
drop policy if exists titulos_open       on public.titulos;
drop policy if exists charge_events_open on public.charge_events;
drop policy if exists import_logs_open   on public.import_logs;

create policy titulos_open       on public.titulos
  for all to anon, authenticated using (true) with check (true);
create policy charge_events_open on public.charge_events
  for all to anon, authenticated using (true) with check (true);
create policy import_logs_open   on public.import_logs
  for all to anon, authenticated using (true) with check (true);

-- MODO SEGURO (quando ativar login Supabase Auth) -----------------------
-- Descomente e rode para exigir usuário autenticado:
--
-- drop policy if exists titulos_open       on public.titulos;
-- drop policy if exists charge_events_open on public.charge_events;
-- drop policy if exists import_logs_open   on public.import_logs;
--
-- create policy titulos_auth       on public.titulos
--   for all to authenticated using (true) with check (true);
-- create policy charge_events_auth on public.charge_events
--   for all to authenticated using (true) with check (true);
-- create policy import_logs_auth   on public.import_logs
--   for all to authenticated using (true) with check (true);
