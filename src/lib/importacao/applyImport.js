import {
  buildOfficialTitleKey,
  getStatusBaixaPorAusencia,
  isImportacaoParcial,
  isTituloElegivelCarteira,
} from "./domain.js";

const MANAGED_SOURCES = new Set([
  "FINR1253",
  "RPT_7007",
  "RPT_7007_CONS_CAR_EB",
  "RPT_E_FINR",
]);

export const STALE_APPLICATION_PLAN_MESSAGE =
  "A carteira mudou desde que o plano foi gerado. Gere uma nova prévia antes de aplicar.";

export const PARTIAL_APPLICATION_FAILURE_MESSAGE =
  "A aplicação falhou parcialmente. Gere uma nova prévia antes de tentar novamente.";

const COMPARED_FIELDS = [
  "source",
  "client_code",
  "client_name",
  "doc_type",
  "serie",
  "title_number",
  "seq",
  "nf_servico",
  "issue_date",
  "due_date",
  "original_value",
  "received_value",
  "open_value",
  "erp_balance",
  "portador",
  "active",
];

function sourceFromRecord(record) {
  if (record?._meta?.source_status === "SOMENTE_RPT") return "RPT_7007_CONS_CAR_EB";
  if (record?._meta?.source_status === "SOMENTE_FINR") return "FINR1253";
  return "RPT_E_FINR";
}

function isReappearingImportAbsence(existing) {
  return existing?.workflow_status === "baixado_importacao";
}

function shouldBeActive(record, existing) {
  const reappearing = isReappearingImportAbsence(existing);

  return isTituloElegivelCarteira({
    ...record,
    active: existing?.active !== false || reappearing,
    current_status: reappearing ? "" : existing?.current_status,
    current_motive: reappearing ? "" : existing?.current_motive,
    workflow_status: reappearing ? "" : existing?.workflow_status,
  });
}

function canonicalToTituloPayload(record, existing, importFile) {
  return {
    source: sourceFromRecord(record),
    client_code: record["Código Cliente"] || null,
    client_name: record["Nome Cliente"] || "",
    doc_type: record["Tipo Documento"] || null,
    serie: record["Série"] || null,
    title_number: record["Número Documento"] || "",
    seq: record["Sequência"] || null,
    nf_servico: record["NF Serviço"] || null,
    issue_date: record["Data Emissão"] || null,
    due_date: record["Data Vencimento"] || null,
    original_value: Number(record["Valor Total (R$)"] || 0),
    received_value: Number(record["Receb. Parcial (R$)"] || 0),
    open_value: Number(record["Saldo Restante (R$)"] || 0),
    erp_balance: Number(record["Saldo Restante (R$)"] || 0),
    portador: record.Portador || null,
    active: shouldBeActive(record, existing),
    import_file: importFile || null,
  };
}

function createPayload(record, importFile) {
  return {
    ...canonicalToTituloPayload(record, null, importFile),
    current_status: "Não Contatado",
    current_motive: null,
    current_contact_type: null,
    client_category: null,
    promise_date: null,
    last_contact_date: null,
    last_note: null,
    contact_count: 0,
    protest_requested_by: null,
    workflow_status: "normal",
    updated_by: "Importação Consolidada",
  };
}

function updatePayload(record, existing, importFile) {
  const payload = {
    ...canonicalToTituloPayload(record, existing, importFile),
    updated_by: "Importação Consolidada",
  };

  if (isReappearingImportAbsence(existing)) {
    payload.current_status = "Não Contatado";
    payload.current_motive = null;
    payload.workflow_status = "normal";
  }

  return payload;
}

function sameValue(left, right) {
  if (typeof right === "number") return Math.abs(Number(left || 0) - right) < 0.005;
  if (typeof right === "boolean") return Boolean(left) === right;
  return String(left ?? "") === String(right ?? "");
}

function hasMeaningfulChange(existing, payload) {
  return COMPARED_FIELDS.some((field) => !sameValue(existing?.[field], payload[field])) ||
    isReappearingImportAbsence(existing);
}

function isManagedActiveTitle(item) {
  return item?.active !== false && MANAGED_SOURCES.has(String(item?.source || ""));
}

function buildAlternativeTitleKey(item) {
  return buildOfficialTitleKey(item).split("|").slice(0, 4).join("|");
}

function addToIndex(index, key, item) {
  const items = index.get(key) || [];
  items.push(item);
  index.set(key, items);
}

export function getApplicationWriteTotals(plan = {}) {
  return {
    totalCreate: Number(plan?.summary?.totalCreate || 0),
    totalUpdate: Number(plan?.summary?.totalUpdate || 0),
    totalAbsence: Number(plan?.summary?.totalAbsence || 0),
  };
}

