import assert from "node:assert/strict";
import test from "node:test";

import {
  STALE_APPLICATION_PLAN_MESSAGE,
  assertApplicationPlanStillCurrent,
  buildImportApplicationPlan,
  canApplyAbsenceSafely,
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

test("persistência mantém o mesmo título separado entre EB e Topcon", () => {
  const rpt = canonical({ _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" } });
  const finr = canonical({ _meta: { source_status: "SOMENTE_FINR", origem_detectada: "FINR1253" } });
  const plan = buildImportApplicationPlan({
    preview: {
      ...preview([canonical()]),
      rptItems: [rpt],
      finrItems: [finr],
    },
    existingTitles: [],
  });

  assert.equal(plan.summary.totalCreate, 2);
  assert.deepEqual(
    new Set(plan.creates.map((item) => item.payload.source)),
    new Set(["RPT_7007_CONS_CAR_EB", "FINR1253"]),
  );
});

test("atualização preserva campos manuais ao omiti-los do payload", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 650 })]),
    existingTitles: [existing()],
  });

  assert.equal(plan.summary.totalUpdate, 1);
  assert.equal(plan.updates[0].payload.open_value, 650);
  assert.equal(plan.updates[0].payload.erp_balance, 650);
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

test("importacao completa e segura permite baixa por ausencia", () => {
  const safePreview = preview([canonical({ "Número Documento": "999" })]);
  const plan = buildImportApplicationPlan({
    preview: safePreview,
    existingTitles: [existing()],
  });

  assert.equal(canApplyAbsenceSafely({
    preview: safePreview,
    totalAtivosAnteriores: 1,
    totalNovaImportacao: 1,
  }), true);
  assert.equal(plan.summary.totalAbsence, 1);
  assert.equal(plan.safety.podeAplicarBaixaAutomatica, true);
});

test("sem previa ou sem registros consolidados bloqueia baixa por ausencia", () => {
  const withoutPreview = buildImportApplicationPlan({
    existingTitles: [existing()],
  });
  const emptyPreview = buildImportApplicationPlan({
    preview: preview([]),
    existingTitles: [existing()],
  });

  assert.equal(withoutPreview.summary.totalAbsence, 0);
  assert.equal(withoutPreview.summary.totalAbsenceBlocked, 1);
  assert.equal(withoutPreview.safety.podeAplicarBaixaAutomatica, false);
  assert.equal(emptyPreview.summary.totalAbsence, 0);
  assert.equal(emptyPreview.summary.totalAbsenceBlocked, 1);
  assert.equal(emptyPreview.safety.podeAplicarBaixaAutomatica, false);
});

test("importação parcial bloqueia baixas automáticas sem aprovação individual", () => {
  const plan = buildImportApplicationPlan({
    preview: preview([], true),
    existingTitles: [existing()],
  });

  assert.equal(plan.absences.length, 0);
  assert.equal(plan.summary.totalAbsenceBlocked, 1);
  assert.equal(plan.safety.podeAplicarBaixaAutomatica, false);
});

test("importacao muito menor que a base existente bloqueia baixa por ausencia", () => {
  const existingTitles = Array.from({ length: 10 }, (_, index) => existing({
    id: `titulo-${index + 1}`,
    title_number: String(1000 + index),
  }));
  const plan = buildImportApplicationPlan({
    preview: preview([canonical({ "Número Documento": "9999" })]),
    existingTitles,
  });

  assert.equal(plan.summary.totalAbsence, 0);
  assert.equal(plan.summary.totalAbsenceBlocked, 10);
  assert.equal(plan.summary.totalPossibleOrphans, 10);
  assert.equal(plan.possibleOrphans.length, 10);
  assert.equal(plan.possibleOrphans.every((item) => item.eligibleForManualApproval), true);
  assert.equal(plan.safety.importacaoParcial, true);
  assert.match(plan.safety.motivoBloqueio, /mínimo: 70%/);
  const reason = plan.safety.motivosBloqueio.find((item) => item.code === "COVERAGE_BELOW_THRESHOLD");
  assert.equal(reason.totalAtivosAnteriores, 10);
  assert.equal(reason.totalImportados, 1);
  assert.equal(reason.percentualCobertura, 10);
  assert.equal(reason.percentualMinimo, 70);
  assert.equal(reason.totalBloqueados, 10);
  assert.equal(reason.titles.length, 10);
});

