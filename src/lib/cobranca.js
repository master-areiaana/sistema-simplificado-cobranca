import * as XLSX from "xlsx";

export const hoje = new Date();
export const hojeISO = hoje.toISOString().slice(0, 10);

export const STATUS_OPC = ["Não Contatado","Em Cobrança","Sem Retorno","Prometeu Pagar","Pago Aguard. Baixa","Em Permuta","Encerrado"];
export const ENCAMINHAR_OPC = [
  {value:"",label:"Sem encaminhamento"},
  {value:"verificacao",label:"→ Verificar Pagamento"},
  {value:"protesto",label:"→ Solicitar Protesto"}
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
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
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

export function pick(row, names) {
  for (const n of names) if (row[n] != null && String(row[n]).trim() !== "") return row[n];
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
function normKey(v) {
  const s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
  // Remove zeros à esquerda de campos que são puramente numéricos (ex: "001234" → "1234")
  return s.replace(/^0+(\d+)$/, "$1");
}

export function buildId(b) {
  return [
    normKey(b.origem),
    normKey(b.nrCli),
    normKey(b.tp),
    normKey(b.ser),
    normKey(b.titulo),
    normKey(b.seq),
    normKey(b.nfServico),
  ].join("|");
}

export function buildItem(base) {
  const venc = dateISO(base.vencimento), fin = calcFin(base.valor, venc);
  // Normalizar campos da chave da mesma forma que buildId para garantir consistência no banco
  const nrCliNorm = String(base.nrCli || "").replace(/\./g, "").trim().replace(/^0+(\d+)$/, "$1");
  const tituloNorm = String(base.titulo || "").trim().toUpperCase().replace(/^0+(\d+)$/, "$1");
  const seqNorm = String(base.seq || "").trim().toUpperCase().replace(/^0+(\d+)$/, "$1");
  const nfServicoNorm = String(base.nfServico || "").trim().toUpperCase().replace(/^0+(\d+)$/, "$1");
  const tpNorm = String(base.tp || "").trim().toUpperCase();
  const serNorm = String(base.ser || "").trim().toUpperCase();
  return {
    id: buildId({ ...base, nrCli: nrCliNorm, titulo: tituloNorm, seq: seqNorm, nfServico: nfServicoNorm, tp: tpNorm, ser: serNorm }),
    origem: base.origem || "FINR1253",
    nrCli: nrCliNorm,
    nomeCli: String(base.nomeCli || "").trim(),
    titulo: tituloNorm,
    seq: seqNorm,
    nfServico: nfServicoNorm,
    tp: tpNorm,
    ser: serNorm,
    emissao: dateISO(base.emissao),
    vencimento: venc,
    ...fin,
    portador: String(base.portador || "").trim(),
    status: base.status || "Não Contatado",
    motivo: base.motivo || "",
    encaminhar: base.encaminhar || "",
    tipoContato: base.tipoContato || "",
    solicitanteProtesto: base.solicitanteProtesto || "",
    dataContato: base.dataContato || "",
    dataPromessa: base.dataPromessa || "",
    obs: base.obs || "",
    qtd: Number(base.qtd || 0),
  };
}

export function cliKey(i) {
  return `${String(i.nrCli || "").trim()}||${normText(i.nomeCli || "")}`;
}

// ── Parse FINR1253 ──
function rowTxt(row, max = 50) {
  return row.slice(0, max).map(v => String(v ?? "").trim()).filter(Boolean).join(" ").trim();
}
function getHMap(row) {
  // normText já remove acentos, pontos e normaliza espaços
  // "NÚMERO" → "NUMERO", "NF Serviço" → "NF SERVICO", "NF de Serviço" → "NF DE SERVICO"
  const h = (row || []).map(c => normText(c));
  // fi: acha o índice da primeira coluna cujo nome (com ou sem espaços) bate em algum alias
  const fi = al => h.findIndex(x => {
    const xSem = x.replace(/\s/g, "");
    return al.some(a => x === a || xSem === a.replace(/\s/g, ""));
  });
  return {
    tp:       fi(["TP", "TIPO", "TPDOC", "TP DOC", "TIPO DOC", "TIPO DOCUMENTO"]),
    ser:      fi(["SER", "SERIE", "SERIE DOC"]),
    numero:   fi(["NUMERO", "NUM", "NR", "NDOC", "N DOC", "NUMERODOC", "NUMERO DOC", "NUMERODOCUMENTO", "NUMERO DOCUMENTO"]),
    seq:      fi(["SEQ", "SEQUENCIA", "SEQ DOC", "SEQUENCIA DOC"]),
    nfServico:fi(["NF SERVICO", "NFSERVICO", "NF DE SERVICO", "NFDESERVICO", "NFSERV", "NF SERV", "NF"]),
    vencto:   fi(["VENCTO", "VENCIMENTO", "DT VENC", "DTVENC", "DTVENCIMENTO", "DATA VENC", "DATA VENCIMENTO", "DT VENCIMENTO"]),
    // CRÍTICO: priorizar "VALOR ORIGINAL" ou "VL ORIG" antes de "SALDO" ou "VALOR TOTAL"
    valorOrig:fi(["VALOR ORIGINAL", "VL ORIG", "VLORIGINAL", "VL ORIGINAL", "VALOR ORIG", "VALOR BRUTO"]),
    multa:    fi(["MULTA", "VLMULTA", "VL MULTA", "MULTA JUROS", "MULTA ACRESCIMO"]),
    juros:    fi(["JUROS", "VLJUROS", "VL JUROS", "JUROS MULTA"]),
    recebPrc: fi(["RECEB PRC", "RECEBPRC", "VLRECEB", "VL RECEB", "VALOR TOTAL", "SALDO", "SALDO DEVEDOR", "VL SALDO"]),
    portador: fi(["PORTADOR", "BANCO", "PORT", "PORTADOR COBR", "BANCO COBR"])
  };
}
function isH1253(row) {
  const m = getHMap(row);
  // Exige número e vencimento como mínimo obrigatório
  // Mais: precisa de pelo menos 1 dos outros campos financeiros/sequência
  if (m.numero < 0 || m.vencto < 0) return false;
  const extras = [m.seq >= 0, m.recebPrc >= 0, m.tp >= 0, m.ser >= 0].filter(Boolean).length;
  return extras >= 1;
}
function findCL(row) {
  for (const c of row || []) { const s = String(c ?? "").trim(); if (s.toUpperCase().includes("CLIENTE:")) return s; }
  return "";
}
function parseCli(txt) {
  let s = String(txt || "").trim();
  const pi = s.toUpperCase().indexOf("CLIENTE:"); if (pi >= 0) s = s.slice(pi + 8).trim();
  const pc = s.toUpperCase().indexOf("CPF/CNPJ:"); const bloco = pc >= 0 ? s.slice(0, pc).trim() : s;
  const ps = bloco.indexOf(" - ");
  return ps >= 0 ? { numeroCliente: bloco.slice(0, ps).replace(/\./g, "").trim(), nomeCliente: bloco.slice(ps + 3).trim() } : { numeroCliente: "", nomeCliente: bloco };
}

export function parseRows1253(matrix) {
  const lc = matrix.findIndex(r => isH1253(r)); if (lc < 0) return [];
  const map = getHMap(matrix[lc]); 
  let cN = "", cNome = ""; 
  const itens = [];
  
  // Log dos campos detectados no FINR1253
  console.log("📋 FINR1253 Mapeamento de colunas:", {
    valorOrig: map.valorOrig >= 0 ? "✅ Detectado" : "❌ Não encontrado",
    multa: map.multa >= 0 ? "✅ Detectado" : "❌ Não encontrado",
    juros: map.juros >= 0 ? "✅ Detectado" : "❌ Não encontrado",
    recebPrc: map.recebPrc >= 0 ? "✅ Detectado (Saldo/Total)" : "❌ Não encontrado"
  });
  
  for (let i = lc + 1; i < matrix.length; i++) {
    const row = matrix[i] || [], txt = rowTxt(row); 
    if (!txt) continue;
    
    const cl = findCL(row);
    if (cl) { const p = parseCli(cl); cN = p.numeroCliente; cNome = p.nomeCliente; continue; }
    if (txt.toUpperCase().includes("TOTAL CLIENTE") || txt.toUpperCase().includes("CONTATO:")) continue;
    if (!cN) continue;
    
    const nd = String(row[map.numero] ?? "").trim();
    const sq = map.seq >= 0 ? String(row[map.seq] ?? "").trim() : "";
    
    // REGRA: preferir VALOR ORIGINAL; se não existir, usar SALDO/TOTAL
    let valorPrincipal = "";
    if (map.valorOrig >= 0) {
      valorPrincipal = row[map.valorOrig];
    } else if (map.recebPrc >= 0) {
      valorPrincipal = row[map.recebPrc];
    }
    
    if (!nd || String(valorPrincipal ?? "").trim() === "") continue;
    
    itens.push(buildItem({ 
      origem: "FINR1253", 
      nrCli: cN, 
      nomeCli: cNome, 
      tp: map.tp >= 0 ? row[map.tp] : "", 
      ser: map.ser >= 0 ? row[map.ser] : "", 
      titulo: nd, 
      seq: sq, 
      nfServico: map.nfServico >= 0 ? row[map.nfServico] : "", 
      emissao: "", 
      vencimento: map.vencto >= 0 ? row[map.vencto] : "", 
      valor: valorPrincipal,
      portador: map.portador >= 0 ? row[map.portador] : "" 
    }));
  }
  
  const seen = new Set(), out = [];
  for (const x of itens) { 
    if (!seen.has(x.id) && x.nrCli && x.titulo) { 
      seen.add(x.id); 
      out.push(x); 
    } 
  }
  
  console.log(`📊 FINR1253 Parser: ${itens.length} linhas lidas, ${out.length} títulos únicos importados`);
  return out;
}

export function parseRows7007(rows) {
  const itens = rows.map(r => buildItem({
    origem: "RPT_7007_CONS_CAR_EB",
    tp: pick(r, ["Tipo Documento"]),
    ser: pick(r, ["Série", "Serie"]),
    titulo: pick(r, ["Numero Documento"]),
    seq: pick(r, ["Sequência", "Sequencia"]),
    nrCli: pick(r, ["Código Cliente", "Codigo Cliente"]),
    nomeCli: pick(r, ["Razão Social", "Razao Social"]),
    emissao: pick(r, ["Data Emissão", "Data Emissao"]),
    vencimento: pick(r, ["Data Vencimento"]),
    valor: pick(r, ["Valor Total"]),
    portador: `Vendedor: ${String(pick(r, ["Vendedor"]) || "").trim()}`
  }));
  const seen = new Set(), out = [];
  for (const x of itens) { if (!seen.has(x.id) && x.nrCli && x.titulo) { seen.add(x.id); out.push(x); } }
  return out;
}

export function dbToItem(r) {
  const item = buildItem({
    origem: r.source, nrCli: r.client_code, nomeCli: r.client_name,
    tp: r.doc_type, ser: r.serie, titulo: r.title_number, seq: r.seq,
    nfServico: r.nf_servico, emissao: r.issue_date, vencimento: r.due_date,
    valor: r.original_value, portador: r.portador,
    status: r.current_status || "Não Contatado",
    motivo: r.current_motive || "",
    encaminhar: r.workflow_status && r.workflow_status !== "normal" ? r.workflow_status : "",
    tipoContato: r.current_contact_type || "",
    solicitanteProtesto: r.protest_requested_by || "",
    dataContato: r.last_contact_date || "",
    dataPromessa: r.promise_date || "",
    obs: r.last_note || "",
    qtd: r.contact_count || 0,
  });
  item._dbId = r.id; // preserve DB id for updates
  return item;
}

export function dlCsv(fn, rows) {
  const esc = v => { const s = String(v ?? ""); return (s.includes(";") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map(r => r.map(esc).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function openPrint(title, headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join("");
  const tb = rows.map(r => `<tr>${r.map(c => `<td>${String(c ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("");
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#eee;font-weight:700}th,td{border:1px solid #ccc;padding:6px 8px}tr:nth-child(even){background:#f9f9f9}@media print{@page{margin:1cm}}</style></head><body><h1>${title}</h1><p>Emitido em ${new Date().toLocaleString("pt-BR")} — ${rows.length} registros</p><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
}