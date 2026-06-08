import * as XLSX from "xlsx";

export const hoje = new Date();
export const hojeISO = hoje.toISOString().slice(0, 10);

export const STATUS_OPC = ["Não Contatado","Em Cobrança","Sem Retorno","Prometeu Pagar","Pago Aguard. Baixa","Em Permuta","Encerrado","Incobrável / Baixa por Perda"];
export const ENCAMINHAR_OPC = [
  {value:"",label:"Sem encaminhamento"},
  {value:"verificacao",label:"→ Verificar Pagamento"},
  {value:"protesto",label:"→ Solicitar Protesto"},
  {value:"assessoria",label:"→ Encaminhar para Assessoria"}
];
export const CONTATO_OPC = ["Ligação","WhatsApp","E-mail","Presencial","Mensagem Interna"];
export const VERIF_RESP = ["Confirmado","Não localizado","Baixado","Erro","Duplicidade","Devolver para cobrança"];
export const PROT_RESP = ["Aprovado","Reprovado","Devolver para cobrança"];

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

export function promessaClassif(qtd) {
  if (qtd >= 3) return { label: "Crítico", cor: "#ef4444" };
  if (qtd === 2) return { label: "Médio", cor: "#f97316" };
  if (qtd === 1) return { label: "Baixo", cor: "#eab308" };
  return null;
}

export function sugestaoEncaminhamento(diasAtraso, valor) {
  if (diasAtraso > 900) return { label: "Perda", cor: "#991b1b" };
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
  return String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^\uFEFF/, "").replace(/[^A-Z0-9]/g, "");
}

function normH(v) {
  return String(v ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-_°ºª]/g, " ").replace(/\s+/g, " ").trim();
}

function normToken(v) {
  return String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
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

export function pick(row, names) {
  for (const n of names) if (row[n] != null && String(row[n]).trim() !== "") return row[n];
  return "";
}

export function detectSrc(fn) {
  const u = String(fn || "").toUpperCase().replace(/[\s\-_]/g, "");
  return (u.includes("7007") || u.includes("CONSCAREB") || u.includes("RPTEB") || /EB\.XLS/.test(u) || u.endsWith("EB")) ? "RPT_7007_CONS_CAR_EB" : "FINR1253";
}

export function calcFin(valor, venc) {
  const orig = num(valor), dias = diffDias(venc);
  if (dias <= 0) return { valorOriginal: orig, valorMulta: 0, valorJuros: 0, valorTotalDebito: orig, diasAtraso: 0 };
  const multa = orig * 0.02, juros = orig * 0.01 * (dias / 30);
  return { valorOriginal: orig, valorMulta: multa, valorJuros: juros, valorTotalDebito: orig + multa + juros, diasAtraso: dias };
}

export function keyPart(v) {
  return String(v ?? "").toUpperCase().replace(/\s+/g, "").replace(/\./g, "").replace(/^0+(\d+)$/, "$1");
}

export function normalizeTituloNumero(titulo) {
  const raw = String(titulo ?? "").trim().replace(/\./g, "");
  const m = raw.match(/^(\d+)\/(\d{1,3})$/);
  if (m) return { base: m[1].replace(/^0+(\d)/, "$1"), sufixo: m[2] };
  return { base: raw.replace(/^0+(\d)/, "$1").toUpperCase(), sufixo: "" };
}

export function normalizarRazaoSocial(nome) {
  return String(nome || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\-\/\\]/g, " ").replace(/\b(LTDA|ME|EPP|S A|SA|EIRELI|EIRELLI|SPE)\b/g, "").replace(/\s+/g, " ").trim();
}

export function getClienteGroupKeyRPT7007(item) {
  const nome = normalizarRazaoSocial(item?.nomeCli || item?.client_name);
  if (nome.length >= 3) return `NOME:${nome}`;
  const cod = String(item?.nrCli || item?.client_code || "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1");
  return `COD:${cod}`;
}

