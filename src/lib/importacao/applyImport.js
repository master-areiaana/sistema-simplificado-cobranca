import {
  buildOfficialTitleKey,
  getImportCoverage,
  getStatusBaixaPorAusencia,
  hasCompleteOfficialTitleKey,
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
  const recordOrigin = String(item?.record_origin || "ERP").trim().toUpperCase();
  return item?.active !== false &&
    recordOrigin !== "MANUAL" &&
    MANAGED_SOURCES.has(String(item?.source || ""));
}

function buildImportedKeyPayload(record, importFile) {
  const payload = canonicalToTituloPayload(record, null, importFile);
  return {
    source: payload.source,
    client_code: payload.client_code,
    doc_type: payload.doc_type,
    title_number: payload.title_number,
    seq: payload.seq,
    due_date: payload.due_date,
  };
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

function getSourceCoverage(item, coveredSources) {
  const source = String(item?.source || "");
  if (coveredSources.has(source)) {
    return { covered: true, exact: true, source: normalizeImportSource(source) };
  }

  const coversRPT = coveredSources.has("RPT_7007") || coveredSources.has("RPT_7007_CONS_CAR_EB");
  const coversFINR = coveredSources.has("FINR1253");
  if (source === "RPT_E_FINR" && (coversRPT || coversFINR)) {
    return {
      covered: true,
      exact: coversRPT && coversFINR,
      source,
      legacyCombined: true,
    };
  }

  return { covered: false, exact: false, source: normalizeImportSource(source) };
}

function buildPossibleOrphan(item, coveredSources, exactExistingByKey) {
  const key = buildOfficialTitleKey(item);
  const coverage = getSourceCoverage(item, coveredSources);
  const exactKeyOccurrences = (exactExistingByKey.get(key) || []).length;
  const completeKey = hasCompleteOfficialTitleKey(item);
  const hasStableId = item?.id !== undefined && item?.id !== null && String(item.id).trim() !== "";
  const eligibleForManualApproval = coverage.exact && completeKey && exactKeyOccurrences === 1 && hasStableId;
  let reason = "Título ativo não encontrado no relatório da mesma fonte.";

  if (!coverage.covered) {
    reason = "A fonte deste título não foi coberta pela importação atual.";
  } else if (coverage.legacyCombined && !coverage.exact) {
    reason = "Fonte legada RPT_E_FINR coberta por apenas um dos relatórios; exige os dois arquivos para baixa automática.";
  } else if (!completeKey) {
    reason = "Chave oficial incompleta; exige revisão manual antes da baixa.";
  } else if (exactKeyOccurrences !== 1) {
    reason = "Chave existente ambígua; exige revisão manual antes da baixa.";
  } else if (!hasStableId) {
    reason = "Registro sem identificador persistido; exige revisão manual antes da baixa.";
  }

  return {
    id: item.id,
    key,
    source: String(item?.source || ""),
    client_name: item.client_name || "",
    title_number: item.title_number || "",
    due_date: item.due_date || null,
    existing: item,
    coverage,
    completeKey,
    hasStableId,
    exactKeyOccurrences,
    eligibleForManualApproval,
    reason,
  };
}

function buildBlockedTitleSummary(item, reason = "") {
  return {
    id: item?.id,
    source: String(item?.source || ""),
    client_name: item?.client_name || "",
    title_number: item?.title_number || "",
    due_date: item?.due_date || null,
    reason,
  };
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
  const coverage = getImportCoverage({
    totalAtivosAnteriores,
    totalNovaImportacao: totalAtual,
  });
  const coverageSignal = preview?.seguranca?.bloqueioCobertura === true;
  const explicitPreviewBlock =
    (preview?.seguranca?.importacaoParcial === true && !coverageSignal) ||
    (preview?.seguranca?.podeProsseguir === false && !coverageSignal) ||
    (preview?.seguranca?.podeAplicarBaixaAutomatica === false && !coverageSignal);

  return hasPreview &&
    totalAtual > 0 &&
    !coverage.importacaoParcial &&
    !explicitPreviewBlock &&
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
  // Trava 2 — cobertura e confiança por fonte/chave.
  // O limite de 70% continua impedindo baixa automática em massa, mas nunca
  // oculta os ausentes. Cada órfão é relatado e somente uma chave completa,
  // única e da fonte coberta pode ser aprovada individualmente pelo usuário.
  const totalConsolidados = importedRecords.length;
  const importedSources = Array.from(new Set(importedRecords.map(sourceFromRecord).filter(Boolean)));
  const coverageBySource = importedSources.map((source) => {
    const currentTitles = existing.filter((item) =>
      isManagedActiveTitle(item) && normalizeImportSource(item.source) === source,
    );
    const importedTitles = importedRecords.filter((item) => sourceFromRecord(item) === source);
    const coverage = getImportCoverage({
      totalAtivosAnteriores: currentTitles.length,
      totalNovaImportacao: importedTitles.length,
    });

    return {
      source,
      totalAtivos: currentTitles.length,
      totalImportados: importedTitles.length,
      ...coverage,
      podeAplicarBaixaAutomatica: canApplyAbsenceSafely({
        preview,
        totalAtivosAnteriores: currentTitles.length,
        totalNovaImportacao: importedTitles.length,
      }),
    };
  });
  const coverageBySourceMap = new Map(coverageBySource.map((item) => [item.source, item]));
  const automaticSources = new Set(
    coverageBySource
      .filter((item) => item.podeAplicarBaixaAutomatica)
      .map((item) => item.source),
  );
  const rptCoverage = coverageBySourceMap.get("RPT_7007_CONS_CAR_EB");
  const finrCoverage = coverageBySourceMap.get("FINR1253");
  const legacyActiveCount = existing.filter((item) =>
    isManagedActiveTitle(item) && item.source === "RPT_E_FINR",
  ).length;
  const legacyImportCoverage = rptCoverage && finrCoverage
    ? getImportCoverage({
        totalAtivosAnteriores: legacyActiveCount,
        totalNovaImportacao: Math.min(rptCoverage.totalImportados, finrCoverage.totalImportados),
      })
    : null;
  const legacyCoverage = legacyImportCoverage
    ? {
        source: "RPT_E_FINR",
        totalAtivos: legacyActiveCount,
        totalImportados: legacyImportCoverage.totalNovaImportacao,
        ...legacyImportCoverage,
        importacaoParcial:
          legacyImportCoverage.importacaoParcial || rptCoverage.importacaoParcial || finrCoverage.importacaoParcial,
        podeAplicarBaixaAutomatica:
          !legacyImportCoverage.importacaoParcial &&
          rptCoverage.podeAplicarBaixaAutomatica &&
          finrCoverage.podeAplicarBaixaAutomatica,
        coverageBasis: "RPT_7007_CONS_CAR_EB + FINR1253",
      }
    : null;
  if (legacyCoverage?.podeAplicarBaixaAutomatica) automaticSources.add("RPT_E_FINR");
  const coverageSignal = preview?.seguranca?.bloqueioCobertura === true;
  const hasHardSafetyBlock = !preview ||
    totalConsolidados <= 0 ||
    (preview?.seguranca?.importacaoParcial === true && !coverageSignal) ||
    (preview?.seguranca?.podeProsseguir === false && !coverageSignal) ||
    (preview?.seguranca?.podeAplicarBaixaAutomatica === false && !coverageSignal) ||
    (Array.isArray(preview?.seguranca?.bloqueios) && preview.seguranca.bloqueios.length > 0);
  const possibleOrphanCandidates = coveredSources.size > 0
    ? potentialAbsenceCandidates.filter((item) => getSourceCoverage(item, coveredSources).covered)
    : potentialAbsenceCandidates;
  const uncoveredSourceTitles = coveredSources.size > 0
    ? potentialAbsenceCandidates
        .filter((item) => !getSourceCoverage(item, coveredSources).covered)
        .map((item) => buildBlockedTitleSummary(
          item,
          "A fonte deste título não foi incluída na importação atual.",
        ))
    : [];
  const possibleOrphans = possibleOrphanCandidates.map((item) => {
    const orphan = buildPossibleOrphan(item, coveredSources, exactExistingByKey);
    const sourceCoverage = coverageBySourceMap.get(orphan.coverage.source) ||
      (orphan.coverage.source === "RPT_E_FINR" ? legacyCoverage : null);
    const eligibleForManualApproval = orphan.eligibleForManualApproval &&
      !hasHardSafetyBlock &&
      sourceCoverage?.importacaoParcial === true;

    return {
      ...orphan,
      sourceCoverage: sourceCoverage || null,
      automatic: orphan.eligibleForManualApproval && automaticSources.has(orphan.coverage.source),
      eligibleForManualApproval,
    };
  });
  const reconciliationRequest = preview?.seguranca?.sourceReconciliation;
  const reconciliationSource = normalizeImportSource(
    reconciliationRequest?.source || (importedSources.length === 1 ? importedSources[0] : ""),
  );
  const reconciliationCandidates = possibleOrphans.filter((orphan) =>
    orphan.eligibleForManualApproval &&
    orphan.coverage.exact &&
    orphan.coverage.source === reconciliationSource,
  );
  const reconciliationActive = reconciliationRequest?.confirmed === true &&
    importedSources.length === 1 &&
    importedSources[0] === reconciliationSource &&
    reconciliationSource !== "RPT_E_FINR" &&
    reviewRequired.length === 0 &&
    importedRecords.every(hasCompleteOfficialTitleKey) &&
    Number(reconciliationRequest?.expectedImportedCount) === importedRecords.length &&
    Number(reconciliationRequest?.expectedOrphanCount) === reconciliationCandidates.length;
  const reconciliationCandidateIds = new Set(
    reconciliationCandidates.map((orphan) => String(orphan.id)),
  );
  const approvedAbsenceIds = new Set(
    (preview?.seguranca?.approvedAbsenceIds || []).map(String),
  );
  const selectedOrphans = possibleOrphans.filter((orphan) =>
    orphan.automatic ||
    (reconciliationActive && reconciliationCandidateIds.has(String(orphan.id))) ||
    (orphan.eligibleForManualApproval && approvedAbsenceIds.has(String(orphan.id))),
  );
  const selectedOrphanIds = new Set(selectedOrphans.map((orphan) => String(orphan.id)));
  const absences = selectedOrphans.map((orphan) => ({
    key: orphan.key,
    id: orphan.id,
    existing: orphan.existing,
    confidence: "exact-key",
    approvalMode: orphan.automatic
      ? "automatic"
      : reconciliationActive && reconciliationCandidateIds.has(String(orphan.id))
        ? "source-reconciliation"
        : "manual-partial",
    payload: getStatusBaixaPorAusencia(),
  }));
  const absenceBlocked = possibleOrphans.filter((orphan) => !selectedOrphanIds.has(String(orphan.id)));
  const importacaoParcial = !preview ||
    totalConsolidados <= 0 ||
    coverageBySource.some((item) => item.importacaoParcial) ||
    legacyCoverage?.importacaoParcial === true ||
    (preview?.seguranca?.importacaoParcial === true && !coverageSignal);
  const coverageForDisplay = legacyCoverage
    ? [...coverageBySource, legacyCoverage]
    : coverageBySource;
  const canApplyAbsence = coverageForDisplay.length > 0 &&
    coverageForDisplay.every((item) => item.podeAplicarBaixaAutomatica);
  const coveredActiveTitles = coveredSources.size > 0
    ? existing.filter((item) => isCoveredManagedActiveTitle(item, coveredSources))
    : [];
  const previousCount = coveredActiveTitles.length;
  const coverage = getImportCoverage({
    totalAtivosAnteriores: previousCount,
    totalNovaImportacao: totalConsolidados,
  });
  const blockedPartialSources = coverageForDisplay.filter((item) => item.importacaoParcial);
  const coverageSummary = blockedPartialSources
    .map((item) => `${item.source}: ${item.percentual}%`)
    .join("; ");
  const coverageBlockReasons = blockedPartialSources.map((item) => {
    const affectedTitles = absenceBlocked
      .filter((orphan) => orphan.coverage.source === item.source)
      .map((orphan) => buildBlockedTitleSummary(orphan.existing, orphan.reason));
    return {
      code: "COVERAGE_BELOW_THRESHOLD",
      source: item.source,
      totalAtivosAnteriores: item.totalAtivos,
      totalImportados: item.totalImportados,
      percentualCobertura: item.percentual,
      percentualMinimo: item.minimoPercentual,
      totalBloqueados: affectedTitles.length,
      titles: affectedTitles,
      message: `Baixa automática bloqueada em ${item.source}: ${item.totalImportados} de ${item.totalAtivos} títulos (${item.percentual}%; mínimo: ${item.minimoPercentual}%). ${affectedTitles.length} título(s) aguardam revisão.`,
    };
  });
  const uncoveredSourceReasons = uncoveredSourceTitles.length > 0
    ? [{
        code: "SOURCE_NOT_COVERED",
        sources: [...new Set(uncoveredSourceTitles.map((item) => item.source))],
        totalBloqueados: uncoveredSourceTitles.length,
        titles: uncoveredSourceTitles,
        message: `${uncoveredSourceTitles.length} título(s) permanecem ativos porque a fonte não foi incluída na importação atual.`,
      }]
    : [];
  const motivosBloqueio = [...coverageBlockReasons, ...uncoveredSourceReasons];
  if (motivosBloqueio.length === 0 && absenceBlocked.length > 0) {
    motivosBloqueio.push({
      code: "SAFETY_VALIDATION_BLOCK",
      totalBloqueados: absenceBlocked.length,
      titles: absenceBlocked.map((orphan) => buildBlockedTitleSummary(orphan.existing, orphan.reason)),
      message: "A baixa por ausência foi bloqueada pelos alertas de segurança da Pré-validação. Revise a lista de possíveis órfãos.",
    });
  }
  const safetyMessage = motivosBloqueio.map((item) => item.message).join(" ");

  return {
    creates,
    updates,
    unchanged,
    reviewRequired,
    absences,
    absenceBlocked,
    possibleOrphans,
    reconciliation: reconciliationActive
      ? {
          mode: "source-reconciliation",
          source: reconciliationSource,
          expectedAbsences: reconciliationCandidates.length,
          expectedImportedCount: importedRecords.length,
          importedKeys: importedRecords.map((record) => buildImportedKeyPayload(record, importFile)),
        }
      : null,
    canApply: importedRecords.length > 0 && reviewRequired.length === 0,
    summary: {
      totalCreate: creates.length,
      totalUpdate: updates.length,
      totalUnchanged: unchanged.length,
      totalNeedsReview: reviewRequired.length,
      totalAbsenceCandidates: possibleOrphans.length,
      totalPossibleOrphans: possibleOrphans.length,
      totalAbsence: absences.length,
      totalAbsenceBlocked: absenceBlocked.length + uncoveredSourceTitles.length,
      totalUncoveredSource: uncoveredSourceTitles.length,
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
      podeAplicarBaixaIndividual: possibleOrphans.some((item) => item.eligibleForManualApproval),
      baixasIndividuaisAprovadas: absences.filter((item) => item.approvalMode === "manual-partial").length,
      reconciliacaoIntegralAtiva: reconciliationActive,
      reconciliacaoIntegralDisponivel:
        importedSources.length === 1 &&
        importedSources[0] !== "RPT_E_FINR" &&
        reviewRequired.length === 0 &&
        reconciliationCandidates.length > 0,
      reconciliacaoOrigem: reconciliationActive ? reconciliationSource : null,
      reconciliacaoTotalBaixas: reconciliationActive ? reconciliationCandidates.length : 0,
      totalPossiveisOrfaos: possibleOrphans.length,
      totalFontesNaoCobertas: uncoveredSourceTitles.length,
      totalAtivosOrigem: previousCount,
      totalImportadosOrigem: totalConsolidados,
      percentualCobertura: coverage.percentual,
      minimoCoberturaPercentual: coverage.minimoPercentual,
      coberturaPorFonte: coverageForDisplay,
      motivosBloqueio,
      motivoBloqueio: safetyMessage,
    },
  };
}
