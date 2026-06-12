import {
  OFFICIAL_IMPORT_COLUMNS,
  buildOfficialTitleKey,
  calculateCharges,
} from "./domain.js";

const SOURCE_RPT = "RPT_7007";
const SOURCE_FINR = "FINR1253";

const RPT_PRIORITY_FIELDS = new Set([
  "Id da Empresa",
  "Vendedor",
  "Desconto (R$)",
]);

const FINR_PRIORITY_FIELDS = new Set([
  "CPF/CNPJ",
  "Telefone",
  "Contato",
  "Portador",
  "NF Serviço",
]);

const CALCULATED_FIELDS = new Set([
  "Saldo Restante (R$)",
  "Multa (R$)",
  "Juros (R$)",
  "Total a Receber (R$)",
]);

function cloneRecords(items = []) {
  return items.map((item) => ({ ...(item || {}) }));
}

function hasValue(value) {
  return value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim() === "");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDocument(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!text) return 0;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyMatches(left, right) {
  return Math.abs(normalizeMoney(left) - normalizeMoney(right)) < 0.005;
}

function isValidClientName(value) {
  const normalized = normalizeText(value);
  if (!normalized || /^\d+$/.test(normalized)) return false;
  return normalized.replace(/[^A-Z0-9]/g, "").length >= 3 && /[A-Z]/.test(normalized);
}

function chooseMostCompleteName(rptName, finrName) {
  const candidates = [
    { source: SOURCE_RPT, value: rptName },
    { source: SOURCE_FINR, value: finrName },
  ].filter(({ value }) => hasValue(value));

  candidates.sort((left, right) => {
    const validDifference =
      Number(isValidClientName(right.value)) - Number(isValidClientName(left.value));
    if (validDifference !== 0) return validDifference;

    const normalizedDifference =
      normalizeText(right.value).replace(/\s/g, "").length -
      normalizeText(left.value).replace(/\s/g, "").length;
    if (normalizedDifference !== 0) return normalizedDifference;

    return left.source === SOURCE_RPT ? -1 : 1;
  });

  return candidates[0]?.value ?? "";
}

function canonicalRecord(item = {}) {
  return Object.fromEntries(
    OFFICIAL_IMPORT_COLUMNS.map((column) => [column, item[column] ?? ""]),
  );
}

function sourceRepresentative(items = []) {
  const values = {};

  for (const column of OFFICIAL_IMPORT_COLUMNS) {
    const item = items.find((candidate) => hasValue(candidate?.[column]));
    values[column] = item?.[column] ?? "";
  }

  return values;
}

function buildDiagnostic(code, titleKey, details = {}, level = "warning") {
  return {
    code,
    level,
    title_key: titleKey,
    ...details,
  };
}

function duplicateDiagnostic(source, titleKey, items) {
  if (items.length <= 1) return null;

  return buildDiagnostic(
    source === SOURCE_RPT ? "DUPLICATE_KEY_IN_RPT" : "DUPLICATE_KEY_IN_FINR",
    titleKey,
    {
      source,
      occurrences: items.length,
    },
  );
}

function choosePreferred(rptValue, finrValue, preferredSource) {
  if (preferredSource === SOURCE_FINR) {
    return hasValue(finrValue) ? finrValue : rptValue;
  }

  return hasValue(rptValue) ? rptValue : finrValue;
}

function recalculateFinancial(values, options = {}) {
  const charges = calculateCharges({
    valorTotal: values["Valor Total (R$)"],
    recebParcial: values["Receb. Parcial (R$)"],
    diasAtraso: values["Dias de Atraso"],
    multaPercent: options.multaPercent ?? 0,
    jurosPercent: options.jurosPercent ?? 0,
  });

  return canonicalRecord({
    ...values,
    "Valor Total (R$)": charges.valorTotal,
    "Receb. Parcial (R$)": charges.recebParcial,
    "Saldo Restante (R$)": charges.saldoRestante,
    "Multa (R$)": charges.multa,
    "Juros (R$)": charges.juros,
    "Total a Receber (R$)": charges.totalAReceber,
    "Dias de Atraso": charges.diasAtraso,
  });
}