export function getTituloKey({ origem, titulo, seq, vencimento }) {
  const origRaw = String(origem ?? "").toUpperCase().replace(/[\s\-_]/g, "");
  const normOrig = (origRaw.includes("7007") || origRaw.includes("CONSCAREB") || origRaw === "RPT7007CONSCAREB") ? "EB" : "FINR1253";
  const { base: numeroBase, sufixo: sufixoBarra } = normalizeTituloNumero(titulo);
  const numeroNorm = numeroBase.toUpperCase();
  const seqRaw = String(seq ?? "").trim();
  const seqPareceVencimento = /^\d{4}-\d{2}-\d{2}$/.test(seqRaw) || /^\d{8}$/.test(seqRaw);
  const seqEhSufixoBarra = sufixoBarra !== "" && seqRaw === sufixoBarra;
  const seqNorm = (seqPareceVencimento || seqEhSufixoBarra || !seqRaw) ? "" : seqRaw.replace(/^0+(\d)/, "$1");
  const vencNorm = String(vencimento ?? "").replace(/-/g, "").trim();
  return [normOrig, numeroNorm, seqNorm, vencNorm].join("|");
}

export function dedupeTitulos(items) {
  const map = new Map();
  for (const item of items) {
    const key = getTituloKey(item);
    const prev = map.get(key);
    if (!prev) { map.set(key, item); continue; }
    const score = (i) => [i.status !== "Não Contatado", i.obs, i.dataPromessa, i.dataContato, i.encaminhar, i.clientCategory].filter(Boolean).length;
    if (score(item) > score(prev)) map.set(key, item);
  }
  return Array.from(map.values());
}

export function buildId({ origem, nrCli, tp, titulo, seq }) {
  return [origem, nrCli, tp, titulo, seq].map(keyPart).join("|");
}

export function cliKey(item) {
  return `${String(item.nrCli || "").trim()}||${normText(item.nomeCli || "")}`;
}

export function buildItem(o) {
  const valorOriginal = num(o.valorOriginal ?? o.original_value ?? 0);
  const valorRecebido = num(o.valorRecebido ?? o.received_value ?? 0);
  const saldoErp = num(o.saldoErp ?? o.erp_balance ?? 0);
  const valorEmAberto = num(o.valorEmAberto ?? o.open_value ?? (saldoErp > 0 ? saldoErp : valorOriginal));
  const totalInformado = o.valorTotalDebito !== undefined && o.valorTotalDebito !== null ? num(o.valorTotalDebito) : null;
  const usaValorDoRelatorio = ["FINR1253", "RPT_7007_CONS_CAR_EB"].includes(String(o.origem || ""));
  const diasAtraso = diffDias(o.vencimento);
  const f = totalInformado !== null
    ? { valorMulta: num(o.valorMulta), valorJuros: num(o.valorJuros), valorTotalDebito: totalInformado, diasAtraso }
    : usaValorDoRelatorio
      ? { valorMulta: num(o.valorMulta), valorJuros: num(o.valorJuros), valorTotalDebito: valorEmAberto || valorOriginal, diasAtraso }
      : calcFin(valorEmAberto || valorOriginal, o.vencimento);

  return {
    ...o,
    id: buildId(o),
    valorOriginal,
    valorRecebido,
    valorEmAberto,
    saldoErp,
    valorMulta: f.valorMulta,
    valorJuros: f.valorJuros,
    valorTotalDebito: f.valorTotalDebito,
    diasAtraso: f.diasAtraso,
    partialPaymentDetected: Boolean(o.partialPaymentDetected || o.partial_payment_detected || valorRecebido > 0),
    clientGroupKey: o.clientGroupKey || o.client_group_key || "",
    primaryClientCode: o.primaryClientCode || o.primary_client_code || o.nrCli || "",
    erpClientCodes: o.erpClientCodes || o.erp_client_codes || (o.nrCli ? [String(o.nrCli)] : []),
    recordOrigin: o.recordOrigin || o.record_origin || "ERP",
    status: o.status || "Não Contatado",
    encaminhar: o.encaminhar || "",
    workflow_status: o.workflow_status || o.encaminhar || "",
    dataContato: o.dataContato || "",
    dataPromessa: o.dataPromessa || "",
    obs: o.obs || "",
    qtd: o.qtd || 0,
    clientCategory: o.clientCategory || ""
  };
}

