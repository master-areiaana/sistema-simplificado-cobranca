const DEFAULT_PREFIX = "sc_local_entity_";
const TITLE_ENTITY = "Titulo";
const DB_NAME = "sc_local_entities";
const DB_VERSION = 1;

function defaultWindow() {
  return typeof window !== "undefined" ? window : undefined;
}

export function isQuotaExceededError(error) {
  const text = String(error?.name || error?.message || error || "").toLowerCase();
  return error?.code === 22 || error?.code === 1014 || text.includes("quota") || text.includes("exceeded");
}

export function createStorageLimitError(entityName, cause) {
  const message = entityName === TITLE_ENTITY
    ? "Limite de armazenamento local atingido ao salvar titulos. A importacao foi interrompida antes das baixas e do cruzamento. Recarregue a pagina e tente novamente."
    : `Limite de armazenamento local atingido ao salvar ${entityName}. A operacao foi interrompida.`;
  const error = new Error(message);
  error.name = "LocalStorageQuotaError";
  error.code = "LOCAL_STORAGE_QUOTA_EXCEEDED";
  error.cause = cause;
  return error;
}

function nowISO() {
  return new Date().toISOString();
}

function ensureId(record = {}) {
  return record.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function hasObjectStore(db, storeName) {
  if (db.objectStoreNames?.contains) return db.objectStoreNames.contains(storeName);
  return Array.from(db.objectStoreNames || []).includes(storeName);
}

export function createLocalEntityStorage({ windowObj = defaultWindow(), prefix = DEFAULT_PREFIX } = {}) {
  const subscribers = new Map();
  const migratedFromLocalStorage = new Set();
  let dbPromise = null;

  function isBrowser() {
    return Boolean(windowObj?.localStorage);
  }

  function localKey(entityName) {
    return `${prefix}${entityName}`;
  }

  function shouldUseIndexedDB(entityName) {
    return entityName === TITLE_ENTITY;
  }

  function hasIndexedDB() {
    return Boolean(windowObj?.indexedDB);
  }

  function notify(entityName) {
    for (const callback of subscribers.get(entityName) || []) {
      try { callback(); } catch { /* noop */ }
    }
  }

  function subscribe(entityName, callback) {
    const set = subscribers.get(entityName) || new Set();
    set.add(callback);
    subscribers.set(entityName, set);
    return () => {
      const next = subscribers.get(entityName) || new Set();
      next.delete(callback);
      subscribers.set(entityName, next);
    };
  }

  function readLocalStorageRows(entityName) {
    if (!isBrowser()) return [];
    try {
      const value = windowObj.localStorage.getItem(localKey(entityName));
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  }

  function writeLocalStorageRows(entityName, rows) {
    if (!isBrowser()) return;
    try {
      windowObj.localStorage.setItem(localKey(entityName), JSON.stringify(rows || []));
    } catch (error) {
      if (isQuotaExceededError(error)) throw createStorageLimitError(entityName, error);
      throw error;
    }
  }

  function requireIndexedDB(entityName) {
    if (!hasIndexedDB()) {
      throw createStorageLimitError(entityName, new Error("IndexedDB unavailable"));
    }
  }

  async function openDatabase() {
    if (dbPromise) return dbPromise;
    requireIndexedDB(TITLE_ENTITY);
    dbPromise = new Promise((resolve, reject) => {
      const request = windowObj.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!hasObjectStore(db, TITLE_ENTITY)) {
          db.createObjectStore(TITLE_ENTITY, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
    return dbPromise;
  }

  async function readIndexedRows(entityName) {
    const db = await openDatabase();
    const transaction = db.transaction(entityName, "readonly");
    const done = transactionDone(transaction);
    const rows = await requestToPromise(transaction.objectStore(entityName).getAll());
    await done;
    return Array.isArray(rows) ? rows : [];
  }

  async function writeIndexedRows(entityName, rows) {
    const db = await openDatabase();
    const transaction = db.transaction(entityName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(entityName);
    store.clear();
    for (const row of rows || []) {
      if (row && typeof row === "object") store.put(row.id ? row : { ...row, id: ensureId(row) });
    }
    await done;
  }

  async function getIndexedRow(entityName, id) {
    const db = await openDatabase();
    const transaction = db.transaction(entityName, "readonly");
    const done = transactionDone(transaction);
    const row = await requestToPromise(transaction.objectStore(entityName).get(id));
    await done;
    return row || null;
  }

  async function putIndexedRow(entityName, row) {
    const db = await openDatabase();
    const transaction = db.transaction(entityName, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(entityName).put(row);
    await done;
  }

  async function putIndexedRows(entityName, rows) {
    const db = await openDatabase();
    const transaction = db.transaction(entityName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(entityName);
    for (const row of rows || []) store.put(row);
    await done;
  }

  async function readIndexedWithLegacyMigration(entityName) {
    const indexedRows = await readIndexedRows(entityName);
    if (!migratedFromLocalStorage.has(entityName)) {
      migratedFromLocalStorage.add(entityName);
      const legacyRows = readLocalStorageRows(entityName);
      if (legacyRows.length > 0) {
        const byId = new Map(indexedRows.map((row) => [row.id, row]));
        for (const row of legacyRows) {
          const id = ensureId(row);
          byId.set(id, { ...row, id });
        }
        const merged = Array.from(byId.values());
        await writeIndexedRows(entityName, merged);
        try { windowObj.localStorage.removeItem(localKey(entityName)); } catch { /* keep migrated data in IndexedDB */ }
        return merged;
      }
    }
    return indexedRows;
  }

  async function read(entityName) {
    if (!isBrowser()) return [];
    if (shouldUseIndexedDB(entityName)) {
      if (!hasIndexedDB()) return readLocalStorageRows(entityName);
      return readIndexedWithLegacyMigration(entityName);
    }
    return readLocalStorageRows(entityName);
  }

  async function write(entityName, rows) {
    if (!isBrowser()) return;
    if (shouldUseIndexedDB(entityName)) {
      requireIndexedDB(entityName);
      await writeIndexedRows(entityName, rows);
      notify(entityName);
      return;
    }
    writeLocalStorageRows(entityName, rows);
    notify(entityName);
  }

  async function merge(entityName, rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const current = await read(entityName);
    const byId = new Map(current.map((row) => [row.id, row]));
    for (const row of rows) if (row?.id) byId.set(row.id, { ...(byId.get(row.id) || {}), ...row });
    await write(entityName, Array.from(byId.values()));
  }

  async function save(entityName, record = {}) {
    const id = ensureId(record);
    const timestamp = nowISO();

    if (shouldUseIndexedDB(entityName)) {
      requireIndexedDB(entityName);
      const previous = await getIndexedRow(entityName, id) || {};
      const saved = {
        ...previous,
        ...record,
        id,
        created_date: previous.created_date || record.created_date || timestamp,
        updated_date: timestamp,
      };
      await putIndexedRow(entityName, saved);
      notify(entityName);
      return saved;
    }

    const rows = await read(entityName);
    const index = rows.findIndex((row) => row.id === id);
    const previous = index >= 0 ? rows[index] : {};
    const saved = {
      ...previous,
      ...record,
      id,
      created_date: previous.created_date || record.created_date || timestamp,
      updated_date: timestamp,
    };
    if (index >= 0) rows[index] = saved; else rows.unshift(saved);
    await write(entityName, rows);
    return saved;
  }

  async function saveMany(entityName, records = [], options = {}) {
    if (!Array.isArray(records) || records.length === 0) return [];
    const timestamp = nowISO();
    const shouldNotify = options.notify !== false;

    if (shouldUseIndexedDB(entityName)) {
      requireIndexedDB(entityName);
      const saved = records.map((record = {}) => {
        const id = ensureId(record);
        return {
          ...record,
          id,
          created_date: record.created_date || timestamp,
          updated_date: timestamp,
        };
      });
      await putIndexedRows(entityName, saved);
      if (shouldNotify) notify(entityName);
      return saved;
    }

    const current = await read(entityName);
    const byId = new Map(current.map((row) => [row.id, row]));
    const saved = records.map((record = {}) => {
      const id = ensureId(record);
      const previous = byId.get(id) || {};
      const next = {
        ...previous,
        ...record,
        id,
        created_date: previous.created_date || record.created_date || timestamp,
        updated_date: timestamp,
      };
      byId.set(id, next);
      return next;
    });
    writeLocalStorageRows(entityName, Array.from(byId.values()));
    if (shouldNotify) notify(entityName);
    return saved;
  }

  return { localKey, read, write, merge, save, saveMany, subscribe };
}
