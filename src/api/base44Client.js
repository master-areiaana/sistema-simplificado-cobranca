import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { createLocalEntityStorage } from './localEntityStorage.js';

export const CAMPOS_MANUAIS = [
  'current_status', 'current_motive', 'current_contact_type', 'promise_date',
  'last_contact_date', 'last_note', 'action_to_do', 'description', 'contact_count',
  'protest_requested_by', 'workflow_status', 'updated_by', 'client_category',
  ];

const AUTO_IMPACT_STATUSES = new Set(['pago_importacao', 'sem_carteira']);
const localStorageAdapter = createLocalEntityStorage();
let queue = Promise.resolve();

const TABLE_BY_ENTITY = {
  Titulo: 'titulos',
  ChargeEvent: 'charge_events',
  ImportLog: 'import_logs',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimitError = (error) => String(error?.message || error || '').toLowerCase().includes('rate limit');

async function runRemote(fn) {
  const run = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
        await sleep(1200 + attempt * 600);
      }
    }
    throw lastError;
  };
  const task = queue.then(run, run);
  queue = task.catch(() => undefined);
  return task;
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
  if (String(fields.updated_by || '') !== 'Importação') return false;
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
    subscribe(callback) { return localStorageAdapter.subscribe(entityName, callback); },
  };
}

function remoteTable(entityName) {
  if (!isSupabaseConfigured()) return null;
  return TABLE_BY_ENTITY[entityName] || null;
}

function applyOrderBy(query, orderBy) {
  if (!orderBy) return query;
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return query.order(field, { ascending: !desc, nullsFirst: false });
}

function makeHybridEntity(entityName) {
  const local = makeLocalEntity(entityName);
  const table = remoteTable(entityName);

return {
  async list(orderBy, limit = 1000) {
    const fallback = await local.list(orderBy, limit);
    if (!table) return fallback;
    try {
      const rows = await runRemote(async () => {
        let query = supabase.from(table).select('*').limit(limit);
        query = applyOrderBy(query, orderBy);
        const { data, error } = await query;
        if (error) throw error;
        return data;
      });
      if (Array.isArray(rows)) {
        try { await localStorageAdapter.merge(entityName, rows); } catch (cacheError) { console.warn(`[dados] cache list ${entityName}`, cacheError); }
        return rows;
      }
    } catch (error) {
      console.warn(`[dados] ${entityName} usando cache local (Supabase falhou)`, error);
    }
    return fallback;
  },
  async filter(criteria = {}, orderBy, limit = 1000) {
    const fallback = await local.filter(criteria, orderBy, limit);
    if (!table) return fallback;
    try {
      const rows = await runRemote(async () => {
        let query = supabase.from(table).select('*').limit(limit);
        for (const [field, expected] of Object.entries(criteria || {})) {
          if (expected !== undefined) query = query.eq(field, expected);
        }
        query = applyOrderBy(query, orderBy);
        const { data, error } = await query;
        if (error) throw error;
        return data;
      });
      if (Array.isArray(rows)) {
        try { await localStorageAdapter.merge(entityName, rows); } catch (cacheError) { console.warn(`[dados] cache filter ${entityName}`, cacheError); }
        return rows;
      }
    } catch (error) {
      console.warn(`[dados] filter ${entityName} usando cache local (Supabase falhou)`, error);
    }
    return fallback;
  },
  async create(record) {
    const localSaved = await local.create(record);
    if (!table) return localSaved;
    try {
      const saved = await runRemote(async () => {
        const { data, error } = await supabase.from(table).insert(record).select().single();
        if (error) throw error;
        return data;
      });
      return saved?.id ? localStorageAdapter.save(entityName, saved) : localSaved;
    } catch (error) {
      console.warn(`[dados] create ${entityName} usando cache local (Supabase falhou)`, error);
      return localSaved;
    }
  },
  async update(id, fields) {
    let nextFields = fields || {};
    if (entityName === 'Titulo') {
      const decision = sanitizeTituloUpdate(nextFields);
      if (decision.blocked) {
        console.warn('[importação protegida] baixa/sem_carteira automática bloqueada para evitar esvaziar Carteira Geral', { id, fields: nextFields });
        return resolveExisting(entityName, id);
      }
      nextFields = decision.fields;
    }
    const localSaved = await local.update(id, nextFields);
    if (!table) return localSaved;
    try {
      const saved = await runRemote(async () => {
        const { data, error } = await supabase.from(table).update(nextFields).eq('id', id).select().single();
        if (error) throw error;
        return data;
      });
      return saved?.id ? localStorageAdapter.save(entityName, saved) : localSaved;
    } catch (error) {
      console.warn(`[dados] update ${entityName} usando cache local (Supabase falhou)`, error);
      return localSaved;
    }
  },
  async bulkCreate(records = []) {
    if (!Array.isArray(records) || records.length === 0) return [];
    if (!table) return local.bulkCreate(records);
    try {
      const saved = await runRemote(async () => {
        const { data, error } = await supabase.from(table).insert(records).select();
        if (error) throw error;
        return data;
      });
      if (Array.isArray(saved) && saved.length > 0) {
        await localStorageAdapter.saveMany(entityName, saved);
        return saved;
      }
    } catch (error) {
      console.warn(`[dados] bulkCreate ${entityName} usando cache local (Supabase falhou)`, error);
    }
    return local.bulkCreate(records);
  },
  subscribe(callback) {
    return local.subscribe(callback);
  },
};
}

export const base44 = {
  auth: {
    async me() { throw new Error('Login Base44 não disponível nesta versão (sistema usa Supabase).'); },
  },
  functions: {
    async invoke() { throw new Error('Funções de backend da Base44 não estão disponíveis (sistema usa Supabase apenas para dados).'); },
  },
  entities: {
    Titulo: makeHybridEntity('Titulo'),
    ChargeEvent: makeHybridEntity('ChargeEvent'),
    ImportLog: makeHybridEntity('ImportLog'),
  },
};
