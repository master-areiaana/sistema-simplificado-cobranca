import assert from "node:assert/strict";
import test from "node:test";

import { applyImportPlanToRows } from "../../api/base44Client.js";
import { buildImportApplicationPlan } from "./applyImport.js";
import { parseFINR1253Canonical } from "./parsers.js";
import { REAL_FINR_FINANCIAL_ROWS } from "./realImportFinancialFixtures.js";

function realFinrRows() {
  return [
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Título", "Acréscimo", "Receb.Prc.", "Calculada", "Receber", "Atraso", "Úteis", "Portador"],
    ["Cliente: 1 - CLIENTE FINR ANONIMIZADO LTDA - CPF/CNPJ: 00.000.000/0001-00"],
    ...REAL_FINR_FINANCIAL_ROWS.map(([original, acrescimo, saldo, juros, receber], index) => [
      "FAT", "152", 100000 + index, "1", "", 46042, 46077,
      original, acrescimo, saldo, juros, receber, 1, "", "CARTEIRA",
    ]),
  ];
}

function preview(finrItems) {
  return {
    consolidados: finrItems,
    finrItems,
    seguranca: {
      importacaoParcial: false,
      podeAplicarBaixaAutomatica: true,
    },
  };
}

test("fluxo real FINR remove um ausente da Carteira, envia ao Impacto e preserva dados manuais", () => {
  const imported = parseFINR1253Canonical(realFinrRows());
  assert.equal(imported.length, 199);

  const initialPlan = buildImportApplicationPlan({
    preview: preview(imported),
    existingTitles: [],
    importFile: "finr1253.xls",
  });
  assert.equal(initialPlan.summary.totalCreate, 199);
  const initialApplication = applyImportPlanToRows([], initialPlan, "2026-07-16T10:00:00.000Z");

  const missingTitle = initialApplication.rows.at(-1);
  const rowsWithManualData = initialApplication.rows.map((row) => (
    row.id === missingTitle.id
      ? { ...row, last_note: "Observação manual preservada", promise_date: "2026-07-31" }
      : row
  ));

  const nextImport = imported.slice(0, -1);
  const absencePlan = buildImportApplicationPlan({
    preview: preview(nextImport),
    existingTitles: rowsWithManualData,
    importFile: "finr1253-atualizado.xls",
  });

  assert.equal(absencePlan.safety.importacaoParcial, false);
  assert.equal(absencePlan.safety.podeAplicarBaixaAutomatica, true);
  assert.equal(absencePlan.summary.totalAbsence, 1);
  assert.equal(absencePlan.absences[0].id, missingTitle.id);

  const finalApplication = applyImportPlanToRows(
    rowsWithManualData,
    absencePlan,
    "2026-07-16T11:00:00.000Z",
  );
  const carteiraGeral = finalApplication.rows.filter((row) => row.active !== false);
  const impactoNoCaixa = finalApplication.rows.filter((row) => (
    row.active === false && row.workflow_status === "baixado_importacao"
  ));
  const lowered = impactoNoCaixa.find((row) => row.id === missingTitle.id);

  assert.equal(carteiraGeral.length, 198);
  assert.equal(impactoNoCaixa.length, 1);
  assert.equal(lowered.current_status, "Baixado");
  assert.equal(lowered.current_motive, "Não consta na nova carteira importada");
  assert.equal(lowered.last_note, "Observação manual preservada");
  assert.equal(lowered.promise_date, "2026-07-31");
});
