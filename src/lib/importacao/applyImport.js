import {
  buildOfficialTitleKey,
  getStatusBaixaPorAusencia,
  isImportacaoParcial,
  isTituloElegivelCarteira,
} from "./domain.js";

const MANAGED_SOURCES = new Set([
  "FINR1253",
  "RPT_7007_CONS_CAR_EB",
  "RPT_E_FINR",
]);

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

export function buildImportApplicationPlan({
  preview,
  existingTitles = [],
  importFile = "",
} = {}) {
  const consolidados = Array.isArray(preview?.consolidados) ? preview.consolidados : [];
  const existing = Array.isArray(existingTitles) ? existingTitles : [];
  const exactExistingByKey = new Map();

  for (const item of existing) {
    const key = buildOfficialTitleKey(item);
    if (!exactExistingByKey.has(key)) exactExistingByKey.set(key, item);
  }

  const creates = [];
  const updates = [];
  const unchanged = [];
  const importedKeys = new Set();

  for (const record of consolidados) {
    const key = buildOfficialTitleKey(record);
    const current = exactExistingByKey.get(key);
    importedKeys.add(key);

    if (!current) {
      creates.push({ key, payload: createPayload(record, importFile), record });
      continue;
    }

    const payload = updatePayload(record, current, importFile);
    if (hasMeaningfulChange(current, payload)) {
      updates.push({ key, id: current.id, payload, record });
    } else {
      unchanged.push({ key, id: current.id, record });
    }
  }

  const absenceCandidates = existing.filter((item) =>
    isManagedActiveTitle(item) && !importedKeys.has(buildOfficialTitleKey(item)),
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
        payload: {
          ...getStatusBaixaPorAusencia(),
          updated_by: "Importação Consolidada",
        },
      }))
    : [];

  return {
    creates,
    updates,
    unchanged,
    absences,
    canApply: consolidados.length > 0,
    summary: {
      totalCreate: creates.length,
      totalUpdate: updates.length,
      totalUnchanged: unchanged.length,
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
