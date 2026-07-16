import test from "node:test";
import assert from "node:assert/strict";

import { createLocalEntityStorage } from "./localEntityStorage.js";

function makeLocalStorage(initial = {}, options = {}) {
  const data = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      calls.push({ key, value });
      if (options.throwOnSet?.(key, value)) {
        const error = new Error("Setting the value exceeded the quota.");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function createRequest() {
  return { onsuccess: null, onerror: null, result: undefined, error: null };
}

function finishRequest(request, result) {
  setTimeout(() => {
    request.result = result;
    request.onsuccess?.({ target: request });
  }, 0);
  return request;
}

function makeObjectStoreNames(stores) {
  return {
    contains(name) {
      return stores.has(name);
    },
    [Symbol.iterator]() {
      return stores.keys();
    },
  };
}

function makeFakeIndexedDB() {
  const databases = new Map();
  return {
    open(name) {
      const request = createRequest();
      setTimeout(() => {
        let db = databases.get(name);
        const isNew = !db;
        const stores = db?.stores || new Map();
        db = {
          stores,
          objectStoreNames: makeObjectStoreNames(stores),
          createObjectStore(storeName) {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            return {};
          },
          transaction(storeName) {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            const rows = stores.get(storeName);
            const transaction = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              error: null,
              objectStore() {
                return {
                  getAll() {
                    return finishRequest(createRequest(), Array.from(rows.values()));
                  },
                  get(id) {
                    return finishRequest(createRequest(), rows.get(id));
                  },
                  clear() {
                    rows.clear();
                    return finishRequest(createRequest(), undefined);
                  },
                  put(row) {
                    rows.set(row.id, { ...row });
                    return finishRequest(createRequest(), undefined);
                  },
                };
              },
            };
            setTimeout(() => transaction.oncomplete?.({ target: transaction }), 5);
            return transaction;
          },
        };
        databases.set(name, db);
        request.result = db;
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

test("Titulo usa IndexedDB para volume grande e nao grava sc_local_entity_Titulo no localStorage", async () => {
  const localStorage = makeLocalStorage({}, {
    throwOnSet: (key) => key === "sc_local_entity_Titulo",
  });
  const storage = createLocalEntityStorage({
    windowObj: { localStorage, indexedDB: makeFakeIndexedDB() },
  });
  const records = Array.from({ length: 3500 }, (_, index) => ({
    id: `titulo_${index}`,
    client_name: `Cliente ${index}`,
    title_number: `10${index}`,
    original_value: 1000 + index,
    last_note: "x".repeat(500),
  }));

  await storage.saveMany("Titulo", records);
  const saved = await storage.read("Titulo");

  assert.equal(saved.length, records.length);
  assert.equal(localStorage.calls.some((call) => call.key === "sc_local_entity_Titulo"), false);
});

test("Titulo sem IndexedDB falha com mensagem clara em vez de tentar localStorage", async () => {
  const localStorage = makeLocalStorage({}, {
    throwOnSet: (key) => key === "sc_local_entity_Titulo",
  });
  const storage = createLocalEntityStorage({ windowObj: { localStorage } });

  await assert.rejects(
    () => storage.save("Titulo", { client_name: "PREMIX CONCRETO LTDA" }),
    /Limite de armazenamento local atingido ao salvar titulos/,
  );
  assert.equal(localStorage.calls.length, 0);
});

test("Titulo legado em localStorage e migrado para IndexedDB sem regravar a chave antiga", async () => {
  const legacyRows = [{ id: "old_1", client_name: "PREMIX CONCRETO LTDA", title_number: "10457" }];
  const localStorage = makeLocalStorage({
    sc_local_entity_Titulo: JSON.stringify(legacyRows),
  }, {
    throwOnSet: (key) => key === "sc_local_entity_Titulo",
  });
  const storage = createLocalEntityStorage({
    windowObj: { localStorage, indexedDB: makeFakeIndexedDB() },
  });

  const saved = await storage.read("Titulo");

  assert.equal(saved.length, 1);
  assert.equal(saved[0].client_name, "PREMIX CONCRETO LTDA");
  assert.equal(localStorage.calls.some((call) => call.key === "sc_local_entity_Titulo"), false);
});

test("entidades pequenas continuam no localStorage", async () => {
  const localStorage = makeLocalStorage();
  const storage = createLocalEntityStorage({
    windowObj: { localStorage, indexedDB: makeFakeIndexedDB() },
  });

  await storage.save("ImportLog", { id: "log_1", file_name: "rpt.xlsx" });
  const logs = await storage.read("ImportLog");

  assert.equal(logs.length, 1);
  assert.equal(logs[0].file_name, "rpt.xlsx");
  assert.equal(localStorage.calls.some((call) => call.key === "sc_local_entity_ImportLog"), true);
});

test("cache remoto pode ser salvo sem disparar recarga das entidades", async () => {
  const storage = createLocalEntityStorage({
    windowObj: { localStorage: makeLocalStorage(), indexedDB: makeFakeIndexedDB() },
  });
  let titleNotifications = 0;
  let eventNotifications = 0;
  storage.subscribe("Titulo", () => { titleNotifications += 1; });
  storage.subscribe("ChargeEvent", () => { eventNotifications += 1; });

  await storage.saveMany("Titulo", [{ id: "titulo_cache", client_name: "Cliente cache" }], { notify: false });
  await storage.saveMany("ChargeEvent", [{ id: "evento_cache", event_type: "COBRANCA" }], { notify: false });

  assert.equal(titleNotifications, 0);
  assert.equal(eventNotifications, 0);

  await storage.saveMany("Titulo", [{ id: "titulo_manual", client_name: "Cliente manual" }]);
  await storage.saveMany("ChargeEvent", [{ id: "evento_manual", event_type: "COBRANCA" }]);

  assert.equal(titleNotifications, 1);
  assert.equal(eventNotifications, 1);
});