export function dbToItem(r) {
  return buildItem({
    _dbId: r.id, origem: r.source, nrCli: r.client_code, nomeCli: r.client_name,
    clientGroupKey: r.client_group_key || "", primaryClientCode: r.primary_client_code || r.client_code || "", erpClientCodes: r.erp_client_codes || (r.client_code ? [r.client_code] : []), recordOrigin: r.record_origin || "ERP",
    tp: r.doc_type, ser: r.serie, titulo: r.title_number, seq: r.seq, nfServico: r.nf_servico, emissao: r.issue_date, vencimento: r.due_date,
    valorOriginal: r.open_value || r.original_value, valorRecebido: r.received_value, valorEmAberto: r.open_value || r.original_value, saldoErp: r.erp_balance, partialPaymentDetected: r.partial_payment_detected,
    portador: r.portador, status: r.current_status || "Não Contatado", encaminhar: r.workflow_status || "", workflow_status: r.workflow_status || "", tipoContato: r.current_contact_type || "", dataContato: r.last_contact_date || "", dataPromessa: r.promise_date || "", obs: r.last_note || "", qtd: r.contact_count || 0, solicitanteProtesto: r.protest_requested_by || "", clientCategory: r.client_category || ""
  });
}

function cleanClientCode(v) { return String(v ?? "").replace(/\D/g, "").trim(); }
function cellText(row, idx) { return String((row || [])[idx] ?? "").trim(); }
function joinedRow(row) { return (row || []).map((c) => String(c ?? "").trim()).filter(Boolean).join(" "); }

function parseClienteLinha(row) {
  const raw = cellText(row, 0);
  const m = raw.match(/^Cliente:\s*([\d.]+)\s*-\s*(.+?)\s*-\s*CPF\/CNPJ:\s*([\d./-]+)\s*$/i);
  if (!m) return null;
  return { nrCli: cleanClientCode(m[1]), nomeCli: String(m[2] || "").trim(), cpfCnpj: String(m[3] || "").trim(), telefone: "", contato: "" };
}

function parseTotalCliente(row) {
  let telefone = "", contato = "";
  for (const cell of row || []) {
    const text = String(cell ?? "").trim();
    if (!telefone) telefone = String(text.match(/Tel\.?\s*:?\s*(.+?)(?:\s+Contato\s*:|$)/i)?.[1] || "").trim();
    if (!contato) contato = String(text.match(/Contato\s*:?\s*(.+)$/i)?.[1] || "").trim();
  }
  const raw = joinedRow(row);
  if (!telefone) telefone = String(raw.match(/Tel\.?\s*:?\s*(.+?)(?:\s+Contato\s*:|$)/i)?.[1] || "").trim();
  if (!contato) contato = String(raw.match(/Contato\s*:?\s*(.+)$/i)?.[1] || "").trim();
  return { telefone, contato };
}

