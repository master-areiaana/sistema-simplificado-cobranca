import test from "node:test";
import assert from "node:assert/strict";

import { buildItem, dateISO, dbToItem, dedupeTitulos, getClienteAgrupamentoKey, getTituloKey, manualObservationText, parseRows1253, parseRows7007 } from "./cobranca.js";
import { REAL_FINR_FINANCIAL_ROWS } from "./importacao/realImportFinancialFixtures.js";

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

test("parseRows1253 respeita o layout real do FINR1253/Topcon", () => {
  const [item] = parseRows1253([
    ["Cliente: 224 - ARTEFATOS DE CIMENTO RAIMONDI LTDA - CPF/CNPJ: 12.345.678/0001-90"],
    ["FAT", "152", 9831.0, "2", 120.0, 46042.0, 46077.0, 147900.75, 0.0, 147900.75, 33381.2, 181281.95, 121.0, "", "COB ITAU 34222-7"],
    ["Total Cliente", "Telefone: 47 99999-0000 Contato: Financeiro"],
  ]);

  assert.ok(item);
  assert.equal(item.tp, "FAT");
  assert.equal(item.ser, "152");
  assert.equal(item.titulo, "9831");
  assert.equal(item.seq, "2");
  assert.equal(item.nfServico, "120");
  assert.equal(item.emissao, "2026-01-20");
  assert.equal(item.vencimento, "2026-02-24");
  assert.equal(item.valorOriginal, 147900.75);
  assert.equal(item.valorRecebido, 0);
  assert.equal(item.recebPrc, 147900.75);
  assert.equal(item.saldoErp, 147900.75);
  assert.equal(item.valorJuros, 33381.2);
  assert.equal(item.valorEmAberto, 147900.75);
  assert.equal(item.valorTotalDebito, 181281.95);
  assert.equal(item.diasAtraso, 121);
  assert.equal(item.portador, "COB ITAU 34222-7");
});

