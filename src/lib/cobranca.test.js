import test from "node:test";
import assert from "node:assert/strict";

import { buildItem, dbToItem, getTituloKey } from "./cobranca.js";

test("buildItem mantém sem_carteira como diagnóstico sem bloquear workflow da carteira", () => {
  const item = buildItem({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "123",
    nomeCli: "Cliente Teste",
    tp: "EB",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
    valorOriginal: 1000,
    valorEmAberto: 1000,
    valorTotalDebito: 1000,
    workflow_status: "sem_carteira",
  });

  assert.equal(item.workflow_status, "");
  assert.equal(item.workflow_status_diagnostico, "sem_carteira");
  assert.equal(item.valorTotalDebito, 1000);
});

test("dbToItem converte RPT_E_FINR para origem FINR1253 visível no filtro Topcon", () => {
  const item = dbToItem({
    id: "1",
    source: "RPT_E_FINR",
    client_code: "123",
    client_name: "Cliente Teste",
    doc_type: "NF",
    title_number: "10457",
    seq: "1",
    due_date: "2026-06-01",
    open_value: 1000,
    original_value: 1000,
    current_status: "Não Contatado",
    workflow_status: "normal",
  });

  assert.equal(item.origem, "FINR1253");
  assert.equal(item.valorTotalDebito, 1000);
});

test("getTituloKey não junta parcelas diferentes do mesmo título", () => {
  const parcela1 = getTituloKey({
    origem: "FINR1253",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });
  const parcela2 = getTituloKey({
    origem: "FINR1253",
    titulo: "10457",
    seq: "2",
    vencimento: "2026-06-15",
  });

  assert.notEqual(parcela1, parcela2);
});

test("getTituloKey trata título 10457/1 igual a título 10457 sequência 1", () => {
  const comBarra = getTituloKey({
    origem: "FINR1253",
    titulo: "10457/1",
    seq: "1",
    vencimento: "2026-06-01",
  });
  const canonico = getTituloKey({
    origem: "FINR1253",
    titulo: "10457",
    seq: "",
    vencimento: "2026-06-01",
  });

  assert.equal(comBarra, canonico);
});