function buildFinr1253ItemFromTitulo(row, clienteAtivo, dadosTotal = {}) {
  const tp = cellText(row, 0).toUpperCase();
  if (!clienteAtivo || !isValidClientName(clienteAtivo.nomeCli) || !isFinr1253TitleToken(tp)) return null;
  const ser = cellText(row, 1);
  const { base: numero, sufixo: numSufixo } = normalizeTituloNumero(cellText(row, 2));
  const seq = cellText(row, 3) || numSufixo || "";
  const nfServico = cellText(row, 4);
  const vencto = row?.[6] ?? "";
  const valorFaceTit = num(row?.[7] ?? 0);
  const recebPrc = num(row?.[9] ?? 0);
  const calculada = num(row?.[10] ?? 0);
  const receber = num(row?.[11] ?? 0);
  const atraso = num(row?.[12] ?? 0);
  const uteis = cellText(row, 13);
  const portador = cellText(row, 14);
  if (!numero) return null;

  // FINR1253: a Carteira Geral deve bater com a coluna RECEBER do relatório.
  // "Título" é valor face/original; "Receb.Prc." é principal em aberto; "Calculada" é acréscimo calculado; "Receber" é total a cobrar.
  const valorACobrar = receber > 0 ? receber : (recebPrc > 0 ? recebPrc + calculada : valorFaceTit);
  if (valorACobrar <= 0) return null;
  const valorRecebidoParcial = Math.max(0, valorFaceTit - recebPrc);

  return buildItem({
    origem: "FINR1253", nrCli: clienteAtivo.nrCli, nomeCli: clienteAtivo.nomeCli, cpfCnpj: clienteAtivo.cpfCnpj || "",
    telefone: dadosTotal.telefone || "", contato: dadosTotal.contato || "", tp, ser, titulo: numero, numero, seq, nfServico,
    operacao: row?.[5] ?? "", emissao: "", vencimento: dateISO(vencto),
    valorOriginal: valorACobrar, valorRecebido: valorRecebidoParcial, valorEmAberto: valorACobrar, valorTotalDebito: valorACobrar,
    valorMulta: 0, valorJuros: calculada, acrescimo: num(row?.[8] ?? 0), recebPrc, valorCalculado: calculada, valorReceber: receber,
    atrasoRelatorio: atraso, uteis, portador, partialPaymentDetected: valorRecebidoParcial > 0
  });
}

export function parseRows1253(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const items = [];
  let clienteAtivo = null;
  let bufferTitulos = [];
  let headerSkipped = 0;
  const flushBloco = (dadosTotal = {}) => {
    if (!bufferTitulos.length) return;
    if (!clienteAtivo) { bufferTitulos = []; return; }
    for (const row of bufferTitulos) {
      const item = buildFinr1253ItemFromTitulo(row, clienteAtivo, dadosTotal);
      if (item) items.push(item);
    }
    bufferTitulos = [];
  };
  for (const row of rows) {
    const first = cellText(row, 0), firstNorm = normHeader(first), joined = normHeader(joinedRow(row));
    if (!joined) continue;
    const isHeaderRow = firstNorm === "TP" || firstNorm === "TPSER" || firstNorm === "TIPO" || (firstNorm === "" && joined.includes("VENCIMENTO") && joined.includes("ATRASO")) || (joined.includes("VENCIMENTO") && joined.includes("VALORIA") && !firstNorm.startsWith("CLIENTE") && !isFinr1253TitleToken(first));
    if (headerSkipped < 2 || isHeaderRow) { if (!isHeaderRow) headerSkipped++; continue; }
    if (firstNorm.startsWith("TOTALEMPRESAS") || firstNorm.startsWith("DATAHORAEMISSAO") || firstNorm.startsWith("TOTALGERAL") || joined.includes("DATAHORAEMISSAO")) continue;
    if (/^Cliente:/i.test(first)) { flushBloco({}); bufferTitulos = []; clienteAtivo = parseClienteLinha(row); continue; }
    if (/^Total\s*Cliente/i.test(first) || firstNorm.startsWith("TOTALCLIENTE")) { const dadosTotal = parseTotalCliente(row); flushBloco(dadosTotal); clienteAtivo = null; bufferTitulos = []; continue; }
    if (isFinr1253TitleToken(first)) { if (clienteAtivo) bufferTitulos.push(row); continue; }
  }
  flushBloco({});
  const dedup = dedupeTitulos(items);
  console.info(`FINR1253: ${dedup.length} lançamentos importados com sucesso. Valor usado na carteira = coluna Receber.`);
  return dedup;
}

