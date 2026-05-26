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
    firstNorm.startsWith("TOTALCLIENTE") ||
    firstNorm === "TP" ||
    firstNorm === "TPSER" ||
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

// Mapeamento de colunas da FINR1253 (linha de lançamento, índice 0-based):
// 0=Tp | 1=Ser | 2=Número | 3=Seq | 4=NF Serviço | 5=Operação | 6=Vencto.
// 7=Título(valor face) | 8=Acréscimo | 9=Receb.Prc. | 10=Calculada | 11=Receber | 12=Atraso | 13=Úteis | 14=Portador
function buildFinr1253ItemFromTitulo(row, clienteAtivo, dadosTotal = {}) {
  const tp = cellText(row, 0).toUpperCase();

  if (!clienteAtivo || !isValidClientName(clienteAtivo.nomeCli)) return null;
  if (!isFinr1253TitleToken(tp)) return null;

  const ser            = cellText(row, 1);
  const numero         = cellText(row, 2);   // Número do documento (ex: 9831)
  const seq            = cellText(row, 3);
  const nfServico      = cellText(row, 4);
  const operacao       = row?.[5] ?? "";
  const vencto         = row?.[6] ?? "";
  const valorFaceTit   = row?.[7] ?? 0;      // "Título" = valor face do documento (ex: 147900,75)
  const acrescimo      = row?.[8] ?? 0;
  const recebPrc       = row?.[9] ?? 0;      // Receb.Prc. (valor já recebido)
  const calculada      = row?.[10] ?? 0;     // Calculada (juros+multa calculados)
  const receber        = row?.[11] ?? 0;     // Receber (total a receber = face + acréscimos)
  const atraso         = row?.[12] ?? 0;
  const uteis          = cellText(row, 13);
  const portador       = cellText(row, 14);

  // Número do título é obrigatório para identificar o lançamento
  if (!numero) return null;

  // valorOriginal = valor face do título (col 7), que é o valor do documento sem acréscimos.
  // Se estiver zerado, usa Receb.Prc como fallback, depois Calculada, depois Receber.
  const valorOriginal = num(valorFaceTit) > 0 ? num(valorFaceTit)
    : num(recebPrc) > 0 ? num(recebPrc)
    : num(calculada) > 0 ? num(calculada)
    : num(receber);

  if (valorOriginal <= 0) return null;

  return buildItem({
    origem: "FINR1253",
    nrCli: clienteAtivo.nrCli,
    nomeCli: clienteAtivo.nomeCli,
    cpfCnpj: clienteAtivo.cpfCnpj || "",
    telefone: dadosTotal.telefone || "",
    contato: dadosTotal.contato || "",
    tp,
    ser,
    // "titulo" é o campo interno de chave — guarda o NÚMERO do documento (9831, 9867...)
    // Isso é intencional: buildId usa "titulo" como parte da chave única de deduplicação.
    // O valor monetário do título (col 7) fica em valorOriginal.
    titulo: numero,
    numero,
    seq,
    nfServico,
    operacao,
    emissao: "",
    vencimento: dateISO(vencto),
    valorOriginal,              // valor face do documento (col 7 = "Título" do relatório)
    acrescimo: num(acrescimo),
    recebPrc: num(recebPrc),
    valorCalculado: num(calculada),
    valorReceber: num(receber), // total com juros/multa (col 11 = "Receber")
    atrasoRelatorio: num(atraso),
    uteis,
    portador
  });
}

