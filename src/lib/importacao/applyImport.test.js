import assert from "node:assert/strict";
import test from "node:test";

import {
  STALE_APPLICATION_PLAN_MESSAGE,
  assertApplicationPlanStillCurrent,
  buildImportApplicationPlan,
  createImportApplicationAttemptGuard,
} from "./applyImport.js";

function canonical(overrides = {}) {
  return {
    "Código Cliente": "10",
    "Tipo Documento": "DM",
    "Número Documento": "123",
    "Sequência": "1",
    "Data Vencimento": "2026-06-01",
    "Nome Cliente": "Cliente Teste",
    "Série": "A",
    "NF Serviço": "",
    "Data Emissão": "2026-05-01",
    "Valor Total (R$)": 1000,
    "Receb. Parcial (R$)": 300,
    "Saldo Restante (R$)": 700,
    Portador: "001",
    _meta: { source_status: "RPT_E_FINR", needs_review: false },
    ...overrides,
  };
}

function existing(overrides = {}) {
  return {
    id: "titulo-1",
    source: "RPT_E_FINR",
    client_code: "10",
    client_name: "Cliente Teste",
    doc_type: "DM",
    serie: "A",
    title_number: "123",
    seq: "1",
    nf_servico: null,
    issue_date: "2026-05-01",
    due_date: "2026-06-01",
    original_value: 1000,
    received_value: 300,
    open_value: 700,
    erp_balance: 700,
    portador: "001",
    active: true,
    current_status: "Em Cobrança",
    workflow_status: "normal",
    last_note: "Preservar",
    promise_date: "2026-06-20",
    ...overrides,
  };
}

function preview(consolidados, partial = false) {
  return {
    consolidados,
    seguranca: {
      importacaoParcial: partial,
      podeAplicarBaixaAutomatica: !partial,
    },
  };
}

test("cria título canônico novo sem apagar dados", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical()]),
    existingTitles: [],
    importFile: "rpt.xlsx + finr.xlsx",
  });

  assert.equal(plan.summary.totalCreate, 1);
  assert.equal(plan.creates[0].payload.original_value, 1000);
  assert.equal(plan.creates[0].payload.open_value, 700);
  assert.equal(plan.creates[0].payload.active, true);
});

test("atualização preserva campos manuais ao omiti-los do payload", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 650 })]),
    existingTitles: [existing()],
  });

  assert.equal(plan.summary.totalUpdate, 1);
  assert.equal(plan.updates[0].payload.open_value, 650);
  assert.equal("last_note" in plan.updates[0].payload, false);
  assert.equal("promise_date" in plan.updates[0].payload, false);
  assert.equal("contact_count" in plan.updates[0].payload, false);
  assert.equal("last_contact_date" in plan.updates[0].payload, false);
  assert.equal("current_contact_type" in plan.updates[0].payload, false);
  assert.equal("client_category" in plan.updates[0].payload, false);
});

test("data antiga equivalente encontra título existente e vira update", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Data Vencimento": "2026-06-01", "Saldo Restante (R$)": 650 })]),
    existingTitles: [existing({ due_date: "01/06/2026" })],
  });

  assert.equal(plan.summary.totalCreate, 0);
  assert.equal(plan.summary.totalUpdate, 1);
  assert.equal(plan.updates[0].id, "titulo-1");
});

test("sequência embutida no título antigo encontra registro canônico", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({
      "Número Documento": "10457",
      "Sequência": "1",
      "Saldo Restante (R$)": 650,
    })]),
    existingTitles: [existing({
      title_number: "10457/1",
      seq: "",
    })],
  });

  assert.equal(plan.summary.totalCreate, 0);
  assert.equal(plan.summary.totalUpdate, 1);
  assert.equal(plan.updates[0].id, "titulo-1");
});

test("pareamento alternativo único vira update e não entra em baixa", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({
      "Data Vencimento": "2026-06-15",
      "Saldo Restante (R$)": 650,
    })]),
    existingTitles: [existing({ due_date: "2026-06-01" })],
  });

  assert.equal(plan.updates[0].matchType, "alternative");
  assert.equal(plan.summary.totalCreate, 0);
  assert.equal(plan.summary.totalAbsence, 0);
});