test("importação parcial permite somente baixa individual aprovada e com chave exata", () => {
  const existingTitles = Array.from({ length: 10 }, (_, index) => existing({
    id: `titulo-${index + 1}`,
    title_number: String(1000 + index),
  }));
  const partialPreview = preview([canonical({ "Número Documento": "9999" })]);
  partialPreview.seguranca.approvedAbsenceIds = ["titulo-1"];
  const plan = buildImportApplicationPlan({
    preview: partialPreview,
    existingTitles,
  });

  assert.equal(plan.safety.importacaoParcial, true);
  assert.equal(plan.safety.podeAplicarBaixaAutomatica, false);
  assert.equal(plan.safety.baixasIndividuaisAprovadas, 1);
  assert.equal(plan.absences.length, 1);
  assert.equal(plan.absences[0].id, "titulo-1");
  assert.equal(plan.absences[0].approvalMode, "manual-partial");
  assert.equal(plan.summary.totalAbsenceBlocked, 9);
});

test("chave incompleta nunca pode ser aprovada em importação parcial", () => {
  const partialPreview = preview([canonical({ "Número Documento": "9999" })]);
  partialPreview.seguranca.approvedAbsenceIds = ["titulo-1"];
  const plan = buildImportApplicationPlan({
    preview: partialPreview,
    existingTitles: [
      existing({ seq: "" }),
      ...Array.from({ length: 9 }, (_, index) => existing({
        id: `outro-${index}`,
        title_number: String(2000 + index),
      })),
    ],
  });

  const incomplete = plan.possibleOrphans.find((item) => item.id === "titulo-1");
  assert.equal(incomplete.completeKey, false);
  assert.equal(incomplete.eligibleForManualApproval, false);
  assert.equal(plan.absences.some((item) => item.id === "titulo-1"), false);
});

test("chave incompleta também fica fora da baixa automática com cobertura suficiente", () => {
  const fullPreview = preview([canonical({ "Número Documento": "9999" })]);
  const plan = buildImportApplicationPlan({
    preview: fullPreview,
    existingTitles: [existing({ seq: "" })],
  });

  assert.equal(plan.safety.podeAplicarBaixaAutomatica, true);
  assert.equal(plan.possibleOrphans[0].completeKey, false);
  assert.equal(plan.absences.length, 0);
  assert.equal(plan.absenceBlocked.length, 1);
});

test("importacao RPT isolada nao baixa titulo FINR ausente", () => {
  const rptOnlyPreview = {
    ...preview([canonical({
      "Número Documento": "999",
      _meta: { source_status: "SOMENTE_RPT", needs_review: false },
    })]),
    rptItems: [canonical()],
    finrItems: [],
  };
  const plan = buildImportApplicationPlan({
    preview: rptOnlyPreview,
    existingTitles: [existing({ source: "FINR1253" })],
  });

  assert.equal(plan.summary.totalAbsenceCandidates, 0);
  assert.equal(plan.summary.totalAbsence, 0);
  assert.equal(plan.possibleOrphans.length, 0);
  assert.equal(plan.summary.totalAbsenceBlocked, 1);
  const uncovered = plan.safety.motivosBloqueio.find((item) => item.code === "SOURCE_NOT_COVERED");
  assert.deepEqual(uncovered.sources, ["FINR1253"]);
  assert.equal(uncovered.totalBloqueados, 1);
  assert.equal(uncovered.titles[0].id, "titulo-1");
});

test("fontes são avaliadas separadamente para baixa automática", () => {
  const rptItems = Array.from({ length: 8 }, (_, index) => canonical({
    "Número Documento": String(1000 + index),
    _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" },
  }));
  const finrItems = [canonical({
    "Número Documento": "2000",
    _meta: { source_status: "SOMENTE_FINR", origem_detectada: "FINR1253" },
  })];
  const sourcePreview = {
    ...preview([...rptItems, ...finrItems]),
    rptItems,
    finrItems,
  };
  const existingTitles = [
    ...Array.from({ length: 10 }, (_, index) => existing({
      id: `rpt-${index}`,
      source: "RPT_7007_CONS_CAR_EB",
      title_number: String(1000 + index),
    })),
    ...Array.from({ length: 10 }, (_, index) => existing({
      id: `finr-${index}`,
      source: "FINR1253",
      title_number: String(2000 + index),
    })),
  ];
  const plan = buildImportApplicationPlan({ preview: sourcePreview, existingTitles });
  const rptCoverage = plan.safety.coberturaPorFonte.find((item) => item.source === "RPT_7007_CONS_CAR_EB");
  const finrCoverage = plan.safety.coberturaPorFonte.find((item) => item.source === "FINR1253");

  assert.equal(rptCoverage.percentual, 80);
  assert.equal(rptCoverage.podeAplicarBaixaAutomatica, true);
  assert.equal(finrCoverage.percentual, 10);
  assert.equal(finrCoverage.podeAplicarBaixaAutomatica, false);
  assert.deepEqual(plan.absences.map((item) => item.id).sort(), ["rpt-8", "rpt-9"]);
  assert.equal(plan.absenceBlocked.length, 9);
});

