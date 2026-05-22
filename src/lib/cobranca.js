import * as XLSX from "xlsx";

export const hoje = new Date();
export const hojeISO = hoje.toISOString().slice(0, 10);

export const STATUS_OPC = ["Não Contatado","Em Cobrança","Sem Retorno","Prometeu Pagar","Pago Aguard. Baixa","Em Permuta","Encerrado"];
export const ENCAMINHAR_OPC = [
  {value:"",label:"Sem encaminhamento"},
  {value:"verificacao",label:"→ Verificar Pagamento"},
  {value:"protesto",label:"→ Solicitar Protesto"},
  {value:"assessoria",label:"→ Encaminhar para Assessoria"}
];
export const CONTATO_OPC = ["Ligação","WhatsApp","E-mail","Presencial","Mensagem Interna"];
export const VERIF_RESP = ["Confirmado","Não localizado","Baixado","Erro","Duplicidade","Devolver para cobrança"];
export const PROT_RESP = ["Aprovado","Reprovado","Devolver para cobrança"];

// Faixas de atraso
export const FAIXAS_ATRASO = [
  { label: "Todos", value: 0 },
  { label: "7+ dias", value: 7 },
  { label: "15+ dias", value: 15 },
  { label: "30+ dias", value: 30 },
  { label: "60+ dias", value: 60 },
  { label: "90+ dias", value: 90 },
  { label: "180+ dias", value: 180 },
];

export function fmtD(d) {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}

export function fmtM(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

export function dateISO(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? new Date(p.y, p.m - 1, p.d).toISOString().slice(0, 10) : "";
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+.*)?$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function diffDias(d) {
  if (!d) return 0;
  const r = Math.floor((hoje - new Date(`${d}T00:00:00`)) / 86400000);
  return r > 0 ? r : 0;
}

export function promAlerta(ds) {
  if (!ds) return null;
  const diff = Math.floor((new Date(`${ds}T00:00:00`) - new Date(`${hojeISO}T00:00:00`)) / 86400000);
  if (diff < 0) return { label: "Vencida", cor: "#ef4444", icon: "🔴" };
  if (diff === 0) return { label: "Hoje", cor: "#f97316", icon: "🟠" };
  if (diff <= 3) return { label: "Próxima", cor: "#eab308", icon: "🟡" };
  return null;
}

export function prioLabel(diasAtraso, qtdPromessas) {
  if (diasAtraso > 90 || qtdPromessas >= 3) return "CRÍTICO";
  if (diasAtraso > 30 || qtdPromessas >= 2) return "ALTO";
  if (diasAtraso > 0 || qtdPromessas >= 1) return "MÉDIO";
  return "BAIXO";
}

export function prioCor(l) {
  return l === "CRÍTICO" ? "#ef4444" : l === "ALTO" ? "#f97316" : l === "MÉDIO" ? "#eab308" : "#64748b";
}

// Classificação de promessa de pagamento
export function promessaClassif(qtd) {
  if (qtd >= 3) return { label: "Crítico", cor: "#ef4444" };
  if (qtd === 2) return { label: "Médio", cor: "#f97316" };
  if (qtd === 1) return { label: "Baixo", cor: "#eab308" };
  return null;
}

// Sugestão de encaminhamento baseada em dias de atraso
export function sugestaoEncaminhamento(diasAtraso, valor) {
  if (diasAtraso > 180 || (diasAtraso > 90 && valor > 5000)) return { label: "Jurídico", cor: "#7c3aed" };
  if (diasAtraso > 90) return { label: "Protesto", cor: "#ef4444" };
  if (diasAtraso > 30) return { label: "Assessoria", cor: "#f97316" };
  if (diasAtraso > 7) return { label: "Verificar", cor: "#3b82f6" };
  return null;
}

export function normText(v) {
  return String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/\s+/g, " ");
}

