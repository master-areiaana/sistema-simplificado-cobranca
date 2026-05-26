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
  // Normaliza: maiúsculo, remove espaços/hífens/underlines para comparação robusta
  const u = String(fn || "").toUpperCase().replace(/[\s\-_]/g, "");
  return (u.includes("7007") || u.includes("CONSCAREB") || u.includes("RPTEB") || /EB\.XLS/.test(u) || u.endsWith("EB")) ? "RPT_7007_CONS_CAR_EB" : "FINR1253";
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

// ─── CHAVE ÚNICA CENTRAL DE TÍTULO ─────────────────────────────────────────
// Usada em: importação, syncImport, loadData, grouped, Limpar BD, PDF.
// Inclui vencimento para distinguir parcelas com mesmo número e seq vazia.
// Inclui nome normalizado do cliente como fallback quando nrCli varia entre origens.
export function getTituloKey({ origem, nrCli, nomeCli, titulo, seq, vencimento }) {
  const normOrig = keyPart(origem);
  // Cliente: usa código limpo se existir; fallback: primeiras 3 palavras do nome normalizado
  const codLimpo = String(nrCli ?? "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1");
  const nomeNorm = String(nomeCli ?? "").toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join("");
  const clientePart = codLimpo || nomeNorm;

  // Número do título: normaliza e separa "530/1" em numero=530, seq=1 se seq vier vazio
  const tituloRaw = String(titulo ?? "").trim();
  let numeroNorm = keyPart(tituloRaw);
  let seqNorm = keyPart(seq ?? "");

  // Se o número contém "/" e seq está vazio, extrai seq do número
  if (!seqNorm && tituloRaw.includes("/")) {
    const parts = tituloRaw.split("/");
    numeroNorm = keyPart(parts[0]);
    seqNorm = keyPart(parts[1] || "");
  }

  // Vencimento normalizado: YYYYMMDD sem traços
  const vencNorm = String(vencimento ?? "").replace(/-/g, "").trim();

  // Chave final: origem|cliente|numero|seq|vencimento
  return [normOrig, clientePart, numeroNorm, seqNorm, vencNorm].join("|");
}

// Deduplicação de array de itens usando getTituloKey — mantém o mais completo
export function dedupeTitulos(items) {
  const map = new Map();
  for (const item of items) {
    const key = getTituloKey(item);
    const prev = map.get(key);
    if (!prev) { map.set(key, item); continue; }
    // Prefere o registro com mais campos manuais preenchidos
    const score = (i) => [i.status !== "Não Contatado", i.obs, i.dataPromessa, i.dataContato, i.encaminhar, i.clientCategory]
      .filter(Boolean).length;
    if (score(item) > score(prev)) map.set(key, item);
  }
  return Array.from(map.values());
}

// buildId mantido para compatibilidade interna (buildItem ainda usa internamente)
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

  // Deduplica dentro do próprio arquivo antes de retornar
  const dedup = dedupeTitulos(items);
  const dupCount = items.length - dedup.length;
  if (dupCount > 0) console.info(`FINR1253: ${dupCount} duplicata(s) internas removidas do arquivo.`);
  console.info(`FINR1253: ${dedup.length} lançamentos importados com sucesso.`);
  return dedup;
}

// ─── RPT_7007_CONS_CAR_EB parser ───────────────────────────────────────────
// Suporta qualquer layout tabular com cabeçalho em qualquer linha.
// Normaliza os nomes dos cabeçalhos antes de mapear, aceitando variações com
// acentos, pontuação, espaços e maiúsculas/minúsculas.

