export const OFFICIAL_IMPORT_COLUMNS = Object.freeze([
  "Id da Empresa",
  "Tipo Documento",
  "Série",
  "Número Documento",
  "Sequência",
  "Código Cliente",
  "Nome Cliente",
  "Vendedor",
  "Data Emissão",
  "Data Vencimento",
  "Valor Total (R$)",
  "Desconto (R$)",
  "Multa (R$)",
  "Juros (R$)",
  "Receb. Parcial (R$)",
  "Saldo Restante (R$)",
  "Total a Receber (R$)",
  "Dias de Atraso",
  "Portador",
  "Telefone",
  "Contato",
  "CPF/CNPJ",
  "NF Serviço",
]);

// Trava 1 — cobertura mínima para baixa automática em massa.
// Abaixo de 70% o arquivo pode estar filtrado ou incompleto. Isso não esconde
// candidatos órfãos: eles continuam no plano para revisão/aprovação individual.
export const IMPORTACAO_PARCIAL_LIMIAR = 0.7;
// Alias mantido para compatibilidade com consumidores e testes já publicados.
export const MIN_IMPORT_COVERAGE_RATIO = IMPORTACAO_PARCIAL_LIMIAR;

const TITLE_KEY_FIELDS = [
  ["Código Cliente", "codigoCliente", "clientCode", "client_code", "nrCli"],
  ["Tipo Documento", "tipoDocumento", "docType", "doc_type", "tp"],
  ["Número Documento", "numeroDocumento", "titleNumber", "title_number", "titulo"],
  ["Sequência", "sequencia", "seq"],
  ["Data Vencimento", "dataVencimento", "dueDate", "due_date", "vencimento"],
];

const SOURCE_KEY_FIELDS = ["source", "origem", "origem_detectada"];

const CHARGE_BLOCKING_STATUS = [
  "PAGO",
  "BAIXADO",
  "LIQUIDADO",
  "QUITADO",
  "CANCELADO",
  "ENCERRADO",
  "CONFIRMADO",
  "PERDA",
  "INCOBRAVEL",
];

const PORTFOLIO_BLOCKING_STATUS = [
  ...CHARGE_BLOCKING_STATUS,
  "DUPLICADO",
  "DUPLICATA",
];

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!text) return 0;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
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