function buildCombinedRecord(rptItems, finrItems, options) {
  const rptItem = sourceRepresentative(rptItems);
  const finrItem = sourceRepresentative(finrItems);
  const titleKey = buildOfficialTitleKey(rptItem);
  const values = {};
  const diagnostics = [
    duplicateDiagnostic(SOURCE_RPT, titleKey, rptItems),
    duplicateDiagnostic(SOURCE_FINR, titleKey, finrItems),
  ].filter(Boolean);

  for (const column of OFFICIAL_IMPORT_COLUMNS) {
    if (CALCULATED_FIELDS.has(column)) continue;

    const rptValue = rptItem[column];
    const finrValue = finrItem[column];

    if (column === "Nome Cliente") {
      values[column] = chooseMostCompleteName(rptValue, finrValue);
      if (
        isValidClientName(rptValue) &&
        isValidClientName(finrValue) &&
        normalizeText(rptValue) !== normalizeText(finrValue)
      ) {
        diagnostics.push(buildDiagnostic("CLIENT_NAME_VARIATION", titleKey, {
          selected_value: values[column],
          rpt_value: rptValue,
          finr_value: finrValue,
        }));
      }
      continue;
    }

    if (column === "Valor Total (R$)") {
      values[column] = choosePreferred(rptValue, finrValue, SOURCE_RPT);
      if (hasValue(rptValue) && hasValue(finrValue) && !moneyMatches(rptValue, finrValue)) {
        diagnostics.push(buildDiagnostic("VALUE_MISMATCH_TOTAL", titleKey, {
          selected_value: values[column],
          rpt_value: rptValue,
          finr_value: finrValue,
        }));
      }
      continue;
    }

    if (column === "Receb. Parcial (R$)") {
      values[column] = choosePreferred(rptValue, finrValue, SOURCE_RPT);
      if (hasValue(rptValue) && hasValue(finrValue) && !moneyMatches(rptValue, finrValue)) {
        diagnostics.push(buildDiagnostic("VALUE_MISMATCH_RECEIVED", titleKey, {
          selected_value: values[column],
          rpt_value: rptValue,
          finr_value: finrValue,
        }));
      }
      continue;
    }

    if (column === "CPF/CNPJ") {
      values[column] = choosePreferred(rptValue, finrValue, SOURCE_FINR);
      if (
        hasValue(rptValue) &&
        hasValue(finrValue) &&
        normalizeDocument(rptValue) !== normalizeDocument(finrValue)
      ) {
        diagnostics.push(buildDiagnostic("CPF_CNPJ_MISMATCH", titleKey, {
          selected_value: values[column],
          rpt_value: rptValue,
          finr_value: finrValue,
        }));
      }
      continue;
    }

    let preferredSource = SOURCE_RPT;
    if (FINR_PRIORITY_FIELDS.has(column)) preferredSource = SOURCE_FINR;
    if (RPT_PRIORITY_FIELDS.has(column)) preferredSource = SOURCE_RPT;
    values[column] = choosePreferred(rptValue, finrValue, preferredSource);
  }

  const record = recalculateFinancial(values, options);

  return {
    ...record,
    _meta: {
      source_status: "RPT_E_FINR",
      sources_found: [SOURCE_RPT, SOURCE_FINR],
      needs_review: diagnostics.some(({ level }) => level === "warning"),
      diagnostics,
      rpt_raw: cloneRecords(rptItems),
      finr_raw: cloneRecords(finrItems),
    },
  };
}

function buildExclusiveRecord(items, source, options) {
  const values = sourceRepresentative(items);
  const titleKey = buildOfficialTitleKey(values);
  const sourceStatus = source === SOURCE_RPT ? "SOMENTE_RPT" : "SOMENTE_FINR";
  const diagnostics = [
    buildDiagnostic(
      source === SOURCE_RPT ? "ONLY_IN_RPT" : "ONLY_IN_FINR",
      titleKey,
      {
        source_status: sourceStatus,
        sources_found: [source],
      },
      "info",
    ),
    duplicateDiagnostic(source, titleKey, items),
  ].filter(Boolean);

  return {
    ...recalculateFinancial(values, options),
    _meta: {
      source_status: sourceStatus,
      sources_found: [source],
      needs_review: diagnostics.some(({ level }) => level === "warning"),
      diagnostics,
      rpt_raw: source === SOURCE_RPT ? cloneRecords(items) : [],
      finr_raw: source === SOURCE_FINR ? cloneRecords(items) : [],
    },
  };
}