// Normaliza cabeçalho para comparação: maiúsculo, sem acento, sem ponto/hífen, sem espaço duplo
function normH(v) {
  return String(v ?? "")
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_°ºª]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Aliases normalizados para cada campo (aplicar normH antes de comparar)
const H7007 = {
  nomeCli: ["NOMCLI","NOME CLIENTE","RAZAO SOCIAL","CLIENTE","SACADO","NOME SACADO","DEVEDOR","NOME","RAZAO","NOME DO CLIENTE","NOME SACADO","FAVORECIDO"],
  nrCli:   ["CODCLI","COD CLIENTE","CODIGO CLIENTE","CLIENTE CODIGO","COD","CODIGO","NRCLI","NRO CLIENTE","NR CLIENTE","N CLIENTE","NUM CLIENTE","NUMERO CLIENTE"],
  titulo:  ["NUMTIT","NUM TIT","NUMERO TITULO","N TITULO","NR TITULO","NRO TITULO","DUPLICATA","NOTA","FATURA","DOCUMENTO","NR DOCUMENTO","NUMERO DOCUMENTO","NUM DOCUMENTO","TITULO","TITULOS"],
  seq:     ["SEQ","SEQUENCIA","PARCELA","PARC","PRESTACAO","PAR","PARTE","PARCELA NR","NR PARCELA"],
  venc:    ["DTVENC","DT VENC","DATA VENCIMENTO","VENCIMENTO","VENCTO","DT VENCTO","VENC","DATA VENC","DT VENCIMENTO","VENCIMENTO TITULO"],
  saldo:   ["SLDTTT","SALDO","SALDO TITULO","SALDO TOTAL","VLR SALDO","VAL SALDO","VALOR SALDO","VALOR ABERTO","VALOR EM ABERTO","SALDO EM ABERTO","SALDO DEVEDOR"],
  vlrTit:  ["VLRTIT","VLR TIT","VAL TITULO","VALOR TITULO","VAL ORIG","VALOR ORIGINAL","VLR ORIG","VALOR","TOTAL","VLR TOTAL","VALOR FACE","VALOR NOMINAL"],
  tp:      ["TPTIT","TP","TIPO","TIPO TITULO","TIPO DOC","TIPO DOCUMENTO","ESPECIE","ESP"],
  portador:["PORTAD","PORTADOR","BANCO","CARTEIRA","COBRANCA","COBRANÇA","COD BANCO","BANCO COBRADOR"],
  serie:   ["SERTIT","SERIE","SER","SERIE TITULO","NR SERIE"],
  emissao: ["DTEMIS","EMISSAO","DATA EMISSAO","DT EMISSAO","DATA EMIS","DT EMIS","DT EMISSAO","DATA DE EMISSAO"],
};

// Mapeia as chaves reais do objeto-linha para os campos internos, usando os aliases normalizados
function buildHeaderMap7007(sampleRow) {
  const map = {}; // field -> realKey
  const keys = Object.keys(sampleRow || {});
  for (const [field, aliases] of Object.entries(H7007)) {
    for (const realKey of keys) {
      const n = normH(realKey);
      if (aliases.includes(n)) { map[field] = realKey; break; }
    }
    if (!map[field]) {
      // fallback: busca parcial (ex: "NR. TITULO" contém "TITULO")
      for (const realKey of keys) {
        const n = normH(realKey);
        for (const alias of aliases) {
          if (n.includes(alias) || alias.includes(n)) { map[field] = realKey; break; }
        }
        if (map[field]) break;
      }
    }
  }
  return map;
}

// Detecta a linha de cabeçalho: procura primeira linha que tenha ao menos 2 campos reconhecidos
function detectHeaderRow7007(rows) {
  const minMatches = 2;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row);
    let matches = 0;
    for (const k of keys) {
      const n = normH(k);
      for (const aliases of Object.values(H7007)) {
        if (aliases.some((a) => n === a || n.includes(a) || a.includes(n))) { matches++; break; }
      }
    }
    if (matches >= minMatches) return i;
  }
  return 0; // fallback: assume primeira linha
}

function getField(row, hmap, field) {
  const k = hmap[field];
  if (!k) return undefined;
  const v = row[k];
  return v === undefined || v === null ? undefined : v;
}

