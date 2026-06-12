import {
  OFFICIAL_IMPORT_COLUMNS,
  calculateCharges,
} from "./domain.js";

const NUMERIC_COLUMNS = new Set([
  "Valor Total (R$)",
  "Desconto (R$)",
  "Multa (R$)",
  "Juros (R$)",
  "Receb. Parcial (R$)",
  "Saldo Restante (R$)",
  "Total a Receber (R$)",
  "Dias de Atraso",
]);

const RPT_7007_ALIASES = {
  "Id da Empresa": ["ID EMPRESA", "IDEMPRESA", "EMPRESA", "COD EMPRESA", "CODIGO EMPRESA"],
  "Tipo Documento": ["TPTIT", "TP", "TIPO", "TIPO TITULO", "TIPO DOC", "TIPO DOCUMENTO", "ESPECIE", "ESP"],
  "Série": ["SERTIT", "SERIE", "SER", "SERIE TITULO", "NR SERIE"],
  "Número Documento": ["NUMTIT", "NUM TIT", "NUMERO TITULO", "N TITULO", "NR TITULO", "NRO TITULO", "DUPLICATA", "NOTA", "FATURA", "DOCUMENTO", "NR DOCUMENTO", "NUMERO DOCUMENTO", "NUM DOCUMENTO", "TITULO", "TITULOS"],
  "Sequência": ["SEQ", "SEQUENCIA", "PARCELA", "PARC", "PRESTACAO", "PAR", "PARTE", "PARCELA NR", "NR PARCELA"],
  "Código Cliente": ["CODCLI", "COD CLIENTE", "CODIGO CLIENTE", "CLIENTE CODIGO", "COD", "CODIGO", "NRCLI", "NRO CLIENTE", "NR CLIENTE", "N CLIENTE", "NUM CLIENTE", "NUMERO CLIENTE"],
  "Nome Cliente": ["NOMCLI", "NOME CLIENTE", "RAZAO SOCIAL", "CLIENTE", "SACADO", "NOME SACADO", "DEVEDOR", "NOME", "RAZAO", "NOME DO CLIENTE", "FAVORECIDO"],
  "Vendedor": ["VENDEDOR", "NOME VENDEDOR", "COD VENDEDOR", "CODIGO VENDEDOR"],
  "Data Emissão": ["DTEMIS", "EMISSAO", "DATA EMISSAO", "DT EMISSAO", "DATA EMIS", "DT EMIS", "DATA DE EMISSAO"],
  "Data Vencimento": ["DTVENC", "DT VENC", "DATA VENCIMENTO", "VENCIMENTO", "VENCTO", "DT VENCTO", "VENC", "DATA VENC", "DT VENCIMENTO", "VENCIMENTO TITULO"],
  "Valor Total (R$)": ["VLRTIT", "VLR TIT", "VAL TITULO", "VALOR TITULO", "VALOR TOTAL", "VAL ORIG", "VALOR ORIGINAL", "VLR ORIG", "VALOR", "TOTAL", "VLR TOTAL", "VALOR FACE", "VALOR NOMINAL"],
  "Desconto (R$)": ["DESCONTO", "VLR DESCONTO", "VALOR DESCONTO"],
  "Receb. Parcial (R$)": ["RECEB PARCIAL", "RECEB PRC", "VALOR RECEBIDO", "VLR RECEBIDO", "VAL RECEBIDO", "RECEBIDO", "VLRREC", "VALREC", "VL REC", "VL RECEBIDO", "RECEBIMENTOS", "VALOR PAGO", "VLR PAGO"],
  "Dias de Atraso": ["DIAS ATRASO", "DIAS DE ATRASO", "ATRASO"],
  "Portador": ["PORTAD", "PORTADOR", "BANCO", "CARTEIRA", "COBRANCA", "BANCO COBRADOR"],
  "Telefone": ["TELEFONE", "FONE", "TEL", "CELULAR"],
  "Contato": ["CONTATO", "NOME CONTATO"],
  "CPF/CNPJ": ["CPF CNPJ", "CPFCNPJ", "CPF", "CNPJ"],
  "NF Serviço": ["NF SERVICO", "NFSE", "NFS", "NOTA SERVICO"],
};

const FINR1253_ALIASES = {
  type: ["TP", "TIPO", "TIPO DOCUMENTO"],
  series: ["SER", "SERIE"],
  documentNumber: ["NUMERO", "NUM DOCUMENTO", "NUMERO DOCUMENTO", "NR DOCUMENTO", "NRO DOCUMENTO", "TITULO"],
  sequence: ["SEQ", "SEQUENCIA"],
  serviceInvoice: ["NF SERVICO", "NFSE"],
  issueDate: ["OPERACAO", "DATA OPERACAO"],
  dueDate: ["VENCTO", "VENCIMENTO"],
  totalValue: ["VLR TITULO", "VALOR TITULO", "TITULO", "VALOR"],
  partialReceipt: ["RECEB PRC", "RECEB PARCIAL"],
  delayDays: ["ATRASO", "DIAS ATRASO", "DIAS DE ATRASO"],
  bearer: ["PORTADOR"],
};