function normHeader(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\uFEFF/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function normToken(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

const DOC_TOKENS = new Set(["NF", "NFE", "NFSE", "FAT", "TC", "EB", "CTE", "DUP", "DUPL", "DUPLICATA", "TITULO", "PARCELA", "REC"]);
const FINR1253_TITLE_TOKENS = new Set(["FAT", "REC", "NF", "NFE"]);

function isDocToken(v) {
  const n = normToken(v);
  return DOC_TOKENS.has(n) || /^NF\d*$/.test(n) || /^NFE\d*$/.test(n) || /^FAT\d*$/.test(n) || /^REC\d*$/.test(n);
}

function isFinr1253TitleToken(v) {
  return FINR1253_TITLE_TOKENS.has(normToken(v));
}

function isValidClientName(v) {
  const s = String(v ?? "").trim();
  if (!s || isDocToken(s) || /^\d+$/.test(s)) return false;
  return /[A-Za-zÀ-ÿ]/.test(s) && s.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 3;
}

function isValidClientCode(v) {
  const s = String(v ?? "").trim();
  return /^\d{1,10}$/.test(s.replace(/\D/g, "")) && !isDocToken(s);
}

function firstValid(row, names, validator) {
  for (const n of names) {
    if (row[n] != null && String(row[n]).trim() !== "" && (!validator || validator(row[n]))) return row[n];
  }
  return "";
}

export function pick(row, names) {
  for (const n of names) if (row[n] != null && String(row[n]).trim() !== "") return row[n];
  return "";
}

function pickFlex(row, names, validator = null) {
  const wanted = names.map(normHeader);
  for (const [k, v] of Object.entries(row || {})) {
    const nk = normHeader(k);
    if (wanted.some((w) => nk === w || nk.includes(w) || w.includes(nk))) {
      if (v != null && String(v).trim() !== "" && (!validator || validator(v))) return v;
    }
  }
  return "";
}

export function detectSrc(fn) {
  const u = String(fn || "").toUpperCase();
  return (u.includes("7007") || u.includes("CONS_CAR_EB") || u.includes("_EB")) ? "RPT_7007_CONS_CAR_EB" : "FINR1253";
}

export function calcFin(valor, venc) {
  const orig = num(valor), dias = diffDias(venc);
  if (dias <= 0) return { valorOriginal: orig, valorMulta: 0, valorJuros: 0, valorTotalDebito: orig, diasAtraso: 0 };
  const multa = orig * 0.02, juros = orig * 0.01 * (dias / 30);
  return { valorOriginal: orig, valorMulta: multa, valorJuros: juros, valorTotalDebito: orig + multa + juros, diasAtraso: dias };
}

// Normaliza um campo de chave: maiúsculas, sem espaços, sem pontos, sem zeros à esquerda numéricos
export function keyPart(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/^0+(\d+)$/, "$1");
}

export function buildId({ origem, nrCli, tp, titulo, seq }) {
  return [origem, nrCli, tp, titulo, seq].map(keyPart).join("|");
}

export function cliKey(item) {
  return `${String(item.nrCli || "").trim()}||${normText(item.nomeCli || "")}`;
}

export function buildItem(o) {
  const f = calcFin(o.valorOriginal, o.vencimento);
  return {
    ...o,
    id: buildId(o),
    valorOriginal: f.valorOriginal,
    valorMulta: f.valorMulta,
    valorJuros: f.valorJuros,
    valorTotalDebito: f.valorTotalDebito,
    diasAtraso: f.diasAtraso,
    status: o.status || "Não Contatado",
    encaminhar: o.encaminhar || "",
    dataContato: o.dataContato || "",
    dataPromessa: o.dataPromessa || "",
    obs: o.obs || "",
    qtd: o.qtd || 0,
    clientCategory: o.clientCategory || ""
  };
}

export function dbToItem(r) {
  return buildItem({
    _dbId: r.id,
    origem: r.source,
    nrCli: r.client_code,
    nomeCli: r.client_name,
    tp: r.doc_type,
    ser: r.serie,
    titulo: r.title_number,
    seq: r.seq,
    nfServico: r.nf_servico,
    emissao: r.issue_date,
    vencimento: r.due_date,
    valorOriginal: r.original_value,
    portador: r.portador,
    status: r.current_status || "Não Contatado",
    encaminhar: r.workflow_status || "",
    tipoContato: r.current_contact_type || "",
    dataContato: r.last_contact_date || "",
    dataPromessa: r.promise_date || "",
    obs: r.last_note || "",
    qtd: r.contact_count || 0,
    solicitanteProtesto: r.protest_requested_by || "",
    clientCategory: r.client_category || ""
  });
}

function cleanClientCode(v) {
  return String(v ?? "").replace(/\D/g, "").trim();
}

function cellText(row, idx) {
  return String((row || [])[idx] ?? "").trim();
}

function joinedRow(row) {
  return (row || []).map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
}

function isIgnorableFinr1253Line(row) {
  const firstNorm = normHeader(cellText(row, 0));
  const rawNorm = normHeader(joinedRow(row));
  if (!rawNorm) return true;
  return (
    firstNorm.startsWith("TOTALEMPRESAS") ||
    firstNorm.startsWith("DATAHORAEMISSAO") ||
    firstNorm.startsWith("TOTALGERAL") ||
    firstNorm === "TP" ||
    rawNorm.includes("DATAHORAEMISSAO")
  );
}

function parseClienteLinha(row) {
  const raw = cellText(row, 0);
  const m = raw.match(/^Cliente:\s*([\d.]+)\s*-\s*(.+?)\s*-\s*CPF\/CNPJ:\s*([\d./-]+)\s*$/i);
  if (!m) {
    console.error("Linha Cliente: inválida na FINR1253. Bloco ignorado.", row);
    return null;
  }
  return {
    nrCli: cleanClientCode(m[1]),
    nomeCli: String(m[2] || "").trim(),
    cpfCnpj: String(m[3] || "").trim(),
    telefone: "",
    contato: ""
  };
}

function parseTotalCliente(row) {
  let telefone = "";
  let contato = "";

  for (const cell of row || []) {
    const text = String(cell ?? "").trim();
    if (!telefone) {
      const telMatch = text.match(/Tel\.?\s*:?\s*(.+)/i);
      if (telMatch) telefone = String(telMatch[1] || "").replace(/\s+Contato\s*:.*$/i, "").trim();
    }
    if (!contato) {
      const contatoMatch = text.match(/Contato\s*:?\s*(.+)/i);
      if (contatoMatch) contato = String(contatoMatch[1] || "").trim();
    }
  }

  if (!telefone || !contato) {
    const raw = joinedRow(row);
    if (!telefone) {
      const telMatch = raw.match(/Tel\.?\s*:?\s*(.+?)(?:\s+Contato\s*:|$)/i);
      telefone = String(telMatch?.[1] || "").trim();
    }
    if (!contato) {
      const contatoMatch = raw.match(/Contato\s*:?\s*(.+)$/i);
      contato = String(contatoMatch?.[1] || "").trim();
    }
  }

  return { telefone, contato };
}

function buildFinr1253ItemFromTitulo(row, clienteAtivo, dadosTotal = {}) {
  const tp = cellText(row, 0).toUpperCase();
  const titulo = cellText(row, 7) || cellText(row, 2);
  const receber = row?.[11];
  const calculada = row?.[10];
  const recebPrc = row?.[9];
  const valor = num(receber) > 0 ? receber : num(calculada) > 0 ? calculada : recebPrc;

  if (!clienteAtivo || !isValidClientName(clienteAtivo.nomeCli)) return null;
  if (!isFinr1253TitleToken(tp)) return null;
  if (!titulo || num(valor) <= 0) return null;

  return buildItem({
    origem: "FINR1253",
    nrCli: clienteAtivo.nrCli,
    nomeCli: clienteAtivo.nomeCli,
    cpfCnpj: clienteAtivo.cpfCnpj || "",
    telefone: dadosTotal.telefone || "",
    contato: dadosTotal.contato || "",
    tp,
    ser: cellText(row, 1),
    numero: cellText(row, 2),
    titulo: String(titulo || "").trim(),
    seq: cellText(row, 3),
    nfServico: cellText(row, 4),
    operacao: row?.[5] ?? "",
    emissao: "",
    vencimento: row?.[6] ?? "",
    vencto: row?.[6] ?? "",
    valorOriginal: num(valor),
    valorTitulo: num(row?.[7]),
    acrescimo: num(row?.[8]),
    recebPrc: num(recebPrc),
    valorCalculado: num(calculada),
    valorReceber: num(receber),
    atrasoRelatorio: num(row?.[12]),
    uteis: cellText(row, 13),
    portador: cellText(row, 14)
  });
}

export function parseRows1253(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const items = [];
  let clienteAtivo = null;
  let bufferTitulos = [];

  const flushBloco = (dadosTotal = {}, motivo = "") => {
    if (bufferTitulos.length === 0) return;

    if (!clienteAtivo) {
      console.warn("FINR1253: bloco com títulos sem cliente ativo ignorado.", { motivo, linhas: bufferTitulos.length });
      bufferTitulos = [];
      return;
    }

    if (motivo === "sem_total_cliente") {
      console.warn("FINR1253: bloco fechado sem Total Cliente; telefone e contato ficarão vazios.", {
        cliente: clienteAtivo.nomeCli,
        linhas: bufferTitulos.length
      });
    }

    for (const row of bufferTitulos) {
      const item = buildFinr1253ItemFromTitulo(row, clienteAtivo, dadosTotal);
      if (item) items.push(item);
    }
    bufferTitulos = [];
  };

  for (const row of rows) {
    const first = cellText(row, 0);
    const firstNorm = normHeader(first);

    if (isIgnorableFinr1253Line(row)) continue;

    if (firstNorm.startsWith("CLIENTE")) {
      flushBloco({}, "sem_total_cliente");
      bufferTitulos = [];
      clienteAtivo = parseClienteLinha(row);
      continue;
    }

    if (firstNorm.startsWith("TOTALCLIENTE")) {
      const dadosTotal = parseTotalCliente(row);
      flushBloco(dadosTotal, "total_cliente");
      clienteAtivo = null;
      bufferTitulos = [];
      continue;
    }

    if (isFinr1253TitleToken(first)) {
      if (!clienteAtivo) {
        console.warn("FINR1253: título órfão sem cliente ativo. Linha ignorada.", row);
        continue;
      }
      bufferTitulos.push(row);
      continue;
    }
  }

  flushBloco({}, "sem_total_cliente");
  return items;
}

export function parseRows7007(rows) {
  const out = [];
  for (const row of rows) {
    const nome = firstValid(row, ["NOMCLI", "Nome Cliente", "NOME CLIENTE", "Razão Social", "RAZAO SOCIAL", "CLIENTE", "Cliente"], isValidClientName)
      || pickFlex(row, ["NOMCLI", "Nome Cliente", "Razão Social", "Cliente"], isValidClientName);
    const nrCli = firstValid(row, ["CODCLI", "Cod Cliente", "Código Cliente", "CODIGO CLIENTE", "Nº Cliente", "N Cliente", "Cliente Código"], isValidClientCode)
      || pickFlex(row, ["CODCLI", "Cod Cliente", "Código Cliente", "Nº Cliente"], isValidClientCode);
    const titulo = firstValid(row, ["NUMTIT", "Titulo", "Título", "Núm. Título", "Número Título", "N", "Nº Título"], (v) => !isDocToken(v))
      || pickFlex(row, ["NUMTIT", "Titulo", "Título", "Núm. Título", "Número Título"], (v) => !isDocToken(v));
    const seq = pick(row, ["SEQ", "Parcela", "Seq"]) || pickFlex(row, ["SEQ", "Parcela"]);
    const valor = pick(row, ["SLDTTT", "SALDO", "Valor", "Val. Orig", "Valor Original"]) || pickFlex(row, ["SLDTTT", "Saldo", "Valor", "Valor Original"]);
    const venc = pick(row, ["DTVENC", "Vencimento", "VENCTO", "Data Vencimento"]) || pickFlex(row, ["DTVENC", "Vencimento", "Vencto", "Data Vencimento"]);
    if (!isValidClientName(nome) || !titulo || isDocToken(titulo) || num(valor) <= 0) continue;
    out.push(buildItem({
      origem: "RPT_7007_CONS_CAR_EB",
      nrCli: String(nrCli || "").replace(/\D/g, "").trim(),
      nomeCli: String(nome).trim(),
      tp: "EB",
      titulo: String(titulo).trim(),
      seq: String(seq || "").trim(),
      vencimento: dateISO(venc),
      valorOriginal: num(valor),
      portador: "EB"
    }));
  }
  return out;
}

export function dlCsv(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, name);
}

export function openPrint() {
  window.print();
}