export function assertApplicationPlanStillCurrent(planned, revalidated) {
  const expected = getApplicationWriteTotals(planned);
  const current = getApplicationWriteTotals(revalidated);

  if (JSON.stringify(expected) !== JSON.stringify(current)) {
    throw new Error(STALE_APPLICATION_PLAN_MESSAGE);
  }

  return revalidated;
}

export function createImportApplicationAttemptGuard() {
  let applying = false;
  let consumed = false;

  return {
    begin() {
      if (applying || consumed) return false;
      applying = true;
      consumed = true;
      return true;
    },
    finish() {
      applying = false;
    },
    reset() {
      applying = false;
      consumed = false;
    },
  };
}

export function buildImportApplicationPlan({
  preview,
  existingTitles = [],
  importFile = "",
} = {}) {
  const consolidados = Array.isArray(preview?.consolidados) ? preview.consolidados : [];
  const existing = Array.isArray(existingTitles) ? existingTitles : [];
  const exactExistingByKey = new Map();
  const alternativeExistingByKey = new Map();

  for (const item of existing) {
    addToIndex(exactExistingByKey, buildOfficialTitleKey(item), item);
    addToIndex(alternativeExistingByKey, buildAlternativeTitleKey(item), item);
  }

  const creates = [];
  const updates = [];
  const unchanged = [];
  const reviewRequired = [];
  const matchedExistingIds = new Set();
  const protectedExistingIds = new Set();

  for (const record of consolidados) {
    const key = buildOfficialTitleKey(record);
    const alternativeKey = buildAlternativeTitleKey(record);
    const exactCandidates = exactExistingByKey.get(key) || [];
    const alternativeCandidates = alternativeExistingByKey.get(alternativeKey) || [];
    const candidates = alternativeCandidates.length > 1
      ? alternativeCandidates
      : exactCandidates.length > 0
        ? exactCandidates
        : alternativeCandidates;
    const current = candidates.length === 1 ? candidates[0] : null;

    if (candidates.length > 1 || (current && matchedExistingIds.has(current.id))) {
      candidates.forEach((candidate) => protectedExistingIds.add(candidate.id));
      reviewRequired.push({
        code: "AMBIGUOUS_EXISTING_TITLE_MATCH",
        key,
        alternativeKey,
        candidateIds: candidates.map((candidate) => candidate.id),
        record,
      });
      continue;
    }

    if (!current) {
      creates.push({ key, payload: createPayload(record, importFile), record });
      continue;
    }

    matchedExistingIds.add(current.id);
    const payload = updatePayload(record, current, importFile);
    if (hasMeaningfulChange(current, payload)) {
      updates.push({
        key,
        id: current.id,
        matchType: exactCandidates.length === 1 ? "exact" : "alternative",
        payload,
        record,
      });
    } else {
      unchanged.push({
        key,
        id: current.id,
        matchType: exactCandidates.length === 1 ? "exact" : "alternative",
        record,
      });
    }
  }

  const absenceCandidates = existing.filter((item) =>
    isManagedActiveTitle(item) &&
    !matchedExistingIds.has(item.id) &&
    !protectedExistingIds.has(item.id),
  );
  const managedActiveCount = existing.filter(isManagedActiveTitle).length;
  const importacaoParcial = preview?.seguranca?.importacaoParcial === true ||
    isImportacaoParcial({
      totalAtivosAnteriores: managedActiveCount,
      totalNovaImportacao: consolidados.length,
    });
  const canApplyAbsence = !importacaoParcial &&
    preview?.seguranca?.podeAplicarBaixaAutomatica !== false;
  const absences = canApplyAbsence
    ? absenceCandidates.map((item) => ({
        key: buildOfficialTitleKey(item),
        id: item.id,
        existing: item,
        payload: getStatusBaixaPorAusencia(),
      }))
    : [];

  return {
    creates,
    updates,
    unchanged,
    reviewRequired,
    absences,
    canApply: consolidados.length > 0 && reviewRequired.length === 0,
    summary: {
      totalCreate: creates.length,
      totalUpdate: updates.length,
      totalUnchanged: unchanged.length,
      totalNeedsReview: reviewRequired.length,
      totalAbsenceCandidates: absenceCandidates.length,
      totalAbsence: absences.length,
      totalAbsenceBlocked: canApplyAbsence ? 0 : absenceCandidates.length,
    },
    safety: {
      importacaoParcial,
      podeAplicarBaixaAutomatica: canApplyAbsence,
    },
  };
}