test("parseRows1253 preserva a contagem e o saldo total do FINR1253 real", () => {
  const rows = [
    ["Cliente: 1 - CLIENTE FINR ANONIMIZADO LTDA - CPF/CNPJ: 00.000.000/0001-00"],
    ...REAL_FINR_FINANCIAL_ROWS.map(([original, acrescimo, saldo, juros, receber], index) => [
      "FAT", "152", 100000 + index, "1", "", 46042, 46077,
      original, acrescimo, saldo, juros, receber, 1, "", "CARTEIRA",
    ]),
  ];
  const items = parseRows1253(rows);

  assert.equal(items.length, 199);
  assert.equal(Number(items.reduce((sum, item) => sum + item.valorEmAberto, 0).toFixed(2)), 3196048.18);
  assert.equal(Number(items.reduce((sum, item) => sum + item.valorTotalDebito, 0).toFixed(2)), 3631726.05);
  assert.equal(items.filter((item) => item.valorEmAberto === 0).length, 0);
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

test("dbToItem lê os campos financeiros legados da tabela titles do Supabase", () => {
  const item = dbToItem({
    id: "legacy-live-schema",
    source: "RPT_7007_CONS_CAR_EB",
    client_code: "202",
    client_name: "ARTEFATOS DE CIMENTO RAIMONDI LTDA",
    title_number: "EB-1",
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    original_value: 202798.30,
    recebido_parcial: 1000,
    current_value: 201798.30,
    active: true,
  });

  assert.equal(item.valorRecebido, 1000);
  assert.equal(item.valorEmAberto, 201798.30);
  assert.equal(item.workflow_status, "normal");
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
  assert.equal(item.saldoErp, 9813.01);
  assert.equal(item.saldoOficialDisponivel, true);
  assert.equal(item.origem, "RPT_7007_CONS_CAR_EB");
});

test("parseRows7007 prioriza Saldo oficial e usa fallback apenas quando ausente", () => {
  const [oficial, fallback, minimo] = parseRows7007([
    {
      "Tipo Documento": "NFe",
      "Numero Documento": 6598,
      "Sequência": 1,
      "Código Cliente": 67,
      "Razão Social": "PREMIX CONCRETO LTDA",
      "Valor Total": 46853.53,
      "Valor Recebido": 37694,
      "Saldo": 9159.07,
    },
    {
      "Tipo Documento": "NFe",
      "Numero Documento": 6600,
      "Sequência": 1,
      "Código Cliente": 67,
      "Razão Social": "PREMIX CONCRETO LTDA",
      "Valor Total": 100,
      "Valor Recebido": 20,
      "Saldo": "",
    },
    {
      "Tipo Documento": "NFe",
      "Numero Documento": 6601,
      "Sequência": 1,
      "Código Cliente": 67,
      "Razão Social": "PREMIX CONCRETO LTDA",
      "Valor Total": 10,
      "Valor Recebido": 9.99,
      "Saldo": 0.01,
    },
  ]);

  assert.equal(oficial.valorEmAberto, 9159.07);
  assert.equal(oficial.saldoCalculado, 9159.53);
  assert.equal(oficial.saldoDivergencia, -0.46);
  assert.equal(fallback.valorEmAberto, 80);
  assert.equal(fallback.saldoOficialDisponivel, false);
  assert.equal(minimo.valorEmAberto, 0.01);
});

test("parseRows7007 usa o Saldo oficial do título 1627", () => {
  const [item] = parseRows7007([{
    "Tipo Documento": "FAT",
    "Numero Documento": 1627,
    "Sequência": 1,
    "Código Cliente": 451,
    "Razão Social": "SUPERTEX CONCRETO LTDA",
    "Valor Total": 149894.76,
    "Valor Recebido": 146555,
    "Saldo": 3339.53,
  }]);

  assert.equal(item.valorEmAberto, 3339.53);
  assert.equal(item.saldoErp, 3339.53);
  assert.equal(item.saldoCalculado, 3339.76);
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
  assert.equal(items[0].clientGroupKey, "NOME:PREMIX CONCRETO");
  assert.deepEqual(items.map((item) => item.erpClientCodes), [["67"], ["70"]]);
  assert.notEqual(getTituloKey(items[0]), getTituloKey(items[1]));
});

test("PREMIX mantém 19 títulos EB em um grupo visual e preserva seis códigos", () => {
  const codes = [67, 70, 71, 73, 88, 728];
  const rows = Array.from({ length: 19 }, (_, index) => ({
    "Tipo Documento": "NFe",
    "Numero Documento": 6500 + index,
    "Sequência": 1,
    "Código Cliente": codes[index % codes.length],
    "Razão Social": codes[index % codes.length] === 728 ? "PREMIX CONCRETO LTDA." : "PREMIX CONCRETO LTDA",
    "Data Vencimento": "30/06/2026",
    "Valor Total": 100 + index,
    "Valor Recebido": 0,
    "Saldo": 100 + index,
  }));
  const items = parseRows7007(rows);

  assert.equal(items.length, 19);
  assert.deepEqual(new Set(items.map((item) => item.clientGroupKey)), new Set(["NOME:PREMIX CONCRETO"]));
  assert.deepEqual(new Set(items.map((item) => item.nrCli)), new Set(codes.map(String)));
  assert.deepEqual(new Set(items.map((item) => item.origem)), new Set(["RPT_7007_CONS_CAR_EB"]));
  assert.equal(new Set(items.map(getTituloKey)).size, 19);
});

test("buildItem mantém saldo ERP separado de multa e juros", () => {
  const item = buildItem({
    origem: "RPT_7007_CONS_CAR_EB",
    nrCli: "67",
    nomeCli: "PREMIX CONCRETO LTDA",
    titulo: "6598",
    seq: "1",
    vencimento: "2000-01-01",
    valorOriginal: 46853.53,
    valorRecebido: 37694,
    valorEmAberto: 9159.07,
    saldoErp: 9159.07,
  });

  assert.equal(item.valorEmAberto, 9159.07);
  assert.equal(item.saldoErp, 9159.07);
  assert.ok(item.valorTotalDebito > item.valorEmAberto);
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

test("getClienteAgrupamentoKey prioriza nome normalizado mesmo quando existe CPF/CNPJ", () => {
  const porDoc = getClienteAgrupamentoKey({
    nrCli: "67",
    nomeCli: "Cliente Teste LTDA",
    cpfCnpj: "12.345.678/0001-90",
  });

  assert.equal(porDoc, "NOME:CLIENTE TESTE");
});