function normalizeKeyPart(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeDateKeyPart(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = iso
    ? { year: iso[1], month: iso[2], day: iso[3] }
    : br
      ? { year: br[3], month: br[2], day: br[1] }
      : null;

  if (!parts) return normalizeKeyPart(value);

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : normalizeKeyPart(value);
}

function readNormalizedTitleAndSequence(item) {
  let title = normalizeKeyPart(readFirst(item, TITLE_KEY_FIELDS[2]));
  let sequence = normalizeKeyPart(readFirst(item, TITLE_KEY_FIELDS[3]));

  if (!sequence) {
    const separator = title.lastIndexOf("/");
    if (separator > 0 && separator < title.length - 1) {
      sequence = normalizeKeyPart(title.slice(separator + 1));
      title = normalizeKeyPart(title.slice(0, separator));
    }
  }

  return { title, sequence };
}

function readFirst(item, fields) {
  for (const field of fields) {
    if (item?.[field] !== undefined && item?.[field] !== null) {
      return item[field];
    }
  }
  return "";
}

export function normalizeImportSource(value) {
  const source = normalizeKeyPart(value);
  if (source === "RPT_7007" || source === "RPT_7007_CONS_CAR_EB" || source === "SOMENTE_RPT") {
    return "RPT_7007_CONS_CAR_EB";
  }
  if (source === "FINR1253" || source === "SOMENTE_FINR") return "FINR1253";
  return source;
}

function readSource(item) {
  const direct = readFirst(item, SOURCE_KEY_FIELDS);
  if (direct) return normalizeImportSource(direct);
  const metadata = item?._meta || {};
  return normalizeImportSource(metadata.origem_detectada || metadata.source_status || "");
}

function hasBlockingStatus(status, blockingStatuses) {
  const normalized = normalizeText(status);
  return blockingStatuses.some((blocked) => normalized.includes(blocked));
}

function readSaldoRestante(item) {
  const explicitFields = [
    "Saldo Restante (R$)",
    "saldoRestante",
    "openValue",
    "open_value",
    "valorEmAberto",
  ];
  const explicit = readFirst(item, explicitFields);

  if (explicit !== "") return toNumber(explicit);

  return calculateSaldoRestante({
    valorTotal: readFirst(item, ["Valor Total (R$)", "valorTotal", "original_value", "valorOriginal"]),
    recebParcial: readFirst(item, ["Receb. Parcial (R$)", "recebParcial", "received_value", "valorRecebido"]),
  });
}

export function buildOfficialTitleKey(item = {}) {
  const { title, sequence } = readNormalizedTitleAndSequence(item);

  return [
    readSource(item),
    normalizeKeyPart(readFirst(item, TITLE_KEY_FIELDS[0])),
    normalizeKeyPart(readFirst(item, TITLE_KEY_FIELDS[1])),
    title,
    sequence,
    normalizeDateKeyPart(readFirst(item, TITLE_KEY_FIELDS[4])),
  ].join("|");
}

export function hasCompleteOfficialTitleKey(item = {}) {
  return buildOfficialTitleKey(item).split("|").every(Boolean);
}

export function calculateSaldoRestante({ valorTotal = 0, recebParcial = 0 } = {}) {
  return roundMoney(toNumber(valorTotal) - toNumber(recebParcial));
}

export function calculateCharges({
  valorTotal = 0,
  recebParcial = 0,
  saldoRestante,
  diasAtraso = 0,
  multaPercent = 0,
  jurosPercent = 0,
  status = "",
  active = true,
} = {}) {
  const temSaldoExplicito = saldoRestante !== undefined &&
    saldoRestante !== null &&
    !(typeof saldoRestante === "string" && saldoRestante.trim() === "");
  const saldoCalculado = temSaldoExplicito
    ? roundMoney(saldoRestante)
    : calculateSaldoRestante({ valorTotal, recebParcial });
  const saldoEmAberto = Math.max(0, saldoCalculado);
  const dias = Math.max(0, toNumber(diasAtraso));
  const naoCalculaEncargos =
    active === false ||
    saldoEmAberto <= 0 ||
    dias <= 0 ||
    hasBlockingStatus(status, CHARGE_BLOCKING_STATUS);

  const multa = naoCalculaEncargos
    ? 0
    : roundMoney(saldoEmAberto * (toNumber(multaPercent) / 100));
  const juros = naoCalculaEncargos
    ? 0
    : roundMoney(saldoEmAberto * (toNumber(jurosPercent) / 100) / 30 * dias);

  return {
    valorTotal: roundMoney(valorTotal),
    recebParcial: roundMoney(recebParcial),
    saldoRestante: saldoEmAberto,
    multa,
    juros,
    totalAReceber: roundMoney(saldoEmAberto + multa + juros),
    diasAtraso: dias,
  };
}

export function isTituloElegivelCarteira(item = {}) {
  if (item.active === false || item.lossStatus === true || item.loss_status === true) {
    return false;
  }

  const status = [
    item.status,
    item.current_status,
    item.workflow_status,
    item.encaminhar,
    item.current_motive,
  ].filter(Boolean).join(" ");

  return readSaldoRestante(item) > 0 &&
    !hasBlockingStatus(status, PORTFOLIO_BLOCKING_STATUS);
}

export function isImportacaoParcial({
  totalAtivosAnteriores = 0,
  totalNovaImportacao = 0,
} = {}) {
  const anteriores = Math.max(0, toNumber(totalAtivosAnteriores));
  const novos = Math.max(0, toNumber(totalNovaImportacao));

  if (anteriores === 0) return false;
  return novos < anteriores * MIN_IMPORT_COVERAGE_RATIO;
}

export function getImportCoverage({
  totalAtivosAnteriores = 0,
  totalNovaImportacao = 0,
} = {}) {
  const anteriores = Math.max(0, toNumber(totalAtivosAnteriores));
  const novos = Math.max(0, toNumber(totalNovaImportacao));
  const ratio = anteriores > 0 ? novos / anteriores : 1;

  return {
    totalAtivosAnteriores: anteriores,
    totalNovaImportacao: novos,
    ratio,
    percentual: Math.round(ratio * 10000) / 100,
    minimoRatio: MIN_IMPORT_COVERAGE_RATIO,
    minimoPercentual: MIN_IMPORT_COVERAGE_RATIO * 100,
    importacaoParcial: anteriores > 0 && ratio < MIN_IMPORT_COVERAGE_RATIO,
  };
}

export function getStatusBaixaPorAusencia() {
  return {
    active: false,
    current_status: "Baixado",
    workflow_status: "baixado_importacao",
    current_motive: "Não consta na nova carteira importada",
  };
}