test("fonte legada combinada aparece como órfão sem baixa cruzada", () => {
  const rptRecord = canonical({
    "Número Documento": "999",
    _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" },
  });
  const sourcePreview = {
    ...preview([rptRecord]),
    rptItems: [rptRecord],
    finrItems: [],
  };
  const plan = buildImportApplicationPlan({
    preview: sourcePreview,
    existingTitles: [existing({ source: "RPT_E_FINR" })],
  });

  assert.equal(plan.possibleOrphans.length, 1);
  assert.equal(plan.possibleOrphans[0].coverage.legacyCombined, true);
  assert.equal(plan.possibleOrphans[0].eligibleForManualApproval, false);
  assert.equal(plan.absences.length, 0);
});

test("fonte legada combinada só baixa automaticamente com RPT e FINR seguros", () => {
  const rptRecord = canonical({
    "Número Documento": "900",
    _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" },
  });
  const finrRecord = canonical({
    "Número Documento": "901",
    _meta: { source_status: "SOMENTE_FINR", origem_detectada: "FINR1253" },
  });
  const sourcePreview = {
    ...preview([rptRecord, finrRecord]),
    rptItems: [rptRecord],
    finrItems: [finrRecord],
  };
  const plan = buildImportApplicationPlan({
    preview: sourcePreview,
    existingTitles: [existing({ source: "RPT_E_FINR" })],
  });

  assert.equal(plan.possibleOrphans[0].sourceCoverage.coverageBasis, "RPT_7007_CONS_CAR_EB + FINR1253");
  assert.equal(plan.possibleOrphans[0].automatic, true);
  assert.equal(plan.absences[0].approvalMode, "automatic");
});

test("fonte legada combinada também respeita o limite de 70%", () => {
  const rptRecord = canonical({
    "Número Documento": "900",
    _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" },
  });
  const finrRecord = canonical({
    "Número Documento": "901",
    _meta: { source_status: "SOMENTE_FINR", origem_detectada: "FINR1253" },
  });
  const plan = buildImportApplicationPlan({
    preview: {
      ...preview([rptRecord, finrRecord]),
      rptItems: [rptRecord],
      finrItems: [finrRecord],
    },
    existingTitles: Array.from({ length: 10 }, (_, index) => existing({
      id: `legacy-${index}`,
      source: "RPT_E_FINR",
      title_number: String(1000 + index),
    })),
  });

  const legacyCoverage = plan.safety.coberturaPorFonte.find((item) => item.source === "RPT_E_FINR");
  assert.equal(legacyCoverage.percentual, 10);
  assert.equal(legacyCoverage.podeAplicarBaixaAutomatica, false);
  assert.equal(plan.absences.length, 0);
  assert.equal(plan.absenceBlocked.length, 10);
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
  const rptRecord = canonical({
    "Número Documento": "999",
    _meta: { source_status: "SOMENTE_RPT", origem_detectada: "RPT_7007_CONS_CAR_EB" },
  });
  const plan = buildImportApplicationPlan({
    preview: {
      ...preview([rptRecord]),
      rptItems: [rptRecord],
      finrItems: [],
    },
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

test("bloqueia plano com mesma quantidade de gravações mas alvo diferente", () => {
  const displayed = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 650 })]),
    existingTitles: [existing({ id: "titulo-1" })],
  });
  const revalidated = buildImportApplicationPlan({
    preview: preview([canonical({ "Saldo Restante (R$)": 650 })]),
    existingTitles: [existing({ id: "titulo-2" })],
  });

  assert.equal(displayed.summary.totalUpdate, 1);
  assert.equal(revalidated.summary.totalUpdate, 1);
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

test("planeja mil títulos em memória sem comparação quadrática", () => {
  const total = 1000;
  const existingTitles = Array.from({ length: total }, (_, index) => existing({
    id: `titulo-${index}`,
    title_number: String(10000 + index),
  }));
  const consolidados = Array.from({ length: total }, (_, index) => canonical({
    "Número Documento": String(10000 + index),
  }));
  const startedAt = performance.now();
  const plan = buildImportApplicationPlan({
    preview: preview(consolidados),
    existingTitles,
  });
  const elapsed = performance.now() - startedAt;

  assert.equal(plan.summary.totalUnchanged, total);
  assert.equal(plan.summary.totalCreate, 0);
  assert.ok(elapsed < 2000, `planejamento levou ${elapsed.toFixed(0)}ms`);
});
