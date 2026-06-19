import React, { useEffect, useMemo, useState } from "react";
import ColHeader from "./ColHeader";
import { Btn, PromBadge, ObsCell, Badge } from "./UI";
import { fmtM, fmtD, prioCor, getTituloKey } from "@/lib/cobranca";

const RATES_STORAGE_KEY = "sc_carteira_multa_juros_por_titulo";

const COLS_DEF = [
  { key: "check", label: "", width: 32, fixed: true },
  { key: "expand", label: "", width: 28, fixed: true },
  { key: "nrCli", label: "Nº", width: 58 },
  { key: "nomeCli", label: "CLIENTE", width: 170 },
  { key: "qtd", label: "QTD.", width: 54 },
  { key: "venc", label: "VENCIMENTO", width: 94 },
  { key: "atraso", label: "ATRASO", width: 68 },
  { key: "vOrig", label: "VAL. ORIG", width: 100 },
  { key: "multa", label: "MULTA", width: 96 },
  { key: "juros", label: "JUROS", width: 96 },
  { key: "total", label: "TOTAL A COBRAR", width: 130 },
  { key: "status", label: "STATUS", width: 125 },
  { key: "enc", label: "ENCAMINHAR", width: 105 },
  { key: "origem", label: "RELATÓRIO", width: 86 },
  { key: "cat", label: "CATEGORIA", width: 98 },
  { key: "contato", label: "DT. CONTATO", width: 96 },
  { key: "prom", label: "PROMESSA", width: 96 },
  { key: "obs", label: "OBSERVAÇÃO", width: 180 },
  { key: "acoes", label: "AÇÕES", width: 118, fixed: true },
];