const H7007 = {
  nomeCli: ["NOMCLI","NOME CLIENTE","RAZAO SOCIAL","CLIENTE","SACADO","NOME SACADO","DEVEDOR","NOME","RAZAO","NOME DO CLIENTE","FAVORECIDO"],
  nrCli: ["CODCLI","COD CLIENTE","CODIGO CLIENTE","CLIENTE CODIGO","COD","CODIGO","NRCLI","NRO CLIENTE","NR CLIENTE","N CLIENTE","NUM CLIENTE","NUMERO CLIENTE"],
  titulo: ["NUMTIT","NUM TIT","NUMERO TITULO","N TITULO","NR TITULO","NRO TITULO","DUPLICATA","NOTA","FATURA","DOCUMENTO","NR DOCUMENTO","NUMERO DOCUMENTO","NUM DOCUMENTO","TITULO","TITULOS"],
  seq: ["SEQ","SEQUENCIA","PARCELA","PARC","PRESTACAO","PAR","PARTE","PARCELA NR","NR PARCELA"],
  venc: ["DTVENC","DT VENC","DATA VENCIMENTO","VENCIMENTO","VENCTO","DT VENCTO","VENC","DATA VENC","DT VENCIMENTO","VENCIMENTO TITULO"],
  saldo: ["SLDTTT","SALDO","SALDO TITULO","SALDO TOTAL","VLR SALDO","VAL SALDO","VALOR SALDO","VALOR ABERTO","VALOR EM ABERTO","SALDO EM ABERTO","SALDO DEVEDOR"],
  vlrTit: ["VLRTIT","VLR TIT","VAL TITULO","VALOR TITULO","VAL ORIG","VALOR ORIGINAL","VLR ORIG","VALOR","TOTAL","VLR TOTAL","VALOR FACE","VALOR NOMINAL"],
  valorRecebido: ["VALOR RECEBIDO","VLR RECEBIDO","VAL RECEBIDO","RECEBIDO","VLRREC","VALREC","VL REC","VL_RECEBIDO","RECEBIMENTOS","VALOR PAGO","VLR PAGO"],
  tp: ["TPTIT","TP","TIPO","TIPO TITULO","TIPO DOC","TIPO DOCUMENTO","ESPECIE","ESP"],
  portador: ["PORTAD","PORTADOR","BANCO","CARTEIRA","COBRANCA","COBRANÇA","COD BANCO","BANCO COBRADOR"],
  serie: ["SERTIT","SERIE","SER","SERIE TITULO","NR SERIE"],
  emissao: ["DTEMIS","EMISSAO","DATA EMISSAO","DT EMISSAO","DATA EMIS","DT EMIS","DATA DE EMISSAO"],
};

function buildHeaderMap7007(sampleRow) {
  const map = {}, keys = Object.keys(sampleRow || {});
  for (const [field, aliases] of Object.entries(H7007)) {
    for (const realKey of keys) { const n = normH(realKey); if (aliases.includes(n)) { map[field] = realKey; break; } }
    if (!map[field]) for (const realKey of keys) { const n = normH(realKey); if (aliases.some((a) => n.includes(a) || a.includes(n))) { map[field] = realKey; break; } }
  }
  return map;
}

function detectHeaderRow7007(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]; if (!row || typeof row !== "object") continue;
    let matches = 0;
    for (const k of Object.keys(row)) {
      const n = normH(k);
      for (const aliases of Object.values(H7007)) if (aliases.some((a) => n === a || n.includes(a) || a.includes(n))) { matches++; break; }
    }
    if (matches >= 2) return i;
  }
  return 0;
}

