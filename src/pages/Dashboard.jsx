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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 2000),
        base44.entities.ChargeEvent.list("-created_date", 2000)
      ]);
      // Dedup visual: mesma getTituloKey do syncImport → banco consistente com tela
      const tituloKeyMap = new Map();
      for (const r of titulos || []) {
        const key = getTituloKey({ origem: r.source, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });
        const prev = tituloKeyMap.get(key);
        if (!prev) { tituloKeyMap.set(key, r); continue; }
        const score = (rec) => [
          rec.current_status && rec.current_status !== "Não Contatado",
          rec.last_note, rec.promise_date, rec.last_contact_date,
          rec.workflow_status && rec.workflow_status !== "normal",
          rec.client_category, Number(rec.contact_count) > 0
        ].filter(Boolean).length;
        const dc = r.updated_date || r.created_date || "";
        const dp = prev.updated_date || prev.created_date || "";
        if (score(r) > score(prev) || (score(r) === score(prev) && dc > dp)) tituloKeyMap.set(key, r);
      }
      const titulosFinais = Array.from(tituloKeyMap.values()).map((r) => dbToItem(r));
      setRecords(titulosFinais);
      setEvents(evts || []);
      const dupCount = (titulos || []).length - titulosFinais.length;
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${titulosFinais.length} títulos carregados${dupCount > 0 ? ` (${dupCount} duplicatas ocultas)` : ""}`);
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
    const unsub1 = base44.entities.Titulo.subscribe(() => loadData());
    const unsub2 = base44.entities.ChargeEvent.subscribe(() => loadData());
    return () => { unsub1(); unsub2(); };
  }, [loadData]);

  const histMap = useMemo(() => {
    const out = {}, seen = new Map();
    for (const e of events) {
      const k = [e.client_code || "", normText(e.client_name || ""), e.event_date || "", e.status || "", e.motive || "", e.note || "", e.event_user || ""].join("|");
      if (!seen.has(k)) seen.set(k, e);
    }
    for (const e of seen.values()) {
      const evtData = { ...e, data: e.event_date || "", tipo: e.contact_type || "", status: e.status || "", motivo: e.motive || "", obs: e.note || "", usuario: e.event_user || "", dataPromessa: e.promise_date || "", subtype: e.event_subtype || "" };
      // Indexa por código+nome E por nome normalizado sozinho (para grupos unificados por nome)
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
    const map = new Map();

    // Normaliza nome para chave de agrupamento (não altera exibição):
    // maiúsculas, sem acentos, pontuação vira espaço, espaços duplos removidos.
    function normNomeKey(v) {
      return String(v || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,\-/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Extrai nome limpo removendo prefixo numérico "CÓDIGO / NOME"
    function extractNomeCli(v) {
      const raw = String(v || "").trim();
      const m = raw.match(/^(\d{1,10})\s*[\/\-–]\s*(.{2,})$/);
      if (m && /[A-Za-zÀ-ÿ]/.test(m[2])) return m[2].trim();
      return /^\d+$/.test(raw) ? "" : raw;
    }

    // Normaliza código do cliente: remove não-dígitos e zeros à esquerda
    function normCod(v) {
      return String(v || "").replace(/\D/g, "").replace(/^0+(\d+)$/, "$1");
    }

    // Chave de agrupamento: CPF/CNPJ > Nome normalizado > Código
    // PREMIX CONCRETO LTDA com códigos 71, 67, 73 → mesma chave NOME:PREMIX CONCRETO LTDA
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
      if (!map.has(k)) {
        map.set(k, { clientKey: k, nrCli: cod, nomeCli: nomeExibicao, _codigos: new Set(), titulos: [], _nomes: [] });
      }
      const g = map.get(k);
      if (cod) g._codigos.add(cod);
      g._nomes.push(nomeExibicao);
      g.titulos.push(item);
    });

    // Consolida nome de exibição (mais longo com letras) e lista de códigos
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
    return Array.from(map.values()).map((g) => {
      const ts = g.titulos;
      const vOrig = ts.reduce((s, x) => s + Number(x.valorOriginal || 0), 0);
      const vMult = ts.reduce((s, x) => s + Number(x.valorMulta || 0), 0);
      const vJuro = ts.reduce((s, x) => s + Number(x.valorJuros || 0), 0);
      const vTot = ts.reduce((s, x) => s + Number(x.valorTotalDebito || 0), 0);
      const mAtr = ts.reduce((m, x) => Math.max(m, Number(x.diasAtraso || 0)), 0);
      const qtdT = ts.reduce((s, x) => s + Number(x.qtd || 0), 0);
      const ultCont = ts.map((x) => x.dataContato || "").filter(Boolean).sort().slice(-1)[0] || "";
      const dataProm = ts.map((x) => x.dataPromessa || "").filter(Boolean).sort().slice(-1)[0] || "";
      const statusC = ts.map((x) => x.status).filter(Boolean).sort().slice(-1)[0] || "Não Contatado";
      const obsC = ts.map((x) => x.obs).filter(Boolean).slice(-1)[0] || "";
      const encC = ts.map((x) => x.encaminhar).filter(Boolean).slice(-1)[0] || "";
      const solProt = ts.map((x) => x.solicitanteProtesto).filter(Boolean).slice(-1)[0] || "";
      const prio = mAtr > 90 || qtdT >= 3 ? "CRÍTICO" : mAtr > 30 || qtdT >= 2 ? "ALTO" : mAtr > 0 || qtdT >= 1 ? "MÉDIO" : "BAIXO";
      const foiCobrado = ts.some((x) => (x.qtd || 0) > 0 || !!x.dataContato);
      const vencimentos = ts.map((x) => x.vencimento).filter(Boolean).sort();
      const primeiroVencimento = vencimentos[0] || "";
      // Busca histórico: tenta clientKey direto, depois chaves derivadas (código+nome de cada título)
      const histCliKey = histMap[g.clientKey];
      const histNomeKey = g.clientKey.startsWith("NOME:") ? histMap[g.clientKey] : histMap[`NOME:${normText(g.nomeCli || "")}`];
      const historicoMerged = (() => {
        const all = [...(histCliKey || []), ...(histNomeKey || [])];
        const seen = new Set();
        return all.filter((h) => {
          const hk = [h.data, h.status, h.motivo, h.obs, h.usuario].join("|");
          if (seen.has(hk)) return false;
          seen.add(hk);
          return true;
        }).sort((a, b) => String(b.data).localeCompare(String(a.data)));
      })();
      return { ...g, valorOriginal: vOrig, valorMulta: vMult, valorJuros: vJuro, valorTotalDebito: vTot, maiorAtraso: mAtr, qtdTitulos: ts.length, qtdTotal: qtdT, ultimoContato: ultCont, dataPromessa: dataProm, statusConsolidado: statusC, obsConsolidada: obsC, encaminharConsolidado: encC, solicitanteProtestoConsolidado: solProt, prioridadeCliente: prio, foiCobrado, historicoCliente: historicoMerged, primeiroVencimento };
    });
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
        // Filtro por origem: mostra clientes que tenham pelo menos um título da origem selecionada
        if (filtroOrigem && !g.titulos.some((ti) => ti.origem === filtroOrigem)) return false;
        if (busca && !normText(g.nomeCli).includes(busca) && !String(g.nrCli || "").includes(buscaCliente) && !(g.codigosLista || []).some((c) => c.includes(buscaCliente))) return false;
        if (buscaTit) {
          const temTituloMatch = g.titulos.some((ti) => normText(ti.titulo || "").includes(buscaTit) || String(ti.titulo || "").includes(buscaTitulo));
          if (!temTituloMatch) return false;
        }
        if (filtroSentinela && g.maiorAtraso <= 90) return false;
        if (filtroCategoria && !g.titulos.some((ti) => ti.clientCategory === filtroCategoria)) return false;
        if (!showPaid) {
          const temPagamento = g.statusConsolidado === "Encerrado" || g.statusConsolidado === "Baixado" || g.statusConsolidado === "Pago Aguard. Baixa" || g.historicoCliente.some((h) => h.motivo === "Confirmado");
          if (temPagamento) return false;
        }
        return true;
      })
      .map((g) => {
        // Quando há filtro por origem, recalcula totais da linha principal apenas com títulos da origem filtrada
        if (!filtroOrigem) return g;
        const tsFilt = g.titulos.filter((ti) => ti.origem === filtroOrigem);
        if (tsFilt.length === g.titulos.length) return g; // todos são da mesma origem, sem recálculo necessário
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
    const recuperadoMes = events.filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado").filter((e) => e.event_date && e.event_date.startsWith(hojeISO.slice(0, 7))).reduce((s, e) => s + (e.total_value || 0), 0);
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
      recuperadoMes,
      aCobrar: base.filter((g) => !g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0),
      cobrado: base.filter((g) => g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0)
    };
  }, [groupedFiltrado, sortedCart, cobrados, verifLista, protestoLista, events, activeTab]);

  function handleSort(k) { setScCart((p) => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }); }
  function toggleSel(k) { setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function toggleAll() { setSelected((p) => p.size === sortedCart.length && sortedCart.length > 0 ? new Set() : new Set(sortedCart.map((g) => g.clientKey))); }
  const hasAnyFilter = (f) => Object.values(f).some((v) => v !== null && v !== undefined);

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

  async function limparDuplicatasBanco() {
    // ─── FASE 1: DIAGNÓSTICO ───────────────────────────────────────────────
    setCleanupMsg("🔍 Analisando duplicatas no banco...");
    await yieldUI();

    const allTitulos = await base44.entities.Titulo.list("client_name", 5000);

    // Usa getTituloKey — mesma chave do syncImport e loadData
    const dupKey = (r) => getTituloKey({ origem: r.source, titulo: r.title_number, seq: r.seq, vencimento: r.due_date });

    const byKey = new Map();
    for (const r of allTitulos || []) {
      const key = dupKey(r);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }

    // Identifica grupos com duplicatas
    const gruposDup = [];
    for (const [key, group] of byKey) {
      if (group.length <= 1) continue;
      // Ordena: mais recente primeiro
      group.sort((a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || "")));
      gruposDup.push({ key, group });
    }

    const totalFisico = allTitulos.length;
    const totalUnicos = byKey.size;
    const totalDupGrupos = gruposDup.length;
    const totalDupRegistros = gruposDup.reduce((s, g) => s + g.group.length - 1, 0);

    if (totalDupRegistros === 0) {
      setCleanupMsg("✅ Nenhuma duplicata física encontrada no banco. Banco já está limpo.");
      return;
    }

    // ─── FASE 2: CONFIRMAÇÃO COM DIAGNÓSTICO ──────────────────────────────
    const msgConfirm = [
      `📊 DIAGNÓSTICO DE DUPLICATAS`,
      ``,
      `Registros físicos no banco: ${totalFisico}`,
      `Registros únicos (chave lógica): ${totalUnicos}`,
      `Grupos com duplicatas: ${totalDupGrupos}`,
      `Duplicatas a inativar: ${totalDupRegistros}`,
      ``,
      `REGRA USADA: origem + nrCli + tp + titulo + seq`,
      `CRITÉRIO: mantém o registro com updated_date mais recente.`,
      ``,
      `⚠️  SEGURANÇA: duplicatas com observação, promessa, status`,
      `manual ou data de contato NÃO serão inativadas automaticamente.`,
      `Elas serão preservadas e listadas no relatório.`,
      ``,
      `Deseja prosseguir com a limpeza segura?`
    ].join("\n");

    if (!window.confirm(msgConfirm)) {
      setCleanupMsg("ℹ️ Limpeza cancelada pelo usuário.");
      return;
    }

    // ─── FASE 3: LIMPEZA SEGURA ────────────────────────────────────────────
    setCleanupMsg("⏳ Executando limpeza segura...");
    await yieldUI();

    // Verifica se registro tem dados manuais relevantes (todos os campos de cobrança)
    const temDadosManuais = (r) =>
      !!(r.last_note?.trim()) ||
      !!(r.promise_date) ||
      !!(r.last_contact_date) ||
      !!(r.protest_requested_by?.trim()) ||
      !!(r.current_contact_type?.trim()) ||
      !!(r.client_category?.trim()) ||
      (Number(r.contact_count) > 0) ||
      (r.current_status && r.current_status !== "Não Contatado" && r.current_status !== "Baixado") ||
      (r.workflow_status && r.workflow_status !== "normal" && r.workflow_status !== "baixado" && r.workflow_status !== "duplicata" && r.workflow_status !== "");

    let inativados = 0, preservadosManuais = 0, conflitos = 0, migrados = 0;
    const conflitosDetalhe = [];
    const t0 = Date.now();

    for (const { group } of gruposDup) {
      const principal = group[0]; // mais recente — manter
      const duplicatas = group.slice(1);

      for (const dup of duplicatas) {
        // Segurança: origens diferentes no mesmo grupo → conflito, não inativar
        if (dup.source !== principal.source) {
          conflitos++;
          conflitosDetalhe.push(`Conflito de origem: ${dup.client_name} [${dup.source} vs ${principal.source}]`);
          continue;
        }

        // Segurança: duplicata tem dados manuais que o principal não tem
        const dupTemDados = temDadosManuais(dup);
        const principalTemDados = temDadosManuais(principal);

        if (dupTemDados && !principalTemDados) {
          migrados++;
          // Migra TODOS os dados manuais para o principal antes de inativar
          await base44.entities.Titulo.update(principal.id, {
            current_status: dup.current_status || principal.current_status,
            current_motive: dup.current_motive || principal.current_motive,
            current_contact_type: dup.current_contact_type || principal.current_contact_type,
            client_category: dup.client_category || principal.client_category,
            promise_date: dup.promise_date || principal.promise_date,
            last_contact_date: dup.last_contact_date || principal.last_contact_date,
            last_note: dup.last_note || principal.last_note,
            protest_requested_by: dup.protest_requested_by || principal.protest_requested_by,
            workflow_status: (dup.workflow_status && dup.workflow_status !== "normal" && dup.workflow_status !== "") ? dup.workflow_status : principal.workflow_status,
            contact_count: Math.max(Number(dup.contact_count || 0), Number(principal.contact_count || 0)),
            updated_by: `Limpeza Segura ${hojeISO} — dados migrados de duplicata ID ${dup.id}`,
          });
        } else if (dupTemDados && principalTemDados) {
          // Ambos têm dados manuais — preservar duplicata, não inativar automaticamente
          preservadosManuais++;
          continue;
        }

        // Inativar duplicata antiga — NÃO deletar fisicamente (reversível)
        await base44.entities.Titulo.update(dup.id, {
          active: false,
          current_motive: `Duplicata inativada em ${hojeISO} — registro principal ID: ${principal.id}`,
          workflow_status: "duplicata",
          updated_by: `Limpeza Segura ${hojeISO}`,
        });
        inativados++;
      }
      await yieldUI();
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // ─── FASE 4: RELATÓRIO FINAL ───────────────────────────────────────────
    const partes = [
      `✅ LIMPEZA SEGURA — ${elapsed}s`,
      `Analisados: ${totalFisico}`,
      `Únicos: ${totalUnicos}`,
      `Grupos dup.: ${totalDupGrupos}`,
      `Inativadas: ${inativados}`,
      `Dados migrados: ${migrados}`,
      `Preservadas (conflito manual): ${preservadosManuais}`,
      `Preservadas (conflito origem): ${conflitos}`,
    ];
    if (conflitosDetalhe.length > 0) partes.push(`Conflitos: ${conflitosDetalhe.slice(0, 2).join(" | ")}`);
    partes.push(`Chave usada: getTituloKey (origem+cliente+numero+seq+vencimento)`);
    partes.push(`Reversão: registros com workflow_status="duplicata" e active=false`);

    setCleanupMsg(partes.join(" | "));
    if (inativados > 0) await loadData();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  async function syncImport(source, imported, fileName, onProgress = () => {}) {
    const T = { t0: Date.now() };
    const lap = (k) => { T[k] = ((Date.now() - T.t0) / 1000).toFixed(2); };

    // ── 1. Deduplicar arquivo em memória (usa nova getTituloKey) ──────────────
    onProgress("🔍 Deduplicando arquivo...");
    const fileMap = new Map();
    for (const item of imported) {
      const k = getTituloKey(item);
      if (!fileMap.has(k)) { fileMap.set(k, item); }
    }
    const deduped = Array.from(fileMap.values());
    const dupArquivo = imported.length - deduped.length;
    lap("dedup");

    // ── 2. Buscar banco UMA VEZ ───────────────────────────────────────────────
    onProgress("📥 Buscando registros existentes...");
    const existingAll = await base44.entities.Titulo.filter({ source }, "client_name", 5000);
    lap("fetch");

    // ── 3. Montar existMap por getTituloKey → registro mais relevante ─────────
    // Score: prefere registro com dados manuais; empate → mais recente
    const manualScore = (r) => [
      r.current_status && r.current_status !== "Não Contatado",
      r.last_note, r.promise_date, r.last_contact_date,
      r.workflow_status && r.workflow_status !== "normal",
      r.client_category, Number(r.contact_count) > 0
    ].filter(Boolean).length;

    const existMap = new Map();
    for (const r of existingAll || []) {
      const key = getTituloKey(dbToItem(r));
      const prev = existMap.get(key);
      if (!prev) { existMap.set(key, r); continue; }
      const sc = manualScore(r), sp = manualScore(prev);
      const dc = r.updated_date || r.created_date || "";
      const dp = prev.updated_date || prev.created_date || "";
      if (sc > sp || (sc === sp && dc > dp)) existMap.set(key, r);
    }
    lap("map");

    // ── 4. Separar: create / update (apenas se mudou) / skip ─────────────────
    const toCreate = [], toUpdate = [], skipped = [];
    const importKeys = new Set(deduped.map((i) => getTituloKey(i)));

    for (const item of deduped) {
      const tKey = getTituloKey(item);
      const old = existMap.get(tKey);

      // Campos financeiros/cadastrais que o relatório pode atualizar
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
        original_value: Number(item.valorOriginal || 0),
        portador: item.portador || null,
        active: true,
        import_file: fileName,
      };

      if (!old) {
        // Novo título
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
        // Verificar se algo financeiro realmente mudou → evita update desnecessário
        const mudou = (
          String(old.client_code || "") !== String(financeiro.client_code || "") ||
          String(old.client_name || "") !== String(financeiro.client_name || "") ||
          String(old.due_date || "") !== String(financeiro.due_date || "") ||
          Math.abs(Number(old.original_value || 0) - financeiro.original_value) > 0.01 ||
          String(old.portador || "") !== String(financeiro.portador || "") ||
          String(old.doc_type || "") !== String(financeiro.doc_type || "") ||
          String(old.serie || "") !== String(financeiro.serie || "") ||
          !old.active
        );

        if (!mudou) {
          skipped.push(tKey);
        } else {
          // Atualizar apenas campos financeiros; preservar todos os manuais
          toUpdate.push({
            dbId: old.id,
            payload: {
              ...financeiro,
              // Preserva TODOS os dados manuais sem exceção
              current_status: old.current_status || "Não Contatado",
              current_motive: old.current_motive || null,
              current_contact_type: old.current_contact_type || null,
              client_category: old.client_category || null,
              promise_date: old.promise_date || null,
              last_contact_date: old.last_contact_date || null,
              last_note: old.last_note || null,
              contact_count: Number(old.contact_count || 0),
              protest_requested_by: old.protest_requested_by || null,
              workflow_status: old.workflow_status || "normal",
              updated_by: "Importação",
            }
          });
        }
      }
    }
    lap("compare");

    // ── 5. Creates em lote ────────────────────────────────────────────────────
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

    // ── 6. Updates em paralelo (lotes de 15) ──────────────────────────────────
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

    // ── 7. Baixa automática (somente carteira completa) ────────────────────────
    let deact = 0, baixados = 0, valorBaixado = 0;
    const isCarteirCompleta = existMap.size === 0 || deduped.length >= existMap.size * 0.5;
    if (isCarteirCompleta) {
      const toBaixa = (existingAll || []).filter((r) => {
        const key = getTituloKey(dbToItem(r));
        return !importKeys.has(key) && r.active &&
          !["Baixado","Recebido","Pago","Encerrado"].includes(r.current_status);
      });
      if (toBaixa.length > 0) onProgress(`📉 Baixando ${toBaixa.length} títulos removidos...`);
      for (let i = 0; i < toBaixa.length; i += 10) {
        await Promise.all(toBaixa.slice(i, i + 10).map(async (r) => {
          const valorTit = Number(r.original_value || 0);
          valorBaixado += valorTit;
          await base44.entities.Titulo.update(r.id, {
            active: false, current_status: "Baixado",
            current_motive: "Saiu da carteira — baixa automática por importação",
            last_contact_date: hojeISO, workflow_status: "baixado", updated_by: "Importação"
          });
          await base44.entities.ChargeEvent.create({
            titulo_id: r.id, client_code: r.client_code, client_name: r.client_name,
            event_type: "BAIXA", event_subtype: "SAIU_IMPORTACAO", event_date: hojeISO,
            status: "Baixado", motive: "Título não presente na nova importação",
            note: `Arquivo: ${fileName}. Valor: R$ ${valorTit.toFixed(2).replace(".",",")}`,
            event_user: "Importação Automática"
          });
          deact++; baixados++;
        }));
        await yieldUI();
      }
    }
    lap("baixa");

    await base44.entities.ImportLog.create({
      file_name: fileName, source, total_read: imported.length,
      inserted_count: ins, updated_count: upd, deactivated_count: deact
    });

    const elapsed = ((Date.now() - T.t0) / 1000).toFixed(1);
    const tempos = `dedup:${T.dedup}s | fetch:${T.fetch}s | map:${T.map}s | compare:${T.compare}s | creates:${T.creates}s | updates:${T.updates}s | total:${elapsed}s`;
    console.info(`syncImport [${source}]: ${imported.length} lidos → ${deduped.length} únicos arquivo (${dupArquivo} dup) | ${ins} novos | ${upd} atualizados | ${skipped.length} ignorados | ${deact} baixados — ${tempos}`);

    return { ins, upd, deact, baixados, valorBaixado, isCarteirCompleta, elapsed, skipped: skipped.length, dupArquivo };
  }

  async function importarArquivo(e) {
    if (isImporting) return; // previne duplo clique
    const file = e.target.files?.[0]; if (!file) return;
    const nomeArq = file.name.toLowerCase(); const tipoMime = file.type.toLowerCase();
    const extensoesValidas = [".csv", ".xlsx", ".xls"];
    const mimeValidos = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!extensoesValidas.some((ext) => nomeArq.endsWith(ext)) && !mimeValidos.some((m) => tipoMime.includes(m)) && tipoMime !== "") {
      setImportStatus({ ok: false, msg: "❌ Formato não permitido. Envie CSV, XLSX ou XLS." }); e.target.value = ""; return;
    }
    setImportStatus(null); setIsImporting(true);
    const t0 = Date.now();
    const setStep = (msg) => setSyncMsg(`⏳ ${msg}`);
    try {
      setStep("Lendo arquivo...");
      const buf = await file.arrayBuffer();
      const isCsv = nomeArq.endsWith(".csv");
      const wb = isCsv ? XLSX.read(buf, { type: "array", FS: ";" }) : XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // cleanRows: cabeçalhos sem BOM e sem espaços extras (para todos os fluxos)
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const cleanRows = rawRows.map((r) => { const out = {}; for (const [k, v] of Object.entries(r)) out[k.replace(/^\uFEFF/, "").trim()] = v; return out; });
      setStep(`Tratando ${rawRows.length} linhas...`);
      await yieldUI();

      if (isCobrCsv(cleanRows)) {
        // CSV cobrados — coleta tudo em memória, salva em paralelo
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
          const dtCont = dateISO(pick(row, ["Data do Contato"])) || hojeISO;
          const dtProm = dateISO(pick(row, ["Data da Promessa"]));
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
        // RPT_7007 recebe cleanRows (cabeçalhos normalizados sem BOM); FINR1253 usa array indexado
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
        const baixaMsg = r.baixados > 0 ? ` | ${r.baixados} baixados (${fmtM(r.valorBaixado)})` : "";
        const ignoradosMsg = r.skipped > 0 ? ` | ${r.skipped} ignorados (sem alteração)` : "";
        const dupArqMsg = r.dupArquivo > 0 ? ` | ${r.dupArquivo} dup. do arquivo ignoradas` : "";
        const parcialMsg = !r.isCarteirCompleta ? " ⚠️ Parcial: baixa automática desabilitada." : "";
        setImportStatus({ ok: true, msg: `✅ "${file.name}" [${source === "FINR1253" ? "Topcon" : "EB"}] — ${rawRows.length} linhas | ${imported.length} válidos | ${r.ins} novos | ${r.upd} atualizados${ignoradosMsg}${dupArqMsg}${baixaMsg}${parcialMsg} — ⏱ ${elapsed}s` });
      }
      e.target.value = ""; await loadData();
    } catch (err) {
      console.error("Erro na importação:", err);
      e.target.value = "";
      setImportStatus({ ok: false, msg: `❌ Erro: ${err.message}` });
    } finally {
      setIsImporting(false);
    }
  }

  const thS = { background: t.th, padding: "9px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .4, color: t.muted, position: "sticky", top: 0, zIndex: 10 };
  const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: `1px solid ${t.bor}`, ...ex });
  function encBadge(enc) { if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />; if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />; return <span style={{ color: t.muted, fontSize: 11 }}>—</span>; }
  const CH = (props) => <ColHeader {...props} t={t} sortCfg={scCart} onSort={handleSort} />;

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: t.bg, minHeight: "100vh", color: t.txt }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={importarArquivo} />
      <header style={{ background: t.head, borderBottom: `1px solid ${t.bor}`, padding: "0 20px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: t.shad }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 4, color: t.txt }}>SISTEMA DE COBRANÇA</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setIsDark((x) => !x)} style={{ background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{isDark ? "☀️" : "🌙"}</button>
          <Btn t={t} sm onClick={() => setEmailModal(true)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>📧 Enviar PDF</Btn>
          <Btn t={t} sm onClick={() => exportarPDFExecutivo({ grouped, filteredCart: sortedCart, dash, faixaAtraso, filtroOrigem, hojeISO })} style={{ background: "#0369a1", border: "none", color: "#fff" }}>📊 Baixar Relatório</Btn>
          <Btn t={t} sm onClick={limparDuplicatasBanco} style={{ background: "#64748b", border: "none", color: "#fff" }} title="Limpeza segura de duplicatas — inativa cópias antigas, preserva dados manuais">🧹 Limpar BD</Btn>
          <Btn t={t} sm onClick={() => fileRef.current?.click()} disabled={isImporting} style={{ background: isImporting ? "#ccc" : t.p, border: "none", color: isImporting ? "#999" : "#fff", cursor: isImporting ? "not-allowed" : "pointer" }}>⬆️ {isImporting ? "Importando..." : "Importar"}</Btn>
        </div>
      </header>
      <main style={{ padding: "14px 16px", maxWidth: "100%", margin: "0 auto" }}>
        {importStatus && <div style={{ background: importStatus.ok ? isDark ? "#052e16" : "#f0fdf4" : isDark ? "#2d0a0a" : "#fef2f2", border: `1px solid ${importStatus.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: importStatus.ok ? "#16a34a" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{importStatus.msg}</span><button onClick={() => setImportStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button></div>}
        {cleanupMsg && <div style={{ background: isDark ? "#0c1a2e" : "#eff6ff", border: "1px solid #3b82f6", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{cleanupMsg}</span><button onClick={() => setCleanupMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button></div>}
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>{isImporting ? "⏳ Importando relatório, aguarde... (não feche a tela)" : loading ? "⏳ Carregando..." : syncMsg}</div>
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
        {activeTab === "fluxo" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="kpi-container kpi-container-4"><KPI t={t} label="Previsão 30 Dias" color="#3B82F6" value={fmtM(grouped.filter((g) => g.maiorAtraso <= 30).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="próximo mês" /><KPI t={t} label="Previsão 60 Dias" color="#FBBF24" value={fmtM(grouped.filter((g) => g.maiorAtraso > 30 && g.maiorAtraso <= 60).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="até 60 dias" /><KPI t={t} label="Previsão 90 Dias" color="#A78BFA" value={fmtM(grouped.filter((g) => g.maiorAtraso > 60 && g.maiorAtraso <= 90).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="até 90 dias" /><KPI t={t} label="Débitos Críticos" color="#EF4444" value={fmtM(grouped.filter((g) => g.maiorAtraso > 90).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="acima 90 dias" /></div><PrevisaoFluxo grouped={grouped} events={events} t={t} />{(() => { const pagosArr = grouped.filter((g) => g.statusConsolidado === "Encerrado" || g.statusConsolidado === "Baixado" || g.statusConsolidado === "Pago Aguard. Baixa" || g.statusConsolidado === "Confirmado" || g.statusConsolidado === "Pagamento confirmado"); const totalPagosVal = pagosArr.reduce((s, g) => s + (g.valorTotalDebito || 0), 0); const totalPagosTit = pagosArr.reduce((s, g) => s + (g.qtdTitulos || 0), 0); return <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}><div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>💰 Clientes Pagos (Impacto no Caixa)</div><div style={{ display: "flex", gap: 12, fontSize: 11, color: t.muted }}><span><b style={{ color: "#10b981" }}>{pagosArr.length}</b> clientes</span><span><b style={{ color: "#10b981" }}>{totalPagosTit}</b> títulos</span><span>Total: <b style={{ color: "#10b981" }}>{fmtM(totalPagosVal)}</b></span></div></div>{pagosArr.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: t.muted, fontSize: 12 }}>Nenhum cliente pago no momento.</div> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: t.th, color: t.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${t.bor}` }}>N°</th><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${t.bor}` }}>Cliente</th><th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Qtd. Títulos</th><th style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${t.bor}` }}>Val. Original</th><th style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${t.bor}` }}>Total Pago</th><th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Último Contato</th><th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Status</th></tr></thead><tbody>{pagosArr.sort((a, b) => (b.valorTotalDebito || 0) - (a.valorTotalDebito || 0)).map((g) => <tr key={g.clientKey} style={{ borderBottom: `1px solid ${t.bor}` }}><td style={{ padding: "8px 10px", color: t.txt, fontWeight: 600 }}>{g.nrCli}</td><td style={{ padding: "8px 10px", color: t.txt }}>{g.nomeCli}</td><td style={{ padding: "8px 10px", textAlign: "center", color: t.txt }}>{g.qtdTitulos}</td><td style={{ padding: "8px 10px", textAlign: "right", color: t.muted }}>{fmtM(g.valorOriginal)}</td><td style={{ padding: "8px 10px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</td><td style={{ padding: "8px 10px", textAlign: "center", color: t.muted }}>{g.ultimoContato ? fmtD(g.ultimoContato) : "—"}</td><td style={{ padding: "8px 10px", textAlign: "center" }}><span style={{ background: "#10b98122", color: "#10b981", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{g.statusConsolidado || "Pago"}</span></td></tr>)}</tbody></table></div>}</div>; })()}</div>}
      </main>
      {modal && <ModalCobranca title="✏️ Registrar Cobrança" frm={form} setFrm={setForm} onSave={() => salvarCobranca(form, modal.titulos, () => setModal(null))} onClose={() => setModal(null)} t={t} isDark={isDark} info={<div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${t.bor}` }}><b>{modal.nomeCli}</b><div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>Cliente {modal.nrCli} · {modal.qtdTitulos} título(s) · <b style={{ color: t.p }}>{fmtM(modal.valorTotalDebito)}</b></div></div>} />}
      {batchModal && <ModalCobranca title={`✏️ Cobrança em Lote — ${selGroups.length} clientes`} frm={batchForm} setFrm={setBatchForm} onSave={() => salvarCobranca(batchForm, selGroups.flatMap((g) => g.titulos), () => { setBatchModal(false); setSelected(new Set()); })} onClose={() => setBatchModal(false)} t={t} isDark={isDark} info={<div style={{ background: t.surf2, borderRadius: 8, padding: "8px 12px", marginBottom: 14, border: `1px solid ${t.bor}`, maxHeight: 100, overflowY: "auto" }}>{selGroups.map((g) => <div key={g.clientKey} style={{ fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between" }}><b>{g.nomeCli}</b><span style={{ color: t.p, fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</span></div>)}</div>} />}
      <ModalResposta respModal={respModal} respForm={respForm} setRespForm={setRespForm} onSave={salvarResposta} onClose={() => setRespModal(null)} t={t} isDark={isDark} />
      <ModalHistorico histModal={histModal} onClose={() => setHistModal(null)} t={t} />
      {negModal && <ModalNegociacao grupo={negModal} onClose={() => setNegModal(null)} t={t} isDark={isDark} />}
      {emailModal && <ModalEnviarPDF grouped={grouped} filteredCart={sortedCart} dash={dash} faixaAtraso={faixaAtraso} filtroOrigem={filtroOrigem} hojeISO={hojeISO} t={t} onClose={() => setEmailModal(false)} />}
    </div>
  );
}