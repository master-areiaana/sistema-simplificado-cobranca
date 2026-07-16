import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const original = readFileSync(new URL("./20260715120000_atomic_import.sql", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("./20260716180000_fix_dates_and_source_reconciliation.sql", import.meta.url), "utf8");

test("migração atômica converte textos ISO para colunas date", () => {
  assert.match(original, /nullif\(v_payload->>'issue_date', ''\)::date/);
  assert.match(original, /nullif\(v_payload->>'due_date', ''\)::date/);
  assert.doesNotMatch(original, /current_date::text/);

  assert.match(reconciliation, /nullif\(v_payload->>'issue_date', ''\)::date/);
  assert.match(reconciliation, /nullif\(v_payload->>'promise_date', ''\)::date/);
  assert.doesNotMatch(reconciliation, /current_date::text/);
});

test("reconciliação integral é compacta, auditável e protege registros manuais", () => {
  assert.match(reconciliation, /create or replace function public\.apply_import_plan_v2/);
  assert.match(reconciliation, /title_import_reconciliation_audit/);
  assert.match(reconciliation, /source-reconciliation/);
  assert.match(reconciliation, /record_origin\)\), 'ERP'\) <> 'MANUAL'/);
  assert.match(reconciliation, /A carteira mudou durante a reconciliação/);
  assert.match(reconciliation, /Reconciliação cruzada entre origens bloqueada/);
});
