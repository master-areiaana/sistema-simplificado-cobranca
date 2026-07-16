import React, { useCallback, useEffect, useMemo, useRef, useState, Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: "center", color: "#ef4444" }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>❌ Erro no sistema</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }} style={{ background: "#E87722", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, cursor: "pointer" }}>🔄 Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import * as XLSX from "xlsx";
import { base44, getDataModeStatus, subscribeDataMode } from "@/api/base44Client";
import {
  hojeISO, fmtM, fmtD, normText, dbToItem,
  detectSrc, parseRows1253, parseRows7007, dateISO, num, pick,
  dlCsv, sugestaoEncaminhamento,
  getTituloKey, isValidClientName, getClienteAgrupamentoKey, manualObservationText } from
"@/lib/cobranca";
import { DARK, LIGHT, THEME_STORAGE_KEY, loadL, saveL } from "@/lib/theme";
import { KPI, SideNavItem, Badge, Btn } from "@/components/cobranca/UI";
import TabelaCarteira from "@/components/cobranca/TabelaCarteira";
import ModalCobranca from "@/components/cobranca/ModalCobranca";
import ModalResposta from "@/components/cobranca/ModalResposta";
import ModalHistorico from "@/components/cobranca/ModalHistorico";
import FaixaFilter from "@/components/cobranca/FaixaFilter";
import MonitorPromessas from "@/components/cobranca/MonitorPromessas";
import exportarPDFExecutivo from "@/components/cobranca/ExportPDF";
import PainelProdutividade from "@/components/cobranca/PainelProdutividade";
import ModalNegociacao from "@/components/cobranca/ModalNegociacao";
import AnalyticsDashboard from "@/components/cobranca/AnalyticsDashboard";
import PainelMetas from "@/components/cobranca/PainelMetas";
import ModalEnviarPDF from "@/components/cobranca/ModalEnviarPDF";
import TabelaCobrados from "@/components/cobranca/TabelaCobrados";
import TabelaVerificacao from "@/components/cobranca/TabelaVerificacao";
import TabelaProtesto from "@/components/cobranca/TabelaProtesto";
import ImpactoCaixaTab from "@/components/cobranca/ImpactoCaixaTab";
import ImportPreviewPanel from "@/components/importacao/ImportPreviewPanel";
import AssessoriaHub from "@/pages/AssessoriaHub";
import {
  assertApplicationPlanStillCurrent,
  buildImportApplicationPlan,
} from "@/lib/importacao/applyImport";

const LOCAL_THEME = THEME_STORAGE_KEY;
const LOCAL_TAB = "sc_tab";
const LOCAL_NAV_COLLAPSED = "sc_nav_collapsed_base44_v1";
const STATUS_OPC = ["Não Contatado", "Em Cobrança", "Sem Retorno", "Prometeu Pagar", "Pago Aguard. Baixa", "Em Permuta", "Encerrado"];
const VERIF_RESP = ["Confirmado", "Não localizado", "Baixado", "Erro", "Duplicidade", "Devolver para cobrança"];
const PROT_RESP = ["Aprovado", "Reprovado", "Devolver para cobrança"];

function isCobrDia(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const h = Object.keys(rows[0] || {}).map((x) => normText(x));
  const temCliente = h.some((x) => x === "CLIENTE" || x.includes("CLIENTE"));
  const temStatus = h.some((x) => x === "STATUS" || x.includes("STATUS"));
  const temMotivo = h.some((x) => x === "MOTIVO" || x.includes("MOTIVO") || x.includes("CONTATO"));
  return temCliente && (temStatus || temMotivo);
}

function isCobrCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const h = Object.keys(rows[0] || {}).map((x) => normText(x).replace(/[^a-z0-9]/g, ""));
  return h.some((x) => x === "nr" || x === "n") && h.includes("cliente") && h.includes("status") && h.some((x) => x.includes("orig") || x.includes("valoig"));
}

function uniqCobr(rows) {
  const seen = new Set(), out = [];
  rows.forEach((r) => {
    const k = [normText(pick(r, ["Cliente"]) || ""), num(pick(r, ["Total"]) || 0), normText(pick(r, ["Status"]) || ""), normText(pick(r, ["Motivo"]) || ""), dateISO(pick(r, ["Data do Contato"]) || "")].join("|");
    if (!normText(pick(r, ["Cliente"]) || "") || seen.has(k)) return;
    seen.add(k); out.push(r);
  });
  return out;
}

