import {
  buildOfficialTitleKey,
  getStatusBaixaPorAusencia,
  isImportacaoParcial,
  isTituloElegivelCarteira,
  normalizeImportSource,
} from "./domain.js";

const MANAGED_SOURCES = new Set([
  "FINR1253",
  "RPT_7007",
  "RPT_7007_CONS_CAR_EB",
  "RPT_E_FINR",
]);

export const STALE_APPLICATION_PLAN_MESSAGE =
  "A carteira mudou desde que o plano foi gerado. Gere uma nova prévia antes de aplicar.";

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
  return normalizeImportSource(
    record?.source ||
    record?.origem ||
    record?._meta?.origem_detectada ||
    record?._meta?.source_status ||
    "RPT_E_FINR",
  );
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

function getImportedSourceCoverage(preview, consolidados) {
  const hasRPT = Array.isArray(preview?.rptItems) && preview.rptItems.length > 0;
  const hasFINR = Array.isArray(preview?.finrItems) && preview.finrItems.length > 0;

  if (hasRPT && hasFINR) return new Set(MANAGED_SOURCES);
  if (hasRPT) return new Set(["RPT_7007", "RPT_7007_CONS_CAR_EB"]);
  if (hasFINR) return new Set(["FINR1253"]);

  const sources = new Set();
  for (const record of consolidados) {
    const source = sourceFromRecord(record);
    if (source === "RPT_7007_CONS_CAR_EB") {
      sources.add("RPT_7007");
      sources.add("RPT_7007_CONS_CAR_EB");
    } else if (source === "RPT_E_FINR") {
      MANAGED_SOURCES.forEach((managedSource) => sources.add(managedSource));
    } else {
      sources.add(source);
    }
  }

  return sources;
}

function isCoveredManagedActiveTitle(item, coveredSources) {
  return isManagedActiveTitle(item) && coveredSources.has(String(item?.source || ""));
}

function buildAlternativeTitleKey(item) {
  return buildOfficialTitleKey(item).split("|").slice(0, 5).join("|");
}

function addToIndex(index, key, item) {
  const items = index.get(key) || [];
  items.push(item);
  index.set(key, items);
}

function normalizedClientName(item = {}) {
  return String(
    item["Nome Cliente"] ?? item.client_name ?? item.nomeCli ?? "",
  )
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(LTDA|EIRELI|S A|SA|ME|EPP)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countUniqueClients(items = []) {
  return new Set(items.map(normalizedClientName).filter(Boolean)).size;
}

function openValue(item = {}) {
  const values = [
    item["Saldo Restante (R$)"],
    item.open_value,
    item.valorEmAberto,
    item.erp_balance,
    item.original_value,
  ];
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return Number(value) || 0;
  }
  return 0;
}

export function getApplicationWriteTotals(plan = {}) {
  return {
    totalCreate: Number(plan?.summary?.totalCreate || 0),
    totalUpdate: Number(plan?.summary?.totalUpdate || 0),
    totalAbsence: Number(plan?.summary?.totalAbsence || 0),
  };
}

export function getApplicationPlanSignature(plan = {}) {
  const sorted = (items) => [...items].sort();

  return {
    totals: getApplicationWriteTotals(plan),
    creates: sorted((plan?.creates || []).map((item) => item.key)),
    updates: sorted((plan?.updates || []).map((item) => `${item.id}|${item.key}`)),
    absences: sorted((plan?.absences || []).map((item) => `${item.id}|${item.key}`)),
    reviews: sorted((plan?.reviewRequired || []).map((item) => `${item.code}|${item.key}|${item.alternativeKey}`)),
  };
}

