import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

// Campos manuais que a importação NUNCA pode sobrescrever.
export const CAMPOS_MANUAIS = [
  'current_status',
  'current_motive',
  'current_contact_type',
  'promise_date',
  'last_contact_date',
  'last_note',
  'action_to_do',
  'description',
  'contact_count',
  'protest_requested_by',
  'workflow_status',
  'updated_by',
  'client_category',
];

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const rawBase44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: appBaseUrl || '',
  requiresAuth: false,
  appBaseUrl,
});

const LOCAL_PREFIX = 'sc_local_entity_';
const isBrowser = typeof window !== 'undefined' && Boolean(window.localStorage);
const subscribers = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let queue = Promise.resolve();

function isRateLimitError(error) {
  return String(error?.message || error || '').toLowerCase().includes('rate limit');
}

async function runWithRateLimit(fn) {
  const run = async () => {
    let lastError = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await fn();
        await sleep(350);
        return result;
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
        await sleep(1800 + attempt * 900);
      }
    }

    throw lastError;
  };

  const task = queue.then(run, run);
  queue = task.catch(() => undefined);
  return task;
}

function localKey(entityName) {
  return `${LOCAL_PREFIX}${entityName}`;
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readLocal(entityName) {
  if (!isBrowser) return [];
  return safeParse(window.localStorage.getItem(localKey(entityName)), []);
}

function writeLocal(entityName, rows) {
  if (!isBrowser) return;
  window.localStorage.setItem(localKey(entityName), JSON.stringify(rows || []));
  notify(entityName);
}

function notify(entityName) {
  for (const callback of subscribers.get(entityName) || []) {
    try { callback(); } catch { /* mantém os demais listeners vivos */ }
  }
}

function ensureId(record = {}) {
  return record.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function normalizeComparable(value) {
  return String(value ?? '').trim();
}

function matchesCriteria(row, criteria = {}) {
  return Object.entries(criteria || {}).every(([field, expected]) => {
    if (expected === undefined) return true;
    return normalizeComparable(row?.[field]) === normalizeComparable(expected);
  });
}

function sortRows(rows, orderBy = '') {
  if (!orderBy) return [...rows];
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return [...rows].sort((a, b) => {
    const left = a?.[field] ?? '';
    const right = b?.[field] ?? '';
    const result = String(left).localeCompare(String(right), 'pt-BR', { numeric: true });
    return desc ? -result : result;
  });
}

function mergeLocal(entityName, remoteRows = []) {
  if (!Array.isArray(remoteRows) || remoteRows.length === 0) return;
  const localRows = readLocal(entityName);
  const byId = new Map(localRows.map((row) => [row.id, row]));
  for (const row of remoteRows) {
    if (row?.id) byId.set(row.id, { ...byId.get(row.id), ...row });
  }
  writeLocal(entityName, Array.from(byId.values()));
}

function upsertLocal(entityName, record = {}) {
  const rows = readLocal(entityName);
  const id = ensureId(record);
  const index = rows.findIndex((row) => row.id === id);
  const saved = {
    ...(index >= 0 ? rows[index] : {}),
    ...record,
    id,
    created_date: record.created_date || rows[index]?.created_date || nowISO(),
    updated_date: nowISO(),
  };

  if (index >= 0) rows[index] = saved;
  else rows.unshift(saved);

  writeLocal(entityName, rows);
  return saved;
}

function makeLocalEntity(entityName) {
  return {
    async list(orderBy, limit = 1000) {
      return sortRows(readLocal(entityName), orderBy).slice(0, limit);
    },

    async filter(criteria = {}, orderBy, limit = 1000) {
      return sortRows(readLocal(entityName).filter((row) => matchesCriteria(row, criteria)), orderBy).slice(0, limit);
    },

    async create(record) {
      return upsertLocal(entityName, record);
    },

    async update(id, fields) {
      return upsertLocal(entityName, { ...(fields || {}), id });
    },

    async bulkCreate(records = []) {
      return Promise.all((records || []).map((record) => this.create(record)));
    },

    subscribe(callback) {
      const current = subscribers.get(entityName) || new Set();
      current.add(callback);
      subscribers.set(entityName, current);
      return () => {
        const next = subscribers.get(entityName) || new Set();
        next.delete(callback);
        subscribers.set(entityName, next);
      };
    },
  };
}

function remoteEntity(entityName) {
  return rawBase44?.entities?.[entityName] || null;
}

function makeHybridEntity(entityName) {
  const local = makeLocalEntity(entityName);

  return {
    async list(orderBy, limit = 1000) {
      const localRows = await local.list(orderBy, limit);
      const remote = remoteEntity(entityName);
      if (!remote?.list) return localRows;

      try {
        const remoteRows = await runWithRateLimit(() => remote.list(orderBy, limit));
        if (Array.isArray(remoteRows) && remoteRows.length > 0) {
          mergeLocal(entityName, remoteRows);
          return remoteRows;
        }
      } catch (error) {
        console.warn(`[local-first] Falha ao listar ${entityName} na Base44. Usando base local.`, error);
      }

      return localRows;
    },

    async filter(criteria = {}, orderBy, limit = 1000) {
      const localRows = await local.filter(criteria, orderBy, limit);
      const remote = remoteEntity(entityName);
      if (!remote?.filter) return localRows;

      try {
        const remoteRows = await runWithRateLimit(() => remote.filter(criteria, orderBy, limit));
        if (Array.isArray(remoteRows) && remoteRows.length > 0) {
          mergeLocal(entityName, remoteRows);
          return remoteRows;
        }
      } catch (error) {
        console.warn(`[local-first] Falha ao filtrar ${entityName} na Base44. Usando base local.`, error);
      }

      return localRows;
    },

    async create(record) {
      const localSaved = await local.create(record);
      const remote = remoteEntity(entityName);
      if (!remote?.create) return localSaved;

      try {
        const remoteSaved = await runWithRateLimit(() => remote.create(record));
        if (remoteSaved?.id) return upsertLocal(entityName, remoteSaved);
      } catch (error) {
        console.warn(`[local-first] Falha ao criar ${entityName} na Base44. Registro salvo localmente.`, error);
      }

      return localSaved;
    },

    async update(id, fields) {
      const localSaved = await local.update(id, fields);
      const remote = remoteEntity(entityName);
      if (!remote?.update) return localSaved;

      try {
        const remoteSaved = await runWithRateLimit(() => remote.update(id, fields));
        if (remoteSaved?.id) return upsertLocal(entityName, remoteSaved);
      } catch (error) {
        console.warn(`[local-first] Falha ao atualizar ${entityName} na Base44. Alteração salva localmente.`, error);
      }

      return localSaved;
    },

    async bulkCreate(records = []) {
      const saved = [];
      for (const record of records || []) {
        saved.push(await this.create(record));
      }
      return saved;
    },

    subscribe(callback) {
      const unsubLocal = local.subscribe(callback);
      const remote = remoteEntity(entityName);
      let unsubRemote = null;

      try {
        if (remote?.subscribe) unsubRemote = remote.subscribe(callback);
      } catch (error) {
        console.warn(`[local-first] Assinatura Base44 indisponível para ${entityName}.`, error);
      }

      return () => {
        unsubLocal?.();
        if (typeof unsubRemote === 'function') unsubRemote();
      };
    },
  };
}

export const base44 = {
  ...rawBase44,
  entities: {
    ...(rawBase44?.entities || {}),
    Titulo: makeHybridEntity('Titulo'),
    ChargeEvent: makeHybridEntity('ChargeEvent'),
    ImportLog: makeHybridEntity('ImportLog'),
  },
};