export default function Dashboard() {
  const fileRef = useRef(null);
  const rawTitlesRef = useRef([]);
  const [isDark, setIsDark] = useState(() => loadL(LOCAL_THEME, "light") === "dark");
  const t = isDark ? DARK : LIGHT;

  const [records, setRecords] = useState([]);
  const [baixadosImportacao, setBaixadosImportacao] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState(() => loadL(LOCAL_TAB, "carteira"));
  const [navCollapsed, setNavCollapsed] = useState(() => loadL(LOCAL_NAV_COLLAPSED, "0") === "1");
  const [subTabProd, setSubTabProd] = useState("produtividade");

  const [modal, setModal] = useState(null);
  const [histModal, setHistModal] = useState(null);
  const [openCli, setOpenCli] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [batchModal, setBatchModal] = useState(false);
  const [respModal, setRespModal] = useState(null);
  const [respForm, setRespForm] = useState({ responsavel: "", resposta: "", obs: "" });
  const [negModal, setNegModal] = useState(null);
  const [emailModal, setEmailModal] = useState(false);
  const [subTabCobr, setSubTabCobr] = useState("historico");

  const emptyForm = () => ({ status: "", encaminhar: "", tipo: "", solicitante: "", dataPromessa: "", obs: "" });
  const [form, setForm] = useState(emptyForm());
  const [batchForm, setBatchForm] = useState(emptyForm());

  const [scCart, setScCart] = useState({ key: "cliente", dir: "asc" });
  const [faixaAtraso, setFaixaAtraso] = useState(0);
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaTitulo, setBuscaTitulo] = useState("");
  const [filtroSentinela, setFiltroSentinela] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState("");

  const [fCart, setFCart] = useState({});
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [fCob, setFCob] = useState({});
  const [fVerif, setFVerif] = useState({});
  const [fProt, setFProt] = useState({});
  const [kpiFilter, setKpiFilter] = useState(null);
  const [cleanupMsg, setCleanupMsg] = useState(null);
  const [showPaid, setShowPaid] = useState(false);
  const [dataMode, setDataMode] = useState(() => getDataModeStatus());

  const importingRef = useRef(false);

  useEffect(() => subscribeDataMode(setDataMode), []);

  const loadData = useCallback(async () => {
    const t0perf = performance.now();
    setLoading(true);
    try {
      const t1 = performance.now();
      const [titulos, evts, baixados] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 50000),
        base44.entities.ChargeEvent.list("-created_date", 50000),
        // A base Supabase original não tinha workflow_status. Títulos inativos
        // continuam auditáveis no Impacto no Caixa e são normalizados no adaptador.
        base44.entities.Titulo.filter({ active: false }, "-updated_date", 50000)
      ]);
      const t2 = performance.now();

      rawTitlesRef.current = [...(titulos || []), ...(baixados || [])];

      const tituloKeyMap = new Map();
      for (const r of titulos || []) {
        const key = getTituloKey({ origem: r.source, nrCli: r.client_code, nomeCli: r.client_name, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });
        const prev = tituloKeyMap.get(key);
        if (!prev) { tituloKeyMap.set(key, r); continue; }
        const sc = (rec) => {
          const pagoImportacao = rec.workflow_status === "pago_importacao" || rec.current_status === "Pago Aguard. Baixa";
          const valorAberto = Number(rec.open_value ?? rec.original_value ?? 0);
          return (
            (!pagoImportacao && rec.active && valorAberto > 0 ? 100 : 0) -
            (pagoImportacao ? 100 : 0) +
            (rec.current_status && rec.current_status !== "Não Contatado" ? 1 : 0) +
            (rec.last_note ? 1 : 0) + (rec.promise_date ? 1 : 0) +
            (rec.last_contact_date ? 1 : 0) +
            (rec.workflow_status && rec.workflow_status !== "normal" ? 1 : 0) +
            (rec.client_category ? 1 : 0) +
            (Number(rec.contact_count) > 0 ? 1 : 0)
          );
        };
        const sr = sc(r), sp = sc(prev);
        const dc = r.updated_date || r.updated_at || r.created_date || r.created_at || "";
        const dp = prev.updated_date || prev.updated_at || prev.created_date || prev.created_at || "";
        if (sr > sp || (sr === sp && dc > dp)) tituloKeyMap.set(key, r);
      }
      const t3 = performance.now();

      const titulosFinais = Array.from(tituloKeyMap.values()).map((r) => dbToItem(r));
      const t4 = performance.now();

      setRecords(titulosFinais);
      setBaixadosImportacao((baixados || []).map((r) => dbToItem(r)));
      setEvents(evts || []);

      const dupCount = (titulos || []).length - titulosFinais.length;
      const totalMs = (performance.now() - t0perf).toFixed(0);
      const fetchMs = (t2 - t1).toFixed(0);
      const dedupMs = (t3 - t2).toFixed(0);
      const convMs = (t4 - t3).toFixed(0);
      console.info(`⚡ loadData: total=${totalMs}ms | fetch=${fetchMs}ms | dedup=${dedupMs}ms | convert=${convMs}ms | ${titulosFinais.length} títulos${dupCount > 0 ? ` (${dupCount} dup ocultas)` : ""}`);
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${titulosFinais.length} títulos carregados${dupCount > 0 ? ` (${dupCount} duplicatas ocultas)` : ""} ⏱${totalMs}ms`);
    } catch (err) {
      setSyncMsg(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { saveL(LOCAL_THEME, isDark ? "dark" : "light"); }, [isDark]);
  useEffect(() => { saveL(LOCAL_TAB, activeTab); setKpiFilter(null); }, [activeTab]);
  useEffect(() => { saveL(LOCAL_NAV_COLLAPSED, navCollapsed ? "1" : "0"); }, [navCollapsed]);
  useEffect(() => {
    let debounceTimer = null;
    const debouncedLoad = () => {
      if (importingRef.current) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!importingRef.current) loadData();
      }, 800);
    };
    const unsub1 = base44.entities.Titulo.subscribe(debouncedLoad);
    const unsub2 = base44.entities.ChargeEvent.subscribe(debouncedLoad);
    return () => { unsub1(); unsub2(); clearTimeout(debounceTimer); };
  }, [loadData]);

  const histMap = useMemo(() => {
    const out = {}, seen = new Map();
    for (const e of events) {
      const manualObs = manualObservationText(e.note, e.event_user);
      const k = [e.client_code || "", normText(e.client_name || ""), e.event_date || "", e.status || "", e.motive || "", manualObs, e.event_user || ""].join("|");
      if (!seen.has(k)) seen.set(k, e);
    }
    for (const e of seen.values()) {
      const evtData = { ...e, data: e.event_date || "", tipo: e.contact_type || "", status: e.status || "", motivo: e.motive || "", obs: manualObservationText(e.note, e.event_user), usuario: e.event_user || "", dataPromessa: e.promise_date || "", subtype: e.event_subtype || "" };
      const keyFull = `${String(e.client_code || "").trim()}||${normText(e.client_name || "")}`;
      const keyNome = `NOME:${normText(e.client_name || "")}`;
      const keyCliente = getClienteAgrupamentoKey({ nrCli: e.client_code, nomeCli: e.client_name });
      for (const key of [keyFull, keyNome, keyCliente].filter(Boolean)) {
        if (!out[key]) out[key] = [];
        out[key].push(evtData);
      }
    }
    Object.keys(out).forEach((k) => out[k].sort((a, b) => String(b.data).localeCompare(String(a.data))));
    return out;
  }, [events]);

  const grouped = useMemo(() => {
    const tg0 = performance.now();
    const map = new Map();

    function extractNomeCli(v) {
      const raw = String(v || "").trim();
      const m = raw.match(/^(\d{1,10})\s*[\/\-–]\s*(.{2,})$/);
      if (m && /[A-Za-zÀ-ÿ]/.test(m[2])) return m[2].trim();
      return /^\d+$/.test(raw) ? "" : raw;
    }

    function normCod(v) {
      return String(v || "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1");
    }

    function getClienteKey(item) {
      const chaveCliente = getClienteAgrupamentoKey(item);
      if (chaveCliente) return chaveCliente;
      return `ID:${item.id || Math.random()}`;
    }

    records.forEach((item) => {
      let nomeExibicao = extractNomeCli(item.nomeCli) || item.nomeCli || "";
      const cod = normCod(item.nrCli);
      if (!isValidClientName(nomeExibicao)) {
        if (!cod) return;
        nomeExibicao = `Cliente ${cod}`;
      }
      const k = getClienteKey(item);
      if (!map.has(k)) {
        map.set(k, { clientKey: k, nrCli: cod, nomeCli: nomeExibicao, _codigos: new Set(), titulos: [], _nomes: [] });
      }
      const g = map.get(k);
      if (cod) g._codigos.add(cod);
      g._nomes.push(nomeExibicao);
      g.titulos.push(item);
    });

    map.forEach((g) => {
      const comLetras = (g._nomes || []).filter((s) => /[A-Za-zÀ-ÿ]/.test(s));
      if (comLetras.length > 0) {
        comLetras.sort((a, b) => b.length - a.length);
        g.nomeCli = comLetras[0];
      }
      g.codigosLista = [...g._codigos].sort((a, b) => Number(a) - Number(b));
      if (g.codigosLista.length > 0) g.nrCli = g.codigosLista[0];
      delete g._nomes;
      delete g._codigos;
    });

    const agrupados = Array.from(map.values()).map((g) => {
      const ts = g.titulos;
      let vOrig = 0, vMult = 0, vJuro = 0, vTot = 0, mAtr = 0, qtdT = 0;
      let ultCont = "", dataProm = "", statusC = "", obsC = "", encC = "", solProt = "";
      let primeiroVencimento = "", foiCobrado = false;
      for (const x of ts) {
        vOrig += Number(x.valorOriginal || 0);
        vMult += Number(x.valorMulta || 0);
        vJuro += Number(x.valorJuros || 0);
        vTot += Number(x.valorTotalDebito || 0);
        const da = Number(x.diasAtraso || 0); if (da > mAtr) mAtr = da;
        qtdT += Number(x.qtd || 0);
        if (x.dataContato && x.dataContato > ultCont) ultCont = x.dataContato;
        if (x.dataPromessa && x.dataPromessa > dataProm) dataProm = x.dataPromessa;
        if (x.status && x.status > statusC) status�_4󋨑鬶��q�^�󥬥ct value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todas</option><option value="Portador">Portador</option><option value="Imobiliário">Imobiliário</option><option value="Parceiros">Parceiros</option><option value="Bancos">Bancos</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span><select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todos</option><option value="FINR1253">Topcon (FINR1253)</option><option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>📄 Título:</span><input type="text" placeholder="Buscar por nº ou nome..." value={buscaTitulo} onChange={(e) => setBuscaTitulo(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaTitulo && <button onClick={() => setBuscaTitulo("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span><input type="text" placeholder="Buscar por nome ou nº..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaCliente && <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div>{activeTab === "carteira" && <div style={{ display: "flex", gap: 8, alignItems: "center" }}><div style={{ position: "relative" }}><button onClick={() => setShowColMenu((x) => !x)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>☰ Colunas {hiddenCols.size > 0 ? `(${hiddenCols.size} ocultas)` : ""}</button>{showColMenu && <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "8px", zIndex: 300, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{[{ key: "nrCli", label: "Nº" }, { key: "nomeCli", label: "CLIENTE" }, { key: "qtd", label: "QTD." }, { key: "venc", label: "VENCIMENTO" }, { key: "atraso", label: "ATRASO" }, { key: "vOrig", label: "VAL. ORIG" }, { key: "multa", label: "MULTA" }, { key: "juros", label: "JUROS" }, { key: "total", label: "TOTAL" }, { key: "status", label: "STATUS" }, { key: "enc", label: "ENCAMINHAR" }, { key: "origem", label: "ORIG." }, { key: "contato", label: "DT. CONTATO" }, { key: "prom", label: "PROMESSA" }, { key: "sugest", label: "SUGESTÃO" }, { key: "obs", label: "OBSERVAÇÃO" }].map((c) => <label key={c.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, background: hiddenCols.has(c.key) ? t.surf2 : "transparent" }}><input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => setHiddenCols((p) => { const n = new Set(p); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} style={{ accentColor: t.p }} />{c.label}</label>)}<button onClick={() => { setHiddenCols(new Set()); setShowColMenu(false); }} style={{ gridColumn: "1/-1", marginTop: 4, background: t.p, color: "#fff", border: "none", borderRadius: 4, padding: "4px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Mostrar Todas</button></div>}</div></div>}</div>}
        {activeTab === "carteira" && <div>{selected.size > 0 && <div style={{ background: t.p, borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{selected.size} selecionado(s)</span><button onClick={() => { setBatchForm(emptyForm()); setBatchModal(true); }} style={{ background: "#fff", color: t.p, border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏️ Cobrança em Lote</button>{selGroups.length === 1 && <button onClick={() => setNegModal(selGroups[0])} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🤝 Negociar</button>}<Btn t={t} ghost sm onClick={() => setSelected(new Set())} style={{ color: "#fff", borderColor: "#fff" }}>✕ Deselecionar</Btn></div>}<TabelaCarteira sortedCart={sortedCart} baseCart={baseCart} fCart={fCart} setFCart={setFCart} selected={selected} toggleSel={toggleSel} toggleAll={toggleAll} scCart={scCart} handleSort={handleSort} setModal={setModal} setForm={setForm} setHistModal={setHistModal} openCli={openCli} setOpenCli={setOpenCli} emptyForm={emptyForm} isDark={isDark} t={t} makeColData={makeColData} fieldVal={fieldVal} applyExcelFilter={applyExcelFilter} setNegModal={setNegModal} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} filtroOrigem={filtroOrigem} onClickFilter={(val) => setBuscaCliente(val)} onEncaminharSugestao={async (g, enc) => { for (const item of g.titulos) { await base44.entities.ChargeEvent.create({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: "COBRANCA", event_subtype: enc, event_date: hojeISO, status: g.statusConsolidado || "Em Cobrança", motive: enc, event_user: "Sistema" }); if (item._dbId) await base44.entities.Titulo.update(item._dbId, { workflow_status: enc, updated_by: "Sistema" }); } setSyncMsg(`✅ ${g.nomeCli} encaminhado para ${enc === "protesto" ? "Protesto" : enc === "verificacao" ? "Verificação" : enc}.`); await loadData(); }} /></div>}
        {activeTab === "cobrados" && <><div style={{ display: "flex", gap: 6, marginBottom: 12 }}><button onClick={() => setSubTabCobr("historico")} style={{ background: subTabCobr === "historico" ? t.p : t.surf2, color: subTabCobr === "historico" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "historico" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✅ Histórico de Cobrança</button><button onClick={() => setSubTabCobr("promessas")} style={{ background: subTabCobr === "promessas" ? t.p : t.surf2, color: subTabCobr === "promessas" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "promessas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📅 Promessas & Calendário</button></div><div className="kpi-container kpi-container-6"><KPI t={t} label="Total Cobrados" color="#10B981" value={cobrados.length} sub="clientes contactados" /><KPI t={t} label="Valor Cobrado" color="#10B981" value={fmtM(cobrados.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total em aberto" /><KPI t={t} label="Com Promessa" color="#FBBF24" value={cobrados.filter((g) => g.dataPromessa).length} sub="clientes com data" /><KPI t={t} label="Prometeu Pagar" color="#A78BFA" value={cobrados.filter((g) => g.statusConsolidado === "Prometeu Pagar" || g.statusConsolidado === "Promessa ativa").length} sub="status atual" /><KPI t={t} label="Pago Aguard. Baixa" color="#3B82F6" value={cobrados.filter((g) => g.statusConsolidado === "Pago Aguard. Baixa" || g.statusConsolidado === "Pago aguardando baixa").length} sub="aguardando baixa" /><KPI t={t} label="Sem Retorno" color="#EF4444" value={cobrados.filter((g) => g.statusConsolidado === "Sem Retorno").length} sub="sem resposta" /></div><div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}><FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} /><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span><select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todos</option><option value="FINR1253">Topcon (FINR1253)</option><option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span><input type="text" placeholder="Buscar por nome ou nº..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaCliente && <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div></div>{subTabCobr === "historico" && <TabelaCobrados data={cobrados} events={events} t={t} setHistModal={setHistModal} dlCsv={dlCsv} />}{subTabCobr === "promessas" && <MonitorPromessas grouped={groupedFiltrado} events={events} t={t} />}</>}
        {activeTab === "verificacao" && <TabelaVerificacao data={verifLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />}
        {activeTab === "protesto" && <TabelaProtesto data={protestoLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />}
        {activeTab === "produtividade" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="kpi-container kpi-container-4"><KPI t={t} label="Total de Contatos" color="#3B82F6" value={events.filter((e) => e.event_type === "COBRANCA").length} sub="no período" /><KPI t={t} label="Promessas Obtidas" color="#FBBF24" value={events.filter((e) => e.status === "Prometeu Pagar" || e.status === "Promessa ativa").length} sub="confirmadas" /><KPI t={t} label="Pagamentos Confirmados" color="#10B981" value={events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Pagamento confirmado").length} sub="verificados" /><KPI t={t} label="Taxa de Sucesso" color="#A78BFA" value={`${events.length > 0 ? (events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Prometeu Pagar" || e.status === "Promessa ativa" || e.status === "Pagamento confirmado").length / events.length * 100).toFixed(1) : 0}%`} sub="conversão" /></div><div style={{ display: "flex", gap: 6 }}><button onClick={() => setSubTabProd("produtividade")} style={{ background: subTabProd === "produtividade" ? t.p : t.surf2, color: subTabProd === "produtividade" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "produtividade" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>👤 Produtividade por Usuário</button><button onClick={() => setSubTabProd("metas")} style={{ background: subTabProd === "metas" ? t.p : t.surf2, color: subTabProd === "metas" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "metas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🎯 Metas de Cobrança</button></div>{subTabProd === "produtividade" && <><PainelProdutividade events={events} t={t} /><div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "16px", boxShadow: t.shad }}><div style={{ fontSize: 14, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📊 Analytics & Exportação</div><AnalyticsDashboard grouped={grouped} events={events} t={t} /></div></>}{subTabProd === "metas" && <PainelMetas grouped={grouped} events={events} t={t} />}</div>}
        {activeTab === "fluxo" && <ImpactoCaixaTab grouped={grouped} baixadosImportacao={baixadosImportacao} events={events} t={t} isDark={isDark} />}
        {activeTab === "assessoria" && <AssessoriaHub embedded />}
      </main>
      </div>
      {modal && <ModalCobranca title="✏️ Registrar Cobrança" frm={form} setFrm={setForm} onSave={() => salvarCobranca(form, modal.titulos, () => setModal(null))} onClose={() => setModal(null)} t={t} isDark={isDark} info={<div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${t.bor}` }}><b>{modal.nomeCli}</b><div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>Cliente {modal.nrCli} · {modal.qtdTitulos} título(s) · <b style={{ color: t.p }}>{fmtM(modal.valorTotalDebito)}</b></div></div>} />}
      {batchModal && <ModalCobranca title={`✏️ Cobrança em Lote — ${selGroups.length} clientes`} frm={batchForm} setFrm={setBatchForm} onSave={() => salvarCobranca(batchForm, selGroups.flatMap((g) => g.titulos), () => { setBatchModal(false); setSelected(new Set()); })} onClose={() => setBatchModal(false)} t={t} isDark={isDark} info={<div style={{ background: t.surf2, borderRadius: 8, padding: "8px 12px", marginBottom: 14, border: `1px solid ${t.bor}`, maxHeight: 100, overflowY: "auto" }}>{selGroups.map((g) => <div key={g.clientKey} style={{ fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between" }}><b>{g.nomeCli}</b><span style={{ color: t.p, fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</span></div>)}</div>} />}
      <ModalResposta respModal={respModal} respForm={respForm} setRespForm={setRespForm} onSave={salvarResposta} onClose={() => setRespModal(null)} t={t} isDark={isDark} />
      <ModalHistorico histModal={histModal} onClose={() => setHistModal(null)} t={t} />
      {negModal && <ModalNegociacao grupo={negModal} onClose={() => setNegModal(null)} t={t} isDark={isDark} />}
      {emailModal && <ModalEnviarPDF grouped={grouped} filteredCart={sortedCart} dash={dash} faixaAtraso={faixaAtraso} filtroOrigem={filtroOrigem} hojeISO={hojeISO} t={t} onClose={() => setEmailModal(false)} />}
    </div>
    </ErrorBoundary>
  );
}
