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

export function pick(row, names) {
  for (const n of names) if (row[n] != null && String(row[n]).trim() !== "") return row[n];
  return "";
}

function pickFlex(row, names) {
  const wanted = names.map(normHeader);
  for (const [k, v] of Object.entries(row || {})) {
    const nk = normHeader(k);
    if (wanted.some((w) => nk === w || nk.includes(w) || w.includes(nk))) {
      if (v != null && String(v).trim() !== "") return v;
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

export function parseRows1253(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const aliases = {
    codfil: ["CODFIL", "FILIAL", "COD FIL", "COD. FILIAL"],
    numtit: ["NUMTIT", "NUM TIT", "NUM. TIT", "N TITULO", "TITULO", "TÍTULO", "NUMERO TITULO", "NÚMERO TÍTULO"],
    codcli: ["CODCLI", "COD CLI", "COD. CLI", "CLIENTE", "CODIGO CLIENTE", "CÓDIGO CLIENTE"],
    dtemis: ["DTEMIS", "DT EMIS", "EMISSAO", "EMISSÃO", "DATA EMISSAO", "DATA EMISSÃO"],
    dtvenc: ["DTVENC", "DT VENC", "VENCIMENTO", "DATA VENCIMENTO", "VENCTO"],
    vlrorig: ["VLRORIG", "VLR ORIG", "VALOR ORIGINAL", "VLORIG", "ORIGINAL"],
    saldo: ["SLDTTT", "SALDO", "SALDO TOTAL", "VALOR SALDO", "VLR SALDO", "TOTAL"],
    juros: ["JUROS", "JURO"],
    atualizado: ["ATUALIZADO", "VALOR ATUALIZADO"],
    numnota: ["NUMNOTA", "NUM NOTA", "NF", "NOTA", "NOTA FISCAL", "NFSE"],
    nomcli: ["NOMCLI", "NOM CLI", "NOME CLIENTE", "NOME DO CLIENTE", "CLIENTE", "RAZAO SOCIAL", "RAZÃO SOCIAL", "NOME"],
    cep: ["CEP"],
    end: ["ENDERECO", "ENDEREÇO", "LOGRADOURO"],
    numero: ["NUMERO", "NÚMERO", "NR"],
    bairro: ["BAIRRO"],
    cidade: ["CIDADE", "MUNICIPIO", "MUNICÍPIO"],
    estado: ["ESTADO", "UF"],
    fone1: ["FONE1", "FONE 1", "TELEFONE", "TEL"],
    fone2: ["FONE2", "FONE 2", "CELULAR"],
    email: ["E_MAIL", "EMAIL", "E-MAIL"]
  };

  const findCol = (headers, names) => {
    const normalizedNames = names.map(normHeader).filter(Boolean);
    return headers.findIndex((header) => normalizedNames.some((name) => header === name || header.includes(name) || name.includes(header)));
  };

  let headerIdx = rows.findIndex((r) => {
    const headers = (r || []).map(normHeader);
    const hasClient = findCol(headers, aliases.nomcli) >= 0;
    const hasTitle = findCol(headers, aliases.numtit) >= 0;
    const hasValue = findCol(headers, [...aliases.saldo, ...aliases.vlrorig, ...aliases.atualizado]) >= 0;
    return hasClient && hasTitle && hasValue;
  });

  if (headerIdx < 0) {
    headerIdx = rows.findIndex((r) => (r || []).map(normHeader).some((c) => c.includes("NOMCLI") || c.includes("NOMECLIENTE") || c.includes("RAZAOSOCIAL")));
  }

  if (headerIdx < 0) return [];

  const h = (rows[headerIdx] || []).map(normHeader);
  const idx = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findCol(h, names)]));
  const out = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = (key) => idx[key] >= 0 ? r[idx[key]] : "";
    const nome = get("nomcli");
    const titulo = get("numtit");
    const valor = get("saldo") || get("atualizado") || get("vlrorig");
    const nomeTxt = String(nome || "").trim();
    const tituloTxt = String(titulo || "").trim();

    if (!nomeTxt || !tituloTxt || num(valor) <= 0) continue;
    if (["TOTAL", "TOTAIS", "SUBTOTAL"].includes(normHeader(nomeTxt)) || ["TOTAL", "TOTAIS", "SUBTOTAL"].includes(normHeader(tituloTxt))) continue;

    out.push(buildItem({
      origem: "FINR1253",
      nrCli: String(get("codcli") || "").trim(),
      nomeCli: nomeTxt,
      tp: "TC",
      titulo: tituloTxt,
      seq: "",
      nfServico: String(get("numnota") || "").trim(),
      emissao: dateISO(get("dtemis")),
      vencimento: dateISO(get("dtvenc")),
      valorOriginal: num(valor),
      portador: "TC"
    }));
  }
  return out;
}

export function parseRows7007(rows) {
  const out = [];
  for (const row of rows) {
    const nome = pick(row, ["NOMCLI", "Cliente", "CLIENTE", "Nome Cliente"]) || pickFlex(row, ["NOMCLI", "Nome Cliente", "Cliente", "Razão Social"]);
    const nrCli = pick(row, ["CODCLI", "Cliente", "Cod Cliente", "Nº"]) || pickFlex(row, ["CODCLI", "Cod Cliente", "Código Cliente", "Nº"]);
    const titulo = pick(row, ["NUMTIT", "Titulo", "Título", "Núm. Título", "N"]) || pickFlex(row, ["NUMTIT", "Titulo", "Título", "Núm. Título", "Número Título", "N"]);
    const seq = pick(row, ["SEQ", "Parcela", "Seq"]) || pickFlex(row, ["SEQ", "Parcela"]);
    const valor = pick(row, ["SLDTTT", "SALDO", "Valor", "Val. Orig", "Valor Original"]) || pickFlex(row, ["SLDTTT", "Saldo", "Valor", "Valor Original"]);
    const venc = pick(row, ["DTVENC", "Vencimento", "VENCTO", "Data Vencimento"]) || pickFlex(row, ["DTVENC", "Vencimento", "Vencto", "Data Vencimento"]);
    if (!nome || !titulo || num(valor) <= 0) continue;
    out.push(buildItem({
      origem: "RPT_7007_CONS_CAR_EB",
      nrCli: String(nrCli || "").trim(),
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