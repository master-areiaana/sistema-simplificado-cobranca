import test from "node:test";
import assert from "node:assert/strict";

import { buildImportPreview } from "./preview.js";

const PARTIAL_IMPORT_ALERT =
  "Planilha parcial detectada — baixa automática não aplicada.";

function rptRow(overrides = {}) {
  return {
    "Id da Empresa": "01",
    "Tipo Documento": "NF",
    "Série": "A",
    "Número Documento": "100",
    "Sequência": "1",
    "Código Cliente": "10",
    "Razão Social": "Cliente Exemplo Ltda",
    "Vendedor": "Maria",
    "Data Emissão": "01/06/2026",
    "Data Vencimento": "30/06/2026",
    "Valor Total": 1000,
    "Desconto": 0,
    "Valor Recebido": 300,
    "Atraso": 0,
    ...overrides,
  };
}

function finrRows(overrides = {}) {
  const {
    clientCode = "10",
    clientName = "Cliente Exemplo Ltda",
    cpfCnpj = "10.000.000/0001-10",
    type = "NF",
    series = "A",
    documentNumber = "100",
    sequence = "1",
    issueDate = "01/06/2026",
    dueDate = "30/06/2026",
    totalValue = 1000,
    partialReceipt = 300,
    delayDays = 0,
    bearer = "CARTEIRA",
  } = overrides;

  return [
    [
      "Tp",
      "Ser",
      "Número",
      "Seq",
      "NF Serviço",
      "Operação",
      "Vencto",
      "Vlr. Título",
      "",
      "Receb.Prc.",
      "",
      "",
      "Atraso",
      "",
      "Portador",
    ],
    [`Cliente: ${clientCode} - ${clientName} - CPF/CNPJ: ${cpfCnpj}`],
    [
      type,
      series,
      documentNumber,
      sequence,
      "",
      issueDate,
      dueDate,
      totalValue,
      "",
      partialReceipt,
      "",
      "",
      delayDays,
      "",
      bearer,
    ],
  ];
}

function manyRptRows(total) {
  return Array.from({ length: total }, (_, index) => rptRow({
    "Número Documento": String(index + 1),
  }));
}

test("gera prévia usando RPT e FINR", () => {
  const result = buildImportPreview({
    rptRows: [rptRow()],
    finrRows: finrRows(),
  });

  assert.equal(result.rptItems.length, 1);
  assert.equal(result.finrItems.length, 1);
  assert.equal(result.consolidados.length, 1);
  assert.equal(result.consolidados[0]._meta.source_status, "RPT_E_FINR");
});

test("retorna registros parseados de RPT", () => {
  const result = buildImportPreview({ rptRows: [rptRow()] });

  assert.equal(result.rptItems[0]["Código Cliente"], "10");
  assert.equal(result.rptItems[0]["Valor Total (R$)"], 1000);
});

test("retorna registros parseados de FINR", () => {
  const result = buildImportPreview({ finrRows: finrRows() });

  assert.equal(result.finrItems[0]["CPF/CNPJ"], "10.000.000/0001-10");
  assert.equal(result.finrItems[0].Portador, "CARTEIRA");
});

test("retorna registros consolidados", () => {
  const result = buildImportPreview({
    rptRows: [rptRow()],
    finrRows: finrRows(),
  });

  assert.equal(result.consolidados.length, 1);
  assert.deepEqual(result.consolidados[0]._meta.sources_found, ["RPT_7007", "FINR1253"]);
});

test("retorna diagnósticos da consolidação", () => {
  const result = buildImportPreview({ rptRows: [rptRow()] });

  assert.equal(result.diagnosticos[0].code, "ONLY_IN_RPT");
  assert.equal(result.resumo.totalDiagnosticos, 1);
});

test("retorna resumo geral com totais e registros que precisam de revisão", () => {
  const result = buildImportPreview({
    rptRows: [rptRow({ "Valor Total": 1000 })],
    finrRows: finrRows({ totalValue: 1200 }),
  });

  assert.deepEqual(result.resumo, {
    totalRPT: 1,
    totalFINR: 1,
    totalConsolidados: 1,
    somenteRPT: 0,
    somenteFINR: 0,
    emAmbas: 1,
    comConflito: 1,
    totalDiagnosticos: 1,
    totalNeedsReview: 1,
  });
});

test("detecta importação parcial com 60 consolidados para 500 ativos anteriores", () => {
  const result = buildImportPreview({
    rptRows: manyRptRows(60),
    totalAtivosAnteriores: 500,
  });

  assert.equal(result.resumo.totalConsolidados, 60);
  assert.equal(result.seguranca.importacaoParcial, true);
  assert.deepEqual(result.seguranca.alertas, [PARTIAL_IMPORT_ALERT]);
  assert.deepEqual(result.seguranca.bloqueios, [PARTIAL_IMPORT_ALERT]);
});

test("não considera parcial com 490 consolidados para 500 ativos anteriores", () => {
  const result = buildImportPreview({
    rptRows: manyRptRows(490),
    totalAtivosAnteriores: 500,
  });

  assert.equal(result.resumo.totalConsolidados, 490);
  assert.equal(result.seguranca.importacaoParcial, false);
});

test("importação parcial não permite baixa automática ou prosseguimento", () => {
  const result = buildImportPreview({
    rptRows: manyRptRows(60),
    totalAtivosAnteriores: 500,
  });

  assert.equal(result.seguranca.podeAplicarBaixaAutomatica, false);
  assert.equal(result.seguranca.podeProsseguir, false);
});

test("importação não parcial permite baixa automática e prosseguimento futuro", () => {
  const result = buildImportPreview({
    rptRows: manyRptRows(490),
    totalAtivosAnteriores: 500,
  });

  assert.equal(result.seguranca.podeAplicarBaixaAutomatica, true);
  assert.equal(result.seguranca.podeProsseguir, true);
  assert.deepEqual(result.seguranca.alertas, []);
  assert.deepEqual(result.seguranca.bloqueios, []);
});

test("não muta os arrays recebidos", () => {
  const rptRows = [rptRow()];
  const finrInputRows = finrRows();
  const originalRptRows = structuredClone(rptRows);
  const originalFinrRows = structuredClone(finrInputRows);

  buildImportPreview({ rptRows, finrRows: finrInputRows });

  assert.deepEqual(rptRows, originalRptRows);
  assert.deepEqual(finrInputRows, originalFinrRows);
});

test("continua funcionando com apenas RPT", () => {
  const result = buildImportPreview({ rptRows: [rptRow()] });

  assert.equal(result.resumo.somenteRPT, 1);
  assert.equal(result.resumo.somenteFINR, 0);
  assert.equal(result.consolidados[0]._meta.source_status, "SOMENTE_RPT");
});

test("continua funcionando com apenas FINR", () => {
  const result = buildImportPreview({ finrRows: finrRows() });

  assert.equal(result.resumo.somenteRPT, 0);
  assert.equal(result.resumo.somenteFINR, 1);
  assert.equal(result.consolidados[0]._meta.source_status, "SOMENTE_FINR");
});

test("repassa multaPercent e jurosPercent para o cálculo financeiro", () => {
  const result = buildImportPreview({
    rptRows: [rptRow({ "Atraso": 10 })],
    options: {
      multaPercent: 2,
      jurosPercent: 1,
    },
  });
  const [record] = result.consolidados;

  assert.equal(record["Saldo Restante (R$)"], 700);
  assert.equal(record["Multa (R$)"], 14);
  assert.equal(record["Juros (R$)"], 2.33);
  assert.equal(record["Total a Receber (R$)"], 716.33);
});
