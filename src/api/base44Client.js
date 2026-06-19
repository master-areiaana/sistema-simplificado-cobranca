import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

export const CAMPOS_MANUAIS = [
  'current_status', 'current_motive', 'current_contact_type', 'promise_date',
  'last_contact_date', 'last_note', 'action_to_do', 'description', 'contact_count',
  'protest_requested_by', 'workflow_status', 'updated_by', 'client_category',
];

const LOCAL_PREFIX = 'sc_local_entity_';
const isBrowser = typeof window !== 'undefined' && Boolean(window.localStorage);
const subscribers = new Map();
let queue = Promise.resolve();

function startRemoteClient() {
  try {
    const { appId, token, functionsVersion, appBaseUrl } = appParams;
    if (!appId && !appBaseUrl) return { entities: {} };
    if (!token) {
      console.info('[local-first] Base44 remoto sem token. Usando modo local no GitHub Pages.');
      return { entities: {} };
    }
    return createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: appBaseUrl || '',
      requiresAuth: true,
      appBaseUrl,
    });
  } catch (error) {
    console.warn('[local-first] Base44 não iniciou. Usando dados locais.', error);
    return { entities: {} };
  }
}

const rawBase44 = startRemoteClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimitError = (error) => String(error?.message || error || '').toLowerCase().includes('rate limit');

async function runRemote(fn) {
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

function readLocal(entityName) {
  if (!isBrowser) return [];
  try {
    return JSON.parse(window.localStorage.getItem(localKey(entityName)) || '[]');
  } catch {
    return [];
  }
}

function notify(entityName) {
  for (const callback of subscribers.get(entityName) || []) {
    try { callback(); } catch { /* noop */ }
  }
}

function writeLocal(entityName, rows) {
  if (!isBrowser) return;
  window.localStorage.setItem(localKey(entityName), JSON.stringify(rows || []));
  notify(entityName);
}

function nowISO() {
  return new Date().toISOString();
}

function ensureId(record = {}) {
  return record.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sameValue(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function matches(row, criteria = {}) {
  return Object.entries(criteria || {}).every(([field, expected]) => expected === undefined || sameValue(row?.[field], expected));
}

function sortRows(rows, orderBy = '') {
  if (!orderBy) return [...rows];
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return [...rows].sort((a, b) => {
    const result = String(a?.[field] ?? '').localeCompare(String(b?.[field] ?? ''), 'pt-BR', { numeric: true });
    return desc ? -result : result;
  });
}

function mergeLocal(entityName, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const current = readLocal(entityName);
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of rows) {
    if (row?.id) byId.set(row.id, { ...(byId.get(row.id) || {}), ...row });
  }
  writeLocal(entityName, Array.from(byId.values()));
}

function saveLocal(entityName, record = {}) {
  const rows = readLocal(entityName);
  const id = ensureId(record);
  const index = rows.findIndex((row) => row.id === id);
  const previous = index >= 0 ? rows[index] : {};
  const saved = {
    ...previous,
    ...record,
    id,
    created_date: previous.created_date || record.created_date || nowISO(),
    updated_date: nowISO(),
  };
  if (index >= 0) rows[index] = saved;
  else rows.unshift(saved);
  writeLocal(entityName, rows);
  return saved;
}

function dashboardDedupeSuffix(row = {}) {
  const key = String(row.client_code || row.client_name || '').replace(/\s+/g, '').toUpperCase();
  if (!key) return '';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash * 31) + key.charCodeAt(i)) % 997;
  return '\u2063'.repeat((hash % 17) + 1);
}

function prepareRowsForDashboard(entityName, criteria, orderBy, limit, rows) {
  const isDashboardLoad = entityName === 'Titulo' &&
    criteria?.active === true &&
    String(orderBy || '') === 'client_name' &&
    Number(limit || 0) === 3000;

  if (!isDashboardLoad || !Array.isArray(rows)) return rows;

  return rows.map((row) => {
    const suffix = dashboardDedupeSuffix(row);
    if (!suffix || !row?.title_number) return row;
    return {
      ...row,
      title_number: `${row.title_number}${suffix}`,
      title_number_display: row.title_number,
    };
  });
}

function makeLocalEntity(entityName) {
  return {
    async list(orderBy, limit = 1000) {
      return sortRows(readLocal(entityName), orderBy).slice(0, limit);
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      const rows = sortRows(readLocal(entityName).filter((row) => matches(row, criteria)), orderBy).slice(0, limit);
      return prepareRowsForDashboard(entityName, criteria, orderBy, limit, rows);
    },
    async create(record) {
      return saveLocal(entityName, record);
    },
    async update(id, fields) {
      return saveLocal(entityName, { ...(fields || {}), id });
    },
    async bulkCreate(records = []) {
      const result = [];
      for (const record of records || []) result.push(await this.create(record));
      return result;
    },
    subscribe(callback) {
      const set = subscribers.get(entityName) || new Set();
      set.add(callback);
      subscribers.set(entityName, set);
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
      const fallback = await local.list(orderBy, limit);
      const remote = remoteEntity(entityName);
      if (!remote?.list) return fallback;
      try {
        const rows = await runRemote(() => remote.list(orderBy, limit));
        if (Array.isArray(rows) && rows.length > 0) {
          mergeLocal(entityName, rows);
          return rows;
        }
      } catch (error) {
        console.warn(`[local-first] list ${entityName} local`, error);
      }
      return fallback;
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      const fallback = await local.filter(criteria, orderBy, limit);
      const remote = remoteEntity(entityName);
      if (!remote?.filter) return fallback;
      try {
        const rows = await runRemote(() => remote.filter(criteria, orderBy, limit));
        if (Array.isArray(rows) && rows.length > 0) {
          mergeLocal(entityName, rows);
          return prepareRowsForDashboard(entityName, criteria, orderBy, limit, rows);
        }
      } catch (error) {
        console.warn(`[local-first] filter ${entityName} local`, error);
      }
      return fallback;
    },
    async create(record) {
      const localSaved = await local.create(record);
      const remote = remoteEntity(entityName);
      if (!remote?.create) return localSaved;
      try {
        const saved = await runRemote(() => remote.create(record));
        return saved?.id ? saveLocal(entityName, saved) : localSaved;
      } catch (error) {
        console.warn(`[local-first] create ${entityName} local`, error);
        return localSaved;
      }
    },
    async update(id, fields) {
      const localSaved = await local.update(id, fields);
      const remote = remoteEntity(entityName);
      if (!remote?.update) return localSaved;
      try {
        const saved = await runRemote(() => remote.update(id, fields));
        return saved?.id ? saveLocal(entityName, saved) : localSaved;
      } catch (error) {
        console.warn(`[local-first] update ${entityName} local`, error);
        return localSaved;
      }
    },
    async bulkCreate(records = []) {
      const result = [];
      for (const record of records || []) result.push(await this.create(record));
      return result;
    },
    subscribe(callback) {
      const stopLocal = local.subscribe(callback);
      let stopRemote = null;
      try {
        const remote = remoteEntity(entityName);
        if (remote?.subscribe) stopRemote = remote.subscribe(callback);
      } catch (error) {
        console.warn(`[local-first] subscribe ${entityName} local`, error);
      }
      return () => {
        stopLocal?.();
        if (typeof stopRemote === 'function') stopRemote();
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