function groupByOfficialKey(items) {
  const groups = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = buildOfficialTitleKey(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function buildKeyWithoutDueDate(item = {}) {
  return [
    item["Código Cliente"],
    item["Tipo Documento"],
    item["Número Documento"],
    item["Sequência"],
  ].map(normalizeText).join("|");
}

function indexRecordsByKey(records) {
  const indexed = new Map();

  for (const record of records) {
    indexed.set(buildOfficialTitleKey(record), record);
  }

  return indexed;
}

function appendDueDateMismatchDiagnostics({
  rptGroups,
  finrGroups,
  recordsByKey,
  diagnostics,
}) {
  const finrByIdentity = new Map();

  for (const [titleKey, items] of finrGroups) {
    if (rptGroups.has(titleKey)) continue;

    const identity = buildKeyWithoutDueDate(sourceRepresentative(items));
    const groups = finrByIdentity.get(identity) || [];
    groups.push({ titleKey, items });
    finrByIdentity.set(identity, groups);
  }

  for (const [rptTitleKey, rptItems] of rptGroups) {
    if (finrGroups.has(rptTitleKey)) continue;

    const rptItem = sourceRepresentative(rptItems);
    const identity = buildKeyWithoutDueDate(rptItem);

    for (const finrGroup of finrByIdentity.get(identity) || []) {
      const finrItem = sourceRepresentative(finrGroup.items);
      const diagnostic = buildDiagnostic("DUE_DATE_MISMATCH", rptTitleKey, {
        rpt_title_key: rptTitleKey,
        finr_title_key: finrGroup.titleKey,
        rpt_due_date: rptItem["Data Vencimento"],
        finr_due_date: finrItem["Data Vencimento"],
      });
      diagnostics.push(diagnostic);

      for (const key of [rptTitleKey, finrGroup.titleKey]) {
        const record = recordsByKey.get(key);
        if (!record) continue;
        record._meta.diagnostics.push(diagnostic);
        record._meta.needs_review = true;
      }
    }
  }
}

export function consolidarFontesImportacao({
  rptItems = [],
  finrItems = [],
  options = {},
} = {}) {
  const rptList = Array.isArray(rptItems) ? rptItems : [];
  const finrList = Array.isArray(finrItems) ? finrItems : [];
  const rptGroups = groupByOfficialKey(rptList);
  const finrGroups = groupByOfficialKey(finrList);
  const consolidados = [];
  let somenteRPT = 0;
  let somenteFINR = 0;
  let emAmbas = 0;

  for (const [titleKey, rptGroup] of rptGroups) {
    const finrGroup = finrGroups.get(titleKey);

    if (finrGroup) {
      consolidados.push(buildCombinedRecord(rptGroup, finrGroup, options));
      emAmbas += 1;
    } else {
      consolidados.push(buildExclusiveRecord(rptGroup, SOURCE_RPT, options));
      somenteRPT += 1;
    }
  }

  for (const [titleKey, finrGroup] of finrGroups) {
    if (rptGroups.has(titleKey)) continue;
    consolidados.push(buildExclusiveRecord(finrGroup, SOURCE_FINR, options));
    somenteFINR += 1;
  }

  const diagnosticos = consolidados.flatMap((record) => record._meta.diagnostics);
  appendDueDateMismatchDiagnostics({
    rptGroups,
    finrGroups,
    recordsByKey: indexRecordsByKey(consolidados),
    diagnostics: diagnosticos,
  });

  return {
    consolidados,
    diagnosticos,
    resumo: {
      totalRPT: rptList.length,
      totalFINR: finrList.length,
      totalConsolidados: consolidados.length,
      somenteRPT,
      somenteFINR,
      emAmbas,
      comConflito: consolidados.filter((record) => record._meta.needs_review).length,
    },
  };
}
