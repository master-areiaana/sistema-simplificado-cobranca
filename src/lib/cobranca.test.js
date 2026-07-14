import test from "node:test";
import assert from "node:assert/strict";

import { buildItem, dateISO, dbToItem, dedupeTitulos, getClienteAgrupamentoKey, getTituloKey, manualObservationText, parseRows7007 } from "./cobranca.js";

test("buildItem mantém sem_carteira como diagnóstico sem bloquear workflow da carteira", () => {
  const item = buildItem({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "123",
    nomeCli: "Cliente Teste",
    tp: "EB",
    titulo: "10457",
    seq: "1",
        vencimento: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
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
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
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

test("getTituloKey nao junta clientes diferentes com mesmo titulo", () => {
  const clienteA = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });
  const clienteB = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "200",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });

  assert.notEqual(clienteA, clienteB);
});

test("getTituloKey nao junta EB e Topcon do mesmo cliente e titulo", () => {
  const eb = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });
  const topcon = getTituloKey({
    origem: "FINR1253",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });

  assert.notEqual(eb, topcon);
});

test("getTituloKey normaliza datas equivalentes", () => {
  const iso = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "2026-06-01",
  });
  const semZero = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "1/6/2026",
  });
  const br = getTituloKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "100",
    titulo: "10457",
    seq: "1",
    vencimento: "01/06/2026",
  });

  assert.equal(iso, semZero);
  assert.equal(iso, br);
});

test("dateISO converte data serial do Excel", () => {
  assert.equal(dateISO(46174), "2026-06-01");
});

test("dedupeTitulos prefere título aberto a pago por importação", () => {
  const base = {
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "67",
    nomeCli: "PREMIX CONCRETO LTDA",
    titulo: "6598",
    seq: "1",
    vencimento: "2026-04-15",
    valorOriginal: 46853.53,
    valorEmAberto: 46853.53,
    valorTotalDebito: 46853.53,
  };
  const pagoImportacao = buildItem({
    ...base,
    status: "Pago Aguard. Baixa",
    workflow_status: "pago_importacao",
    obs: "movido automaticamente",
  });
  const aberto = buildItem({
    ...base,
    status: "Não Contatado",
    workflow_status: "normal",
  });

  const [mantido] = dedupeTitulos([pagoImportacao, aberto]);

  assert.equal(mantido.workflow_status, "normal");
  assert.equal(mantido.status, "Não Contatado");
});

test("dbToItem preserva saldo em aberto importado do EB", () => {
  const item = dbToItem({
    id: "premix-6598",
    source: "RPT_7007_CONS_CAR_EB",
    client_code: "67",
    client_name: "PREMIX CONCRETO LTDA",
    doc_type: "EB",
    title_number: "6598",
    seq: "1",
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    original_value: 46853.53,
    received_value: 37694.46,
    open_value: 9159.07,
    erp_balance: 9159.07,
    current_status: "Não Contatado",
    workflow_status: "normal",
    active: true,
  });

  assert.equal(item.valorOriginal, 46853.53);
  assert.equal(item.valorRecebido, 37694.46);
  assert.equal(item.valorEmAberto, 9159.07);
  assert.equal(item.valorTotalDebito, 9159.07);
});

test("dbToItem oculta observação gerada por sistema ou importação", () => {
  const item = dbToItem({
    id: "auto-note",
    source: "RPT_7007_CONS_CAR_EB",
    client_code: "67",
    client_name: "PREMIX CONCRETO LTDA",
    title_number: "6598",
    due_date: "2026-04-15",
    original_value: 100,
    open_value: 100,
    last_note: "movido automaticamente",
    updated_by: "Importação",
    active: true,
  });

  assert.equal(item.obs, "");
});