export function parseRows1253(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const items = [];
  let clienteAtivo = null;
  let bufferTitulos = [];
  let headerSkipped = 0; // conta as 2 primeiras linhas de cabeçalho que devem ser ignoradas

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
    const joined = normHeader(joinedRow(row));

    // Linha vazia
    if (!joined) continue;

    // Linhas de cabeçalho (agrupadores ou cabeçalho detalhado) — ignora por conteúdo
    // Linha agrupadora: contém "VENCIMENTO", "VALORIA" ou "ATRASO" sem ser um lançamento
    // Linha de cabeçalho detalhado: começa com "TP", "TPSER", "TIPO", "SER", "NUMERO"
    const isHeaderRow = (
      firstNorm === "TP" || firstNorm === "TPSER" || firstNorm === "TIPO" ||
      (firstNorm === "" && joined.includes("VENCIMENTO") && joined.includes("ATRASO")) ||
      (joined.includes("VENCIMENTO") && joined.includes("VALORIA") && !firstNorm.startsWith("CLIENTE") && !isFinr1253TitleToken(first))
    );
    // Também pula as primeiras 2 linhas como fallback para arquivos com estrutura ligeiramente diferente
    if (headerSkipped < 2 || isHeaderRow) {
      if (!isHeaderRow) headerSkipped++;
      continue;
    }

    // Linhas de rodapé/totais globais — sempre ignorar
    if (
      firstNorm.startsWith("TOTALEMPRESAS") ||
      firstNorm.startsWith("DATAHORAEMISSAO") ||
      firstNorm.startsWith("TOTALGERAL") ||
      joined.includes("DATAHORAEMISSAO")
    ) continue;

    // Linha "Cliente: CÓDIGO - NOME - CPF/CNPJ: XXX"
    if (/^Cliente:/i.test(first)) {
      flushBloco({}, "sem_total_cliente");
      bufferTitulos = [];
      clienteAtivo = parseClienteLinha(row);
      continue;
    }

    // Linha "Total Cliente:" — extrai telefone e contato, fecha bloco
    if (/^Total\s*Cliente/i.test(first) || firstNorm.startsWith("TOTALCLIENTE")) {
      const dadosTotal = parseTotalCliente(row);
      flushBloco(dadosTotal, "total_cliente");
      clienteAtivo = null;
      bufferTitulos = [];
      continue;
    }

    // Linha de lançamento válida (começa com FAT, NFE, REC, NF...)
    if (isFinr1253TitleToken(first)) {
      if (!clienteAtivo) {
        console.warn("FINR1253: título órfão sem cliente ativo. Linha ignorada.", row);
        continue;
      }
      bufferTitulos.push(row);
      continue;
    }

    // Qualquer outra linha (subtotais, observações) — ignorar
  }

  // Fecha último bloco caso não haja linha Total Cliente no final
  flushBloco({}, "sem_total_cliente");

  console.info(`FINR1253: ${items.length} lançamentos importados com sucesso.`);
  return items;
}

