const DB_PREFIX = "sc_local_entity_";
const listeners = new Map();

function nowIso() {
  return new Date().toISOString();
}

function makeId(entityName) {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : null;
  const random = cryptoObj?.randomUUID ? cryptoObj.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${entityName}_${random}`;
}

function storageKey(entityName) {
  return `${DB_PREFIX}${entityName}`;
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readRows(entityName) {
  if (typeof localStorage === "undefined") return [];
  const rows = safeParse(localStorage.getItem(storageKey(entityName)), []);
  return Array.isArray(rows) ? rows : [];
}

function writeRows(entityName, rows) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(entityName), JSON.stringify(rows));
  notify(entityName);
}

function notify(entityName) {
  const subs = listeners.get(entityName);
  if (!subs) return;
  for (const callback of subs) {
    try { callback(); } catch (error) { console.warn(`Erro em subscribe(${entityName}):`, error); }
  }
}

function matchFilter(row, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (expected === null) return row?.[key] === null || row?.[key] === undefined;
    return String(row?.[key] ?? "") === String(expected);
  });
}

function applySort(rows, sortArg = "") {
  const sortText = String(sortArg || "").trim();
  if (!sortText) return rows;

  const desc = sortText.startsWith("-");
  const field = desc ? sortText.slice(1) : sortText;
  if (!field) return rows;

  return [...rows].sort((a, b) => {
    const av = a?.[field] ?? "";
    const bv = b?.[field] ?? "";
    if (typeof av === "number" && typeof bv === "number") return desc ? bv - av : av - bv;
    return desc
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv));
  });
}

function limitRows(rows, limit) {
  const max = Number(limit || 0);
  return max > 0 ? rows.slice(0, max) : rows;
}

function normalizeCreatePayload(entityName, payload = {}) {
  const stamp = nowIso();
  return {
    ...payload,
    id: payload.id || makeId(entityName),
    created_date: payload.created_date || stamp,
    updated_date: payload.updated_date || stamp,
  };
}

function createEntity(entityName) {
  return {
    async list(sortArg = "-updated_date", limit = 1000) {
      return limitRows(applySort(readRows(entityName), sortArg), limit);
    },

    async filter(filter = {}, sortArg = "-updated_date", limit = 1000) {
      const rows = readRows(entityName).filter((row) => matchFilter(row, filter));
      return limitRows(applySort(rows, sortArg), limit);
    },

    async create(payload = {}) {
      const rows = readRows(entityName);
      const record = normalizeCreatePayload(entityName, payload);
      rows.push(record);
      writeRows(entityName, rows);
      return record;
    },

    async bulkCreate(payloads = []) {
      const rows = readRows(entityName);
      const created = (Array.isArray(payloads) ? payloads : []).map((payload) => normalizeCreatePayload(entityName, payload));
      rows.push(...created);
      writeRows(entityName, rows);
      return created;
    },

    async update(id, patch = {}) {
      const rows = readRows(entityName);
      const idx = rows.findIndex((row) => String(row.id) === String(id));
      if (idx < 0) throw new Error(`${entityName} ${id} não encontrado para update`);
      const updated = {
        ...rows[idx],
        ...patch,
        id: rows[idx].id,
        created_date: rows[idx].created_date || nowIso(),
        updated_date: nowIso(),
      };
      rows[idx] = updated;
      writeRows(entityName, rows);
      return updated;
    },

    async delete(id) {
      const rows = readRows(entityName);
      const next = rows.filter((row) => String(row.id) !== String(id));
      writeRows(entityName, next);
      return { id };
    },

    subscribe(callback) {
      if (!listeners.has(entityName)) listeners.set(entityName, new Set());
      listeners.get(entityName).add(callback);
      return () => listeners.get(entityName)?.delete(callback);
    },
  };
}

function createEntitiesProxy() {
  const cache = new Map();
  return new Proxy({}, {
    get(_target, entityName) {
      if (typeof entityName !== "string") return undefined;
      if (!cache.has(entityName)) cache.set(entityName, createEntity(entityName));
      return cache.get(entityName);
    },
  });
}

export const base44 = {
  entities: createEntitiesProxy(),
  functions: {
    async invoke(name) {
      throw new Error(`Função Base44 não disponível no modo local: ${name}`);
    },
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(DB_PREFIX)) return;
    notify(event.key.replace(DB_PREFIX, ""));
  });
}
