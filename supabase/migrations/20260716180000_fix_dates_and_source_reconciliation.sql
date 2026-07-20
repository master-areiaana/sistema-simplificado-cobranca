-- Corrige a tipagem das datas na aplicação atômica e adiciona uma forma
-- compacta, auditável e transacional de reconciliar uma origem inteira.
--
-- A trava normal de cobertura mínima (70%) continua existindo no frontend.
-- A reconciliação integral é uma exceção explícita, confirmada pelo usuário,
-- revalidada no banco e limitada a registros ERP com chave oficial completa,
-- única e da mesma origem do arquivo.

begin;

create table if not exists public.title_import_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  import_file text,
  import_source text not null,
  title_id text not null,
  previous_active boolean,
  previous_current_status text,
  previous_current_motive text,
  previous_workflow_status text,
  previous_updated_by text,
  created_at timestamptz not null default now()
);

create index if not exists title_import_reconciliation_audit_title_idx
  on public.title_import_reconciliation_audit (title_id, created_at desc);

alter table public.title_import_reconciliation_audit enable row level security;

drop policy if exists "anon read title reconciliation audit" on public.title_import_reconciliation_audit;
create policy "anon read title reconciliation audit"
  on public.title_import_reconciliation_audit for select to anon, authenticated using (true);

drop policy if exists "anon insert title reconciliation audit" on public.title_import_reconciliation_audit;
create policy "anon insert title reconciliation audit"
  on public.title_import_reconciliation_audit for insert to anon, authenticated with check (true);

grant select, insert on public.title_import_reconciliation_audit to anon, authenticated;