const FINR1253_FALLBACK_INDEXES = {
  type: 0,
  series: 1,
  documentNumber: 2,
  sequence: 3,
  serviceInvoice: 4,
  issueDate: 5,
  dueDate: 6,
  totalValue: 7,
  partialReceipt: 9,
  delayDays: 12,
  bearer: 14,
};

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeInteger(value) {
  const parsed = normalizeMoney(value);
  return parsed > 0 ? Math.trunc(parsed) : 0;
}

function dateToISO(value) {
  if (value === undefined || value === null || value === "") return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return "";
}

function text(value) {
  return String(value ?? "").trim();
}

function createCanonicalRecord(values = {}) {
  return Object.fromEntries(
    OFFICIAL_IMPORT_COLUMNS.map((column) => [
      column,
      values[column] ?? (NUMERIC_COLUMNS.has(column) ? 0 : ""),
    ]),
  );
}

function addCalculatedValues(values, options = {}) {
  const charges = calculateCharges({
    valorTotal: values["Valor Total (R$)"],
    recebParcial: values["Receb. Parcial (R$)"],
    diasAtraso: values["Dias de Atraso"],
    multaPercent: options.multaPercent,
    jurosPercent: options.jurosPercent,
    status: options.status,
    active: options.active,
  });

  return createCanonicalRecord({
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

function buildHeaderMap(rows, aliases) {
  const keys = [];
  const seen = new Set();

  for (const row of rows.slice(0, 20)) {
    if (!row || Array.isArray(row) || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(aliases).flatMap(([column, columnAliases]) => {
      const normalizedAliases = new Set([column, ...columnAliases].map(normalizeHeader));
      const key = keys.find((candidate) => normalizedAliases.has(normalizeHeader(candidate)));
      return key ? [[column, key]] : [];
    }),
  );
}

function readMapped(row, headerMap, column) {
  const key = headerMap[column];
  return key ? row?.[key] : "";
}

function splitDocumentAndSequence(documentValue, sequenceValue = "") {
  const rawDocument = text(documentValue).replace(/\./g, "");
  const explicitSequence = text(sequenceValue);
  const match = rawDocument.match(/^(.+?)\/(\d{1,4})$/);

  if (!match) {
    return { documentNumber: rawDocument, sequence: explicitSequence };
  }

  return {
    documentNumber: match[1],
    sequence: explicitSequence || match[2],
  };
}

function isRptDataRow(row, headerMap) {
  const documentNumber = text(readMapped(row, headerMap, "Número Documento"));
  const clientCode = text(readMapped(row, headerMap, "Código Cliente"));
  const clientName = text(readMapped(row, headerMap, "Nome Cliente"));
  const joined = normalizeHeader(Object.values(row || {}).join(" "));

  return Boolean(documentNumber && (clientCode || clientName)) &&
    !joined.startsWith("TOTAL ") &&
    !joined.includes("TOTAL EMPRESA");
}

export function parseRPT7007Canonical(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const headerMap = buildHeaderMap(rows, RPT_7007_ALIASES);

  return rows
    .filter((row) => row && !Array.isArray(row) && typeof row === "object")
    .filter((row) => isRptDataRow(row, headerMap))
    .map((row) => {
      const { documentNumber, sequence } = splitDocumentAndSequence(
        readMapped(row, headerMap, "Número Documento"),
        readMapped(row, headerMap, "Sequência"),
      );
      const valorTotal = normalizeMoney(readMapped(row, headerMap, "Valor Total (R$)"));
      const recebParcial = normalizeMoney(readMapped(row, headerMap, "Receb. Parcial (R$)"));

      return addCalculatedValues({
        "Id da Empresa": text(readMapped(row, headerMap, "Id da Empresa")),
        "Tipo Documento": text(readMapped(row, headerMap, "Tipo Documento")).toUpperCase(),
        "Série": text(readMapped(row, headerMap, "Série")),
        "Número Documento": documentNumber,
        "Sequência": sequence,
        "Código Cliente": text(readMapped(row, headerMap, "Código Cliente")),
        "Nome Cliente": text(readMapped(row, headerMap, "Nome Cliente")),
        "Vendedor": text(readMapped(row, headerMap, "Vendedor")),
        "Data Emissão": dateToISO(readMapped(row, headerMap, "Data Emissão")),
        "Data Vencimento": dateToISO(readMapped(row, headerMap, "Data Vencimento")),
        "Valor Total (R$)": valorTotal,
        "Desconto (R$)": normalizeMoney(readMapped(row, headerMap, "Desconto (R$)")),
        "Receb. Parcial (R$)": recebParcial,
        "Dias de Atraso": normalizeInteger(readMapped(row, headerMap, "Dias de Atraso")),
        "Portador": text(readMapped(row, headerMap, "Portador")),
        "Telefone": text(readMapped(row, headerMap, "Telefone")),
        "Contato": text(readMapped(row, headerMap, "Contato")),
        "CPF/CNPJ": text(readMapped(row, headerMap, "CPF/CNPJ")),
        "NF Serviço": text(readMapped(row, headerMap, "NF Serviço")),
      }, options);
    });
}

function cellText(row, index) {
  return text((row || [])[index]);
}

function joinedRow(row) {
  return (row || []).map(text).filter(Boolean).join(" ");
}

function parseFinrClientRow(row) {
  const match = cellText(row, 0).match(
    /^Cliente:\s*([\d.]+)\s*-\s*(.+?)\s*-\s*CPF\/CNPJ:\s*([\d./-]+)\s*$/i,
  );
  if (!match) return null;

  return {
    clientCode: match[1].replace(/\D/g, ""),
    clientName: text(match[2]),
    cpfCnpj: text(match[3]),
  };
}

function parseFinrClientTotal(row) {
  const joined = joinedRow(row);
  return {
    telefone: text(joined.match(/(?:Telefone|Tel\.?)\s*:?\s*(.+?)(?:\s+Contato\s*:|$)/i)?.[1]),
    contato: text(joined.match(/Contato\s*:?\s*(.+)$/i)?.[1]),
  };
}

function findFinrHeaderIndex(row, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return row.findIndex((cell) => normalizedAliases.has(normalizeHeader(cell)));
}

function buildFinrHeaderMap(row) {
  const indexes = Object.fromEntries(
    Object.entries(FINR1253_ALIASES).map(([field, aliases]) => [
      field,
      findFinrHeaderIndex(row, aliases),
    ]),
  );

  if (indexes.documentNumber === indexes.totalValue) {
    indexes.totalValue = findFinrHeaderIndex(
      row,
      FINR1253_ALIASES.totalValue.filter((alias) => normalizeHeader(alias) !== "TITULO"),
    );
  }

  return Object.fromEntries(
    Object.entries(FINR1253_FALLBACK_INDEXES).map(([field, fallbackIndex]) => [
      field,
      indexes[field] >= 0 ? indexes[field] : fallbackIndex,
    ]),
  );
}

function isFinrHeaderRow(row) {
  const normalizedCells = row.map(normalizeHeader);
  const hasType = normalizedCells.some((cell) => FINR1253_ALIASES.type.includes(cell));
  const hasDocument = normalizedCells.some((cell) =>
    FINR1253_ALIASES.documentNumber.map(normalizeHeader).includes(cell));
  const hasDueDate = normalizedCells.some((cell) =>
    FINR1253_ALIASES.dueDate.map(normalizeHeader).includes(cell));

  return hasType && hasDocument && hasDueDate;
}

function isFinrTitleRow(row, headerMap) {
  return Boolean(
    cellText(row, headerMap.type) &&
    cellText(row, headerMap.documentNumber),
  );
}

function buildFinrCanonicalRecord(row, client, clientTotal, headerMap, options) {
  const { documentNumber, sequence } = splitDocumentAndSequence(
    cellText(row, headerMap.documentNumber),
    cellText(row, headerMap.sequence),
  );

  return addCalculatedValues({
    "Id da Empresa": "",
    "Tipo Documento": cellText(row, headerMap.type).toUpperCase(),
    "Série": cellText(row, headerMap.series),
    "Número Documento": documentNumber,
    "Sequência": sequence,
    "Código Cliente": client.clientCode,
    "Nome Cliente": client.clientName,
    "Vendedor": "",
    "Data Emissão": dateToISO(row?.[headerMap.issueDate]),
    "Data Vencimento": dateToISO(row?.[headerMap.dueDate]),
    "Valor Total (R$)": normalizeMoney(row?.[headerMap.totalValue]),
    "Desconto (R$)": 0,
    "Receb. Parcial (R$)": normalizeMoney(row?.[headerMap.partialReceipt]),
    "Dias de Atraso": normalizeInteger(row?.[headerMap.delayDays]),
    "Portador": cellText(row, headerMap.bearer),
    "Telefone": clientTotal.telefone,
    "Contato": clientTotal.contato,
    "CPF/CNPJ": client.cpfCnpj,
    "NF Serviço": cellText(row, headerMap.serviceInvoice),
  }, options);
}

export function parseFINR1253Canonical(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const records = [];
  let client = null;
  let titleRows = [];
  let headerMap = FINR1253_FALLBACK_INDEXES;

  const flush = (clientTotal = {}) => {
    if (client) {
      for (const title of titleRows) {
        records.push(buildFinrCanonicalRecord(
          title.row,
          client,
          clientTotal,
          title.headerMap,
          options,
        ));
      }
    }
    titleRows = [];
  };

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    if (isFinrHeaderRow(row)) {
      headerMap = buildFinrHeaderMap(row);
      continue;
    }

    const nextClient = parseFinrClientRow(row);
    if (nextClient) {
      flush();
      client = nextClient;
      continue;
    }

    if (/^Total\s*Cliente/i.test(cellText(row, 0))) {
      flush(parseFinrClientTotal(row));
      client = null;
      continue;
    }

    if (client && isFinrTitleRow(row, headerMap)) {
      titleRows.push({ row, headerMap: { ...headerMap } });
    }
  }

  flush();
  return records;
}
