import test from "node:test";
import assert from "node:assert/strict";

import { applyImportPlanToRows, getDataModeStatus, normalizeRemoteRow, normalizeRemoteWrite } from "./base44Client.js";

function title(overrides = {}) {
  return {
    id: "titulo-1",
    source: "FINR1253",
    client_code: "10",
    client_name: "CLIENTE TESTE LTDA",
    doc_type: "NF",
    title_number: "100",
    seq: "1",
    due_date: "2026-07-30",
    open_value: 100,
    active: true,
    current_status: "Em Cobrança",
    last_note: "Observação manual",
    promise_date: "2026-07-20",
    ...overrides,
  };
}

test("modo local fica explicitamente identificado sem variáveis do Supabase", () => {
  const status = getDataModeStatus();
  assert.equal(status.mode, "local");
  assert.equal(status.remoteAvailable, false);
  assert.equal(status.message, "Supabase não configurado. Dados somente neste navegador");
});

test("aplicação local atômica preserva campos manuais na atualização financeira", () => {
  const result = applyImportPlanToRows([title()], {
    canApply: true,
    creates: [],
    updates: [{ id: "titulo-1", payload: { open_value: 0, active: false, updated_by: "Importação Consolidada" } }],
    absences: [],
    summary: { totalCreate: 0, totalUpdate: 1, totalAbsence: 0 },
  }, "2026-07-15T12:00:00.000Z");

  assert.equal(result.rows[0].open_value, 0);
  assert.equal(result.rows[0].last_note, "Observação manual");
  assert.equal(result.rows[0].promise_date, "2026-07-20");
});

test("aplicação local mantém o mesmo título separado por origem", () => {
  const existing = title();
  const ebPayload = {
    ...title({ id: undefined, source: "RPT_7007_CONS_CAR_EB" }),
    id: undefined,
    current_status: "Não Contatado",
    workflow_status: "normal",
  };
  const result = applyImportPlanToRows([existing], {
    canApply: true,
    creates: [{ payload: ebPayload }],
    updates: [],
    absences: [],
    summary: { totalCreate: 1, totalUpdate: 0, totalAbsence: 0 },
  });

  assert.equal(result.rows.length, 2);
  assert.deepEqual(new Set(result.rows.map((row) => row.source)), new Set(["FINR1253", "RPT_7007_CONS_CAR_EB"]));
});

test("baixa por ausência local mantém o registro para o Impacto no Caixa", () => {
  const result = applyImportPlanToRows([title()], {
    canApply: true,
    creates: [],
    updates: [],
    absences: [{ id: "titulo-1", payload: { active: false, current_status: "Baixado", workflow_status: "baixado_importacao", current_motive: "Não consta na nova carteira importada" } }],
    summary: { totalCreate: 0, totalUpdate: 0, totalAbsence: 1 },
  });

  assert.equal(result.rows[0].active, false);
  assert.equal(result.rows[0].workflow_status, "baixado_importacao");
  assert.equal(result.rows[0].last_note, "Observação manual");
});

test("adaptador lê a tabela titles legada sem zerar saldo explícito", () => {
  const row = normalizeRemoteRow("Titulo", {
    id: "legacy-1",
    original_value: 1000,
    recebido_parcial: 300,
    current_value: 700,
    active: true,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-15T10:00:00Z",
  });

  assert.equal(row.received_value, 300);
  assert.equal(row.open_value, 700);
  assert.equal(row.erp_balance, 700);
  assert.equal(row.workflow_status, "normal");
  assert.equal(row.updated_date, "2026-07-15T10:00:00Z");
});

test("adaptador mantém colunas financeiras novas e legadas sincronizadas", () => {
  const payload = normalizeRemoteWrite("Titulo", { open_value: 0, received_value: 100 });
  assert.equal(payload.open_value, 0);
  assert.equal(payload.current_value, 0);
  assert.equal(payload.calculado, 0);
  assert.equal(payload.recebido_parcial, 100);
});

test("adaptador converte titulo_id do app para title_id do Supabase", () => {
  const payload = normalizeRemoteWrite("ChargeEvent", { titulo_id: "titulo-1", event_type: "COBRANCA" });
  assert.equal(payload.title_id, "titulo-1");
  assert.equal("titulo_id" in payload, false);
});
