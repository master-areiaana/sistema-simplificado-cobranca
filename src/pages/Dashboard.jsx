import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import {
  hoje, hojeISO, fmtM, fmtD, normText, cliKey, buildItem, buildId, dbToItem,
  detectSrc, parseRows1253, parseRows7007, calcFin, dateISO, num, pick,
  dlCsv, openPrint, prioLabel, prioCor, sugestaoEncaminhamento, diffDias,
  getTituloKey, dedupeTitulos } from
"@/lib/cobranca";
import { DARK, LIGHT, loadL, saveL } from "@/lib/theme";
import { KPI, TabBtn, Badge, PrioBadge, PromBadge, ObsCell, Btn, SugestaoEncBadge } from "@/components/cobranca/UI";
import ColHeader from "@/components/cobranca/ColHeader";
import TabelaCarteira from "@/components/cobranca/TabelaCarteira";
import ModalCobranca from "@/components/cobranca/ModalCobranca";
import ModalResposta from "@/components/cobranca/ModalResposta";
import ModalHistorico from "@/components/cobranca/ModalHistorico";
import FaixaFilter from "@/components/cobranca/FaixaFilter";
import MonitorPromessas from "@/components/cobranca/MonitorPromessas";
import exportarPDFExecutivo from "@/components/cobranca/ExportPDF";
import PainelProdutividade from "@/components/cobranca/PainelProdutividade";
import ModalNegociacao from "@/components/cobranca/ModalNegociacao";
import PainelNotificacoes from "@/components/cobranca/PainelNotificacoes";
import PrevisaoFluxo from "@/components/cobranca/PrevisaoFluxo";
import AnalyticsDashboard from "@/components/cobranca/AnalyticsDashboard";
import PainelMetas from "@/components/cobranca/PainelMetas";
import ModalEnviarPDF from "@/components/cobranca/ModalEnviarPDF";
import TabelaCobrados from "@/components/cobranca/TabelaCobrados";
import TabelaVerificacao from "@/components/cobranca/TabelaVerificacao";
import TabelaProtesto from "@/components/cobranca/TabelaProtesto";

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
    const k = [normText(pick(r, ["Cliente"])), num(pick(r, ["Total"])), normText(pick(r, ["Status"])), normText(pick(r, ["Motivo"])), dateISO(pick(r, ["Data do Contato"]))].join("|");
    if (!normText(pick(r, ["Cliente"])) || seen.has(k)) return;
    seen.add(k); out.push(r);
  });
  return out;
}