export function parseRows7007(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headerIdx = detectHeaderRow7007(rows);
  const hmap = buildHeaderMap7007(rows[headerIdx] || rows[0]);
  console.info(`RPT_7007 diagnóstico: ${rows.length} linhas lidas | cabeçalho na linha ${headerIdx} | mapeados: [${Object.entries(hmap).map(([f, k]) => `${f}="${k}"`).join(", ")}]`);

  const isHeaderOrTotalRow = (row) => {
    if (!row) return true;
    const vals = Object.values(row).map((v) => normH(String(v ?? ""))), joined = vals.join(" ");
    return (joined.includes("TOTAL") && vals.some((v) => /^TOTAL/.test(v))) || (joined.includes("EMPRESA") && joined.includes("TOTAL")) || vals.every((v) => !v);
  };

  const out = [];
  let descartados = 0;
  const motivosDescarte = {};
  const addMotivo = (m) => { motivosDescarte[m] = (motivosDescarte[m] || 0) + 1; };

  for (const row of rows.slice(headerIdx + 1 > 0 ? headerIdx + 1 : 1)) {
    if (isHeaderOrTotalRow(row)) continue;
    let nome = "";
    if (hmap.nomeCli && isValidClientName(row[hmap.nomeCli])) nome = String(row[hmap.nomeCli]).trim();
    if (!nome) for (const k of Object.keys(row)) if (isValidClientName(row[k])) { nome = String(row[k]).trim(); break; }
    let nrCli = hmap.nrCli && row[hmap.nrCli] != null ? String(row[hmap.nrCli]).replace(/\D/g, "").trim() : "";
    let titulo = "", seqDaBarra = "";
    if (hmap.titulo && row[hmap.titulo] != null && String(row[hmap.titulo]).trim() && !isDocToken(String(row[hmap.titulo]).trim())) {
      const t = normalizeTituloNumero(String(row[hmap.titulo]).trim()); titulo = t.base; seqDaBarra = t.sufixo;
    }
    const seq = (hmap.seq ? String(row[hmap.seq] ?? "").trim() : "") || (!hmap.seq && seqDaBarra ? seqDaBarra : "");
    const vencimento = dateISO(hmap.venc ? row[hmap.venc] : undefined);
    const valorTotalErp = num(hmap.vlrTit ? row[hmap.vlrTit] : 0);
    const valorRecebidoErp = num(hmap.valorRecebido ? row[hmap.valorRecebido] : 0);
    const saldoErp = num(hmap.saldo ? row[hmap.saldo] : 0);
    let valorEmAberto = saldoErp > 0 ? saldoErp : valorTotalErp - valorRecebidoErp;
    if (!Number.isFinite(valorEmAberto) || valorEmAberto < 0) valorEmAberto = 0;
    if (!isValidClientName(nome) && !nrCli) { descartados++; addMotivo("sem_cliente"); continue; }
    if (!titulo) { descartados++; addMotivo("sem_titulo"); continue; }
    if (!vencimento && valorTotalErp <= 0 && valorEmAberto <= 0) { descartados++; addMotivo("sem_venc_nem_valor"); continue; }
    if (valorEmAberto <= 0) { descartados++; addMotivo("saldo_zerado"); continue; }
    const nomeFinal = nome || `CLI_${nrCli}`;
    const clientGroupKey = getClienteGroupKeyRPT7007({ nrCli, nomeCli: nomeFinal });
    const tpRaw = hmap.tp ? row[hmap.tp] : undefined;
    const tp = (tpRaw && String(tpRaw).trim() && !isDocToken(String(tpRaw).trim())) ? String(tpRaw).trim().toUpperCase() : "EB";
    const portadorRaw = hmap.portador ? row[hmap.portador] : undefined;
    const portador = (portadorRaw && String(portadorRaw).trim()) ? String(portadorRaw).trim() : "EB";
    out.push(buildItem({
      origem: "RPT_7007_CONS_CAR_EB", nrCli, nomeCli: nomeFinal, clientGroupKey, primaryClientCode: nrCli, erpClientCodes: nrCli ? [nrCli] : [], recordOrigin: "ERP",
      tp, ser: hmap.serie ? String(row[hmap.serie] ?? "").trim() : "", titulo, seq: String(seq || "").trim(), nfServico: "", emissao: dateISO(hmap.emissao ? row[hmap.emissao] : undefined), vencimento,
      valorOriginal: valorEmAberto, valorRecebido: valorRecebidoErp, valorEmAberto, valorTotalDebito: valorEmAberto, saldoErp, partialPaymentDetected: valorRecebidoErp > 0, portador
    }));
  }
  const dedup = dedupeTitulos(out);
  console.info(`RPT_7007: ${dedup.length} títulos importados | ${descartados} descartados | motivos:`, motivosDescarte, "Valor usado na carteira = Saldo.");
  return dedup;
}

export function dlCsv(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, name);
}

export function openPrint() { window.print(); }