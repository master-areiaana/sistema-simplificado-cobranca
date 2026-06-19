import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createLocalEntityStorage } from './localEntityStorage.js';

export const CAMPOS_MANUAIS = [
  'current_status', 'current_motive', 'current_contact_type', 'promise_date',
  'last_contact_date', 'last_note', 'action_to_do', 'description', 'contact_count',
  'protest_requested_by', 'workflow_status', 'updated_by', 'client_category',
];

const INVISIBLE_DEDUPE = /[\u200B\u200C\u200D\u2060\u2063]/g;
const localStorageAdapter = createLocalEntityStorage();
let queue = Promise.resolve();

function startRemoteClient() {
  try {
    const { appId, token, functionsVersion, appBaseUrl } = appParams;
    if (!appId && !appBaseUrl) return { entities: {} };
    if (!token) {
      console.info('[local-first] Base44 remoto sem token. Usando modo local no GitHub Pages.');
      return { entities: {} };
    }
    return createClient({ appId, token, functionsVersion, serverUrl: appBaseUrl || '', requiresAuth: true, appBaseUrl });
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
      try { const result = await fn(); await sleep(350); return result; }
      catch (error) { lastError = error; if (!isRateLimitError(error)) throw error; await sleep(1800 + attempt * 900); }
    }
    throw lastError;
  };
  const task = queue.then(run, run);
  queue = task.catch(() => undefined);
  return task;
}

function sameValue(left, right) { return String(left ?? '').trim() === String(right ?? '').trim(); }
function matches(row, criteria = {}) { return Object.entries(criteria || {}).every(([field, expected]) => expected === undefined || sameValue(row?.[field], expected)); }
function sortRows(rows, orderBy = '') { if (!orderBy) return [...rows]; const desc = String(orderBy).startsWith('-'); const field = desc ? String(orderBy).slice(1) : String(orderBy); return [...rows].sort((a, b) => { const result = String(a?.[field] ?? '').localeCompare(String(b?.[field] ?? ''), 'pt-BR', { numeric: true }); return desc ? -result : result; }); }

function clientDedupeSuffix(row = {}) {
  const key = String(row.client_code || row.client_name || '').replace(/\s+/g, '').toUpperCase();
  if (!key) return '';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash * 31) + key.charCodeAt(i)) % 997;
  return '\u2063'.repeat((hash % 17) + 1);
}

function prepareTituloRows(entityName, rows) {
  if (entityName !== 'Titulo' || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const originalTitle = String(row?.title_number || '');
    const cleanTitle = originalTitle.replace(INVISIBLE_DEDUPE, '');
    const suffix = clientDedupeSuffix(row);
    if (!suffix || !cleanTitle) return row;
    return { ...row, title_number: `${cleanTitle}${suffix}`, title_number_display: cleanTitle };
  });
}

function makeLocalEntity(entityName) {
  return {
    async list(orderBy, limit = 1000) {
      const rows = await localStorageAdapter.read(entityName);
      return prepareTituloRows(entityName, sortRows(rows, orderBy).slice(0, limit));
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      const rows = await localStorageAdapter.read(entityName);
      return prepareTituloRows(entityName, sortRows(rows.filter((row) => matches(row, criteria)), orderBy).slice(0, limit));
    },
    async create(record) { return localStorageAdapter.save(entityName, record); },
    async update(id, fields) { return localStorageAdapter.save(entityName, { ...(fields || {}), id }); },
    async bulkCreate(records = []) { return localStorageAdapter.saveMany(entityName, records); },
    subscribe(callback) { return localStorageAdapter.subscribe(entityName, callback); },
  };
}

function remoteEntity(entityName) { return rawBase44?.entities?.[entityName] || null; }

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
          try { await localStorageAdapter.merge(entityName, rows); } catch (cacheError) { console.warn(`[local-first] cache list ${entityName}`, cacheError); }
          return prepareTituloRows(entityName, rows);
        }
      }
      catch (error) { console.warn(`[local-first] list ${entityName} local`, error); }
      return fallback;
    },
    async filter(criteria = {}, orderBy, limit = 1000) {
      const fallback = await local.filter(criteria, orderBy, limit);
      const remote = remoteEntity(entityName);
      if (!remote?.filter) return fallback;
      try {
        const rows = await runRemote(() => remote.filter(criteria, orderBy, limit));
        if (Array.isArray(rows) && rows.length > 0) {
          try { await localStorageAdapter.merge(entityName, rows); } catch (cacheError) { console.warn(`[local-first] cache filter ${entityName}`, cacheError); }
          return prepareTituloRows(entityName, rows);
        }
      }
      catch (error) { console.warn(`[local-first] filter ${entityName} local`, error); }
      return fallback;
    },
    async create(record) { const localSaved = await local.create(record); const remote = remoteEntity(entityName); if (!remote?.create) return localSaved; try { const saved = await runRemote(() => remote.create(record)); return saved?.id ? localStorageAdapter.save(entityName, saved) : localSaved; } catch (error) { console.warn(`[local-first] create ${entityName} local`, error); return localSaved; } },
    async update(id, fields) { const localSaved = await local.update(id, fields); const remote = remoteEntity(entityName); if (!remote?.update) return localSaved; try { const saved = await runRemote(() => remote.update(id, fields)); return saved?.id ? localStorageAdapter.save(entityName, saved) : localSaved; } catch (error) { console.warn(`[local-first] update ${entityName} local`, error); return localSaved; } },
    async bulkCreate(records = []) { const remote = remoteEntity(entityName); if (!remote?.create) return local.bulkCreate(records); const result = []; for (const record of records || []) result.push(await this.create(record)); return result; },
    subscribe(callback) { const stopLocal = local.subscribe(callback); let stopRemote = null; try { const remote = remoteEntity(entityName); if (remote?.subscribe) stopRemote = remote.subscribe(callback); } catch (error) { console.warn(`[local-first] subscribe ${entityName} local`, error); } return () => { stopLocal?.(); if (typeof stopRemote === 'function') stopRemote(); }; },
  };
}

export const base44 = {
  ...rawBase44,
  entities: { ...(rawBase44?.entities || {}), Titulo: makeHybridEntity('Titulo'), ChargeEvent: makeHybridEntity('ChargeEvent'), ImportLog: makeHybridEntity('ImportLog') },
};
