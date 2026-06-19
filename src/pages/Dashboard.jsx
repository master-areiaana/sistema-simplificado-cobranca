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
import { base44 } from "@/api/base44Client";
import {
  hojeISO, fmtM, fmtD, normText, dbToItem,
  detectSrc, parseRows1253, parseRows7007, dateISO, num, pick,
  dlCsv, sugestaoEncaminhamento,
  getTituloKey, isValidClientName, getClienteAgrupamentoKey } from
"@/lib/cobranca";
import { DARK, LIGHT, loadL, saveL } from "@/lib/theme";
import { KPI, TabBtn, Badge, Btn } from "@/components/cobranca/UI";
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
import {
  PARTIAL_APPLICATION_FAILURE_MESSAGE,
  assertApplicationPlanStillCurrent,
  buildImportApplicationPlan,
} from "@/lib/importacao/applyImport";

const LOCAL_THEME = "sc_theme";
const LOCAL_TAB = "sc_tab";
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
  const [isDark, setIsDark] = useState(() => loadL(LOCAL_THEME, "dark") === "dark");
  const t = isDark ? DARK : LIGHT;

  const [records, setRecords] = useState([]);
  const [baixadosImportacao, setBaixadosImportacao] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState(() => loadL(LOCAL_TAB, "carteira"));
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

  const importingRef = useRef(false);

  const loadData = useCallback(async () => {
    const t0perf = performance.now();
    setLoading(true);
    try {
      const t1 = performance.now();
      const [titulos, evts, baixados] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 10000),
        base44.entities.ChargeEvent.list("-created_date", 10000),
        base44.entities.Titulo.filter({ workflow_status: "baixado_importacao" }, "-updated_date", 1000)
      ]);
      const t2 = performance.now();

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
        const dc = r.updated_date || r.created_date || "";
        const dp = prev.updated_date || prev.created_date || "";
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
      const k = [e.client_code || "", normText(e.client_name || ""), e.event_date || "", e.status || "", e.motive || "", e.note || "", e.event_user || ""].join("|");
      if (!seen.has(k)) seen.set(k, e);
    }
    for (const e of seen.values()) {
      const evtData = { ...e, data: e.event_date || "", tipo: e.contact_type || "", status: e.status || "", motivo: e.motive || "", obs: e.note || "", usuario: e.event_user || "", dataPromessa: e.promise_date || "", subtype: e.event_subtype || "" };
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
      const cod = normCod(item.nrCli);
      if (cod) return `COD:${cod}`;
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
        if (x.status && x.status > statusC) statusC = x.status;
        if (x.obs && !obsC) obsC = x.obs;
        if (x.encaminhar && !encC) encC = x.encaminhar;
        if (x.solicitanteProtesto && !solProt) solProt = x.solicitanteProtesto;
        if (x.vencimento && (!primeiroVencimento || x.vencimento < primeiroVencimento)) primeiroVencimento = x.vencimento;
        if (!foiCobrado && ((x.qtd || 0) > 0 || !!x.dataContato)) foiCobrado = true;
      }
      if (!statusC) statusC = "Não Contatado";
      const prio = mAtr > 90 || qtdT >= 3 ? "CRÍTICO" : mAtr > 30 || qtdT >= 2 ? "ALTO" : mAtr > 0 || qtdT >= 1 ? "MÉDIO" : "BAIXO";
      const histKeys = new Set([
        g.clientKey,
        `${String(g.nrCli || "").trim()}||${normText(g.nomeCli || "")}`,
        `NOME:${normText(g.nomeCli || "")}`,
        getClienteAgrupamentoKey({ nrCli: g.nrCli, nomeCli: g.nomeCli })
      ].filter(Boolean));
      for (const ti of g.titulos || []) {
        histKeys.add(getClienteAgrupamentoKey(ti));
        histKeys.add(`${String(ti.nrCli || "").trim()}||${normText(ti.nomeCli || "")}`);
        histKeys.add(`NOME:${normText(ti.nomeCli || "")}`);
      }
      const historicoMerged = (() => {
        const all = [...histKeys].flatMap((key) => histMap[key] || []);
        if (!all.length) return [];
        const seen = new Set();
        return all.filter((h) => {
          const hk = `${h.data}|${h.status}|${h.motivo}|${h.obs}|${h.usuario}`;
          if (seen.has(hk)) return false;
          seen.add(hk);
          return true;
        }).sort((a, b) => b.data > a.data ? -1 : 1);
      })();
      const ultimaObsHistorico = historicoMerged.find((h) => h.obs)?.obs || "";
      const ultimaPromessaHistorico = historicoMerged.find((h) => h.dataPromessa)?.dataPromessa || "";
      const ultimoContatoHistorico = historicoMerged.find((h) => h.data)?.data || "";
      return { ...g, valorOriginal: vOrig, valorMulta: vMult, valorJuros: vJuro, valorTotalDebito: vTot, maiorAtraso: mAtr, qtdTitulos: ts.length, qtdTotal: qtdT, ultimoContato: ultCont || ultimoContatoHistorico, dataPromessa: dataProm || ultimaPromessaHistorico, statusConsolidado: statusC, obsConsolidada: obsC || ultimaObsHistorico, encaminharConsolidado: encC, solicitanteProtestoConsolidado: solProt, prioridadeCliente: prio, foiCobrado: foiCobrado || historicoMerged.length > 0, historicoCliente: historicoMerged, primeiroVencimento };
    });
    console.info(`⚡ grouped: ${(performance.now() - tg0).toFixed(0)}ms | ${agrupados.length} grupos de ${records.length} títulos`);
    return agrupados;
  }, [records, histMap]);

  function fieldVal(g, field) {
    switch (field) {
      case "nrCli": return g.nrCli || "(Vazio)";
      case "nomeCli": return g.nomeCli || "(Vazio)";
      case "statusConsolidado": return g.statusConsolidado || "(Vazio)";
      case "prioridadeCliente": return g.prioridadeCliente || "(Vazio)";
      case "encaminharConsolidado": return g.encaminharConsolidado || "Sem encaminhamento";
      case "ultimoContato": return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)";
      case "dataPromessa": return g.dataPromessa ? fmtD(g.dataPromessa) : "(Vazio)";
      case "atrasoLabel": return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—";
      case "vencimento": return g.primeiroVencimento ? fmtD(g.primeiroVencimento) : "(Vazio)";
      case "obsConsolidada": return g.obsConsolidada || "(Sem observação)";
      case "origem": return [...new Set(g.titulos?.map((ti) => ti.origem))].map((o) => o === "FINR1253" ? "Topcon" : "EB").join(", ") || "(Vazio)";
      case "valorOriginal": return fmtM(g.valorOriginal);
      case "valorTotalDebito": return fmtM(g.valorTotalDebito);
      case "sugestaoLabel": { const s = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito); return s ? s.label : "(Sem sugestão)"; }
      default: return "";
    }
  }
  function makeColData(arr, field) { return arr.map((g) => ({ [field]: fieldVal(g, field) })); }
  function applyExcelFilter(arr, filters) {
    return arr.filter((g) => {
      for (const [field, vals] of Object.entries(filters)) {
        if (!vals) continue;
        if (vals.length === 0) return false;
        const v = fieldVal(g, field);
        if (!vals.includes(v)) return false;
      }
      return true;
    });
  }

  const groupedFiltrado = useMemo(() => {
    const busca = normText(buscaCliente);
    const buscaTit = normText(buscaTitulo);
    return grouped
      .filter((g) => {
        if (faixaAtraso > 0 && g.maiorAtraso < faixaAtraso) return false;
        if (filtroOrigem && !g.titulos.some((ti) => ti.origem === filtroOrigem)) return false;
        if (busca && !normText(g.nomeCli).includes(busca) && !String(g.nrCli || "").includes(buscaCliente) && !(g.codigosLista || []).some((c) => c.includes(buscaCliente))) return false;
        if (buscaTit) {
          const temTituloMatch = g.titulos.some((ti) =>
            [ti.titulo, ti.seq, ti.tp, ti.nfServico].some((v) =>
              normText(v || "").includes(buscaTit) || String(v || "").includes(buscaTitulo)
            )
          );
          if (!temTituloMatch) return false;
        }
        if (filtroSentinela && g.maiorAtraso <= 90) return false;
        if (filtroCategoria && !g.titulos.some((ti) => ti.clientCategory === filtroCategoria)) return false;
        // "sem_carteira" e diagnostico de cruzamento e nao remove saldo valido da Carteira Geral.
        // Pagamento por importacao so remove o grupo quando todos os titulos do cliente estao pagos/baixados.
        const tituloPagoOuBaixado = (ti) => (
          ti.encaminhar === "pago_importacao" ||
          ti.workflow_status === "pago_importacao" ||
          ["Encerrado", "Baixado", "Pago", "Recebido", "Pago Aguard. Baixa"].includes(ti.status)
        );
        const todosPagosOuBaixados = (g.titulos || []).length > 0 && g.titulos.every(tituloPagoOuBaixado);
        if (todosPagosOuBaixados) return false;
        if (!showPaid) {
          const temPagamento =
            todosPagosOuBaixados ||
            (g.historicoCliente.some((h) => h.motivo === "Confirmado") && todosPagosOuBaixados);
          if (temPagamento) return false;
        }
        return true;
      })
      .map((g) => {
        if (!filtroOrigem) return g;
        const tsFilt = g.titulos.filter((ti) => ti.origem === filtroOrigem);
        if (tsFilt.length === g.titulos.length) return g;
        return {
          ...g,
          valorOriginal: tsFilt.reduce((s, x) => s + Number(x.valorOriginal || 0), 0),
          valorMulta: tsFilt.reduce((s, x) => s + Number(x.valorMulta || 0), 0),
          valorJuros: tsFilt.reduce((s, x) => s + Number(x.valorJuros || 0), 0),
          valorTotalDebito: tsFilt.reduce((s, x) => s + Number(x.valorTotalDebito || 0), 0),
          maiorAtraso: tsFilt.reduce((m, x) => Math.max(m, Number(x.diasAtraso || 0)), 0),
          qtdTitulos: tsFilt.length,
          primeiroVencimento: tsFilt.map((x) => x.vencimento).filter(Boolean).sort()[0] || "",
        };
      });
  }, [grouped, faixaAtraso, filtroOrigem, buscaCliente, buscaTitulo, filtroSentinela, filtroCategoria, showPaid]);

  const baseCart = useMemo(() => {
    let arr = [...groupedFiltrado];
    const d = scCart.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (scCart.key) {
        case "numero": return (Number(a.nrCli || 0) - Number(b.nrCli || 0)) * d;
        case "valorOriginal": return (a.valorOriginal - b.valorOriginal) * d;
        case "valorTotalDebito": return (a.valorTotalDebito - b.valorTotalDebito) * d;
        case "atraso": return (a.maiorAtraso - b.maiorAtraso) * d;
        default: return normText(a.nomeCli).localeCompare(normText(b.nomeCli)) * d;
      }
    });
    return arr;
  }, [groupedFiltrado, scCart]);

  const sortedCartBase = useMemo(() => applyExcelFilter(baseCart, fCart), [baseCart, fCart]);
  const sortedCart = useMemo(() => {
    if (!kpiFilter) return sortedCartBase;
    if (kpiFilter === "aCobrar") return sortedCartBase.filter((g) => !g.foiCobrado);
    if (kpiFilter === "cobrado") return sortedCartBase.filter((g) => g.foiCobrado);
    if (kpiFilter === "cobHoje") return sortedCartBase.filter((g) => g.ultimoContato === hojeISO);
    if (kpiFilter === "faltando") return sortedCartBase.filter((g) => g.ultimoContato !== hojeISO);
    if (kpiFilter === "pendVerif") return sortedCartBase.filter((g) => g.encaminharConsolidado === "verificacao");
    if (kpiFilter === "pendProt") return sortedCartBase.filter((g) => g.encaminharConsolidado === "protesto");
    return sortedCartBase;
  }, [sortedCartBase, kpiFilter, hojeISO]);
  const cobrados = useMemo(() => groupedFiltrado.filter((g) => g.foiCobrado), [groupedFiltrado]);
  const verifLista = useMemo(() => groupedFiltrado.filter((g) => g.encaminharConsolidado === "verificacao"), [groupedFiltrado]);
  const protestoLista = useMemo(() => groupedFiltrado.filter((g) => g.encaminharConsolidado === "protesto"), [groupedFiltrado]);
  const selGroups = useMemo(() => sortedCart.filter((g) => selected.has(g.clientKey)), [sortedCart, selected]);

  const dash = useMemo(() => {
    let base = groupedFiltrado;
    if (activeTab === "cobrados") base = cobrados;
    else if (activeTab === "verificacao") base = verifLista;
    else if (activeTab === "protesto") base = protestoLista;
    else if (activeTab === "carteira") base = sortedCart;
    const cobHoje = base.filter((x) => x.ultimoContato === hojeISO).length;
    const tot = base.length;
    const clientesComResposta = grouped.filter((g) => {
      const temResposta = g.historicoCliente.some((h) => h.subtype?.startsWith("RESP_VERIF") || h.subtype?.startsWith("RESP_PROT"));
      const workflow = g.encaminharConsolidado;
      return temResposta && (!workflow || workflow === "normal" || workflow === "") && g.ultimoContato !== hojeISO;
    });
    return {
      cobHoje, faltando: tot - cobHoje, perc: tot ? cobHoje / tot * 100 : 0,
      numCli: tot, numTit: base.reduce((s, x) => s + x.qtdTitulos, 0),
      vOrig: base.reduce((s, x) => s + x.valorOriginal, 0),
      vTot: base.reduce((s, x) => s + x.valorTotalDebito, 0),
      pendVerif: verifLista.length, pendProt: protestoLista.length,
      devolvidos: clientesComResposta.length,
      aCobrar: base.filter((g) => !g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0),
      cobrado: base.filter((g) => g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0)
    };
  }, [groupedFiltrado, sortedCart, cobrados, verifLista, protestoLista, events, activeTab]);

  function handleSort(k) { setScCart((p) => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }); }
  function toggleSel(k) { setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function toggleAll() { setSelected((p) => p.size === sortedCart.length && sortedCart.length > 0 ? new Set() : new Set(sortedCart.map((g) => g.clientKey))); }

  async function salvarCobranca(frm, titulos, onDone) {
    if (!frm.status) { alert("Status automático não identificado. Confira os dados preenchidos."); return; }
    if (frm.encaminhar === "protesto" && !frm.solicitante?.trim()) { alert("Informe quem está solicitando o protesto."); return; }
    const enc = frm.encaminhar || "";
    for (const item of titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "COBRANCA", event_subtype: enc || null, event_date: hojeISO,
        status: frm.status, motive: enc || null, contact_type: frm.tipo || null,
        promise_date: frm.dataPromessa || null, note: frm.obs || null,
        protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
        event_user: frm.solicitante || "Usuário responsável"
      });
      const existing = records.find((r) => r.id === item.id);
      if (existing?._dbId) {
        await base44.entities.Titulo.update(existing._dbId, {
          current_status: frm.status, current_motive: enc || null,
          current_contact_type: frm.tipo || null, promise_date: frm.dataPromessa || null,
          last_contact_date: hojeISO, last_note: frm.obs || null,
          contact_count: (item.qtd || 0) + 1,
          protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
          workflow_status: enc || "normal", updated_by: frm.solicitante || "Usuário responsável"
        });
      }
    }
    onDone(); setSyncMsg("✅ Cobrança salva."); await loadData();
  }

  async function salvarResposta() {
    if (!respModal || !respForm.responsavel.trim()) { alert("Informe o responsável."); return; }
    if (!respForm.resposta) { alert("Selecione uma resposta."); return; }
    const tipo = respModal.tipo;
    for (const item of respModal.grupo.titulos) {
      await base44.entities.ChargeEvent.create({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: "COBRANCA", event_subtype: `RESP_${tipo.toUpperCase()}`, event_date: hojeISO, status: "Em Cobrança", motive: respForm.resposta, note: respForm.obs || null, event_user: respForm.responsavel.trim() });
      const existing = records.find((r) => r.id === item.id);
      if (existing?._dbId) await base44.entities.Titulo.update(existing._dbId, { current_status: "Em Cobrança", workflow_status: "normal", updated_by: respForm.responsavel.trim() });
    }
    setRespModal(null); setSyncMsg("✅ Resposta registrada. Cliente devolvido para a Carteira."); await loadData();
  }

  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  async function limparDuplicatasBanco() {
    const tTotal = performance.now();
    setCleanupMsg("🔍 Buscando registros ativos...");
    await yieldUI();

    try {
      const t1 = performance.now();
      const allTitulos = await base44.entities.Titulo.filter({ active: true }, "client_name", 5000);
      const fetchMs = (performance.now() - t1).toFixed(0);

      const temDadosManuais = (r) =>
        !!(r.last_note?.trim()) || !!(r.promise_date) || !!(r.last_contact_date) ||
        !!(r.protest_requested_by?.trim()) || !!(r.current_contact_type?.trim()) ||
        !!(r.client_category?.trim()) || (Number(r.contact_count) > 0) ||
        (r.current_status && r.current_status !== "Não Contatado" && r.current_status !== "Baixado") ||
        (r.workflow_status && !["normal", "baixado", "duplicata", ""].includes(r.workflow_status));

      const invalidos = (allTitulos || []).filter((r) => !isValidClientName(r.client_name));
      const invalidosSemDados = invalidos.filter((r) => !temDadosManuais(r));
      const invalidosComDados = invalidos.filter(temDadosManuais);

      const totalFisico = (allTitulos || []).length;
      setCleanupMsg(`🔍 ${totalFisico} registros ativos encontrados (${fetchMs}ms). Agrupando...`);
      await yieldUI();

      const t2 = performance.now();
      const dupKey = (r) => getTituloKey({ origem: r.source, nrCli: r.client_code, nomeCli: r.client_name, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });
      const byKey = new Map();
      for (const r of allTitulos || []) {
        const key = dupKey(r);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(r);
      }
      const gruposDup = [];
      for (const [, group] of byKey) {
        if (group.length <= 1) continue;
        group.sort((a, b) =>
          Number(isValidClientName(b.client_name)) - Number(isValidClientName(a.client_name)) ||
          Number(temDadosManuais(b)) - Number(temDadosManuais(a)) ||
          String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""))
        );
        gruposDup.push(group);
      }
      const totalUnicos = byKey.size;
      const totalDupGrupos = gruposDup.length;
      const totalDupRegistros = gruposDup.reduce((s, g) => s + g.length - 1, 0);
      const groupMs = (performance.now() - t2).toFixed(0);

      if (totalDupRegistros === 0 && invalidosSemDados.length === 0) {
        setCleanupMsg(`✅ Limpeza finalizada: ${totalFisico} registros analisados — nenhuma duplicata ou cliente inválido sem dados manuais. ${invalidosComDados.length} inválidos preservados. ⏱${((performance.now() - tTotal) / 1000).toFixed(1)}s`);
        return;
      }

      const ok = window.confirm(
        `📊 DIAGNÓSTICO\n\nRegistros ativos: ${totalFisico}\nRegistros únicos: ${totalUnicos}\nGrupos com duplicata: ${totalDupGrupos}\nDuplicatas candidatas a inativar: ${totalDupRegistros}\nClientes inválidos sem dados manuais candidatos a inativar: ${invalidosSemDados.length}\nClientes inválidos com dados manuais preservados: ${invalidosComDados.length}\n\n⚠️ Duplicatas e clientes inválidos com dados manuais serão preservados.\nDeseja prosseguir?`
      );
      if (!ok) { setCleanupMsg(`ℹ️ Limpeza cancelada — diagnóstico: ${totalDupRegistros} duplicatas candidatas | ${invalidosSemDados.length} inválidos sem dados manuais | ${invalidosComDados.length} inválidos preservados.`); return; }

      const t4 = performance.now();
      const toInativar = [];
      const toMigrar = [];
      let preservadosManuais = 0, conflitos = 0;

      for (const group of gruposDup) {
        const principal = group[0];
        for (const dup of group.slice(1)) {
          if (dup.source !== principal.source) { conflitos++; continue; }
          const dupTemDados = temDadosManuais(dup);
          const principalTemDados = temDadosManuais(principal);
          if (dupTemDados && principalTemDados) { preservadosManuais++; continue; }
          if (dupTemDados && !principalTemDados) {
            toMigrar.push({ targetId: principal.id, payload: {
              current_status: dup.current_status || principal.current_status,
              current_motive: dup.current_motive || principal.current_motive,
              current_contact_type: dup.current_contact_type || principal.current_contact_type,
              client_category: dup.client_category || principal.client_category,
              promise_date: dup.promise_date || principal.promise_date,
              last_contact_date: dup.last_contact_date || principal.last_contact_date,
              last_note: dup.last_note || principal.last_note,
              protest_requested_by: dup.protest_requested_by || principal.protest_requested_by,
              workflow_status: (dup.workflow_status && !["normal",""].includes(dup.workflow_status)) ? dup.workflow_status : principal.workflow_status,
              contact_count: Math.max(Number(dup.contact_count || 0), Number(principal.contact_count || 0)),
              updated_by: `Limpeza ${hojeISO}`,
            }});
          }
          toInativar.push({ id: dup.id, principalId: principal.id, payload: {
            active: false,
            current_motive: `Duplicata inativada ${hojeISO} — principal: ${principal.id}`,
            workflow_status: "duplicata",
            updated_by: `Limpeza ${hojeISO}`,
          }});
        }
      }

      const alvosMigracao = new Set(toMigrar.map(({ targetId }) => targetId));
      const invalidosMigrados = new Set(invalidosSemDados.filter((r) => alvosMigracao.has(r.id)).map((r) => r.id));
      const invalidosToInativar = invalidosSemDados.filter((r) => !alvosMigracao.has(r.id)).map((r) => ({ id: r.id, payload: {
        active: false,
        current_motive: `Cliente inválido inativado ${hojeISO}`,
        workflow_status: "saneamento_automatico",
        updated_by: `Limpeza ${hojeISO}`,
      }}));
      const invalidosToInativarIds = new Set(invalidosToInativar.map(({ id }) => id));
      const invalidosComDadosIds = new Set(invalidosComDados.map((r) => r.id));
      const duplicatasToInativar = toInativar.filter(({ id, principalId }) =>
        !invalidosToInativarIds.has(id) &&
        !invalidosComDadosIds.has(id) &&
        !invalidosToInativarIds.has(principalId)
      );
      const invalidosPreservados = invalidosComDados.length + invalidosMigrados.size;

      if (duplicatasToInativar.length === 0 && invalidosToInativar.length === 0) {
        setCleanupMsg(`✅ Limpeza finalizada: ${preservadosManuais} duplicatas e ${invalidosPreservados} clientes inválidos preservados por dados manuais | ${conflitos} conflitos. ⏱${((performance.now() - tTotal) / 1000).toFixed(1)}s`);
        return;
      }

      const LOTE = 15;
      if (toMigrar.length > 0) {
        setCleanupMsg(`🔄 Migrando dados de ${toMigrar.length} registros...`);
        await yieldUI();
        for (let i = 0; i < toMigrar.length; i += LOTE) {
          await Promise.all(toMigrar.slice(i, i + LOTE).map(({ targetId, payload }) => base44.entities.Titulo.update(targetId, payload)));
          await yieldUI();
        }
      }

      const totalLotes = Math.ceil(duplicatasToInativar.length / LOTE);
      for (let i = 0; i < duplicatasToInativar.length; i += LOTE) {
        const loteNum = Math.floor(i / LOTE) + 1;
        setCleanupMsg(`⏳ Inativando duplicatas — lote ${loteNum}/${totalLotes}...`);
        await Promise.all(duplicatasToInativar.slice(i, i + LOTE).map(({ id, payload }) => base44.entities.Titulo.update(id, payload)));
        await yieldUI();
      }

      const totalLotesInvalidos = Math.ceil(invalidosToInativar.length / LOTE);
      for (let i = 0; i < invalidosToInativar.length; i += LOTE) {
        const loteNum = Math.floor(i / LOTE) + 1;
        setCleanupMsg(`⏳ Saneando clientes inválidos — lote ${loteNum}/${totalLotesInvalidos}...`);
        await Promise.all(invalidosToInativar.slice(i, i + LOTE).map(({ id, payload }) => base44.entities.Titulo.update(id, payload)));
        await yieldUI();
      }

      try {
        await base44.entities.ImportLog.create({
          file_name: `limpeza_bd_${hojeISO}`,
          source: "LIMPEZA_BD",
          total_read: totalFisico,
          inserted_count: 0,
          updated_count: toMigrar.length,
          deactivated_count: duplicatasToInativar.length + invalidosToInativar.length,
        });
      } catch (logErr) {
        console.warn("Não foi possível registrar ImportLog da limpeza:", logErr);
      }

      const elapsed = ((performance.now() - tTotal) / 1000).toFixed(1);
      setCleanupMsg(`✅ Limpeza concluída — ${duplicatasToInativar.length} duplicatas inativadas | ${invalidosToInativar.length} clientes inválidos inativados | ${preservadosManuais} duplicatas preservadas por dados manuais | ${invalidosPreservados} clientes inválidos preservados | ${conflitos} conflitos | ⏱${elapsed}s`);
      await loadData();
    } catch (err) {
      console.error("Erro no Limpar BD:", err);
      setCleanupMsg(`❌ Erro na limpeza: ${err.message}`);
    }
  }

  async function syncImport(source, imported, fileName, onProgress = () => {}) {
    const T = { t0: Date.now() };
    const lap = (k) => { T[k] = ((Date.now() - T.t0) / 1000).toFixed(2); };

    onProgress(`🔍 Deduplicando ${imported.length} registros do arquivo...`);
    await yieldUI();
    const fileMap = new Map();
    for (const item of imported) {
      const k = getTituloKey(item);
      if (!fileMap.has(k)) { fileMap.set(k, item); }
    }
    const deduped = Array.from(fileMap.values());
    const dupArquivo = imported.length - deduped.length;
    lap("dedup");

    onProgress(`📥 Consultando banco de dados (origem: ${source})...`);
    await yieldUI();
    const existingAllRaw = await base44.entities.Titulo.filter({ source }, "client_name", 10000);
    const existingAll = (existingAllRaw || []).filter((r) => String(r.source || "") === source);
    lap("fetch");

    const isPagoImportacaoDb = (r) => (
      r.workflow_status === "pago_importacao" ||
      (r.current_status === "Pago Aguard. Baixa" && String(r.updated_by || "").includes("Importa"))
    );

    const manualScore = (r) => {
      const pagoImportacao = isPagoImportacaoDb(r);
      const valorAberto = Number(r.open_value ?? r.original_value ?? 0);
      return (
        (!pagoImportacao && r.active && valorAberto > 0 ? 100 : 0) -
        (pagoImportacao ? 100 : 0) +
        [
          r.current_status && r.current_status !== "Não Contatado",
          r.last_note, r.promise_date, r.last_contact_date,
          r.workflow_status && r.workflow_status !== "normal",
          r.client_category, Number(r.contact_count) > 0
        ].filter(Boolean).length
      );
    };

    const existMap = new Map();
    for (const r of existingAll || []) {
      const key = getTituloKey({ origem: r.source, nrCli: r.client_code, nomeCli: r.client_name, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });
      const prev = existMap.get(key);
      if (!prev) { existMap.set(key, r); continue; }
      const sc = manualScore(r), sp = manualScore(prev);
      const dc = r.updated_date || r.created_date || "";
      const dp = prev.updated_date || prev.created_date || "";
      if (sc > sp || (sc === sp && dc > dp)) existMap.set(key, r);
    }
    lap("map");
    onProgress(`🔎 Comparando ${deduped.length} registros com ${existMap.size} existentes...`);
    await yieldUI();

    const toCreate = [], toUpdate = [], skipped = [];

    for (const item of deduped) {
      const tKey = getTituloKey(item);
      const old = existMap.get(tKey);
      const valorOriginalImportado = Number(item.valorOriginal || 0);
      const valorRecebidoImportado = Number(item.valorRecebido || item.recebPrc || 0);
      const valorAbertoImportado = Number(item.valorEmAberto ?? item.valorTotalDebito ?? Math.max(0, valorOriginalImportado - valorRecebidoImportado));
      const saldoErpImportado = Number(item.saldoErp ?? valorAbertoImportado);

      const financeiro = {
        source: item.origem,
        client_code: item.nrCli || null,
        client_name: item.nomeCli,
        doc_type: item.tp || null,
        serie: item.ser || null,
        title_number: item.titulo,
        seq: item.seq || null,
        nf_servico: item.nfServico || null,
        issue_date: item.emissao || null,
        due_date: item.vencimento || null,
        original_value: valorOriginalImportado,
        received_value: valorRecebidoImportado,
        open_value: valorAbertoImportado,
        erp_balance: saldoErpImportado,
        partial_payment_detected: Boolean(item.partialPaymentDetected || valorRecebidoImportado > 0),
        portador: item.portador || null,
        client_group_key: item.clientGroupKey || item.client_group_key || null,
        primary_client_code: item.primaryClientCode || item.primary_client_code || item.nrCli || null,
        erp_client_codes: item.erpClientCodes || item.erp_client_codes || (item.nrCli ? [String(item.nrCli)] : []),
        record_origin: item.recordOrigin || item.record_origin || "ERP",
        active: true,
        import_file: fileName,
      };

      if (!old) {
        toCreate.push({
          ...financeiro,
          current_status: "Não Contatado",
          current_motive: null,
          current_contact_type: null,
          client_category: null,
          promise_date: null,
          last_contact_date: null,
          last_note: null,
          contact_count: 0,
          protest_requested_by: null,
          workflow_status: "normal",
          updated_by: "Importação",
        });
      } else {
        const reabrirPagoImportacao = isPagoImportacaoDb(old);
        const mudou = (
          String(old.client_code || "") !== String(financeiro.client_code || "") ||
          String(old.client_name || "") !== String(financeiro.client_name || "") ||
          String(old.due_date || "") !== String(financeiro.due_date || "") ||
          Math.abs(Number(old.original_value || 0) - financeiro.original_value) > 0.01 ||
          Math.abs(Number(old.received_value || 0) - financeiro.received_value) > 0.01 ||
          Math.abs(Number(old.open_value ?? old.original_value ?? 0) - financeiro.open_value) > 0.01 ||
          Math.abs(Number(old.erp_balance || 0) - financeiro.erp_balance) > 0.01 ||
          String(old.portador || "") !== String(financeiro.portador || "") ||
          String(old.doc_type || "") !== String(financeiro.doc_type || "") ||
          String(old.serie || "") !== String(financeiro.serie || "") ||
          String(old.client_group_key || "") !== String(financeiro.client_group_key || "") ||
          String(old.primary_client_code || "") !== String(financeiro.primary_client_code || "") ||
          JSON.stringify(old.erp_client_codes || []) !== JSON.stringify(financeiro.erp_client_codes || []) ||
          String(old.record_origin || "") !== String(financeiro.record_origin || "") ||
          !old.active ||
          reabrirPagoImportacao
        );

        if (!mudou) {
          skipped.push(tKey);
        } else {
          toUpdate.push({
            dbId: old.id,
            payload: {
              ...financeiro,
              current_status: reabrirPagoImportacao ? "Não Contatado" : (old.current_status || "Não Contatado"),
              current_motive: reabrirPagoImportacao ? null : (old.current_motive || null),
              current_contact_type: old.current_contact_type || null,
              client_category: old.client_category || null,
              promise_date: old.promise_date || null,
              last_contact_date: old.last_contact_date || null,
              last_note: old.last_note || null,
              contact_count: Number(old.contact_count || 0),
              protest_requested_by: old.protest_requested_by || null,
              workflow_status: reabrirPagoImportacao ? "normal" : (old.workflow_status || "normal"),
              updated_by: "Importação",
            }
          });
        }
      }
    }
    lap("compare");
    onProgress(`📊 Resultado: ${toCreate.length} novos | ${toUpdate.length} a atualizar | ${skipped.length} sem alteração`);
    await yieldUI();

    let ins = 0;
    const BULK = 50;
    const totalCrLotes = Math.ceil(toCreate.length / BULK);
    for (let i = 0; i < toCreate.length; i += BULK) {
      onProgress(`💾 Criando novos — lote ${Math.floor(i/BULK)+1}/${totalCrLotes}...`);
      await base44.entities.Titulo.bulkCreate(toCreate.slice(i, i + BULK));
      ins += Math.min(BULK, toCreate.length - i);
      await yieldUI();
    }
    lap("creates");

    let upd = 0;
    const CONCUR = 15;
    const totalUpdLotes = Math.ceil(toUpdate.length / CONCUR);
    for (let i = 0; i < toUpdate.length; i += CONCUR) {
      onProgress(`🔄 Atualizando — lote ${Math.floor(i/CONCUR)+1}/${totalUpdLotes}...`);
      await Promise.all(toUpdate.slice(i, i + CONCUR).map((u) => base44.entities.Titulo.update(u.dbId, u.payload)));
      upd += Math.min(CONCUR, toUpdate.length - i);
      await yieldUI();
    }
    lap("updates");

    // ── 7. Baixa automática ──
    // Este fluxo legado importa relatórios isolados. Não marca ausências como pagas aqui,
    // pois isso pode esvaziar a Carteira Geral quando a planilha é parcial ou de outra origem.
    let deact = 0, baixados = 0, valorBaixado = 0;
    const isCarteirCompleta = existMap.size === 0 || deduped.length >= existMap.size;
    const baixaAutomaticaBloqueada = true;
    lap("baixa");

    // ── 8. Cruzar carteiras: clientes que só existem em UMA origem → "sem_carteira" ──
    // Se importando EB: buscar clientes do EB que não têm nenhum título TOPCON (FINR1253)
    // Se importando TOPCON: buscar clientes do TOPCON que não têm nenhum título EB (RPT_7007)
    // Resultado: aparecem na aba Impacto no Caixa com badge "Sem Carteira" para revisão
    try {
      const outraOrigem = source === "FINR1253" ? "RPT_7007_CONS_CAR_EB" : "FINR1253";
      onProgress(`🔀 Cruzando carteiras — buscando títulos da origem ${outraOrigem === "FINR1253" ? "TOPCON" : "EB"}...`);
      await yieldUI();
      const outraCarteira = await base44.entities.Titulo.filter({ source: outraOrigem, active: true }, "client_name", 5000);

      // Normalizar nome para match robusto (sem acento, sem pontuação, maiúsculo)
      function normNomeCross(v) {
        return String(v || "").toUpperCase().normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Z0-9]/g, " ")
          .replace(/\s+/g, " ").trim();
      }
      function normCodCross(v) {
        return String(v || "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1");
      }

      // Monta set de chaves da outra carteira (código + nome normalizado)
      const outraKeys = new Set();
      for (const r of outraCarteira || []) {
        const cod = normCodCross(r.client_code);
        const nome = normNomeCross(r.client_name);
        if (cod) outraKeys.add(`COD:${cod}`);
        if (nome.length >= 3) outraKeys.add(`NOME:${nome}`);
      }

      // Títulos desta importação que não têm correspondente na outra carteira
      const semCarteira = (existingAll || []).filter((r) => {
        // Só processa registros ativos que não são já pago_importacao ou sem_carteira
        if (!r.active) return false;
        if (r.workflow_status === "pago_importacao" || r.workflow_status === "sem_carteira") return false;
        const cod = normCodCross(r.client_code);
        const nome = normNomeCross(r.client_name);
        const temCod = cod && outraKeys.has(`COD:${cod}`);
        const temNome = nome.length >= 3 && outraKeys.has(`NOME:${nome}`);
        // Se cliente inválido (sem nome e sem código numérico), não marcar
        if (!cod && nome.length < 3) return false;
        // Sem correspondente na outra carteira → candidato a "sem_carteira"
        return !temCod && !temNome;
      });

      if (semCarteira.length > 0) {
        onProgress(`⚠️ ${semCarteira.length} título(s) sem carteira correspondente — marcando...`);
        const SC_BATCH = 20;
        for (let i = 0; i < semCarteira.length; i += SC_BATCH) {
          await Promise.all(semCarteira.slice(i, i + SC_BATCH).map((r) =>
            base44.entities.Titulo.update(r.id, {
              workflow_status: "sem_carteira",
              current_motive: `Cliente sem carteira correspondente (${outraOrigem === "FINR1253" ? "TOPCON" : "EB"} não possui este cliente)`,
              updated_by: "Cruzamento Automático"
            })
          ));
          await yieldUI();
        }
        console.info(`🔀 Cruzamento: ${semCarteira.length} títulos marcados como "sem_carteira"`);
      }
    } catch (crossErr) {
      console.warn("Cruzamento de carteiras falhou (não crítico):", crossErr.message);
    }
    lap("cross");

    await base44.entities.ImportLog.create({
      file_name: fileName, source, total_read: imported.length,
      inserted_count: ins, updated_count: upd, deactivated_count: deact
    });

    const elapsed = ((Date.now() - T.t0) / 1000).toFixed(1);
    return { ins, upd, deact, baixados, valorBaixado, isCarteirCompleta, baixaAutomaticaBloqueada, elapsed, skipped: skipped.length, dupArquivo };
  }

  async function prepararPlanoNovaImportacao(preview, importFile) {
    const existingTitles = await base44.entities.Titulo.list("-updated_date", 5000);
    return buildImportApplicationPlan({ preview, existingTitles, importFile });
  }

  async function aplicarNovaImportacao(plan, preview, importFile) {
    if (!plan?.canApply) throw new Error("O plano de aplicação não possui registros consolidados.");
    const currentTitles = await base44.entities.Titulo.list("-updated_date", 5000);
    const revalidatedPlan = assertApplicationPlanStillCurrent(
      plan,
      buildImportApplicationPlan({ preview, existingTitles: currentTitles, importFile }),
    );
    if (revalidatedPlan.safety?.importacaoParcial && revalidatedPlan.absences.length > 0) {
      throw new Error("Plano parcial inválido: a baixa automática deve permanecer bloqueada.");
    }

    setIsImporting(true);
    importingRef.current = true;
    let writeStarted = false;
    try {
      const CREATE_BATCH = 50;
      for (let i = 0; i < revalidatedPlan.creates.length; i += CREATE_BATCH) {
        writeStarted = true;
        await base44.entities.Titulo.bulkCreate(revalidatedPlan.creates.slice(i, i + CREATE_BATCH).map((item) => item.payload));
        await yieldUI();
      }

      const updates = [...revalidatedPlan.updates, ...revalidatedPlan.absences];
      const UPDATE_BATCH = 15;
      for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
        writeStarted = true;
        await Promise.all(updates.slice(i, i + UPDATE_BATCH).map((item) =>
          base44.entities.Titulo.update(item.id, item.payload),
        ));
        await yieldUI();
      }

      const result = {
        created: revalidatedPlan.creates.length,
        updated: revalidatedPlan.updates.length,
        lowered: revalidatedPlan.absences.length,
      };
      setImportStatus({
        ok: true,
        msg: `✅ Nova importação aplicada — ${result.created} criado(s), ${result.updated} atualizado(s), ${result.lowered} baixado(s) por ausência.`,
      });
      await loadData();
      return result;
    } catch (error) {
      if (writeStarted) throw new Error(PARTIAL_APPLICATION_FAILURE_MESSAGE, { cause: error });
      throw error;
    } finally {
      importingRef.current = false;
      setIsImporting(false);
    }
  }

  async function importarArquivo(e) {
    if (isImporting) return;
    const file = e.target.files?.[0]; if (!file) return;
    const nomeArq = file.name.toLowerCase(); const tipoMime = file.type.toLowerCase();
    const extensoesValidas = [".csv", ".xlsx", ".xls"];
    const mimeValidos = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!extensoesValidas.some((ext) => nomeArq.endsWith(ext)) && !mimeValidos.some((m) => tipoMime.includes(m)) && tipoMime !== "") {
      setImportStatus({ ok: false, msg: "❌ Formato não permitido. Envie CSV, XLSX ou XLS." }); e.target.value = ""; return;
    }
    setImportStatus(null); setIsImporting(true);
    importingRef.current = true;
    const t0 = Date.now();
    const t0perf = performance.now();
    setSyncMsg("⏳ Lendo arquivo...");
    const setStep = (msg) => { setSyncMsg(`⏳ ${msg}`); };
    try {
      setStep("Lendo arquivo...");
      const buf = await file.arrayBuffer();
      const isCsv = nomeArq.endsWith(".csv");
      const wb = isCsv ? XLSX.read(buf, { type: "array", FS: ";" }) : XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const cleanRows = rawRows.map((r) => { const out = {}; for (const [k, v] of Object.entries(r)) out[k.replace(/^\uFEFF/, "").trim()] = v; return out; });
      setStep(`Tratando ${rawRows.length} linhas...`);
      await yieldUI();

      if (isCobrCsv(cleanRows)) {
        const evtsBatch = [], updBatch = [];
        let naoEncontrados = 0;
        for (const row of cleanRows) {
          const nrCli = String(row["Nº"] || row["Nr"] || row["N"] || "").trim();
          const nomeCli = String(row["Cliente"] || "").trim();
          if (!nomeCli) continue;
          const statusNovo = String(row["Status"] || "").trim() || "Em Cobrança";
          const encaminhar = String(row["Encaminhar"] || "").trim().toLowerCase();
          const promessa = String(row["Promessa"] || "").trim();
          const obs = String(row["Observação"] || row["Observacao"] || "").trim();
          const cands = records.filter((r2) => (nrCli && String(r2.nrCli).trim() === nrCli) || normText(r2.nomeCli) === normText(nomeCli));
          if (!cands.length) { naoEncontrados++; continue; }
          for (const item of cands) {
            evtsBatch.push({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: "COBRANCA", event_date: hojeISO, status: statusNovo, motive: encaminhar || null, contact_type: null, promise_date: dateISO(promessa) || null, note: obs || null, event_user: "Importação CSV" });
            if (item._dbId) updBatch.push({ id: item._dbId, data: { current_status: statusNovo, current_motive: encaminhar || null, promise_date: dateISO(promessa) || null, last_contact_date: hojeISO, last_note: obs || null, contact_count: (item.qtd || 0) + 1, workflow_status: encaminhar || "normal", updated_by: "Importação CSV" } });
          }
        }
        setStep("Salvando eventos...");
        for (let i = 0; i < evtsBatch.length; i += 20) { await Promise.all(evtsBatch.slice(i, i+20).map((ev) => base44.entities.ChargeEvent.create(ev))); await yieldUI(); }
        for (let i = 0; i < updBatch.length; i += 8) { await Promise.all(updBatch.slice(i, i+8).map((u) => base44.entities.Titulo.update(u.id, u.data))); await yieldUI(); }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        setImportStatus({ ok: true, msg: `✅ CSV Cobrados: ${evtsBatch.length} eventos${naoEncontrados > 0 ? `, ${naoEncontrados} não encontrados` : ""} — ⏱ ${elapsed}s` });
        e.target.value = ""; await loadData(); return;
      }

      if (isCobrDia(cleanRows.length ? cleanRows : rawRows)) {
        const uniq = uniqCobr(cleanRows.length ? cleanRows : rawRows);
        const evtsBatch = [], updBatch = [];
        let naoEnc = 0;
        for (const row of uniq) {
          const nomeN = normText(pick(row, ["Cliente"]) || "");
          const nrCliRow = String(pick(row, ["N", "Nº", "Nr", "N°"]) || "").replace(/\./g, "").trim();
          const statusNovo2 = String(pick(row, ["Status"]) || "").trim() || "Em Cobrança";
          const motivoNovo = String(pick(row, ["Motivo"]) || "").trim();
          const tipoNovo = String(pick(row, ["Tipo de Contato"]) || "").trim();
          const dtCont = dateISO(pick(row, ["Data do Contato"]) || "") || hojeISO;
          const dtProm = dateISO(pick(row, ["Data da Promessa"]) || "");
          const obsNova = String(pick(row, ["Observação", "Observacao"]) || "").trim();
          const cands = records.filter((i) => (nrCliRow && String(i.nrCli).replace(/\./g, "").trim() === nrCliRow) || (nomeN && normText(i.nomeCli) === nomeN));
          if (!cands.length) { naoEnc++; continue; }
          for (const item of cands) {
            evtsBatch.push({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: "COBRANCA", event_date: dtCont, status: statusNovo2, motive: motivoNovo || null, contact_type: tipoNovo || null, promise_date: dtProm || null, note: obsNova || null, event_user: "Importação" });
            if (item._dbId) updBatch.push({ id: item._dbId, data: { current_status: statusNovo2, current_motive: motivoNovo || null, current_contact_type: tipoNovo || null, promise_date: dtProm || null, last_contact_date: dtCont, last_note: obsNova || null, contact_count: (item.qtd || 0) + 1, updated_by: "Importação" } });
          }
        }
        setStep("Salvando cobrança do dia...");
        for (let i = 0; i < evtsBatch.length; i += 20) { await Promise.all(evtsBatch.slice(i, i+20).map((ev) => base44.entities.ChargeEvent.create(ev))); await yieldUI(); }
        for (let i = 0; i < updBatch.length; i += 8) { await Promise.all(updBatch.slice(i, i+8).map((u) => base44.entities.Titulo.update(u.id, u.data))); await yieldUI(); }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        setImportStatus({ ok: true, msg: `✅ Cobrança do dia: ${uniq.length} clientes, ${evtsBatch.length} eventos${naoEnc > 0 ? `, ${naoEnc} não encontrados` : ""} — ⏱ ${elapsed}s` });
      } else {
        const source = detectSrc(file.name);
        setStep(`Processando ${source === "FINR1253" ? "FINR1253 (Topcon)" : "RPT_7007 (EB)"}...`);
        await yieldUI();
        const imported = source === "FINR1253"
          ? parseRows1253(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }))
          : parseRows7007(cleanRows);
        if (imported.length === 0) {
          const hint = source !== "FINR1253" ? " Verifique o console para diagnóstico dos campos detectados." : "";
          setImportStatus({ ok: false, msg: `❌ Nenhum título válido em "${file.name}".${hint}` });
          e.target.value = ""; setIsImporting(false); return;
        }
        setStep(`${imported.length} títulos válidos. Iniciando gravação...`);
        await yieldUI();
        const r = await syncImport(source, imported, file.name, setStep);
        const elapsed = r.elapsed;
        const baixaMsg = r.baixados > 0 ? ` | ${r.baixados} marcados como pagos → Impacto no Caixa (${fmtM(r.valorBaixado)})` : "";
        const ignoradosMsg = r.skipped > 0 ? ` | ${r.skipped} ignorados (sem alteração)` : "";
        const dupArqMsg = r.dupArquivo > 0 ? ` | ${r.dupArquivo} dup. do arquivo ignoradas` : "";
        const parcialMsg = !r.isCarteirCompleta ? " ⚠️ Parcial: baixa automática desabilitada." : "";
        const baixaBloqueadaMsg = r.baixaAutomaticaBloqueada ? " | baixa automática não aplicada" : "";
        const sourceLabel = source === "FINR1253" ? "Topcon" : "EB";
        const criadosMsg = r.ins > 0 ? ` | ${r.ins} ${sourceLabel} criados e disponíveis na Carteira Geral` : "";
        setFiltroOrigem("");
        setFCart({});
        setBuscaCliente("");
        setBuscaTitulo("");
        setFiltroCategoria("");
        setFaixaAtraso(0);
        setKpiFilter(null);
        setImportStatus({ ok: true, msg: `✅ "${file.name}" [${sourceLabel}] — ${rawRows.length} linhas | ${imported.length} válidos | ${r.ins} novos | ${r.upd} atualizados${criadosMsg}${ignoradosMsg}${dupArqMsg}${baixaMsg}${parcialMsg}${baixaBloqueadaMsg} — ⏱ ${elapsed}s` });
      }
      e.target.value = "";
      setSyncMsg("⏳ Importação concluída. Atualizando carteira...");
      await loadData();
    } catch (err) {
      console.error("Erro na importação:", err);
      e.target.value = "";
      setImportStatus({ ok: false, msg: `❌ Erro: ${err.message}` });
    } finally {
      importingRef.current = false;
      setIsImporting(false);
    }
  }

  function encBadge(enc) { if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />; if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />; return <span style={{ color: t.muted, fontSize: 11 }}>—</span>; }

  return (
    <ErrorBoundary>
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: t.bg, minHeight: "100vh", color: t.txt }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={importarArquivo} />
      <header style={{ background: t.head, borderBottom: `1px solid ${t.bor}`, padding: "0 20px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: t.shad }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 4, color: t.txt }}>SISTEMA DE COBRANÇA</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setIsDark((x) => !x)} style={{ background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{isDark ? "☀️" : "🌙"}</button>
          <Btn t={t} sm onClick={() => setEmailModal(true)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>📧 Enviar PDF</Btn>
          <Btn t={t} sm onClick={() => exportarPDFExecutivo({ grouped, filteredCart: sortedCart, dash, faixaAtraso, filtroOrigem, hojeISO })} style={{ background: "#0369a1", border: "none", color: "#fff" }}>📊 Baixar Relatório</Btn>
          <Btn t={t} sm onClick={() => fileRef.current?.click()} disabled={isImporting} style={{ background: isImporting ? "#ccc" : t.p, border: "none", color: isImporting ? "#999" : "#fff", cursor: isImporting ? "not-allowed" : "pointer" }}>⬆️ {isImporting ? "Importando..." : "Importar"}</Btn>
        </div>
      </header>
      <main style={{ padding: "14px 16px", maxWidth: "100%", margin: "0 auto" }}>
        {importStatus && <div style={{ background: importStatus.ok ? isDark ? "#052e16" : "#f0fdf4" : isDark ? "#2d0a0a" : "#fef2f2", border: `1px solid ${importStatus.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: importStatus.ok ? "#16a34a" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{importStatus.msg}</span><button onClick={() => setImportStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button></div>}
        {cleanupMsg && <div style={{ background: isDark ? "#0c1a2e" : "#eff6ff", border: "1px solid #3b82f6", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{cleanupMsg}</span><button onClick={() => setCleanupMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button></div>}
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>{loading && !isImporting ? "⏳ Carregando..." : syncMsg}</div>
        <ImportPreviewPanel
          totalAtivosAnteriores={records.length}
          onPreparePlan={prepararPlanoNovaImportacao}
          onApplyPlan={aplicarNovaImportacao}
          t={t}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 8, paddingTop: 8, scrollbarWidth: "thin", WebkitOverflowScrolling: "touch", alignItems: "stretch", justifyContent: "flex-start", borderBottom: `1px solid ${t.bor}` }} className="bg-transparent">
          <TabBtn t={t} active={activeTab === "carteira"} onClick={() => setActiveTab("carteira")} badge={dash.devolvidos} badgeColor="#10b981">📋 Carteira Geral</TabBtn>
          <TabBtn t={t} active={activeTab === "cobrados"} onClick={() => setActiveTab("cobrados")}>✅ Histórico / Promessas</TabBtn>
          <TabBtn t={t} active={activeTab === "verificacao"} onClick={() => setActiveTab("verificacao")} badge={dash.pendVerif} badgeColor="#3b82f6">🔍 Conferência de Pagamento</TabBtn>
          <TabBtn t={t} active={activeTab === "protesto"} onClick={() => setActiveTab("protesto")} badge={dash.pendProt} badgeColor="#ef4444">⚖️ Aprovação do Gestor</TabBtn>
          <TabBtn t={t} active={activeTab === "produtividade"} onClick={() => setActiveTab("produtividade")}>👥 Produtividade / Metas</TabBtn>
          <TabBtn t={t} active={activeTab === "fluxo"} onClick={() => setActiveTab("fluxo")}>📈 Impacto no Caixa</TabBtn>
        </div>
        {activeTab === "carteira" && <><div className="kpi-container kpi-container-8"><KPI t={t} label="Total em Aberto" color="#F59E0B" value={fmtM(dash.vTot)} sub="com multa/juros" /><KPI t={t} label="A Cobrar" color="#EF4444" value={fmtM(dash.aCobrar)} sub="sem contato" onClick={() => setKpiFilter((p) => p === "aCobrar" ? null : "aCobrar")} active={kpiFilter === "aCobrar"} /><KPI t={t} label="Cobrado" color="#10B981" value={fmtM(dash.cobrado)} sub="já contactados" onClick={() => setKpiFilter((p) => p === "cobrado" ? null : "cobrado")} active={kpiFilter === "cobrado"} /><KPI t={t} label="Cobrados Hoje" color="#FBBF24" value={dash.cobHoje} sub={`${dash.perc.toFixed(1).replace(".", ",")}% do total`} onClick={() => setKpiFilter((p) => p === "cobHoje" ? null : "cobHoje")} active={kpiFilter === "cobHoje"} /><KPI t={t} label="Faltam Cobrar" color="#EF4444" value={dash.faltando} sub="sem contato hoje" onClick={() => setKpiFilter((p) => p === "faltando" ? null : "faltando")} active={kpiFilter === "faltando"} /><KPI t={t} label="Nº Clientes" color="#6B7280" value={dash.numCli} sub="ativos" /><KPI t={t} label="Nº Títulos" color="#6B7280" value={dash.numTit} sub="ativos" /><KPI t={t} label="Val. Original" color="#10B981" value={fmtM(dash.vOrig)} sub="sem multa/juros" /></div>{kpiFilter && <div style={{ textAlign: "center", marginBottom: 12 }}><button onClick={() => setKpiFilter(null)} style={{ background: t.p, border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>✕ Limpar Filtro</button></div>}</>}
        {activeTab === "verificacao" && <div className="kpi-container kpi-container-2"><KPI t={t} label="Pendentes de Verificação" color="#3B82F6" value={verifLista.length} sub="aguardando resposta" /><KPI t={t} label="Valor em Verificação" color="#3B82F6" value={fmtM(verifLista.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total a validar" /></div>}
        {activeTab === "protesto" && <div className="kpi-container kpi-container-2"><KPI t={t} label="Pendentes de Aprovação" color="#EF4444" value={protestoLista.length} sub="aguardando gestor" /><KPI t={t} label="Valor em Protesto" color="#EF4444" value={fmtM(protestoLista.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total a autorizar" /></div>}
        {(activeTab === "carteira" || activeTab === "verificacao" || activeTab === "protesto") && <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}><FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} /><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Categoria:</span><select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todas</option><option value="Portador">Portador</option><option value="Imobiliário">Imobiliário</option><option value="Parceiros">Parceiros</option><option value="Bancos">Bancos</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span><select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todos</option><option value="FINR1253">Topcon (FINR1253)</option><option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>📄 Título:</span><input type="text" placeholder="Buscar por nº ou nome..." value={buscaTitulo} onChange={(e) => setBuscaTitulo(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaTitulo && <button onClick={() => setBuscaTitulo("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span><input type="text" placeholder="Buscar por nome ou nº..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaCliente && <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div>{activeTab === "carteira" && <div style={{ display: "flex", gap: 8, alignItems: "center" }}><div style={{ position: "relative" }}><button onClick={() => setShowColMenu((x) => !x)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>☰ Colunas {hiddenCols.size > 0 ? `(${hiddenCols.size} ocultas)` : ""}</button>{showColMenu && <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "8px", zIndex: 300, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{[{ key: "nrCli", label: "Nº" }, { key: "nomeCli", label: "CLIENTE" }, { key: "qtd", label: "QTD." }, { key: "venc", label: "VENCIMENTO" }, { key: "atraso", label: "ATRASO" }, { key: "vOrig", label: "VAL. ORIG" }, { key: "multa", label: "MULTA" }, { key: "juros", label: "JUROS" }, { key: "total", label: "TOTAL" }, { key: "status", label: "STATUS" }, { key: "enc", label: "ENCAMINHAR" }, { key: "origem", label: "ORIG." }, { key: "contato", label: "DT. CONTATO" }, { key: "prom", label: "PROMESSA" }, { key: "sugest", label: "SUGESTÃO" }, { key: "obs", label: "OBSERVAÇÃO" }].map((c) => <label key={c.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, background: hiddenCols.has(c.key) ? t.surf2 : "transparent" }}><input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => setHiddenCols((p) => { const n = new Set(p); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} style={{ accentColor: t.p }} />{c.label}</label>)}<button onClick={() => { setHiddenCols(new Set()); setShowColMenu(false); }} style={{ gridColumn: "1/-1", marginTop: 4, background: t.p, color: "#fff", border: "none", borderRadius: 4, padding: "4px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Mostrar Todas</button></div>}</div></div>}</div>}
        {activeTab === "carteira" && <div>{selected.size > 0 && <div style={{ background: t.p, borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{selected.size} selecionado(s)</span><button onClick={() => { setBatchForm(emptyForm()); setBatchModal(true); }} style={{ background: "#fff", color: t.p, border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏️ Cobrança em Lote</button>{selGroups.length === 1 && <button onClick={() => setNegModal(selGroups[0])} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🤝 Negociar</button>}<Btn t={t} ghost sm onClick={() => setSelected(new Set())} style={{ color: "#fff", borderColor: "#fff" }}>✕ Deselecionar</Btn></div>}<TabelaCarteira sortedCart={sortedCart} baseCart={baseCart} fCart={fCart} setFCart={setFCart} selected={selected} toggleSel={toggleSel} toggleAll={toggleAll} scCart={scCart} handleSort={handleSort} setModal={setModal} setForm={setForm} setHistModal={setHistModal} openCli={openCli} setOpenCli={setOpenCli} emptyForm={emptyForm} isDark={isDark} t={t} makeColData={makeColData} fieldVal={fieldVal} applyExcelFilter={applyExcelFilter} setNegModal={setNegModal} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} filtroOrigem={filtroOrigem} onClickFilter={(val) => setBuscaCliente(val)} onEncaminharSugestao={async (g, enc) => { for (const item of g.titulos) { await base44.entities.ChargeEvent.create({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: "COBRANCA", event_subtype: enc, event_date: hojeISO, status: g.statusConsolidado || "Em Cobrança", motive: enc, event_user: "Sistema" }); if (item._dbId) await base44.entities.Titulo.update(item._dbId, { workflow_status: enc, updated_by: "Sistema" }); } setSyncMsg(`✅ ${g.nomeCli} encaminhado para ${enc === "protesto" ? "Protesto" : enc === "verificacao" ? "Verificação" : enc}.`); await loadData(); }} /></div>}
        {activeTab === "cobrados" && <><div style={{ display: "flex", gap: 6, marginBottom: 12 }}><button onClick={() => setSubTabCobr("historico")} style={{ background: subTabCobr === "historico" ? t.p : t.surf2, color: subTabCobr === "historico" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "historico" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✅ Histórico de Cobrança</button><button onClick={() => setSubTabCobr("promessas")} style={{ background: subTabCobr === "promessas" ? t.p : t.surf2, color: subTabCobr === "promessas" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "promessas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📅 Promessas & Calendário</button></div><div className="kpi-container kpi-container-6"><KPI t={t} label="Total Cobrados" color="#10B981" value={cobrados.length} sub="clientes contactados" /><KPI t={t} label="Valor Cobrado" color="#10B981" value={fmtM(cobrados.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total em aberto" /><KPI t={t} label="Com Promessa" color="#FBBF24" value={cobrados.filter((g) => g.dataPromessa).length} sub="clientes com data" /><KPI t={t} label="Prometeu Pagar" color="#A78BFA" value={cobrados.filter((g) => g.statusConsolidado === "Prometeu Pagar" || g.statusConsolidado === "Promessa ativa").length} sub="status atual" /><KPI t={t} label="Pago Aguard. Baixa" color="#3B82F6" value={cobrados.filter((g) => g.statusConsolidado === "Pago Aguard. Baixa" || g.statusConsolidado === "Pago aguardando baixa").length} sub="aguardando baixa" /><KPI t={t} label="Sem Retorno" color="#EF4444" value={cobrados.filter((g) => g.statusConsolidado === "Sem Retorno").length} sub="sem resposta" /></div><div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}><FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} /><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span><select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}><option value="">Todos</option><option value="FINR1253">Topcon (FINR1253)</option><option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option></select></div><div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}><span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span><input type="text" placeholder="Buscar por nome ou nº..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />{buscaCliente && <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}</div></div>{subTabCobr === "historico" && <TabelaCobrados data={cobrados} events={events} t={t} setHistModal={setHistModal} dlCsv={dlCsv} />}{subTabCobr === "promessas" && <MonitorPromessas grouped={groupedFiltrado} events={events} t={t} />}</>}
        {activeTab === "verificacao" && <TabelaVerificacao data={verifLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />}
        {activeTab === "protesto" && <TabelaProtesto data={protestoLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />}
        {activeTab === "produtividade" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="kpi-container kpi-container-4"><KPI t={t} label="Total de Contatos" color="#3B82F6" value={events.filter((e) => e.event_type === "COBRANCA").length} sub="no período" /><KPI t={t} label="Promessas Obtidas" color="#FBBF24" value={events.filter((e) => e.status === "Prometeu Pagar" || e.status === "Promessa ativa").length} sub="confirmadas" /><KPI t={t} label="Pagamentos Confirmados" color="#10B981" value={events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Pagamento confirmado").length} sub="verificados" /><KPI t={t} label="Taxa de Sucesso" color="#A78BFA" value={`${events.length > 0 ? (events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Prometeu Pagar" || e.status === "Promessa ativa" || e.status === "Pagamento confirmado").length / events.length * 100).toFixed(1) : 0}%`} sub="conversão" /></div><div style={{ display: "flex", gap: 6 }}><button onClick={() => setSubTabProd("produtividade")} style={{ background: subTabProd === "produtividade" ? t.p : t.surf2, color: subTabProd === "produtividade" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "produtividade" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>👤 Produtividade por Usuário</button><button onClick={() => setSubTabProd("metas")} style={{ background: subTabProd === "metas" ? t.p : t.surf2, color: subTabProd === "metas" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "metas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🎯 Metas de Cobrança</button></div>{subTabProd === "produtividade" && <><PainelProdutividade events={events} t={t} /><div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "16px", boxShadow: t.shad }}><div style={{ fontSize: 14, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📊 Analytics & Exportação</div><AnalyticsDashboard grouped={grouped} events={events} t={t} /></div></>}{subTabProd === "metas" && <PainelMetas grouped={grouped} events={events} t={t} />}</div>}
        {activeTab === "fluxo" && <ImpactoCaixaTab grouped={grouped} baixadosImportacao={baixadosImportacao} events={events} t={t} isDark={isDark} />}
      </main>
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