export function parseRows7007(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // --- Detecta linha de cabeçalho e constrói mapa de campos ---
  const headerIdx = detectHeaderRow7007(rows);
  const sampleRow = rows[headerIdx] || rows[0];
  const hmap = buildHeaderMap7007(sampleRow);

  // --- Log de diagnóstico ---
  const camposMapeados = Object.entries(hmap).map(([f, k]) => `${f}="${k}"`).join(", ");
  const camposFaltando = Object.keys(H7007).filter((f) => !hmap[f]);
  console.info(`RPT_7007 diagnóstico: ${rows.length} linhas lidas | cabeçalho na linha ${headerIdx} | mapeados: [${camposMapeados}]${camposFaltando.length ? ` | NÃO mapeados: [${camposFaltando.join(", ")}]` : ""}`);

  // --- Filtra linhas de cabeçalho, totais e vazias ---
  const isHeaderOrTotalRow = (row) => {
    if (!row) return true;
    const vals = Object.values(row).map((v) => normH(String(v ?? "")));
    const joined = vals.join(" ");
    // Linhas de totais ou metadados
    if (joined.includes("TOTAL") && vals.some((v) => /^TOTAL/.test(v))) return true;
    if (joined.includes("EMPRESA") && joined.includes("TOTAL")) return true;
    // Linha completamente vazia
    if (vals.every((v) => !v)) return true;
    return false;
  };

  const dataRows = rows.slice(headerIdx + 1 > 0 ? headerIdx + 1 : 1);
  const out = [];
  let descartados = 0;
  const motivosDescarte = {};
  const addMotivo = (m) => { motivosDescarte[m] = (motivosDescarte[m] || 0) + 1; };

  for (const row of dataRows) {
    if (isHeaderOrTotalRow(row)) continue;

    // --- Nome do cliente ---
    let nome = "";
    if (hmap.nomeCli) {
      const v = row[hmap.nomeCli];
      if (isValidClientName(v)) nome = String(v).trim();
    }
    // fallback: qualquer coluna com nome válido que se pareça com cliente
    if (!nome) {
      for (const k of Object.keys(row)) {
        if (isValidClientName(row[k])) { nome = String(row[k]).trim(); break; }
      }
    }

    // --- Código do cliente ---
    let nrCli = "";
    if (hmap.nrCli) {
      const raw = row[hmap.nrCli];
      if (raw != null && String(raw).trim()) nrCli = String(raw).replace(/\D/g, "").trim();
    }

    // --- Número do título ---
    let titulo = "";
    if (hmap.titulo) {
      const v = row[hmap.titulo];
      if (v != null && String(v).trim() && !isDocToken(String(v).trim())) titulo = String(v).trim();
    }

    // --- Parcela/Sequência ---
    const seq = hmap.seq ? String(row[hmap.seq] ?? "").trim() : "";

    // --- Vencimento ---
    const vencRaw = hmap.venc ? row[hmap.venc] : undefined;
    const vencimento = dateISO(vencRaw);

    // --- Valor ---
    const saldoRaw = hmap.saldo ? row[hmap.saldo] : undefined;
    const vlrTitRaw = hmap.vlrTit ? row[hmap.vlrTit] : undefined;
    const valorRaw = saldoRaw ?? vlrTitRaw;
    const valorOriginal = num(valorRaw);

    // --- Tipo ---
    const tpRaw = hmap.tp ? row[hmap.tp] : undefined;
    const tp = (tpRaw && String(tpRaw).trim() && !isDocToken(String(tpRaw).trim()))
      ? String(tpRaw).trim().toUpperCase() : "EB";

    // --- Portador ---
    const portadorRaw = hmap.portador ? row[hmap.portador] : undefined;
    const portador = (portadorRaw && String(portadorRaw).trim()) ? String(portadorRaw).trim() : "EB";

    // --- Série ---
    const ser = hmap.serie ? String(row[hmap.serie] ?? "").trim() : "";

    // --- Emissão ---
    const emissaoRaw = hmap.emissao ? row[hmap.emissao] : undefined;
    const emissao = dateISO(emissaoRaw);

    // --- Validação: regra mínima ---
    // Deve ter (nome OU código) E título E (vencimento OU valor)
    if (!isValidClientName(nome) && !nrCli) { descartados++; addMotivo("sem_cliente"); continue; }
    if (!titulo) { descartados++; addMotivo("sem_titulo"); continue; }
    if (!vencimento && valorOriginal <= 0) { descartados++; addMotivo("sem_venc_nem_valor"); continue; }

    // --- Chave de deduplicação ---
    // Inclui sempre o vencimento para evitar colisão entre parcelas de mesmo número
    // com vencimentos diferentes quando a coluna SEQ não existe ou está vazia.
    const seqBase = String(seq || "").trim();
    const seqKey = seqBase ? seqBase : vencimento;

    out.push(buildItem({
      origem: "RPT_7007_CONS_CAR_EB",
      nrCli,
      nomeCli: nome || `CLI_${nrCli}`,
      tp,
      ser,
      titulo,
      seq: seqKey,
      nfServico: "",
      emissao,
      vencimento,
      valorOriginal,
      portador
    }));
  }

  if (out.length === 0) {
    console.warn(`RPT_7007: ZERO títulos válidos. Descartados: ${descartados}. Motivos:`, motivosDescarte);
    console.warn(`RPT_7007: Campos mapeados:`, hmap);
    console.warn(`RPT_7007: Primeira linha de dados:`, dataRows[0]);
    return out;
  }

  // Deduplica dentro do próprio arquivo antes de retornar
  const dedup = dedupeTitulos(out);
  const dupCount = out.length - dedup.length;
  if (dupCount > 0) console.info(`RPT_7007: ${dupCount} duplicata(s) internas removidas do arquivo.`);
  console.info(`RPT_7007: ${dedup.length} títulos importados | ${descartados} descartados | motivos:`, motivosDescarte);
  return dedup;
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