create or replace function public.apply_import_plan_v2(
  p_import_source text,
  p_import_file text,
  p_creates jsonb default '[]'::jsonb,
  p_updates jsonb default '[]'::jsonb,
  p_absences jsonb default '[]'::jsonb,
  p_expected_counts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source text;
  v_item jsonb;
  v_payload jsonb;
  v_id text;
  v_target_source text;
  v_created integer := 0;
  v_updated integer := 0;
  v_lowered integer := 0;
  v_expected_created integer := coalesce((p_expected_counts->>'created')::integer, jsonb_array_length(coalesce(p_creates, '[]'::jsonb)));
  v_expected_updated integer := coalesce((p_expected_counts->>'updated')::integer, jsonb_array_length(coalesce(p_updates, '[]'::jsonb)));
  v_expected_lowered integer := coalesce((p_expected_counts->>'lowered')::integer, jsonb_array_length(coalesce(p_absences, '[]'::jsonb)));
  v_expected_imported integer := coalesce((p_expected_counts->>'imported')::integer, v_expected_created + v_expected_updated);
  v_reconciliation boolean := false;
  v_reconciliation_item jsonb;
  v_received_imported integer := 0;
begin
  v_source := case upper(trim(coalesce(p_import_source, '')))
    when 'FINR1253' then 'FINR1253'
    when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
    when 'RPT_7007_CONS_CAR_EB' then 'RPT_7007_CONS_CAR_EB'
    else null
  end;

  if v_source is null then
    raise exception 'Origem de importação inválida: %', p_import_source;
  end if;

  if jsonb_typeof(coalesce(p_creates, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_absences, '[]'::jsonb)) <> 'array' then
    raise exception 'Plano inválido: creates, updates e absences precisam ser arrays.';
  end if;

  v_reconciliation := jsonb_array_length(coalesce(p_absences, '[]'::jsonb)) = 1
    and coalesce(p_absences->0->>'mode', '') = 'source-reconciliation';

  if jsonb_array_length(coalesce(p_creates, '[]'::jsonb)) <> v_expected_created
    or jsonb_array_length(coalesce(p_updates, '[]'::jsonb)) <> v_expected_updated
    or (not v_reconciliation and jsonb_array_length(coalesce(p_absences, '[]'::jsonb)) <> v_expected_lowered) then
    raise exception 'Contagens do plano não conferem com os itens recebidos.';
  end if;

  for v_payload in select value from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb))
  loop
    if (case upper(trim(coalesce(v_payload->>'source', '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_payload->>'source', '')))
    end) <> v_source then
      raise exception 'Criação com origem diferente do relatório: %', v_payload->>'source';
    end if;

    insert into public.titles (
      id, source, client_code, client_name, doc_type, serie, title_number, seq,
      nf_servico, issue_date, due_date, original_value, received_value,
      open_value, erp_balance, recebido_parcial, calculado, current_value,
      portador, active, import_file,
      current_status, current_motive, current_contact_type, client_category,
      promise_date, last_contact_date, last_note, contact_count,
      protest_requested_by, workflow_status, updated_by
    ) values (
      coalesce(nullif(v_payload->>'id', ''), gen_random_uuid()::text),
      v_source,
      nullif(v_payload->>'client_code', ''),
      coalesce(v_payload->>'client_name', ''),
      nullif(v_payload->>'doc_type', ''),
      nullif(v_payload->>'serie', ''),
      coalesce(v_payload->>'title_number', ''),
      nullif(v_payload->>'seq', ''),
      nullif(v_payload->>'nf_servico', ''),
      nullif(v_payload->>'issue_date', '')::date,
      nullif(v_payload->>'due_date', '')::date,
      coalesce((v_payload->>'original_value')::numeric, 0),
      coalesce((v_payload->>'received_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      coalesce((v_payload->>'erp_balance')::numeric, 0),
      coalesce((v_payload->>'received_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      nullif(v_payload->>'portador', ''),
      coalesce((v_payload->>'active')::boolean, true),
      coalesce(nullif(v_payload->>'import_file', ''), p_import_file),
      coalesce(nullif(v_payload->>'current_status', ''), 'Não Contatado'),
      nullif(v_payload->>'current_motive', ''),
      nullif(v_payload->>'current_contact_type', ''),
      nullif(v_payload->>'client_category', ''),
      nullif(v_payload->>'promise_date', '')::date,
      nullif(v_payload->>'last_contact_date', '')::date,
      nullif(v_payload->>'last_note', ''),
      coalesce((v_payload->>'contact_count')::integer, 0),
      nullif(v_payload->>'protest_requested_by', ''),
      coalesce(nullif(v_payload->>'workflow_status', ''), 'normal'),
      'Importação Consolidada'
    )
    on conflict (source, client_code, doc_type, title_number, seq, due_date)
    do update set
      client_name = excluded.client_name,
      serie = excluded.serie,
      nf_servico = excluded.nf_servico,
      issue_date = excluded.issue_date,
      original_value = excluded.original_value,
      received_value = excluded.received_value,
      open_value = excluded.open_value,
      erp_balance = excluded.erp_balance,
      recebido_parcial = excluded.recebido_parcial,
      calculado = excluded.calculado,
      current_value = excluded.current_value,
      portador = excluded.portador,
      active = excluded.active,
      import_file = excluded.import_file,
      current_status = case when titles.workflow_status = 'baixado_importacao' then 'Não Contatado' else titles.current_status end,
      current_motive = case when titles.workflow_status = 'baixado_importacao' then null else titles.current_motive end,
      workflow_status = case when titles.workflow_status = 'baixado_importacao' then 'normal' else titles.workflow_status end,
      updated_by = 'Importação Consolidada';

    v_created := v_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    v_payload := coalesce(v_item->'payload', '{}'::jsonb);

    select source into v_target_source from public.titles where id = v_id for update;
    if not found then raise exception 'Título a atualizar não existe: %', v_id; end if;
    if (case upper(trim(coalesce(v_target_source, '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_target_source, '')))
    end) <> v_source then
      raise exception 'Atualização cruzada entre origens bloqueada para o título %', v_id;
    end if;

    update public.titles set
      client_code = case when v_payload ? 'client_code' then nullif(v_payload->>'client_code', '') else client_code end,
      client_name = case when v_payload ? 'client_name' then coalesce(v_payload->>'client_name', '') else client_name end,
      doc_type = case when v_payload ? 'doc_type' then nullif(v_payload->>'doc_type', '') else doc_type end,
      serie = case when v_payload ? 'serie' then nullif(v_payload->>'serie', '') else serie end,
      title_number = case when v_payload ? 'title_number' then coalesce(v_payload->>'title_number', '') else title_number end,
      seq = case when v_payload ? 'seq' then nullif(v_payload->>'seq', '') else seq end,
      nf_servico = case when v_payload ? 'nf_servico' then nullif(v_payload->>'nf_servico', '') else nf_servico end,
      issue_date = case when v_payload ? 'issue_date' then nullif(v_payload->>'issue_date', '')::date else issue_date end,
      due_date = case when v_payload ? 'due_date' then nullif(v_payload->>'due_date', '')::date else due_date end,
      original_value = case when v_payload ? 'original_value' then coalesce((v_payload->>'original_value')::numeric, 0) else original_value end,
      received_value = case when v_payload ? 'received_value' then coalesce((v_payload->>'received_value')::numeric, 0) else received_value end,
      open_value = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else open_value end,
      erp_balance = case when v_payload ? 'erp_balance' then coalesce((v_payload->>'erp_balance')::numeric, 0) else erp_balance end,
      recebido_parcial = case when v_payload ? 'received_value' then coalesce((v_payload->>'received_value')::numeric, 0) else recebido_parcial end,
      calculado = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else calculado end,
      current_value = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else current_value end,
      portador = case when v_payload ? 'portador' then nullif(v_payload->>'portador', '') else portador end,
      active = case when v_payload ? 'active' then coalesce((v_payload->>'active')::boolean, active) else active end,
      import_file = coalesce(nullif(v_payload->>'import_file', ''), p_import_file, import_file),
      current_status = case when v_payload ? 'current_status' then nullif(v_payload->>'current_status', '') else current_status end,
      current_motive = case when v_payload ? 'current_motive' then nullif(v_payload->>'current_motive', '') else current_motive end,
      workflow_status = case when v_payload ? 'workflow_status' then nullif(v_payload->>'workflow_status', '') else workflow_status end,
      updated_by = 'Importação Consolidada'
    where id = v_id;

    v_updated := v_updated + 1;
  end loop;

  if v_reconciliation then
    v_reconciliation_item := p_absences->0;
    if (case upper(trim(coalesce(v_reconciliation_item->>'source', '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_reconciliation_item->>'source', '')))
    end) <> v_source then
      raise exception 'Reconciliação cruzada entre origens bloqueada.';
    end if;
    if coalesce((v_reconciliation_item->>'expected_absences')::integer, -1) <> v_expected_lowered then
      raise exception 'Quantidade esperada de ausências da reconciliação não confere.';
    end if;
    if coalesce((v_reconciliation_item->>'expected_imported_count')::integer, -1) <> v_expected_imported then
      raise exception 'Quantidade importada da reconciliação não confere.';
    end if;
    if jsonb_typeof(coalesce(v_reconciliation_item->'imported_keys', 'null'::jsonb)) <> 'array' then
      raise exception 'Reconciliação sem lista válida de chaves importadas.';
    end if;

    create temporary table tmp_imported_keys (
      source text not null,
      client_code text not null,
      doc_type text not null,
      title_number text not null,
      seq text not null,
      due_date date not null,
      primary key (source, client_code, doc_type, title_number, seq, due_date)
    ) on commit drop;

    insert into tmp_imported_keys (source, client_code, doc_type, title_number, seq, due_date)
    select
      case upper(trim(coalesce(value->>'source', '')))
        when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
        else upper(trim(coalesce(value->>'source', '')))
      end,
      upper(trim(value->>'client_code')),
      upper(trim(value->>'doc_type')),
      upper(trim(value->>'title_number')),
      upper(trim(value->>'seq')),
      nullif(value->>'due_date', '')::date
    from jsonb_array_elements(v_reconciliation_item->'imported_keys');

    get diagnostics v_received_imported = row_count;
    if v_received_imported <> v_expected_imported then
      raise exception 'Chaves importadas divergentes: recebido %, esperado %', v_received_imported, v_expected_imported;
    end if;
    if exists (select 1 from tmp_imported_keys where source <> v_source) then
      raise exception 'A reconciliação contém chave de outra origem.';
    end if;

    create temporary table tmp_reconciliation_targets (
      id text primary key
    ) on commit drop;

    insert into tmp_reconciliation_targets (id)
    select t.id
    from public.titles t
    where t.active is not false
      and coalesce(upper(trim(t.record_origin)), 'ERP') <> 'MANUAL'
      and (case upper(trim(coalesce(t.source, '')))
        when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
        else upper(trim(coalesce(t.source, '')))
      end) = v_source
      and nullif(trim(coalesce(t.client_code, '')), '') is not null
      and nullif(trim(coalesce(t.doc_type, '')), '') is not null
      and nullif(trim(coalesce(t.title_number, '')), '') is not null
      and nullif(trim(coalesce(t.seq, '')), '') is not null
      and t.due_date is not null
      and not exists (
        select 1 from tmp_imported_keys k
        where k.source = v_source
          and k.client_code = upper(trim(t.client_code))
          and k.doc_type = upper(trim(t.doc_type))
          and k.title_number = upper(trim(t.title_number))
          and k.seq = upper(trim(t.seq))
          and k.due_date = t.due_date
      )
      and 1 = (
        select count(*)
        from public.titles d
        where (case upper(trim(coalesce(d.source, '')))
          when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
          else upper(trim(coalesce(d.source, '')))
        end) = v_source
          and upper(trim(coalesce(d.client_code, ''))) = upper(trim(t.client_code))
          and upper(trim(coalesce(d.doc_type, ''))) = upper(trim(t.doc_type))
          and upper(trim(coalesce(d.title_number, ''))) = upper(trim(t.title_number))
          and upper(trim(coalesce(d.seq, ''))) = upper(trim(t.seq))
          and d.due_date = t.due_date
      );

    select count(*) into v_lowered from tmp_reconciliation_targets;
    if v_lowered <> v_expected_lowered then
      raise exception 'A carteira mudou durante a reconciliação: % baixas candidatas no banco, % esperadas. Gere uma nova prévia.', v_lowered, v_expected_lowered;
    end if;

    insert into public.title_import_reconciliation_audit (
      import_file, import_source, title_id, previous_active,
      previous_current_status, previous_current_motive,
      previous_workflow_status, previous_updated_by
    )
    select
      p_import_file, v_source, t.id, t.active,
      t.current_status, t.current_motive, t.workflow_status, t.updated_by
    from public.titles t
    join tmp_reconciliation_targets r on r.id = t.id;

    update public.titles t set
      active = false,
      current_status = 'Baixado',
      workflow_status = 'baixado_importacao',
      current_motive = 'Não consta na nova carteira importada',
      updated_by = 'Reconciliação de Importação'
    from tmp_reconciliation_targets r
    where t.id = r.id;

    insert into public.charge_events (
      title_id, client_code, client_name, event_type, event_subtype,
      event_date, status, motive, note, event_user
    )
    select
      t.id, t.client_code, t.client_name, 'IMPORTACAO', 'BAIXA_AUSENCIA',
      current_date, 'Baixado', 'Não consta na nova carteira importada',
      concat('Reconciliação integral auditável do arquivo ', coalesce(p_import_file, 'sem nome')),
      'Reconciliação de Importação'
    from public.titles t
    join tmp_reconciliation_targets r on r.id = t.id;
  else
    for v_item in select value from jsonb_array_elements(coalesce(p_absences, '[]'::jsonb))
    loop
      v_id := v_item->>'id';
      select source into v_target_source from public.titles where id = v_id for update;
      if not found then raise exception 'Título ausente não existe: %', v_id; end if;
      if (case upper(trim(coalesce(v_target_source, '')))
        when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
        else upper(trim(coalesce(v_target_source, '')))
      end) <> v_source then
        raise exception 'Baixa cruzada entre origens bloqueada para o título %', v_id;
      end if;

      update public.titles set
        active = false,
        current_status = 'Baixado',
        workflow_status = 'baixado_importacao',
        current_motive = 'Não consta na nova carteira importada',
        updated_by = 'Importação Consolidada'
      where id = v_id;

      insert into public.charge_events (
        title_id, client_code, client_name, event_type, event_subtype,
        event_date, status, motive, note, event_user
      )
      select
        id, client_code, client_name, 'IMPORTACAO', 'BAIXA_AUSENCIA',
        current_date, 'Baixado', 'Não consta na nova carteira importada',
        concat('Baixa automática segura do arquivo ', coalesce(p_import_file, 'sem nome')),
        'Importação Consolidada'
      from public.titles where id = v_id;

      v_lowered := v_lowered + 1;
    end loop;
  end if;

  if v_created <> v_expected_created or v_updated <> v_expected_updated or v_lowered <> v_expected_lowered then
    raise exception 'Resultado divergente do plano: criados %, atualizados %, baixados %', v_created, v_updated, v_lowered;
  end if;

  insert into public.import_logs (
    file_name, source, total_read, inserted_count, updated_count, deactivated_count
  ) values (
    p_import_file, v_source, v_expected_imported, v_created, v_updated, v_lowered
  );

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'lowered', v_lowered,
    'source', v_source,
    'atomic', true,
    'reconciliation', v_reconciliation
  );
end;
$$;

grant execute on function public.apply_import_plan_v2(text, text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

commit;
