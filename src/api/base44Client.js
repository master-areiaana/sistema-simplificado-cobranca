import { buildOfficialTitleKey } from '../lib/importacao/domain.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { createLocalEntityStorage } from './localEntityStorage.js';

export const CAMPOS_MANUAIS = [
  'current_status', 'current_motive', 'current_contact_type', 'promise_date',
  'last_contact_date', 'last_note', 'action_to_do', 'description', 'contact_count',
  'protest_requested_by', 'workflow_status', 'updated_by', 'client_category',
];

const AUTO_IMPACT_STATUSES = new Set(['pago_importacao', 'sem_carteira']);
const TITLE_CONFLICT_COLUMNS = 'source,client_code,doc_type,title_number,seq,due_date';
const CACHE_WRITE_CHUNK_SIZE = 500;
const localStorageAdapter = createLocalEntityStorage();
const dataModeSubscribers = new Set();
let queue = Promise.resolve();
let cacheQueue = Promise.resolve();
let lastRemoteError = null;

const TABLE_BY_ENTITY = {
  // O projeto Supabase existente usa public.titles. Manter este mapeamento
  // evita criar uma segunda carteira vazia em public.titulos.
  Titulo: 'titles',
  ChargeEvent: 'charge_events',
  ImportLog: 'import_logs',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimitError = (error) => String(error?.message || error || '').toLowerCase().includes('rate limit');
const nowISO = () => new Date().toISOString();
const newRecordId = () => globalThis.crypto?.randomUUID?.() || `record_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

function notifyDataMode() {
  const status = getDataModeStatus();
  for (const callback of dataModeSubscribers) {
    try { callback(status); } catch { /* noop */ }
  }
}

function markRemoteSuccess() {
  if (!lastRemoteError) return;
  lastRemoteError = null;
  notifyDataMode();
}

function markRemoteFailure(error) {
  lastRemoteError = error || new Error('Falha de comunicação com o Supabase.');
  notifyDataMode();
}

export function getDataModeStatus() {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      mode: 'local',
      configured: false,
      remoteAvailable: false,
      message: 'Supabase não configurado. Dados somente neste navegador',
    };
  }
  if (lastRemoteError) {
    return {
      mode: 'cache',
      configured: true,
      remoteAvailable: false,
      message: 'Supabase indisponível. Gravações remotas bloqueadas',
      error: String(lastRemoteError?.message || lastRemoteError),
    };
  }
  return {
    mode: 'supabase',
    configured: true,
    remoteAvailable: true,
    message: 'Modo de dados: Supabase',
  };
}

export function subscribeDataMode(callback) {
  dataModeSubscribers.add(callback);
  return () => dataModeSubscribers.delete(callback);
}

async function executeRemoteWithRetry(fn) {
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const result = await fn();
      markRemoteSuccess();
      return result;
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error)) throw error;
      await sleep(1200 + attempt * 600);
    }
  }
  throw lastError;
}

async function runRemote(fn) {
  const run = () => executeRemoteWithRetry(fn);
  const task = queue.then(run, run);
  queue = task.catch(() => undefined);
  return task;
}

// Leituras independentes podem ocorrer em paralelo. A fila global continua
// exclusiva para gravacoes, preservando a ordem de create/update/importacao.
async function runRemoteRead(fn) {
  return executeRemoteWithRetry(fn);
}

function cacheRemoteRowsInBackground(entityName, rows, operation) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const enqueue = () => {
    cacheQueue = cacheQueue.then(async () => {
      for (let index = 0; index < rows.length; index += CACHE_WRITE_CHUNK_SIZE) {
        await localStorageAdapter.saveMany(
          entityName,
          rows.slice(index, index + CACHE_WRITE_CHUNK_SIZE),
          { notify: false },
        );
        // Entrega o controle ao navegador entre lotes para nao travar a tela.
        await sleep(0);
      }
    }).catch((cacheError) => {
      console.warn(`[dados] cache ${operation} ${entityName}`, cacheError);
    });
  };

  // A renderizacao dos dados remotos tem prioridade sobre a copia de seguranca local.
  if (typeof setTimeout === 'function') setTimeout(enqueue, 0);
  else enqueue();
}

function sameValue(left, right) { return String(left ?? '').trim() === String(right ?? '').trim(); }
function matches(row, criteria = {}) { return Object.entries(criteria || {}).every(([field, expected]) => expected === undefined || sameValue(row?.[field], expected)); }
function sortRows(rows, orderBy = '') {
  if (!orderBy) return [...rows];
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return [...rows].sort((a, b) => {
    const result = String(a?.[field] ?? '').localeCompare(String(b?.[field] ?? ''), 'pt-BR', { numeric: true });
    return desc ? -result : result;
  });
}

function isFinancialImportUpdate(fields = {}) {
  if (!String(fields.updated_by || '').startsWith('Importação')) return false;
  return fields.active === true || 'source' in fields || 'title_number' in fields || 'original_value' in fields || 'open_value' in fields || 'due_date' in fields;
}

function isAutomaticBaixaPayload(fields = {}) {
  return String(fields.updated_by || '') === 'Importação Automática' && String(fields.workflow_status || '') === 'pago_importacao';
}

function isAutomaticCrossPayload(fields = {}) {
  return String(fields.updated_by || '') === 'Cruzamento Automático' && String(fields.workflow_status || '') === 'sem_carteira';
}

function sanitizeTituloUpdate(fields = {}) {
  const next = { ...(fields || {}) };
  if (isAutomaticBaixaPayload(next) || isAutomaticCrossPayload(next)) {
    return { blocked: true, fields: next };
  }
  if (isFinancialImportUpdate(next) && AUTO_IMPACT_STATUSES.has(String(next.workflow_status || ''))) {
    next.workflow_status = 'normal';
    if (String(next.current_status || '') === 'Pago Aguard. Baixa') next.current_status = 'Não Contatado';
    const motivo = String(next.current_motive || '').toLowerCase();
    if (motivo.includes('saiu da carteira') || motivo.includes('sem carteira correspondente')) next.current_motive = null;
    next.updated_by = 'Importação';
  }
  return { blocked: false, fields: next };
}

async function resolveExisting(entityName, id) {
  try {
    const rows = await localStorageAdapter.read(entityName);
    return rows.find((row) => row?.id === id) || { id };
  } catch {
    return { id };
  }
}

function normalizeBulkUpdateItem(item = {}) {
  if (item.payload && item.id) return { id: item.id, fields: item.payload };
  const { id, ...fields } = item;
  return { id, fields };
}

async function applyLocalBulkUpdates(entityName, updates = []) {
  const rows = await localStorageAdapter.read(entityName);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const saved = [];
  for (const raw of updates) {
    const { id, fields: rawFields } = normalizeBulkUpdateItem(raw);
    if (!id) throw new Error(`bulkUpdate ${entityName}: registro sem id.`);
    let fields = rawFields || {};
    if (entityName === 'Titulo') {
      const decision = sanitizeTituloUpdate(fields);
      if (decision.blocked) throw new Error('Atualização automática bloqueada pela proteção da Carteira Geral.');
      fields = decision.fields;
    }
    const previous = byId.get(id) || { id, created_date: nowISO() };
    const next = { ...previous, ...fields, id, updated_date: nowISO() };
    byId.set(id, next);
    saved.push(next);
  }
  await localStorageAdapter.write(entityName, Array.from(byId.values()));
  return saved;
}

function makeLocalEntity(entityName) {
  return {
    async list(orderBy, limit = 1000) {
      const rows = await localStorageAdapter.read(entityName);
      return sortRows(rows, orderBy).slice(0, limit);
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      const rows = await localStorageAdapter.read(entityName);
      return sortRows(rows.filter((row) => matches(row, criteria)), orderBy).slice(0, limit);
    },
    async create(record) { return localStorageAdapter.save(entityName, record); },
    async update(id, fields) {
      if (entityName === 'Titulo') {
        const decision = sanitizeTituloUpdate(fields);
        if (decision.blocked) return resolveExisting(entityName, id);
        return localStorageAdapter.save(entityName, { ...(decision.fields || {}), id });
      }
      return localStorageAdapter.save(entityName, { ...(fields || {}), id });
    },
    async bulkCreate(records = []) { return localStorageAdapter.saveMany(entityName, records); },
    async bulkUpdate(updates = []) { return applyLocalBulkUpdates(entityName, updates); },
    subscribe(callback) { return localStorageAdapter.subscribe(entityName, callback); },
  };
}

function remoteTable(entityName) {
  if (!isSupabaseConfigured()) return null;
  return TABLE_BY_ENTITY[entityName] || null;
}

export function normalizeRemoteRow(entityName, row = {}) {
  if (entityName === 'Titulo') {
    const legacyOpenValue = row.current_value ?? row.calculado;
    return {
      ...row,
      received_value: row.received_value ?? row.recebido_parcial ?? 0,
      open_value: row.open_value ?? legacyOpenValue ?? row.original_value ?? 0,
      erp_balance: row.erp_balance ?? legacyOpenValue ?? row.original_value ?? 0,
      workflow_status: row.workflow_status || (row.active === false ? 'baixado_importacao' : 'normal'),
      created_date: row.created_date ?? row.created_at,
      updated_date: row.updated_date ?? row.updated_at,
    };
  }
  if (entityName === 'ChargeEvent') {
    return {
      ...row,
      titulo_id: row.titulo_id ?? row.title_id,
      created_date: row.created_date ?? row.created_at,
      updated_date: row.updated_date ?? row.updated_at,
    };
  }
  if (entityName === 'ImportLog') {
    return {
      ...row,
      created_date: row.created_date ?? row.imported_at,
      updated_date: row.updated_date ?? row.imported_at,
    };
  }
  return row;
}

export function normalizeRemoteWrite(entityName, record = {}) {
  if (entityName === 'Titulo') {
    const next = { ...record };
    if (Object.prototype.hasOwnProperty.call(next, 'open_value')) {
      next.current_value = next.open_value;
      next.calculado = next.open_value;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'received_value')) {
      next.recebido_parcial = next.received_value;
    }
    return next;
  }
  if (entityName === 'ChargeEvent') {
    const next = { ...record, title_id: record.title_id ?? record.titulo_id };
    delete next.titulo_id;
    return next;
  }
  return { ...record };
}

function remoteOrderField(entityName, field) {
  if (entityName === 'Titulo') {
    if (field === 'updated_date') return 'updated_at';
    if (field === 'created_date') return 'created_at';
  }
  if (entityName === 'ChargeEvent') {
    if (field === 'updated_date') return 'updated_at';
    if (field === 'created_date') return 'created_at';
  }
  if (entityName === 'ImportLog' && ['updated_date', 'created_date'].includes(field)) return 'imported_at';
  return field;
}

function remoteFilterField(entityName, field) {
  if (entityName === 'ChargeEvent' && field === 'titulo_id') return 'title_id';
  return field;
}

function applyOrderBy(query, orderBy, entityName) {
  if (!orderBy) return query.order('id', { ascending: true, nullsFirst: false });
  const desc = String(orderBy).startsWith('-');
  const requestedField = desc ? String(orderBy).slice(1) : String(orderBy);
  const field = remoteOrderField(entityName, requestedField);
  const ordered = query.order(field, { ascending: !desc, nullsFirst: false });
  return field === 'id' ? ordered : ordered.order('id', { ascending: true, nullsFirst: false });
}

async function fetchRemoteRows({ entityName, table, criteria = {}, orderBy, limit }) {
  const requestedLimit = Math.max(0, Number(limit) || 0);
  if (requestedLimit === 0) return [];
  const pageSize = Math.min(1000, requestedLimit);
  const rows = [];

  while (rows.length < requestedLimit) {
    const from = rows.length;
    const to = Math.min(from + pageSize, requestedLimit) - 1;
    let query = supabase.from(table).select('*').range(from, to);
    for (const [field, expected] of Object.entries(criteria || {})) {
      if (expected !== undefined) query = query.eq(remoteFilterField(entityName, field), expected);
    }
    query = applyOrderBy(query, orderBy, entityName);
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    rows.push(...page.map((row) => normalizeRemoteRow(entityName, row)));
    if (page.length < pageSize) break;
  }

  return rows;
}

function remoteWriteError(action, entityName, error) {
  markRemoteFailure(error);
  const detail = String(error?.message || error || 'erro desconhecido');
  const wrapped = new Error(`Supabase recusou ${action} de ${entityName}: ${detail}. Nenhuma gravação local foi usada como sucesso.`);
  wrapped.code = error?.code || 'SUPABASE_WRITE_FAILED';
  wrapped.cause = error;
  return wrapped;
}

async function remoteInsertOrUpsert(entityName, table, records, single = false) {
  const inputRecords = Array.isArray(records) ? records : [records];
  const recordsWithId = inputRecords.filter(Boolean).map((record) => ({
    ...normalizeRemoteWrite(entityName, record),
    id: record?.id || newRecordId(),
  }));
  const payload = single ? recordsWithId[0] : recordsWithId;
  let query = entityName === 'Titulo'
    ? supabase.from(table).upsert(payload, { onConflict: TITLE_CONFLICT_COLUMNS, ignoreDuplicates: false })
    : supabase.from(table).insert(payload);
  query = query.select();
  if (single) query = query.single();
  const { data, error } = await query;
  if (error) throw error;
  if (Array.isArray(data)) return data.map((row) => normalizeRemoteRow(entityName, row));
  return normalizeRemoteRow(entityName, data || {});
}

export function applyImportPlanToRows(rows = [], plan = {}, timestamp = nowISO()) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byKey = new Map(rows.map((row) => [buildOfficialTitleKey(row), row.id]));

  for (const item of plan.creates || []) {
    const payload = item?.payload || {};
    const key = buildOfficialTitleKey(payload);
    const existingId = byKey.get(key);
    const id = existingId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const previous = byId.get(id) || {};
    const next = {
      ...previous,
      ...payload,
      id,
      created_date: previous.created_date || timestamp,
      updated_date: timestamp,
    };
    byId.set(id, next);
    byKey.set(key, id);
  }

  for (const item of [...(plan.updates || []), ...(plan.absences || [])]) {
    const previous = byId.get(item.id);
    if (!previous) throw new Error(`O título ${item.id} não existe mais no armazenamento local. Gere uma nova prévia.`);
    const decision = sanitizeTituloUpdate(item.payload || {});
    if (decision.blocked) throw new Error(`A atualização do título ${item.id} foi bloqueada pela proteção da Carteira Geral.`);
    byId.set(item.id, { ...previous, ...decision.fields, id: item.id, updated_date: timestamp });
  }

  return {
    rows: Array.from(byId.values()),
    created: Number(plan?.summary?.totalCreate || 0),
    updated: Number(plan?.summary?.totalUpdate || 0),
    lowered: Number(plan?.summary?.totalAbsence || 0),
    mode: 'local',
  };
}

async function applyImportPlanLocally(plan = {}) {
  const rows = await localStorageAdapter.read('Titulo');
  const result = applyImportPlanToRows(rows, plan);
  await localStorageAdapter.write('Titulo', result.rows);
  return result;
}

export function buildImportAbsenceRpcPayload(plan = {}) {
  const reconciliation = plan?.reconciliation;
  if (reconciliation?.mode === 'source-reconciliation') {
    return [{
      mode: 'source-reconciliation',
      source: reconciliation.source,
      expected_absences: Number(reconciliation.expectedAbsences || 0),
      expected_imported_count: Number(reconciliation.expectedImportedCount || 0),
      imported_keys: Array.isArray(reconciliation.importedKeys) ? reconciliation.importedKeys : [],
    }];
  }

  return (plan.absences || []).map((item) => ({ id: item.id, payload: item.payload }));
}

async function applyImportPlanRemotely(plan = {}, context = {}) {
  try {
    return await runRemote(async () => {
      const { data, error } = await supabase.rpc('apply_import_plan_v2', {
        p_import_source: context.source || null,
        p_import_file: context.importFile || null,
        p_creates: (plan.creates || []).map((item) => item.payload),
        p_updates: (plan.updates || []).map((item) => ({ id: item.id, payload: item.payload })),
        p_absences: buildImportAbsenceRpcPayload(plan),
        p_expected_counts: {
          created: Number(plan?.summary?.totalCreate || 0),
          updated: Number(plan?.summary?.totalUpdate || 0),
          lowered: Number(plan?.summary?.totalAbsence || 0),
          imported: Number(plan?.snapshot?.imported?.titles || 0),
        },
      });
      if (error) throw error;
      return { ...(data || {}), mode: 'supabase' };
    });
  } catch (error) {
    markRemoteFailure(error);
    const missingRpc = ['PGRST202', '42883'].includes(String(error?.code || '')) ||
      String(error?.message || '').includes('apply_import_plan_v2');
    const message = missingRpc
      ? 'A função transacional apply_import_plan_v2 ainda não existe no Supabase. Execute a migração indicada em docs/INSTRUCOES_SUPABASE.md antes de importar.'
      : `A importação foi recusada pelo Supabase e nenhuma etapa foi confirmada: ${error?.message || error}`;
    const wrapped = new Error(message);
    wrapped.code = error?.code || 'SUPABASE_IMPORT_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function applyImportPlanAtomic(plan = {}, context = {}) {
  if (!plan?.canApply) throw new Error('O plano de importação não está liberado para aplicação.');
  if (plan?.reconciliation && !isSupabaseConfigured()) {
    throw new Error('A reconciliação integral exige Supabase conectado para garantir transação e auditoria.');
  }
  if (isSupabaseConfigured()) return applyImportPlanRemotely(plan, context);
  return applyImportPlanLocally(plan);
}

function makeHybridEntity(entityName) {
  const local = makeLocalEntity(entityName);
  const table = remoteTable(entityName);

  const entity = {
    async list(orderBy, limit = 1000) {
      if (!table) return local.list(orderBy, limit);
      try {
        const rows = await runRemoteRead(async () => {
          return fetchRemoteRows({ entityName, table, orderBy, limit });
        });
        if (Array.isArray(rows)) {
          cacheRemoteRowsInBackground(entityName, rows, 'list');
          return rows;
        }
      } catch (error) {
        markRemoteFailure(error);
        console.warn(`[dados] ${entityName} usando cache local somente para leitura`, error);
      }
      return local.list(orderBy, limit);
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      if (!table) return local.filter(criteria, orderBy, limit);
      try {
        const rows = await runRemoteRead(async () => {
          return fetchRemoteRows({ entityName, table, criteria, orderBy, limit });
        });
        if (Array.isArray(rows)) {
          cacheRemoteRowsInBackground(entityName, rows, 'filter');
          return rows;
        }
      } catch (error) {
        markRemoteFailure(error);
        console.warn(`[dados] filter ${entityName} usando cache local somente para leitura`, error);
      }
      return local.filter(criteria, orderBy, limit);
    },
    async create(record) {
      if (!table) return local.create(record);
      try {
        const saved = await runRemote(() => remoteInsertOrUpsert(entityName, table, record, true));
        if (saved?.id) await localStorageAdapter.save(entityName, saved);
        return saved;
      } catch (error) {
        throw remoteWriteError('a criação', entityName, error);
      }
    },
    async update(id, fields) {
      let nextFields = fields || {};
      if (entityName === 'Titulo') {
        const decision = sanitizeTituloUpdate(nextFields);
        if (decision.blocked) {
          throw new Error('Atualização automática bloqueada para proteger a Carteira Geral.');
        }
        nextFields = decision.fields;
      }
      if (!table) return local.update(id, nextFields);
      try {
        const saved = await runRemote(async () => {
          const { data, error } = await supabase.from(table).update(normalizeRemoteWrite(entityName, nextFields)).eq('id', id).select().single();
          if (error) throw error;
          return normalizeRemoteRow(entityName, data || {});
        });
        if (saved?.id) await localStorageAdapter.save(entityName, saved);
        return saved;
      } catch (error) {
        throw remoteWriteError('a atualização', entityName, error);
      }
    },
    async bulkCreate(records = []) {
      if (!Array.isArray(records) || records.length === 0) return [];
      if (!table) return local.bulkCreate(records);
      try {
        const saved = await runRemote(() => remoteInsertOrUpsert(entityName, table, records, false));
        if (Array.isArray(saved) && saved.length > 0) await localStorageAdapter.saveMany(entityName, saved);
        return saved || [];
      } catch (error) {
        throw remoteWriteError('a criação em lote', entityName, error);
      }
    },
    async bulkUpdate(updates = []) {
      if (!Array.isArray(updates) || updates.length === 0) return [];
      if (!table) return local.bulkUpdate(updates);
      try {
        const saved = await runRemote(async () => Promise.all(updates.map(async (raw) => {
          const { id, fields: rawFields } = normalizeBulkUpdateItem(raw);
          if (!id) throw new Error(`bulkUpdate ${entityName}: registro sem id.`);
          let fields = rawFields || {};
          if (entityName === 'Titulo') {
            const decision = sanitizeTituloUpdate(fields);
            if (decision.blocked) throw new Error('Atualização bloqueada pela proteção da Carteira Geral.');
            fields = decision.fields;
          }
          const { data, error } = await supabase.from(table).update(normalizeRemoteWrite(entityName, fields)).eq('id', id).select().single();
          if (error) throw error;
          return normalizeRemoteRow(entityName, data || {});
        })));
        if (saved.length > 0) await localStorageAdapter.saveMany(entityName, saved);
        return saved;
      } catch (error) {
        throw remoteWriteError('a atualização em lote', entityName, error);
      }
    },
    subscribe(callback) {
      return local.subscribe(callback);
    },
  };

  if (entityName === 'Titulo') entity.applyImportPlan = applyImportPlanAtomic;
  return entity;
}

export const base44 = {
  auth: {
    async me() { throw new Error('Login Base44 não disponível nesta versão (sistema usa Supabase).'); },
  },
  functions: {
    async invoke() { throw new Error('Funções de backend da Base44 não estão disponíveis (sistema usa Supabase).'); },
  },
  entities: {
    Titulo: makeHybridEntity('Titulo'),
    ChargeEvent: makeHybridEntity('ChargeEvent'),
    ImportLog: makeHybridEntity('ImportLog'),
  },
};