function statusNorm(v) {
  return String(v || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isStatusBaixado(v) {
  const s = statusNorm(v);
  return ["BAIX", "PAGO", "RECEB", "LIQUID", "ENCERR", "DUPLIC"].some((x) => s.includes(x));
}

export default function Dashboard() {
  const fileRef = useRef(null);
  const [isDark, setIsDark] = useState(() => loadL(LOCAL_THEME, "dark") === "dark");
  const t = isDark ? DARK : LIGHT;

  const [records, setRecords] = useState([]);
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
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 3000),
        base44.entities.ChargeEvent.list("-created_date", 2000)
      ]);
      const t2 = performance.now();

      const tituloKeyMap = new Map();
      for (const r of titulos || []) {
        if (isStatusBaixado(r.current_status) || isStatusBaixado(r.workflow_status) || isStatusBaixado(r.current_motive)) continue;
        const key = getTituloKey({ origem: r.source, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });
        const prev = tituloKeyMap.get(key);
        if (!prev) { tituloKeyMap.set(key, r); continue; }
        const sc = (rec) => (
          (rec.current_status && rec.current_status !== "Não Contatado" ? 1 : 0) +
          (rec.last_note ? 1 : 0) + (rec.promise_date ? 1 : 0) +
          (rec.last_contact_date ? 1 : 0) +
          (rec.workflow_status && rec.workflow_status !== "normal" ? 1 : 0) +
          (rec.client_category ? 1 : 0) +
          (Number(rec.contact_count) > 0 ? 1 : 0)
        );
        const sr = sc(r), sp = sc(prev);
        const dc = r.updated_date || r.created_date || "";
        const dp = prev.updated_date || prev.created_date || "";
        if (sr > sp || (sr === sp && dc > dp)) tituloKeyMap.set(key, r);
      }
      const t3 = performance.now();

      const titulosFinais = Array.from(tituloKeyMap.values()).map((r) => dbToItem(r));
      const t4 = performance.now();
      setRecords(titulosFinais);
      setEvents(evts || []);

      const dupCount = (titulos || []).length - titulosFinais.length;
      const totalMs = (performance.now() - t0perf).toFixed(0);
      const fetchMs = (t2 - t1).toFixed(0);
      const dedupMs = (t3 - t2).toFixed(0);
      const convMs = (t4 - t3).toFixed(0);
      console.info(`⚡ loadData: total=${totalMs}ms | fetch=${fetchMs}ms | dedup=${dedupMs}ms | convert=${convMs}ms | ${titulosFinais.length} títulos${dupCount > 0 ? ` (${dupCount} dup/baixados ocultos)` : ""}`);
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${titulosFinais.length} títulos carregados${dupCount > 0 ? ` (${dupCount} duplicatas/baixados ocultos)` : ""} ⏱${totalMs}ms`);
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
      if (!out[keyFull]) out[keyFull] = [];
      out[keyFull].push(evtData);
      if (!out[keyNome]) out[keyNome] = [];
      out[keyNome].push(evtData);
    }
    Object.keys(out).forEach((k) => out[k].sort((a, b) => String(b.data).localeCompare(String(a.data))));
    return out;
  }, [events]);

  const grouped = useMemo(() => {
    const tg0 = performance.now();
    const map = new Map();
    function normNomeKey(v) {
      return String(v || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\-/\\]/g, " ").replace(/\s+/g, " ").trim();
    }
    function extractNomeCli(v) {
      const raw = String(v || "").trim();
      const m = raw.match(/^(\d{1,10})\s*[\/\-–]\s*(.{2,})$/);
      if (m && /[A-Za-zÀ-ÿ]/.test(m[2])) return m[2].trim();
      return /^\d+$/.test(raw) ? "" : raw;
    }
    function normCod(v) { return String(v || "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1"); }
    function getClienteKey(item) {
      const doc = String(item.cpfCnpj || "").replace(/\D/g, "");
      if (doc.length >= 11) return `DOC:${doc}`;
      const nomeNorm = normNomeKey(extractNomeCli(item.nomeCli));
      if (nomeNorm.replace(/\s/g, "").length >= 3 && /[A-Za-z]/.test(nomeNorm)) return `NOME:${nomeNorm}`;
      const cod = normCod(item.nrCli);
      if (cod) return `COD:${cod}`;
      return `ID:${item.id || Math.random()}`;
    }
    records.forEach((item) => {
      const k = getClienteKey(item);
      const nomeExibicao = extractNomeCli(item.nomeCli) || item.nomeCli || "";
      const cod = normCod(item.nrCli);
      if (!map.has(k)) map.set(k, { clientKey: k, nrCli: cod, nomeCli: nomeExibicao, _codigos: new Set(), titulos: [], _nomes: [] });
      const g = map.get(k);
      if (cod) g._codigos.add(cod);
      g._nomes.push(nomeExibicao);
      g.titulos.push(item);
    });
    map.forEach((g) => {
      const comLetras = (g._nomes || []).filter((s) => /[A-Za-zÀ-ÿ]/.test(s));
      if (comLetras.length > 0) { comLetras.sort((a, b) => b.length - a.length); g.nomeCli = comLetras[0]; }
      g.codigosLista = [...g._codigos].sort((a, b) => Number(a) - Number(b));
      if (g.codigosLista.length > 0) g.nrCli = g.codigosLista[0];
      delete g._nomes; delete g._codigos;
    });
    const agrupados = Array.from(map.values()).map((g) => {
      const ts = g.titulos;
      let vOrig = 0, vMult = 0, vJuro = 0, vTot = 0, mAtr = 0, qtdT = 0;
      let ultCont = "", dataProm = "", statusC = "", obsC = "", encC = "", solProt = "";
      let primeiroVencimento = "", foiCobrado = false;
      for (const x of ts) {
        vOrig += Number(x.valorOriginal || 0); vMult += Number(x.valorMulta || 0); vJuro += Number(x.valorJuros || 0); vTot += Number(x.valorTotalDebito || 0);
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
      const histCliKey = histMap[g.clientKey];
      const histNomeKey = g.clientKey.startsWith("NOME:") ? histCliKey : histMap[`NOME:${normText(g.nomeCli || "")}`];
      const historicoMerged = (() => {
        const all = histCliKey === histNomeKey ? (histCliKey || []) : [...(histCliKey || []), ...(histNomeKey || [])];
        if (!all.length) return [];
        const seen = new Set();
        return all.filter((h) => { const hk = `${h.data}|${h.status}|${h.motivo}|${h.obs}|${h.usuario}`; if (seen.has(hk)) return false; seen.add(hk); return true; }).sort((a, b) => b.data > a.data ? -1 : 1);
      })();
      return { ...g, valorOriginal: vOrig, valorMulta: vMult, valorJuros: vJuro, valorTotalDebito: vTot, maiorAtraso: mAtr, qtdTitulos: ts.length, qtdTotal: qtdT, ultimoContato: ultCont, dataPromessa: dataProm, statusConsolidado: statusC, obsConsolidada: obsC, encaminharConsolidado: encC, solicitanteProtestoConsolidado: solProt, prioridadeCliente: prio, foiCobrado, historicoCliente: historicoMerged, primeiroVencimento };
    });
    console.info(`⚡ grouped: ${(performance.now() - tg0).toFixed(0)}ms | ${agrupados.length} grupos de ${records.length} títulos`);
    return agrupados;
  }, [records, histMap]);

  function fieldVal(g, field) {
    switch (field) {
      case "nrCli": return g.nrCli || "(Vazio)"; case "nomeCli": return g.nomeCli || "(Vazio)"; case "statusConsolidado": return g.statusConsolidado || "(Vazio)"; case "prioridadeCliente": return g.prioridadeCliente || "(Vazio)"; case "encaminharConsolidado": return g.encaminharConsolidado || "Sem encaminhamento"; case "ultimoContato": return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)"; case "dataPromessa": return g.dataPromessa ? fmtD(g.dataPromessa) : "(Vazio)"; case "atrasoLabel": return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"; case "vencimento": return g.primeiroVencimento ? fmtD(g.primeiroVencimento) : "(Vazio)"; case "obsConsolidada": return g.obsConsolidada || "(Sem observação)"; case "origem": return [...new Set(g.titulos?.map((ti) => ti.origem))].map((o) => o === "FINR1253" ? "Topcon" : "EB").join(", ") || "(Vazio)"; case "valorOriginal": return fmtM(g.valorOriginal); case "valorTotalDebito": return fmtM(g.valorTotalDebito); case "sugestaoLabel": { const s = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito); return s ? s.label : "(Sem sugestão)"; } default: return "";
    }
  }
  function makeColData(arr, field) { return arr.map((g) => ({ [field]: fieldVal(g, field) })); }
  function applyExcelFilter(arr, filters) { return arr.filter((g) => { for (const [field, vals] of Object.entries(filters)) { if (!vals) continue; if (vals.length === 0) return false; const v = fieldVal(g, field); if (!vals.includes(v)) return false; } return true; }); }

  const groupedFiltrado = useMemo(() => {
    const busca = normText(buscaCliente); const buscaTit = normText(buscaTitulo);
    return grouped.filter((g) => {
      if (faixaAtraso > 0 && g.maiorAtraso < faixaAtraso) return false;
      if (filtroOrigem && !g.titulos.some((ti) => ti.origem === filtroOrigem)) return false;
      if (busca && !normText(g.nomeCli).includes(busca) && !String(g.nrCli || "").includes(buscaCliente) && !(g.codigosLista || []).some((c) => c.includes(buscaCliente))) return false;
      if (buscaTit) { const temTituloMatch = g.titulos.some((ti) => normText(ti.titulo || "").includes(buscaTit) || String(ti.titulo || "").includes(buscaTitulo)); if (!temTituloMatch) return false; }
      if (filtroSentinela && g.maiorAtraso <= 90) return false;
      if (filtroCategoria && !g.titulos.some((ti) => ti.clientCategory === filtroCategoria)) return false;
      if (!showPaid) { const temPagamento = isStatusBaixado(g.statusConsolidado) || g.historicoCliente.some((h) => isStatusBaixado(h.motivo) || isStatusBaixado(h.status)); if (temPagamento) return false; }
      return true;
    }).map((g) => {
      if (!filtroOrigem) return g;
      const tsFilt = g.titulos.filter((ti) => ti.origem === filtroOrigem);
      if (tsFilt.length === g.titulos.length) return g;
      return { ...g, valorOriginal: tsFilt.reduce((s, x) => s + Number(x.valorOriginal || 0), 0), valorMulta: tsFilt.reduce((s, x) => s + Number(x.valorMulta || 0), 0), valorJuros: tsFilt.reduce((s, x) => s + Number(x.valorJuros || 0), 0), valorTotalDebito: tsFilt.reduce((s, x) => s + Number(x.valorTotalDebito || 0), 0), maiorAtraso: tsFilt.reduce((m, x) => Math.max(m, Number(x.diasAtraso || 0)), 0), qtdTitulos: tsFilt.length, primeiroVencimento: tsFilt.map((x) => x.vencimento).filter(Boolean).sort()[0] || "" };
    });
  }, [grouped, faixaAtraso, filtroOrigem, buscaCliente, buscaTitulo, filtroSentinela, filtroCategoria, showPaid]);

  const baseCart = useMemo(() => { let arr = [...groupedFiltrado]; const d = scCart.dir === "asc" ? 1 : -1; arr.sort((a, b) => { switch (scCart.key) { case "numero": return (Number(a.nrCli || 0) - Number(b.nrCli || 0)) * d; case "valorOriginal": return (a.valorOriginal - b.valorOriginal) * d; case "valorTotalDebito": return (a.valorTotalDebito - b.valorTotalDebito) * d; case "atraso": return (a.maiorAtraso - b.maiorAtraso) * d; default: return normText(a.nomeCli).localeCompare(normText(b.nomeCli)) * d; } }); return arr; }, [groupedFiltrado, scCart]);
  const sortedCartBase = useMemo(() => applyExcelFilter(baseCart, fCart), [baseCart, fCart]);
  const sortedCart = useMemo(() => { if (!kpiFilter) return sortedCartBase; if (kpiFilter === "aCobrar") return sortedCartBase.filter((g) => !g.foiCobrado); if (kpiFilter === "cobrado") return sortedCartBase.filter((g) => g.foiCobrado); if (kpiFilter === "cobHoje") return sortedCartBase.filter((g) => g.ultimoContato === hojeISO); if (kpiFilter === "faltando") return sortedCartBase.filter((g) => g.ultimoContato !== hojeISO); if (kpiFilter === "pendVerif") return sortedCartBase.filter((g) => g.encaminharConsolidado === "verificacao"); if (kpiFilter === "pendProt") return sortedCartBase.filter((g) => g.encaminharConsolidado === "protesto"); return sortedCartBase; }, [sortedCartBase, kpiFilter, hojeISO]);
  const cobrados = useMemo(() => groupedFiltrado.filter((g) => g.foiCobrado), [groupedFiltrado]);
  const verifLista = useMemo(() => groupedFiltrado.filter((g) => g.encaminharConsolidado === "verificacao"), [groupedFiltrado]);
  const protestoLista = useMemo(() => groupedFiltrado.filter((g) => g.encaminharConsolidado === "protesto"), [groupedFiltrado]);
  const selGroups = useMemo(() => sortedCart.filter((g) => selected.has(g.clientKey)), [sortedCart, selected]);

  const dash = useMemo(() => {
    let base = groupedFiltrado; if (activeTab === "cobrados") base = cobrados; else if (activeTab === "verificacao") base = verifLista; else if (activeTab === "protesto") base = protestoLista; else if (activeTab === "carteira") base = sortedCart;
    const cobHoje = base.filter((x) => x.ultimoContato === hojeISO).length; const tot = base.length;
    const recuperadoMes = events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Baixado").filter((e) => e.event_date && e.event_date.startsWith(hojeISO.slice(0, 7))).reduce((s, e) => s + (e.total_value || 0), 0);
    const clientesComResposta = grouped.filter((g) => { const temResposta = g.historicoCliente.some((h) => h.subtype?.startsWith("RESP_VERIF") || h.subtype?.startsWith("RESP_PROT")); const workflow = g.encaminharConsolidado; return temResposta && (!workflow || workflow === "normal" || workflow === "") && g.ultimoContato !== hojeISO; });
    return { cobHoje, faltando: tot - cobHoje, perc: tot ? cobHoje / tot * 100 : 0, numCli: tot, numTit: base.reduce((s, x) => s + x.qtdTitulos, 0), vOrig: base.reduce((s, x) => s + x.valorOriginal, 0), vTot: base.reduce((s, x) => s + x.valorTotalDebito, 0), pendVerif: verifLista.length, pendProt: protestoLista.length, devolvidos: clientesComResposta.length, recuperadoMes, aCobrar: base.filter((g) => !g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0), cobrado: base.filter((g) => g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0) };
  }, [groupedFiltrado, sortedCart, cobrados, verifLista, protestoLista, events, activeTab]);

  function handleSort(k) { setScCart((p) => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }); }
  function toggleSel(k) { setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function toggleAll() { setSelected((p) => p.size === sortedCart.length && sortedCart.length > 0 ? new Set() : new Set(sortedCart.map((g) => g.clientKey))); }
  const hasAnyFilter = (f) => Object.values(f).some((v) => v !== null && v !== undefined);

  async function salvarCobranca(frm, titulos, onDone) { alert("Rotina temporariamente preservada. Use a importação para atualizar a carteira."); }

  async function salvarResposta() {
    if (!respModal || !respForm.responsavel.trim()) { alert("Informe o responsável."); return; }
    if (!respForm.resposta) { alert("Selecione uma resposta."); return; }
    const tipo = respModal.tipo; const baixa = isStatusBaixado(respForm.resposta) || respForm.resposta === "Confirmado";
    for (const item of respModal.grupo.titulos) {
      const valorTit = Number(item.valorTotalDebito || item.valorOriginal || 0);
      await base44.entities.ChargeEvent.create({ titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli, event_type: baixa ? "BAIXA" : "COBRANCA", event_subtype: `RESP_${tipo.toUpperCase()}`, event_date: hojeISO, status: baixa ? "Baixado" : "Em Cobrança", motive: respForm.resposta, note: `${respForm.obs || ""}${baixa ? ` Valor original: R$ ${valorTit.toFixed(2).replace(".", ",")}` : ""}`.trim() || null, total_value: baixa ? valorTit : undefined, event_user: respForm.responsavel.trim() });
      const existing = records.find((r) => r.id === item.id);
      if (existing?._dbId) await base44.entities.Titulo.update(existing._dbId, baixa ? { active: false, current_status: "Baixado", current_motive: respForm.resposta, workflow_status: "baixado", last_contact_date: hojeISO, last_note: respForm.obs || null, updated_by: respForm.responsavel.trim() } : { current_status: "Em Cobrança", workflow_status: "normal", updated_by: respForm.responsavel.trim() });
    }
    setRespModal(null); setSyncMsg(baixa ? "✅ Baixa registrada e removida da Carteira Geral." : "✅ Resposta registrada. Cliente devolvido para a Carteira."); await loadData();
  }

  async function limparDuplicatasBanco() { setCleanupMsg("Use a importação para sincronizar a carteira e baixar automaticamente o que saiu do relatório."); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  async function syncImport(source, imported, fileName, onProgress = () => {}) {
    const T = { t0: Date.now() }; const lap = (k) => { T[k] = ((Date.now() - T.t0) / 1000).toFixed(2); };
    onProgress(`🔍 Deduplicando ${imported.length} registros do arquivo...`); await yieldUI();
    const fileMap = new Map(); for (const item of imported) { const k = getTituloKey(item); if (!fileMap.has(k)) fileMap.set(k, item); }
    const deduped = Array.from(fileMap.values()); const dupArquivo = imported.length - deduped.length; lap("dedup");
    onProgress(`📥 Consultando banco de dados (origem: ${source})...`); await yieldUI();
    const existingAll = await base44.entities.Titulo.filter({ source }, "client_name", 5000); lap("fetch");
    const existMap = new Map(); for (const r of existingAll || []) { const key = getTituloKey({ origem: r.source, titulo: r.title_number, seq: r.seq, vencimento: r.due_date }); const prev = existMap.get(key); if (!prev || String(r.updated_date || r.created_date || "") > String(prev.updated_date || prev.created_date || "")) existMap.set(key, r); }
    onProgress(`🔎 Comparando ${deduped.length} registros com ${existMap.size} existentes...`); await yieldUI();
    const toCreate = [], toUpdate = [], skipped = []; const importKeys = new Set(deduped.map((i) => getTituloKey(i)));
    for (const item of deduped) {
      const tKey = getTituloKey(item); const old = existMap.get(tKey);
      const financeiro = { source: item.origem, client_code: item.nrCli || null, client_name: item.nomeCli, doc_type: item.tp || null, serie: item.ser || null, title_number: item.titulo, seq: item.seq || null, nf_servico: item.nfServico || null, issue_date: item.emissao || null, due_date: item.vencimento || null, original_value: Number(item.valorOriginal || 0), open_value: Number(item.valorEmAberto || item.valorTotalDebito || item.valorOriginal || 0), portador: item.portador || null, active: true, import_file: fileName };
      if (!old) toCreate.push({ ...financeiro, current_status: "Não Contatado", current_motive: null, current_contact_type: null, client_category: null, promise_date: null, last_contact_date: null, last_note: null, contact_count: 0, protest_requested_by: null, workflow_status: "normal", updated_by: "Importação" });
      else if (isStatusBaixado(old.current_status) || isStatusBaixado(old.workflow_status)) skipped.push(tKey);
      else toUpdate.push({ dbId: old.id, payload: { ...financeiro, current_status: old.current_status || "Não Contatado", current_motive: old.current_motive || null, current_contact_type: old.current_contact_type || null, client_category: old.client_category || null, promise_date: old.promise_date || null, last_contact_date: old.last_contact_date || null, last_note: old.last_note || null, contact_count: Number(old.contact_count || 0), protest_requested_by: old.protest_requested_by || null, workflow_status: old.workflow_status || "normal", updated_by: "Importação" } });
    }
    let ins = 0; const BULK = 50; for (let i = 0; i < toCreate.length; i += BULK) { onProgress(`💾 Criando novos — lote ${Math.floor(i/BULK)+1}/${Math.ceil(toCreate.length/BULK)}...`); await base44.entities.Titulo.bulkCreate(toCreate.slice(i, i + BULK)); ins += Math.min(BULK, toCreate.length - i); await yieldUI(); } lap("creates");
    let upd = 0; const CONCUR = 15; for (let i = 0; i < toUpdate.length; i += CONCUR) { onProgress(`🔄 Atualizando — lote ${Math.floor(i/CONCUR)+1}/${Math.ceil(toUpdate.length/CONCUR)}...`); await Promise.all(toUpdate.slice(i, i + CONCUR).map((u) => base44.entities.Titulo.update(u.dbId, u.payload))); upd += Math.min(CONCUR, toUpdate.length - i); await yieldUI(); } lap("updates");
    let deact = 0, baixados = 0, valorBaixado = 0; const isCarteirCompleta = true;
    const toBaixa = (existingAll || []).filter((r) => { const key = getTituloKey({ origem: r.source, titulo: r.title_number, seq: r.seq, vencimento: r.due_date }); return !importKeys.has(key) && r.active && !isStatusBaixado(r.current_status) && !isStatusBaixado(r.workflow_status); });
    if (toBaixa.length > 0) { onProgress(`📉 Baixando ${toBaixa.length} títulos que saíram do relatório importado...`); const BAIXA_BATCH = 20; for (let i = 0; i < toBaixa.length; i += BAIXA_BATCH) { const lote = toBaixa.slice(i, i + BAIXA_BATCH); await Promise.all(lote.map((r) => base44.entities.Titulo.update(r.id, { active: false, current_status: "Baixado", current_motive: "Saiu do relatório importado", last_contact_date: hojeISO, workflow_status: "baixado", updated_by: "Importação Automática" }))); await Promise.all(lote.map((r) => { const valorTit = Number(r.open_value || r.original_value || 0); valorBaixado += valorTit; deact++; baixados++; return base44.entities.ChargeEvent.create({ titulo_id: r.id, client_code: r.client_code, client_name: r.client_name, event_type: "BAIXA", event_subtype: "SAIU_IMPORTACAO", event_date: hojeISO, status: "Baixado", motive: "Título não presente na nova importação", note: `Arquivo: ${fileName}. Valor original: R$ ${valorTit.toFixed(2).replace(".", ",")}`, total_value: valorTit, event_user: "Importação Automática" }); })); await yieldUI(); } } lap("baixa");
    await base44.entities.ImportLog.create({ file_name: fileName, source, total_read: imported.length, inserted_count: ins, updated_count: upd, deactivated_count: deact });
    const elapsed = ((Date.now() - T.t0) / 1000).toFixed(1); console.info(`syncImport [${source}]: ${imported.length} lidos → ${deduped.length} únicos arquivo (${dupArquivo} dup) | ${ins} novos | ${upd} atualizados | ${skipped.length} ignorados | ${deact} baixados`);
    return { ins, upd, deact, baixados, valorBaixado, isCarteirCompleta, elapsed, skipped: skipped.length, dupArquivo };
  }

  async function importarArquivo(e) {
    if (isImporting) return; const file = e.target.files?.[0]; if (!file) return;
    const nomeArq = file.name.toLowerCase(); const tipoMime = file.type.toLowerCase();
    const extensoesValidas = [".csv", ".xlsx", ".xls"]; const mimeValidos = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!extensoesValidas.some((ext) => nomeArq.endsWith(ext)) && !mimeValidos.some((m) => tipoMime.includes(m)) && tipoMime !== "") { setImportStatus({ ok: false, msg: "❌ Formato não permitido. Envie CSV, XLSX ou XLS." }); e.target.value = ""; return; }
    setImportStatus(null); setIsImporting(true); importingRef.current = true; const t0 = Date.now(); const t0perf = performance.now(); setSyncMsg("⏳ Lendo arquivo..."); const setStep = (msg) => { setSyncMsg(`⏳ ${msg}`); };
    try { setStep("Lendo arquivo..."); const buf = await file.arrayBuffer(); const isCsv = nomeArq.endsWith(".csv"); const wb = isCsv ? XLSX.read(buf, { type: "array", FS: ";" }) : XLSX.read(buf, { type: "array" }); const sheet = wb.Sheets[wb.SheetNames[0]]; const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" }); const cleanRows = rawRows.map((r) => { const out = {}; for (const [k, v] of Object.entries(r)) out[k.replace(/^\uFEFF/, "").trim()] = v; return out; }); setStep(`Tratando ${rawRows.length} linhas...`); await yieldUI();
      const source = detectSrc(file.name); setStep(`Processando ${source === "FINR1253" ? "FINR1253 (Topcon)" : "RPT_7007 (EB)