test("baixa por ausência apenas inativa e mantém o registro", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Número Documento": "999" })]),
    existingTitles: [existing()],
  });

  assert.deepEqual(plan.absences[0].payload, {
    active: false,
    current_status: "Baixado",
    workflow_status: "baixado_importacao",
    current_motive: "Não consta na nova carteira importada",
  });
  assert.deepEqual(Object.keys(plan.absences[0].payload).sort(), [
    "active",
    "current_motive",
    "current_status",
    "workflow_status",
  ]);
  assert.equal(plan.summary.totalAbsence, 1);
});

test("importação parcial bloqueia todas as baixas por ausência", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([], true),
    existingTitles: [existing()],
  });

  assert.equal(plan.absences.length, 0);
  assert.equal(plan.summary.totalAbsenceBlocked, 1);
  assert.equal(plan.safety.podeAplicarBaixaAutomatica, false);
});

test("múltiplos candidatos equivalentes exigem revisão sem criar ou baixar", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Data Vencimento": "2026-06-20" })]),
    existingTitles: [
      existing({ id: "titulo-1", due_date: "2026-06-01" }),
      existing({ id: "titulo-2", due_date: "2026-06-15" }),
    ],
  });

  assert.equal(plan.summary.totalNeedsReview, 1);
  assert.equal(plan.reviewRequired[0].code, "AMBIGUOUS_EXISTING_TITLE_MATCH");
  assert.equal(plan.summary.totalCreate, 0);
  assert.equal(plan.summary.totalAbsence, 0);
  assert.equal(plan.canApply, false);
});

test("RPT_7007 é fonte gerenciada para baixa realmente ausente", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Número Documento": "999" })]),
    existingTitles: [existing({ source: "RPT_7007" })],
  });

  assert.equal(plan.summary.totalAbsence, 1);
  assert.equal(plan.absences[0].id, "titulo-1");
});

test("saldo zero e status pago não ficam ativos na Carteira Geral", () => {
  const zero = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 0 })]),
  });
  const pago = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 700 })]),
    existingTitles: [existing({ current_status: "Pago" })],
  });

  assert.equal(zero.creates[0].payload.active, false);
  assert.equal(pago.updates[0].payload.active, false);
});

test("título baixado por importação reaparece sem perder campos manuais", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical()]),
    existingTitles: [existing({
      active: false,
      current_status: "Baixado",
      current_motive: "Não consta na nova carteira importada",
      workflow_status: "baixado_importacao",
    })],
  });

  assert.equal(plan.updates[0].payload.active, true);
  assert.equal(plan.updates[0].payload.current_status, "Não Contatado");
  assert.equal(plan.updates[0].payload.workflow_status, "normal");
  assert.equal("last_note" in plan.updates[0].payload, false);
});

test("não altera os arrays recebidos", () => {
  const sourcePreview = preview([canonical()]);
  const sourceExisting = [existing()];
  const snapshot = JSON.stringify({ sourcePreview, sourceExisting });

  buildImportApplicationPlan({
    preview: sourcePreview,
    existingTitles: sourceExisting,
  });

  assert.equal(JSON.stringify({ sourcePreview, sourceExisting }), snapshot);
});

test("bloqueia aplicação quando a carteira muda desde o plano exibido", () => {
  const displayed = buildImportApplicationPlan({
    preview: preview([canonical()]),
    existingTitles: [],
  });
  const revalidated = buildImportApplicationPlan({
    preview: preview([canonical()]),
    existingTitles: [existing()],
  });

  assert.throws(
    () => assertApplicationPlanStillCurrent(displayed, revalidated),
    { message: STALE_APPLICATION_PLAN_MESSAGE },
  );
});

test("falha parcial consome o plano até gerar nova prévia ou plano", () => {
  const guard = createImportApplicationAttemptGuard();

  assert.equal(guard.begin(), true);
  guard.finish();
  assert.equal(guard.begin(), false);
  guard.reset();
  assert.equal(guard.begin(), true);
});

test("aplicação em andamento bloqueia clique duplo e reexecução", () => {
  const guard = createImportApplicationAttemptGuard();

  assert.equal(guard.begin(), true);
  assert.equal(guard.begin(), false);
  guard.finish();
  assert.equal(guard.begin(), false);
});