const thS = (t) => ({ background: t.th, padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .4, color: t.muted, position: "sticky", top: 0, zIndex: 10 });
const tdS = (ex = {}) => ({ padding: "6px 8px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });
const cleanText = (v) => String(v ?? "").trim();
const norm = (v) => cleanText(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const hasLetters = (v) => /[A-Za-zÀ-ÿ]/.test(cleanText(v));
const toNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const clampPercent = (v) => Math.max(0, Math.min(999, toNumber(v)));

function loadStoredRates() {
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredRates(rates) {
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates || {}));
    window.dispatchEvent(new CustomEvent("sc:charge-rates-updated", { detail: rates || {} }));
  } catch {
    // ignora indisponibilidade de storage
  }
}

function isStatusForaCarteira(...values) {
  const s = values.map(norm).filter(Boolean).join(" ");
  if (!s) return false;
  return [
    "BAIX", "PAGO", "PAGAMENTO", "RECEB", "LIQUID", "QUIT", "ENCERR",
    "CANCEL", "PERDA", "INCOBRAVEL", "DUPLIC", "CONFIRMADO", "ACORDOQUITADO"
  ].some((x) => s.includes(x));
}

function valorAbertoReal(item) {
  const camposAbertos = [item?.valorEmAberto, item?.open_value, item?.saldoErp, item?.erp_balance, item?.valorReceber, item?.valorTotalDebito];
  for (const campo of camposAbertos) {
    if (campo !== undefined && campo !== null && campo !== "") return toNumber(campo);
  }
  return toNumber(item?.valorOriginal ?? item?.original_value ?? 0);
}

function isTituloCarteiraGeral(item) {
  if (!item) return false;
  if (item.active === false) return false;
  if (item.lossStatus || item.loss_status) return false;
  if (isStatusForaCarteira(item.status, item.current_status, item.current_motive, item.encaminhar, item.workflow_status, item.obs, item.last_note)) return false;
  const valorOriginal = toNumber(item.valorOriginal ?? item.original_value ?? 0);
  const valorRecebido = toNumber(item.valorRecebido ?? item.received_value ?? 0);
  const valorAberto = valorAbertoReal(item);
  if (valorAberto <= 0) return false;
  if (valorOriginal > 0 && valorRecebido >= valorOriginal - 0.01) return false;
  return true;
}

function dedupeTitulosCarteira(titulos) {
  const map = new Map();
  for (const item of titulos || []) {
    const keySistema = getTituloKey({ origem: item.origem, titulo: item.titulo, seq: item.seq, vencimento: item.vencimento });
    const keySemOrigem = keySistema.replace(/^(FINR1253|EB)\|/, "");
    const key = `${norm(item.nomeCli)}|${keySemOrigem}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, item); continue; }
    const score = (x) => (x.origem === "FINR1253" ? 3 : 0) + (x.dataContato ? 2 : 0) + (x.obs ? 2 : 0) + (x.dataPromessa ? 1 : 0) + (x.encaminhar ? 1 : 0) + (toNumber(x.valorEmAberto ?? x.valorTotalDebito) > 0 ? 1 : 0);
    if (score(item) > score(prev)) map.set(key, item);
  }
  return Array.from(map.values());
}

function isGenericClientName(v) {
  const s = cleanText(v);
  const n = norm(s);
  const invalidos = new Set(["NFE", "NF", "FAT", "REC", "TC", "EB", "NFSE", "CTE", "DUP", "DUPL", "DUPLICATA", "TITULO", "PARCELA", "TOTAL", "TOTALEMPRESAS", "TOTALCLIENTE", "DATAHORAEMISSAO"]);
  return !s || s === "—" || /^\d+$/.test(s) || /^cliente\s*\d+$/i.test(s) || invalidos.has(n) || n.startsWith("TOTAL") || n.startsWith("DATAHORAEMISSAO");
}

function splitCodeAndName(v) {
  const s = cleanText(v);
  const m = s.match(/^(\d{1,10})\s*[\/\-–]\s*(.{2,})$/);
  if (!m) return null;
  const nome = cleanText(m[2]);
  if (!hasLetters(nome) || isGenericClientName(nome)) return null;
  return { nrCli: cleanText(m[1]), nomeCli: nome };
}

function getDisplayClient(g) {
  const candidates = [];
  const fromGroup = splitCodeAndName(g.nomeCli);
  if (fromGroup) candidates.push(fromGroup);
  if (!isGenericClientName(g.nomeCli) && hasLetters(g.nomeCli)) candidates.push({ nrCli: cleanText(g.nrCli), nomeCli: cleanText(g.nomeCli) });
  for (const item of g.titulos || []) {
    const fromItemName = splitCodeAndName(item.nomeCli);
    if (fromItemName) candidates.push(fromItemName);
    if (!isGenericClientName(item.nomeCli) && hasLetters(item.nomeCli)) candidates.push({ nrCli: cleanText(item.nrCli || g.nrCli), nomeCli: cleanText(item.nomeCli) });
  }
  const best = candidates.filter(c => c.nomeCli && hasLetters(c.nomeCli) && !isGenericClientName(c.nomeCli)).sort((a, b) => b.nomeCli.length - a.nomeCli.length)[0];
  return { nrCli: best?.nrCli || cleanText(g.nrCli), nomeCli: best?.nomeCli || (!isGenericClientName(g.nomeCli) ? cleanText(g.nomeCli) : "—") };
}

function encBadge(enc) {
  if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
  if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
  if (enc === "assessoria") return <Badge label="→ Assessoria" color="#f97316" />;
  return <span style={{ color: "#94a3b8", fontSize: 10 }}>—</span>;
}

function categoriaBadge(cat) {
  const cores = { Portador: "#8b5cf6", Imobiliário: "#06b6d4", Parceiros: "#f59e0b", Bancos: "#10b981" };
  if (!cat) return null;
  return <Badge label={cat} color={cores[cat] || "#64748b"} />;
}

function getOrigemLabel(origem) {
  return origem === "FINR1253" ? "Topcon" : "EB";
}

function renderTituloDetalhe(item) {
  const titulo = cleanText(item.titulo);
  const seq = cleanText(item.seq);
  if (titulo && seq) return `${titulo}/${seq}`;
  return titulo || "—";
}

function tituloCalcKey(item) {
  return item.id || getTituloKey({ origem: item.origem, titulo: item.titulo, seq: item.seq, vencimento: item.vencimento });
}

function sanitizeGroup(g, origemFiltro) {
  let titulos = (g.titulos || []).filter(isTituloCarteiraGeral);
  if (origemFiltro) titulos = titulos.filter((item) => item.origem === origemFiltro);
  titulos = dedupeTitulosCarteira(titulos);
  if (!titulos.length) return null;
  const vencimentos = titulos.map((x) => x.vencimento).filter(Boolean).sort();
  const contatos = titulos.map((x) => x.dataContato || "").filter(Boolean).sort();
  const promessas = titulos.map((x) => x.dataPromessa || "").filter(Boolean).sort();
  return {
    ...g,
    titulos,
    valorOriginal: titulos.reduce((s, x) => s + toNumber(x.valorOriginal), 0),
    maiorAtraso: titulos.reduce((m, x) => Math.max(m, Number(x.diasAtraso || 0)), 0),
    qtdTitulos: titulos.length,
    qtdTotal: titulos.reduce((s, x) => s + Number(x.qtd || 0), 0),
    ultimoContato: contatos.slice(-1)[0] || "",
    dataPromessa: promessas.slice(-1)[0] || "",
    primeiroVencimento: vencimentos[0] || "",
    statusConsolidado: titulos.map((x) => x.status).filter(Boolean).sort().slice(-1)[0] || "Não Contatado",
    obsConsolidada: titulos.map((x) => x.obs).filter(Boolean).slice(-1)[0] || "",
    encaminharConsolidado: titulos.map((x) => x.encaminhar).filter(Boolean).slice(-1)[0] || "",
  };
}

function hasValidDisplayClient(g) {
  const cliente = getDisplayClient(g);
  return !!cliente.nomeCli && cliente.nomeCli !== "—" && !isGenericClientName(cliente.nomeCli) && hasLetters(cliente.nomeCli);
}

function matchesSearch(g, busca = "") {
  const b = norm(busca);
  if (!b) return true;
  const cliente = getDisplayClient(g);
  const texto = [cliente.nrCli, cliente.nomeCli, g.nrCli, g.nomeCli, ...(g.codigosLista || []), ...(g.titulos || []).map(t => `${t.titulo} ${t.seq}`)].join(" ");
  return norm(texto).includes(b);
}

function calculateChargeValues(item, rates = {}) {
  const base = toNumber(item?.valorOriginal ?? item?.original_value ?? 0);
  const diasAtraso = Math.max(0, toNumber(item?.diasAtraso ?? item?.dias_atraso ?? 0));
  const multaPercent = clampPercent(rates.multa);
  const jurosPercentDia = clampPercent(rates.juros);
  const vencido = diasAtraso > 0;
  const multa = vencido ? base * (multaPercent / 100) : 0;
  const juros = vencido ? base * (jurosPercentDia / 100) * diasAtraso : 0;
  return { base, multa, juros, total: base + multa + juros, multaPercent, jurosPercentDia, diasAtraso };
}

function sumGroupCharges(g, ratesByTitle = {}) {
  return (g.titulos || []).reduce((acc, item) => {
    const calc = calculateChargeValues(item, ratesByTitle[tituloCalcKey(item)] || { multa: 0, juros: 0 });
    acc.base += calc.base;
    acc.multa += calc.multa;
    acc.juros += calc.juros;
    acc.total += calc.total;
    return acc;
  }, { base: 0, multa: 0, juros: 0, total: 0 });
}

function updateKpiCardsFromCarteira(totals) {
  const labels = { "A COBRAR": fmtM(totals.base), "TOTAL EM ABERTO": fmtM(totals.total) };
  setTimeout(() => {
    const nodes = Array.from(document.querySelectorAll("div"));
    for (const [label, value] of Object.entries(labels)) {
      const labelNode = nodes.find((node) => node.childElementCount === 0 && node.textContent.trim().toUpperCase() === label);
      const card = labelNode?.parentElement;
      const valueNode = card ? Array.from(card.children).find((child) => child !== labelNode && child.textContent.includes("R$")) : null;
      if (valueNode) valueNode.textContent = value;
    }
  }, 0);
}

export default function TabelaCarteira({ sortedCart, baseCart, fCart, setFCart, selected, toggleSel, toggleAll, setModal, setForm, setHistModal, openCli, setOpenCli, emptyForm, isDark, t, setNegModal, hiddenCols = new Set(), setHiddenCols, onClickFilter, filtroOrigem }) {
  const [buscaLocal, setBuscaLocal] = useState("");
  const [ratesByTitle, setRatesByTitle] = useState(() => loadStoredRates());
  const [filters, setFilters] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const visibleCols = COLS_DEF.filter(c => c.fixed || !hiddenCols?.has?.(c.key));
  const colCount = visibleCols.length;
  const selectableCols = COLS_DEF.filter(c => !["check", "expand", "acoes"].includes(c.key));

  useEffect(() => {
    saveStoredRates(ratesByTitle);
  }, [ratesByTitle]);

  function ratesForItem(item) {
    return ratesByTitle[tituloCalcKey(item)] || { multa: 0, juros: 0 };
  }

  function groupCalc(g) {
    return sumGroupCharges(g, ratesByTitle);
  }

  function columnText(g, key) {
    const cliente = getDisplayClient(g);
    const calc = groupCalc(g);
    const origem = [...new Set(g.titulos.map(x => getOrigemLabel(x.origem)))].join(" ");
    const cat = [...new Set(g.titulos.map(x => x.clientCategory).filter(Boolean))].join(" ");
    const values = {
      nrCli: cliente.nrCli || g.nrCli || "(Vazio)",
      nomeCli: cliente.nomeCli || "(Vazio)",
      qtd: String(g.qtdTitulos || 0),
      venc: fmtD(g.primeiroVencimento) || "(Vazio)",
      atraso: g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—",
      vOrig: fmtM(calc.base),
      multa: fmtM(calc.multa),
      juros: fmtM(calc.juros),
      total: fmtM(calc.total),
      status: g.statusConsolidado || "(Vazio)",
      enc: g.encaminharConsolidado || "—",
      origem: origem || "(Vazio)",
      cat: cat || "(Vazio)",
      contato: fmtD(g.ultimoContato) || "(Vazio)",
      prom: fmtD(g.dataPromessa) || "(Vazio)",
      obs: g.obsConsolidada || "(Sem observação)",
    };
    return String(values[key] ?? "");
  }

  const carteiraBase = useMemo(() => {
    return (sortedCart || [])
      .map((g) => sanitizeGroup(g, filtroOrigem))
      .filter(Boolean)
      .filter(hasValidDisplayClient)
      .filter((g) => matchesSearch(g, buscaLocal));
  }, [sortedCart, filtroOrigem, buscaLocal]);

  function colData(field) {
    return carteiraBase.map((g) => ({ [field]: columnText(g, field) }));
  }

  function applySelectionFilters(g) {
    for (const [field, vals] of Object.entries(filters)) {
      if (!vals) continue;
      if (vals.length === 0) return false;
      if (!vals.includes(columnText(g, field))) return false;
    }
    return true;
  }

  const carteiraGeral = useMemo(() => carteiraBase.filter(applySelectionFilters), [carteiraBase, filters, ratesByTitle]);
  const carteiraTotals = useMemo(() => carteiraGeral.reduce((acc, g) => {
    const calc = groupCalc(g);
    acc.base += calc.base;
    acc.total += calc.total;
    return acc;
  }, { base: 0, total: 0 }), [carteiraGeral, ratesByTitle]);

  useEffect(() => {
    updateKpiCardsFromCarteira(carteiraTotals);
  }, [carteiraTotals]);

  const baseValida = useMemo(() => {
    return (baseCart || [])
      .map((g) => sanitizeGroup(g, filtroOrigem))
      .filter(Boolean)
      .filter(hasValidDisplayClient);
  }, [baseCart, filtroOrigem]);

  function clearAllFilters() {
    setBuscaLocal("");
    setFilters({});
    setFCart && setFCart({});
  }

  function setRateForItem(item, field, value) {
    const percent = clampPercent(value);
    const key = tituloCalcKey(item);
    setRatesByTitle((current) => ({ ...current, [key]: { ...(current[key] || { multa: 0, juros: 0 }), [field]: percent } }));
  }

  function editRateForItem(item, field) {
    const atual = ratesForItem(item)?.[field] || 0;
    const label = field === "multa" ? "multa única (%)" : "juros diário (%)";
    const raw = window.prompt(`Digite o percentual de ${label} para o título ${renderTituloDetalhe(item)}. A cobrança só aplica se estiver vencido.`, String(atual).replace(".", ","));
    if (raw === null) return;
    setRateForItem(item, field, raw);
  }

  function editRateForGroup(g, field) {
    const label = field === "multa" ? "multa única (%)" : "juros diário (%)";
    const raw = window.prompt(`Digite o percentual de ${label} para TODOS os títulos abertos deste cliente. A cobrança só aplica em títulos vencidos.`, "0");
    if (raw === null) return;
    const percent = clampPercent(raw);
    setRatesByTitle((current) => {
      const next = { ...current };
      for (const item of g.titulos || []) {
        const key = tituloCalcKey(item);
        next[key] = { ...(next[key] || { multa: 0, juros: 0 }), [field]: percent };
      }
      return next;
    });
  }

  function clearRates() {
    setRatesByTitle({});
    try { localStorage.removeItem(RATES_STORAGE_KEY); } catch {}
  }

  function toggleColumn(key) {
    if (!setHiddenCols) return;
    setHiddenCols((prev) => {
      const next = new Set(prev || []);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function showAllColumns() {
    if (!setHiddenCols) return;
    setHiddenCols(new Set());
    setShowColumnMenu(false);
  }

  function ColumnMenuButton() {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <button
          onClick={(event) => { event.stopPropagation(); setShowColumnMenu((x) => !x); }}
          title="Selecionar colunas"
          style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 4, padding: "2px 6px", fontSize: 12, fontWeight: 900, lineHeight: 1, cursor: "pointer" }}
        >☰</button>
        {showColumnMenu && (
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 900, background: isDark ? "#171717" : "#ffffff", border: `1px solid ${t.bor}`, borderRadius: 7, padding: 6, boxShadow: "0 10px 28px rgba(0,0,0,.35)", width: 190 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {selectableCols.map((c) => (
                <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 5, background: hiddenCols?.has?.(c.key) ? t.surf2 : t.th, borderRadius: 4, padding: "4px 5px", fontSize: 9, color: t.txt, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                  <input type="checkbox" checked={!hiddenCols?.has?.(c.key)} onChange={() => toggleColumn(c.key)} style={{ accentColor: t.p, width: 12, height: 12 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.key === "origem" ? "ORIG." : c.key === "total" ? "TOTAL" : c.label}</span>
                </label>
              ))}
            </div>
            <button onClick={showAllColumns} style={{ marginTop: 6, width: "100%", background: t.p, color: "#fff", border: "none", borderRadius: 4, padding: "5px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Mostrar Todas</button>
          </div>
        )}
      </div>
    );
  }

  function headerCell(c) {
    if (c.key === "check") return <th key={c.key} style={thS(t)}><input type="checkbox" checked={selected.size === carteiraGeral.length && carteiraGeral.length > 0} onChange={toggleAll} /></th>;
    if (c.key === "expand") return <th key={c.key} style={thS(t)} />;
    if (c.key === "acoes") return <th key={c.key} style={{ ...thS(t), textAlign: "right", position: "sticky", top: 0, zIndex: 50 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}><span>AÇÕES</span><ColumnMenuButton /></div></th>;
    return <ColHeader key={c.key} label={c.label} field={c.key} data={colData(c.key)} filters={filters} setFilters={setFilters} t={t} width={c.width} />;
  }

  function renderCell(key, g) {
    const cliente = getDisplayClient(g);
    const calc = groupCalc(g);
    switch (key) {
      case "nrCli": return <td style={{ ...tdS(), color: t.muted }}>{cliente.nrCli || g.nrCli}</td>;
      case "nomeCli": return <td style={tdS()} title={cliente.nomeCli}><b style={{ cursor: "pointer" }} onClick={() => onClickFilter && onClickFilter(cliente.nomeCli)}>{cliente.nomeCli}</b></td>;
      case "qtd": return <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>;
      case "venc": return <td style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(g.primeiroVencimento)}</td>;
      case "atraso": return <td style={{ ...tdS(), color: g.maiorAtraso > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>;
      case "vOrig": return <td style={{ ...tdS(), fontWeight: 700 }}>{fmtM(calc.base)}</td>;
      case "multa": return <td onClick={() => editRateForGroup(g, "multa")} title="Clique para aplicar a % de multa única nos títulos deste cliente" style={{ ...tdS(), color: "#f97316", cursor: "pointer" }}>{fmtM(calc.multa)}</td>;
      case "juros": return <td onClick={() => editRateForGroup(g, "juros")} title="Clique para aplicar a % de juros diário nos títulos deste cliente" style={{ ...tdS(), color: "#eab308", cursor: "pointer" }}>{fmtM(calc.juros)}</td>;
      case "total": return <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(calc.total)}</td>;
      case "status": return <td style={{ ...tdS(), fontSize: 10 }}>{g.statusConsolidado}</td>;
      case "enc": return <td style={tdS()}>{encBadge(g.encaminharConsolidado)}</td>;
      case "origem": return <td style={tdS()}>{[...new Set(g.titulos.map(x => x.origem))].map(o => <span key={o} style={{ display: "inline-block", fontSize: 8, background: o === "FINR1253" ? "#7c3aed22" : "#0369a122", color: o === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{getOrigemLabel(o)}</span>)}</td>;
      case "cat": return <td style={tdS()}>{[...new Set(g.titulos.map(x => x.clientCategory).filter(Boolean))].map(cat => <div key={cat}>{categoriaBadge(cat)}</div>)}</td>;
      case "contato": return <td style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(g.ultimoContato)}</td>;
      case "prom": return <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>;
      case "obs": return <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>;
      default: return null;
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: t.muted }}>Carteira Geral mostra somente títulos em aberto para cobrar. Use o filtro no título da coluna. Abra no + e clique em Multa/Juros de cada título para digitar a %.</span>
        <input value={buscaLocal} onChange={(e) => setBuscaLocal(e.target.value)} placeholder="Buscar cliente/título" style={{ marginLeft: "auto", background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "5px 8px", fontSize: 11 }} />
        {(buscaLocal || Object.values(filters).some(Boolean) || Object.keys(fCart || {}).length > 0) && <button onClick={clearAllFilters} style={{ background: t.p, border: "none", borderRadius: 4, padding: "4px 8px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>Limpar filtros</button>}
        {Object.keys(ratesByTitle).length > 0 && <button onClick={clearRates} style={{ background: "transparent", border: `1px solid ${t.bor}`, borderRadius: 4, padding: "4px 8px", color: t.txt, cursor: "pointer", fontWeight: 700, fontSize: 10 }}>Zerar multa/juros</button>}
      </div>

      <div style={{ borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "65vh", overflowY: "auto", overflowX: "auto", width: "100%" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead><tr>{visibleCols.map(headerCell)}</tr></thead>
          <tbody>
            {carteiraGeral.length === 0 && <tr><td colSpan={colCount} style={{ textAlign: "center", padding: 44, color: t.muted, background: t.surf }}>Nenhum título em aberto para cobrar nesta carteira.</td></tr>}
            {carteiraGeral.map((g, i) => {
              const open = !!openCli[g.clientKey];
              const isSel = selected.has(g.clientKey);
              const rowBg = isSel ? (isDark ? "rgba(232,119,34,.15)" : "rgba(232,119,34,.07)") : (i % 2 === 0 ? t.surf : t.alt);
              const leftClr = g.encaminharConsolidado === "verificacao" ? "#3b82f6" : g.encaminharConsolidado === "protesto" ? "#ef4444" : prioCor(g.prioridadeCliente);
              return (
                <React.Fragment key={g.clientKey}>
                  <tr style={{ background: rowBg, borderLeft: `4px solid ${leftClr}` }}>
                    {visibleCols.map(c => {
                      if (c.key === "check") return <td key={c.key} style={{ ...tdS(), textAlign: "center" }}><input type="checkbox" checked={isSel} onChange={() => toggleSel(g.clientKey)} /></td>;
                      if (c.key === "expand") return <td key={c.key} style={tdS()}><button onClick={() => setOpenCli(p => ({ ...p, [g.clientKey]: !p[g.clientKey] }))} style={{ background: t.p, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>{open ? "−" : "+"}</button></td>;
                      if (c.key === "acoes") return <td key={c.key} style={tdS()}><div style={{ display: "flex", gap: 3 }}><Btn t={t} sm onClick={() => { setModal(g); setForm({ ...emptyForm(), status: g.statusConsolidado || "", encaminhar: g.encaminharConsolidado || "", tipo: g.titulos[0]?.tipoContato || "", dataPromessa: g.dataPromessa || "", obs: g.obsConsolidada || "" }); }}>✏️</Btn><Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn>{setNegModal && <Btn t={t} sm onClick={() => setNegModal(g)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>🤝</Btn>}</div></td>;
                      return React.cloneElement(renderCell(c.key, g), { key: c.key });
                    })}
                  </tr>
                  {open && g.titulos.map(item => {
                    const itemCalc = calculateChargeValues(item, ratesForItem(item));
                    return (
                      <tr key={item.id || tituloCalcKey(item)} style={{ background: t.surf2 }}>
                        {visibleCols.map(c => {
                          if (["check", "expand"].includes(c.key)) return <td key={c.key} style={tdS()} />;
                          if (c.key === "nrCli") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{renderTituloDetalhe(item)}</td>;
                          if (c.key === "nomeCli") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{getDisplayClient(g).nomeCli}</td>;
                          if (c.key === "qtd") return <td key={c.key} style={{ ...tdS(), textAlign: "center" }}>1</td>;
                          if (c.key === "venc") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(item.vencimento)}</td>;
                          if (c.key === "atraso") return <td key={c.key} style={{ ...tdS(), color: itemCalc.diasAtraso > 0 ? "#ef4444" : "#10b981" }}>{itemCalc.diasAtraso > 0 ? `${itemCalc.diasAtraso}d` : "—"}</td>;
                          if (c.key === "vOrig") return <td key={c.key} style={tdS()}>{fmtM(itemCalc.base)}</td>;
                          if (c.key === "multa") return <td key={c.key} onClick={() => editRateForItem(item, "multa")} title="Clique para digitar a % de multa única deste título" style={{ ...tdS(), color: "#f97316", cursor: "pointer", background: itemCalc.multaPercent > 0 ? "#f9731618" : undefined }}>{fmtM(itemCalc.multa)} <span style={{ fontSize: 9 }}>({itemCalc.multaPercent}%)</span></td>;
                          if (c.key === "juros") return <td key={c.key} onClick={() => editRateForItem(item, "juros")} title="Clique para digitar a % de juros diário deste título" style={{ ...tdS(), color: "#eab308", cursor: "pointer", background: itemCalc.jurosPercentDia > 0 ? "#eab30818" : undefined }}>{fmtM(itemCalc.juros)} <span style={{ fontSize: 9 }}>({itemCalc.jurosPercentDia}% dia)</span></td>;
                          if (c.key === "total") return <td key={c.key} style={{ ...tdS(), fontWeight: 700, color: t.p }}>{fmtM(itemCalc.total)}</td>;
                          if (c.key === "status") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{item.status}</td>;
                          if (c.key === "enc") return <td key={c.key} style={tdS()}>{encBadge(item.encaminhar)}</td>;
                          if (c.key === "origem") return <td key={c.key} style={tdS()}><span style={{ display: "inline-block", fontSize: 8, background: item.origem === "FINR1253" ? "#7c3aed22" : "#0369a122", color: item.origem === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{getOrigemLabel(item.origem)}</span></td>;
                          if (c.key === "cat") return <td key={c.key} style={tdS()}>{item.clientCategory ? categoriaBadge(item.clientCategory) : "—"}</td>;
                          if (c.key === "contato") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(item.dataContato)}</td>;
                          if (c.key === "prom") return <td key={c.key} style={tdS()}><PromBadge date={item.dataPromessa} t={t} /></td>;
                          if (c.key === "obs") return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{item.obs || item.portador || "—"}</td>;
                          if (c.key === "acoes") return <td key={c.key} style={tdS()} />;
                          return <td key={c.key} style={tdS()} />;
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.bor}`, fontSize: 11, color: t.muted, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><b style={{ color: t.txt }}>{carteiraGeral.length}</b> de {baseValida.length} clientes com títulos em aberto</span>
        </div>
      </div>
    </div>
  );
}