export function assertApplicationPlanStillCurrent(planned, revalidated) {
  const expected = getApplicationPlanSignature(planned);
  const current = getApplicationPlanSignature(revalidated);

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

export function canApplyAbsenceSafely({
  preview,
  totalAtivosAnteriores = 0,
  totalNovaImportacao = 0,
} = {}) {
  const hasPreview = Boolean(preview && typeof preview === "object");
  const totalAtual = Number(totalNovaImportacao || 0);
  const importacaoParcial = !hasPreview ||
    totalAtual <= 0 ||
    preview?.seguranca?.importacaoParcial === true ||
    isImportacaoParcial({
      totalAtivosAnteriores,
      totalNovaImportacao: totalAtual,
    });

  return hasPreview &&
    totalAtual > 0 &&
    !importacaoParcial &&
    preview?.seguranca?.podeProsseguir !== false &&
    preview?.seguranca?.podeAplicarBaixaAutomatica !== false &&
    !(Array.isArray(preview?.seguranca?.bloqueios) && preview.seguranca.bloqueios.length > 0);
}

export function buildImportApplicationPlan({
  preview,
  existingTitles = [],
  importFile = "",
} = {}) {
  const consolidados = Array.isArray(preview?.consolidados) ? preview.consolidados : [];
  const sourceRecords = [
    ...(Array.isArray(preview?.rptItems) ? preview.rptItems : []),
    ...(Array.isArray(preview?.finrItems) ? preview.finrItems : []),
  ];
  // A consolidação continua servindo para diagnósticos e conferência visual,
  // mas a persistência precisa manter EB e Topcon como títulos separados.
  const recordsForPersistence = sourceRecords.length > 0 ? sourceRecords : consolidados;
  const uniqueImportedByKey = new Map();
  const duplicateImported = [];
  for (const record of recordsForPersistence) {
    const key = buildOfficialTitleKey(record);
    if (uniqueImportedByKey.has(key)) {
      duplicateImported.push({
        code: "DUPLICATE_IMPORTED_TITLE_KEY",
        key,
        record,
      });
      continue;
    }
    uniqueImportedByKey.set(key, record);
  }
  const importedRecords = Array.from(uniqueImportedByKey.values());
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
  const reviewRequired = [...duplicateImported];
  const matchedExistingIds = new Set();
  const protectedExistingIds = new Set();
  const coveredSources = getImportedSourceCoverage(preview, importedRecords);

  for (const record of importedRecords) {
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

  const potentialAbsenceCandidates = existing.filter((item) =>
    isManagedActiveTitle(item) &&
    !matchedExistingIds.has(item.id) &&
    !protectedExistingIds.has(item.id),
  );
  const absenceCandidates = coveredSources.size > 0
    ? potentialAbsenceCandidates.filter((item) => isCoveredManagedActiveTitle(item, coveredSources))
    : [];
  const managedActiveCount = coveredSources.size > 0
    ? existing.filter((item) => isCoveredManagedActiveTitle(item, coveredSources)).length
    : existing.filter(isManagedActiveTitle).length;
  const totalConsolidados = importedRecords.length;
  const importacaoParcial = !preview ||
    totalConsolidados <= 0 ||
    preview?.seguranca?.importacaoParcial === true ||
    isImportacaoParcial({
      totalAtivosAnteriores: managedActiveCount,
      totalNovaImportacao: totalConsolidados,
    });
  const canApplyAbsence = canApplyAbsenceSafely({
    preview,
    totalAtivosAnteriores: managedActiveCount,
    totalNovaImportacao: totalConsolidados,
  });
  const absences = canApplyAbsence
    ? absenceCandidates.map((item) => ({
        key: buildOfficialTitleKey(item),
        id: item.id,
        existing: item,
        payload: getStatusBaixaPorAusencia(),
      }))
    : [];
  const absenceBlocked = canApplyAbsence
    ? []
    : (coveredSources.size > 0 ? absenceCandidates : potentialAbsenceCandidates);
  const coveredActiveTitles = coveredSources.size > 0
    ? existing.filter((item) => isCoveredManagedActiveTitle(item, coveredSources))
    : [];
  const previousCount = coveredActiveTitles.length;
  const coverageRatio = previousCount > 0 ? totalConsolidados / previousCount : 1;

  return {
    creates,
    updates,
    unchanged,
    reviewRequired,
    absences,
    absenceBlocked,
    canApply: importedRecords.length > 0 && reviewRequired.length === 0,
    summary: {
      totalCreate: creates.length,
      totalUpdate: updates.length,
      totalUnchanged: unchanged.length,
      totalNeedsReview: reviewRequired.length,
      totalAbsenceCandidates: absenceCandidates.length,
      totalAbsence: absences.length,
      totalAbsenceBlocked: canApplyAbsence
        ? 0
        : (coveredSources.size > 0 ? absenceCandidates.length : potentialAbsenceCandidates.length),
    },
    snapshot: {
    source: importedRecords[0] ? sourceFromRecord(importedRecords[0]) : "",
      coveredSources: Array.from(coveredSources),
      current: {
        titles: coveredActiveTitles.length,
        clients: countUniqueClients(coveredActiveTitles),
        value: coveredActiveTitles.reduce((sum, item) => sum + openValue(item), 0),
      },
      imported: {
        titles: importedRecords.length,
        clients: countUniqueClients(importedRecords),
        value: importedRecords.reduce((sum, item) => sum + openValue(item), 0),
      },
    },
    safety: {
      importacaoParcial,
      podeAplicarBaixaAutomatica: canApplyAbsence,
      totalAtivosOrigem: previousCount,
      totalImportadosOrigem: totalConsolidados,
      percentualCobertura: Math.round(coverageRatio * 10000) / 100,
      motivoBloqueio: canApplyAbsence
        ? ""
        : importacaoParcial
          ? `O relatório representa ${Math.round(coverageRatio * 10000) / 100}% da carteira ativa desta origem; a baixa por ausência foi bloqueada.`
          : "A baixa por ausência foi bloqueada pelos alertas de segurança da Pré-validação.",
    },
  };
}