test("dbToItem preserva observação descrita manualmente", () => {
  const item = dbToItem({
    id: "manual-note",
    source: "FINR1253",
    client_code: "67",
    client_name: "PREMIX CONCRETO LTDA",
    title_number: "6598",
    due_date: "2026-04-15",
    original_value: 100,
    open_value: 100,
    last_note: "Cliente pediu retorno amanhã",
    updated_by: "Mariana",
    active: true,
  });

  assert.equal(item.obs, "Cliente pediu retorno amanhã");
});

test("manualObservationText retorna somente observação manual", () => {
  assert.equal(manualObservationText("texto do sistema", "Sistema"), "");
  assert.equal(manualObservationText("texto importado", "Importação CSV"), "");
  assert.equal(manualObservationText("texto manual", "Mariana"), "texto manual");
});

test("parseRows7007 importa a primeira linha de dados da planilha EB", () => {
  const [item] = parseRows7007([
    {
      Empresa: 1,
      "Tipo Documento": "NFe",
      "Série": 1,
      "Numero Documento": 6954,
      "Sequência": 1,
      "Código Cliente": 15,
      "Razão Social": "JOJU COM VAREJISTA DE MAT DE CONST LTDA",
      Vendedor: 6,
      "Data Emissão": "08/06/2026",
      "Data Vencimento": "18/06/2026",
      "Valor Total": "R$ 9813,01000",
      Desconto: "R$ ,000",
      Juros: "R$ ,000",
      "Valor Recebido": 0,
      Saldo: "R$ 9813,0100",
    },
  ]);

  assert.ok(item);
  assert.equal(item.nomeCli, "JOJU COM VAREJISTA DE MAT DE CONST LTDA");
  assert.equal(item.nrCli, "15");
  assert.equal(item.titulo, "6954");
  assert.equal(item.seq, "1");
  assert.equal(item.vencimento, "2026-06-18");
  assert.equal(item.valorOriginal, 9813.01);
  assert.equal(item.valorEmAberto, 9813.01);
  assert.equal(item.origem, "RPT_7007_CONS_CAR_EB");
});

test("parseRows7007 agrupa cliente EB por razão social sem deduplicar códigos diferentes", () => {
  const items = parseRows7007([
    {
      Empresa: 1,
      "Tipo Documento": "NFe",
      "Série": 1,
      "Numero Documento": 6598,
      "Sequência": 1,
      "Código Cliente": 67,
      "Razão Social": "PREMIX CONCRETO LTDA",
      "Data Vencimento": "15/04/2026",
      "Valor Total": "R$ 46853,53",
      "Valor Recebido": 0,
      Saldo: "R$ 46853,53",
    },
    {
      Empresa: 1,
      "Tipo Documento": "NFe",
      "Série": 1,
      "Numero Documento": 6693,
      "Sequência": 1,
      "Código Cliente": 70,
      "Razão Social": "PREMIX CONCRETO LTDA.",
      "Data Vencimento": "30/04/2026",
      "Valor Total": "R$ 47528,83",
      "Valor Recebido": 0,
      Saldo: "R$ 47528,83",
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].clientGroupKey, items[1].clientGroupKey);
  assert.notEqual(getTituloKey(items[0]), getTituloKey(items[1]));
});

test("getClienteAgrupamentoKey une o mesmo cliente entre EB e Topcon", () => {
  const eb = getClienteAgrupamentoKey({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "67",
    nomeCli: "PREMIX CONCRETO LTDA",
  });
  const topcon = getClienteAgrupamentoKey({
    origem: "FINR1253",
    nrCli: "728",
    nomeCli: "PREMIX CONCRETO LTDA.",
  });

  assert.equal(eb, "NOME:PREMIX CONCRETO");
  assert.equal(eb, topcon);
});

test("getClienteAgrupamentoKey prioriza CPF/CNPJ quando existir", () => {
  const porDoc = getClienteAgrupamentoKey({
    nrCli: "67",
    nomeCli: "Cliente Teste LTDA",
    cpfCnpj: "12.345.678/0001-90",
  });

  assert.equal(porDoc, "DOC:12345678000190");
});