// ─── RPT_7007_CONS_CAR_EB parser ───────────────────────────────────────────
// O relatório 7007 (EB) é um arquivo tabular com cabeçalho na primeira linha.
// Cada linha representa um título/parcela individual.
//
// Campos lidos dinamicamente (por nome de cabeçalho):
//   nomeCli    → NOMCLI / Nome Cliente / Razão Social / CLIENTE
//   nrCli      → CODCLI / Cod Cliente / Código Cliente / Nº Cliente
//   titulo     → NUMTIT / Núm. Título / Número Título / Nº Título
//                (Evita-se "Titulo"/"Título" soltos para não capturar valor monetário)
//   seq        → SEQ / Parcela / Seq / Par
//   vencimento → DTVENC / Vencimento / VENCTO / Data Vencimento / Dt.Venc
//   saldo      → SLDTTT / SALDO / Saldo / Val. Saldo (valor em aberto = valorOriginal)
//   vlrTit     → VLRTIT / Val. Título / Valor Título (valor face — fallback de saldo)
//   tp         → TPTIT / Tipo Título / Tipo / Tp (fallback "EB" se ausente)
//   portador   → PORTAD / Portador / Banco / Carteira (fallback "EB" se ausente)
//   serie      → SERTIT / Série / Serie / Ser
//   emissao    → DTEMIS / Emissão / Emissao / Data Emissão / Dt.Emissão
//
// Campos FIXOS (só se não houver coluna real):
//   tp = "EB" e portador = "EB" são fallback — o arquivo raramente traz essas colunas.
//
// Deduplicação: buildId usa [origem, nrCli, tp, titulo, seq].
//   Para blindar colisão quando nrCli ausente, o vencimento é incluído no seq como sufixo.
export function parseRows7007(rows) {
  const out = [];
  for (const row of rows) {
    // --- Nome do cliente ---
    const nome = firstValid(row, ["NOMCLI", "Nome Cliente", "NOME CLIENTE", "Razão Social", "RAZAO SOCIAL", "CLIENTE", "Cliente"], isValidClientName)
      || pickFlex(row, ["NOMCLI", "Nome Cliente", "Razão Social", "Cliente"], isValidClientName);

    // --- Código do cliente ---
    const nrCliRaw = firstValid(row, ["CODCLI", "Cod Cliente", "Código Cliente", "CODIGO CLIENTE", "Nº Cliente", "N Cliente", "Cliente Código", "Cód. Cliente"], isValidClientCode)
      || pickFlex(row, ["CODCLI", "Cod Cliente", "Código Cliente", "Cód. Cliente", "Nº Cliente"], isValidClientCode);
    const nrCli = String(nrCliRaw || "").replace(/\D/g, "").trim();

    // --- Número do título ---
    // Nota: "Titulo"/"Título" soltos são evitados pois alguns layouts usam esse cabeçalho
    // para o VALOR MONETÁRIO do título (como na FINR1253 col 7). Prioriza-se NUMTIT e variantes explícitas.
    const titulo = firstValid(row, ["NUMTIT", "Núm. Título", "Número Título", "Nº Título", "Num Titulo", "Num. Titulo", "NUM_TIT"], (v) => !isDocToken(v))
      || pickFlex(row, ["NUMTIT", "Núm. Título", "Número Título", "Nº Título"], (v) => !isDocToken(v));

    // --- Parcela/Sequência ---
    const seq = pick(row, ["SEQ", "Parcela", "Seq", "Par", "PARCELA"]) || pickFlex(row, ["SEQ", "Parcela", "Par"]);

    // --- Vencimento ---
    const vencRaw = pick(row, ["DTVENC", "Vencimento", "VENCTO", "Data Vencimento", "Dt.Venc", "DT_VENC", "Dt. Venc"])
      || pickFlex(row, ["DTVENC", "Vencimento", "Vencto", "Data Vencimento", "DtVenc"]);
    const vencimento = dateISO(vencRaw);

    // --- Valor: saldo em aberto (principal) e valor face (fallback) ---
    // SLDTTT = saldo total do título (campo padrão EB para o que se deve cobrar)
    // VLRTIT = valor face original do título (nem sempre presente)
    // Se só existir saldo, ele é gravado como valorOriginal (comportamento correto para EB).
    const saldoRaw = pick(row, ["SLDTTT", "SALDO", "Saldo", "Val. Saldo", "Vlr Saldo"])
      || pickFlex(row, ["SLDTTT", "Saldo", "Val. Saldo"]);
    const vlrTitRaw = pick(row, ["VLRTIT", "Val. Título", "Valor Título", "Vlr. Título", "Valor Tit"])
      || pickFlex(row, ["VLRTIT", "Val. Título", "Valor Título"]);
    // Prioridade: saldo > valor face > campos genéricos
    const valorRaw = saldoRaw
      || vlrTitRaw
      || pick(row, ["Valor", "Val. Orig", "Valor Original"])
      || pickFlex(row, ["Valor", "Valor Original"]);
    const valorOriginal = num(valorRaw);

    // --- Tipo do título (lê coluna real; fallback "EB") ---
    const tpRaw = pick(row, ["TPTIT", "Tipo Título", "Tipo", "Tp", "TIPO"])
      || pickFlex(row, ["TPTIT", "Tipo Título", "Tipo"]);
    const tp = (tpRaw && String(tpRaw).trim() && !isDocToken(String(tpRaw).trim()))
      ? String(tpRaw).trim().toUpperCase()
      : "EB";

    // --- Portador / Banco / Carteira (lê coluna real; fallback "EB") ---
    const portadorRaw = pick(row, ["PORTAD", "Portador", "Banco", "Carteira", "BANCO", "CARTEIRA"])
      || pickFlex(row, ["PORTAD", "Portador", "Banco", "Carteira"]);
    const portador = (portadorRaw && String(portadorRaw).trim())
      ? String(portadorRaw).trim()
      : "EB";

    // --- Série ---
    const ser = String(
      pick(row, ["SERTIT", "Série", "Serie", "Ser", "SER"]) || pickFlex(row, ["SERTIT", "Série", "Serie"]) || ""
    ).trim();

    // --- Data de emissão ---
    const emissaoRaw = pick(row, ["DTEMIS", "Emissão", "Emissao", "Data Emissão", "Dt. Emissão", "DT_EMIS"])
      || pickFlex(row, ["DTEMIS", "Emissão", "Emissao", "Data Emissão"]);
    const emissao = dateISO(emissaoRaw);

    // --- Validação da linha ---
    // Descarta linhas sem: nome de cliente válido, número de título, ou valor
    if (!isValidClientName(nome)) continue;
    if (!titulo || isDocToken(String(titulo))) continue;
    if (valorOriginal <= 0) continue;

    // --- Chave de deduplicação ---
    // Se nrCli estiver ausente, incorpora o vencimento no seq para evitar colisão
    // entre clientes diferentes com mesmo número de título.
    const seqKey = nrCli
      ? String(seq || "").trim()
      : `${String(seq || "").trim()}|${vencimento}`;

    out.push(buildItem({
      origem: "RPT_7007_CONS_CAR_EB",
      nrCli,
      nomeCli: String(nome).trim(),
      tp,
      ser,
      titulo: String(titulo).trim(),
      seq: seqKey,
      nfServico: "",
      emissao,
      vencimento,
      valorOriginal,
      portador
    }));
  }
  console.info(`RPT_7007: ${out.length} títulos importados.`);
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