import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import {
  hoje, hojeISO, fmtM, fmtD, normText, cliKey, buildItem, buildId, dbToItem,
  detectSrc, parseRows1253, parseRows7007, calcFin, dateISO, num, pick,
  dlCsv, openPrint, prioLabel, prioCor, sugestaoEncaminhamento, diffDias } from
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
  // Aceita relatório de cobrança do dia: precisa ter "Cliente" e pelo menos "Status" ou "Motivo"
  const temCliente = h.some((x) => x === "CLIENTE" || x.includes("CLIENTE"));
  const temStatus = h.some((x) => x === "STATUS" || x.includes("STATUS"));
  const temMotivo = h.some((x) => x === "MOTIVO" || x.includes("MOTIVO") || x.includes("CONTATO"));
  return temCliente && (temStatus || temMotivo);
}

// Detecta o CSV de "clientes cobrados" com colunas: Nº;Cliente;Qtd.;Val. Orig;Multa;Juros;Total;Status;...
function isCobrCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const h = Object.keys(rows[0] || {}).map((x) => normText(x).replace(/[^a-z0-9]/g, ""));
  return h.some((x) => x === "nr" || x === "n") && h.includes("cliente") && h.includes("status") && h.some((x) => x.includes("orig") || x.includes("valoig"));
}

function uniqCobr(rows) {
  const seen = new Set(),out = [];
  rows.forEach((r) => {
    const k = [normText(pick(r, ["Cliente"])), num(pick(r, ["Total"])), normText(pick(r, ["Status"])), normText(pick(r, ["Motivo"])), dateISO(pick(r, ["Data do Contato"]))].join("|");
    if (!normText(pick(r, ["Cliente"])) || seen.has(k)) return;
    seen.add(k);out.push(r);
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
  const [faixaAtraso, setFaixaAtraso] = useState(0); // 0 = todos
  const [filtroOrigem, setFiltroOrigem] = useState(""); // "" = todos, "FINR1253", "RPT_7007_CONS_CAR_EB"
  const [buscaCliente, setBuscaCliente] = useState(""); // busca rápida por nome/nº cliente
  const [buscaTitulo, setBuscaTitulo] = useState(""); // busca por número ou nome do título
  const [filtroSentinela, setFiltroSentinela] = useState(false); // atrasos críticos > 90 dias
  const [filtroCategoria, setFiltroCategoria] = useState(""); // "" = todos, "Portador", "Imobiliário", "Parceiros", "Bancos"

  const [fCart, setFCart] = useState({});
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [fCob, setFCob] = useState({});
  const [fVerif, setFVerif] = useState({});
  const [fProt, setFProt] = useState({});
  const [kpiFilter, setKpiFilter] = useState(null); // "aCobrar" | "cobrado" | "cobHoje" | "faltando" | "pendVerif" | "pendProt" | null
  const [cleanupMsg, setCleanupMsg] = useState(null);
  const [showPaid, setShowPaid] = useState(false);

  // ── Carregar dados do Base44 ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 2000),
        base44.entities.ChargeEvent.list("-created_date", 2000)
      ]);

      // ── DEDUPLICAÇÃO DEFENSIVA ──
      // Usar dbToItem para garantir que a chave seja gerada com os mesmos critérios de
      // normalização (maiúsculas, sem zeros à esquerda, sem pontos, sem espaços).
      const seenKeys = new Map();
      for (const r of (titulos || [])) {
        const asItem = dbToItem(r);
        const key = asItem.id; // buildId já normalizado via dbToItem → buildItem → buildId
        const existing = seenKeys.get(key);
        if (!existing || (r.updated_date || r.created_date) > (existing.updated_date || existing.created_date)) {
          seenKeys.set(key, r);
        }
      }
      const titulosUnicos = Array.from(seenKeys.values());
      // — DEDUPLICAÇÃO LÓGICA (cross-source) —
      // Detecta o mesmo título importado de origens diferentes (ex: FINR1253 e RPT_7007_CONS_CAR_EB).
      // Usa chave lógica sem o campo origem. Mantém o registro mais recente.
      const logicalKeys = new Map();
      for (const r of titulosUnicos) {
        const it = dbToItem(r);
        const lk = [it.nrCli, it.tp, it.titulo, it.seq]
          .map(v => String(v ?? "").toUpperCase().replace(/\s+/g, "").replace(/\./g, "").replace(/^0+(\d+)$/, "$1"))
          .join("|");
        const prev = logicalKeys.get(lk);
        if (!prev || (r.updated_date || r.created_date) > (prev.updated_date || prev.created_date)) {
          logicalKeys.set(lk, r);
        }
      }
      const titulosFinais = Array.from(logicalKeys.values());

      setRecords(titulosFinais.map(dbToItem));
      setEvents(evts || []);
      const dupCount = (titulos || []).length - titulosFinais.length;
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${titulosFinais.length} títulos carregados${dupCount > 0 ? ` (${dupCount} duplicatas ignoradas)` : ""}`);
    } catch (err) {
      setSyncMsg(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {loadData();}, [loadData]);
  useEffect(() => {saveL(LOCAL_THEME, isDark ? "dark" : "light");}, [isDark]);
  useEffect(() => {saveL(LOCAL_TAB, activeTab);setKpiFilter(null);}, [activeTab]);

  // Real-time
  useEffect(() => {
    const unsub1 = base44.entities.Titulo.subscribe(() => loadData());
    const unsub2 = base44.entities.ChargeEvent.subscribe(() => loadData());
    return () => {unsub1();unsub2();};
  }, [loadData]);

  // ── Histórico por cliente ──
  const histMap = useMemo(() => {
    const out = {},seen = new Map();
    for (const e of events) {
      const k = [e.client_code || "", normText(e.client_name || ""), e.event_date || "", e.status || "", e.motive || "", e.note || "", e.event_user || ""].join("|");
      if (!seen.has(k)) seen.set(k, e);
    }
    for (const e of seen.values()) {
      const key = `${String(e.client_code || "").trim()}||${normText(e.client_name || "")}`;
      if (!out[key]) out[key] = [];
      out[key].push({ ...e, data: e.event_date || "", tipo: e.contact_type || "", status: e.status || "", motivo: e.motive || "", obs: e.note || "", usuario: e.event_user || "", dataPromessa: e.promise_date || "", subtype: e.event_subtype || "" });
    }
    Object.keys(out).forEach((k) => out[k].sort((a, b) => String(b.data).localeCompare(String(a.data))));
    return out;
  }, [events]);

  // ── Agrupamento por cliente ──
  const grouped = useMemo(() => {
    const map = new Map();
    // Helper: extrai (codigo, nome) reais quando nomeCli vem no formato "CODIGO/NOME" ou "CODIGO - NOME"
    function extractCliInfo(item) {
      const rawNr = String(item.nrCli || "").trim();
      const rawNome = String(item.nomeCli || "").trim();
      // Padrão 1: nomeCli = "1234/EMPRESA LTDA" ou "1234 - EMPRESA"
      const mSlash = rawNome.match(/^(\d{1,8})\s*[\/\-]\s*(.{2,})$/);
      if (mSlash) {
        const cod = mSlash[1];
        const nome = mSlash[2].trim();
        // Se o nome extraído contém letras, usar essa decomposição
        if (/[A-Za-zÀ-ÿ]/.test(nome)) {
          return { nrCli: cod, nomeCli: nome };
        }
      }
      // Padrão 2: nomeCli puramente numérico → é o código real (nrCli atual é genérico/errado)
      if (/^\d{2,8}$/.test(rawNome) && rawNome !== rawNr) {
        return { nrCli: rawNome, nomeCli: "" };
      }
      return { nrCli: rawNr, nomeCli: rawNome };
    }
    records.forEach((item) => {
      const info = extractCliInfo(item);
      const k = info.nrCli || cliKey(item);
      if (!map.has(k)) map.set(k, { clientKey: k, nrCli: info.nrCli, nomeCli: info.nomeCli, titulos: [], _nomes: [] });
      map.get(k)._nomes.push(info.nomeCli);
      map.get(k).titulos.push(item);
    });
    // Escolher melhor nomeCli: prefere nome com letras (texto real) ao invés de número/código
    map.forEach((g) => {
      // 1) Coleta candidatos: nomes do _nomes + nomes extraídos dos próprios títulos
      const stripCode = (s) => {
        const raw = String(s || "").trim();
        if (!raw) return "";
        // Remove prefixo "CODIGO/" ou "CODIGO -" se houver
        const mm = raw.match(/^(\d{1,8})\s*[\/\-]\s*(.{2,})$/);
        if (mm && /[A-Za-zÀ-ÿ]/.test(mm[2])) return mm[2].trim();
        return raw;
      };
      const fromNomes = (g._nomes || []).map(stripCode).filter(Boolean);
      const fromTitulos = (g.titulos || []).map((t) => stripCode(t && t.nomeCli)).filter(Boolean);
      const cands = [...fromNomes, ...fromTitulos].map((s) => String(s).trim()).filter(Boolean);
      if (cands.length > 0) {
        // Critério: prefere nomes com letras (não-numérico); entre eles, pega o mais longo
        const comLetras = cands.filter((s) => /[A-Za-zÀ-ÿ]/.test(s));
        const pool = comLetras.length > 0 ? comLetras : cands;
        pool.sort((a, b) => b.length - a.length);
        g.nomeCli = pool[0];
      }
      delete g._nomes;
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
      // Vencimentos
      const vencimentos = ts.map((x) => x.vencimento).filter(Boolean).sort();
      const primeiroVencimento = vencimentos[0] || "";
      return { ...g, valorOriginal: vOrig, valorMulta: vMult, valorJuros: vJuro, valorTotalDebito: vTot, maiorAtraso: mAtr, qtdTitulos: ts.length, qtdTotal: qtdT, ultimoContato: ultCont, dataPromessa: dataProm, statusConsolidado: statusC, obsConsolidada: obsC, encaminharConsolidado: encC, solicitanteProtestoConsolidado: solProt, prioridadeCliente: prio, foiCobrado, historicoCliente: histMap[g.clientKey] || [], primeiroVencimento };
    });
  }, [records, histMap]);



  // ── Helpers para filtros Excel ──
  function fieldVal(g, field) {
    switch (field) {
      case "nrCli":return g.nrCli || "(Vazio)";
      case "nomeCli":return g.nomeCli || "(Vazio)";
      case "statusConsolidado":return g.statusConsolidado || "(Vazio)";
      case "prioridadeCliente":return g.prioridadeCliente || "(Vazio)";
      case "encaminharConsolidado":return g.encaminharConsolidado || "Sem encaminhamento";
      case "ultimoContato":return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)";
      case "dataPromessa":return g.dataPromessa ? fmtD(g.dataPromessa) : "(Vazio)";
      case "atrasoLabel":return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—";
      case "vencimento":return g.primeiroVencimento ? fmtD(g.primeiroVencimento) : "(Vazio)";
      case "obsConsolidada":return g.obsConsolidada || "(Sem observação)";
      case "origem":return [...new Set(g.titulos?.map((ti) => ti.origem))].map((o) => o === "FINR1253" ? "Topcon" : "EB").join(", ") || "(Vazio)";
      case "valorOriginal":return fmtM(g.valorOriginal);
      case "valorTotalDebito":return fmtM(g.valorTotalDebito);
      case "sugestaoLabel":{const s = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito);return s ? s.label : "(Sem sugestão)";}
      default:return "";
    }
  }
  function makeColData(arr, field) {return arr.map((g) => ({ [field]: fieldVal(g, field) }));}
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

  // ── Aplicar filtro faixa + origem + busca (memoizado para reatividade) ──
  const groupedFiltrado = useMemo(() => {
    const busca = normText(buscaCliente);
    const buscaTit = normText(buscaTitulo);
    return grouped.filter((g) => {
      if (faixaAtraso > 0 && g.maiorAtraso < faixaAtraso) return false;
      if (filtroOrigem && !g.titulos.some((ti) => ti.origem === filtroOrigem)) return false;
      if (busca && !normText(g.nomeCli).includes(busca) && !String(g.nrCli || "").includes(buscaCliente)) return false;
      // Filtro por título: busca no número ou nome do título
      if (buscaTit) {
        const temTituloMatch = g.titulos.some((ti) => 
          normText(ti.titulo || "").includes(buscaTit) || 
          String(ti.titulo || "").includes(buscaTitulo)
        );
        if (!temTituloMatch) return false;
      }
      // Filtro Atraso Sentinela: apenas atrasos críticos > 90 dias
      if (filtroSentinela && g.maiorAtraso <= 90) return false;
      // Filtro por categoria: busca na categoria de qualquer título do cliente
      if (filtroCategoria && !g.titulos.some((ti) => ti.clientCategory === filtroCategoria)) return false;
      // Esconder pagos por padrão (status Encerrado, Baixado ou resposta Confirmado)
      if (!showPaid) {
        const temPagamento = g.statusConsolidado === "Encerrado" || 
                             g.statusConsolidado === "Baixado" ||
                             g.statusConsolidado === "Pago Aguard. Baixa" ||
                             g.historicoCliente.some(h => h.motivo === "Confirmado");
        if (temPagamento) return false;
      }
      return true;
    });
  }, [grouped, faixaAtraso, filtroOrigem, buscaCliente, buscaTitulo, filtroSentinela, filtroCategoria, showPaid]);

  // ── Sort + filtros ──
  const baseCart = useMemo(() => {
    let arr = [...groupedFiltrado];
    const d = scCart.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (scCart.key) {
        case "numero":return (Number(a.nrCli || 0) - Number(b.nrCli || 0)) * d;
        case "valorOriginal":return (a.valorOriginal - b.valorOriginal) * d;
        case "valorTotalDebito":return (a.valorTotalDebito - b.valorTotalDebito) * d;
        case "atraso":return (a.maiorAtraso - b.maiorAtraso) * d;
        default:return normText(a.nomeCli).localeCompare(normText(b.nomeCli)) * d;
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

  // KPIs dinâmicos baseados na aba ativa e nos dados filtrados
  const dash = useMemo(() => {
    // Base de dados conforme aba
    let base = groupedFiltrado;
    if (activeTab === "cobrados") base = cobrados;else
    if (activeTab === "verificacao") base = verifLista;else
    if (activeTab === "protesto") base = protestoLista;else
    if (activeTab === "carteira") base = sortedCart;

    const cobHoje = base.filter((x) => x.ultimoContato === hojeISO).length;
    const tot = base.length;
    const recuperadoMes = events.
    filter((e) => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado").
    filter((e) => e.event_date && e.event_date.startsWith(hojeISO.slice(0, 7))).
    reduce((s, e) => s + (e.total_value || 0), 0);
    // Clientes devolvidos para a carteira (resposta de verificação ou protesto ainda não recontatados hoje)
    const clientesComResposta = grouped.filter((g) => {
      const temResposta = g.historicoCliente.some(h =>
        h.subtype?.startsWith("RESP_VERIF") || h.subtype?.startsWith("RESP_PROT")
      );
      const workflow = g.encaminharConsolidado;
      // Devolvido = tem resposta E saiu do fluxo (workflow normal) E não foi contatado hoje
      return temResposta && (!workflow || workflow === "normal" || workflow === "") && g.ultimoContato !== hojeISO;
    });
    const devolvidos = clientesComResposta.length;

    return {
      cobHoje, faltando: tot - cobHoje, perc: tot ? cobHoje / tot * 100 : 0,
      numCli: tot, numTit: base.reduce((s, x) => s + x.qtdTitulos, 0),
      vOrig: base.reduce((s, x) => s + x.valorOriginal, 0),
      vTot: base.reduce((s, x) => s + x.valorTotalDebito, 0),
      pendVerif: verifLista.length, pendProt: protestoLista.length,
      devolvidos,
      recuperadoMes,
      aCobrar: base.filter((g) => !g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0),
      cobrado: base.filter((g) => g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0)
    };
  }, [groupedFiltrado, sortedCart, cobrados, verifLista, protestoLista, events, activeTab]);

  function handleSort(k) {setScCart((p) => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" });}
  function toggleSel(k) {setSelected((p) => {const n = new Set(p);n.has(k) ? n.delete(k) : n.add(k);return n;});}
  function toggleAll() {setSelected((p) => p.size === sortedCart.length && sortedCart.length > 0 ? new Set() : new Set(sortedCart.map((g) => g.clientKey)));}
  const hasAnyFilter = (f) => Object.values(f).some((v) => v !== null && v !== undefined);

  // ── Salvar cobrança ──
  async function salvarCobranca(frm, titulos, onDone) {
    if (!frm.status) {alert("Selecione um status.");return;}
    if (frm.encaminhar === "protesto" && !frm.solicitante?.trim()) {alert("Informe quem está solicitando o protesto.");return;}
    const enc = frm.encaminhar || "";
    // Salvar eventos
    for (const item of titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "COBRANCA", event_subtype: enc || null, event_date: hojeISO,
        status: frm.status, motive: enc || null, contact_type: frm.tipo || null,
        promise_date: frm.dataPromessa || null, note: frm.obs || null,
        protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
        event_user: frm.solicitante || "Equipe"
      });
      // Atualizar título
      const existing = records.find((r) => r.id === item.id);
      if (existing) {
        const dbId = existing._dbId;
        if (dbId) {
          await base44.entities.Titulo.update(dbId, {
            current_status: frm.status, current_motive: enc || null,
            current_contact_type: frm.tipo || null, promise_date: frm.dataPromessa || null,
            last_contact_date: hojeISO, last_note: frm.obs || null,
            contact_count: (item.qtd || 0) + 1,
            protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
            workflow_status: enc || "normal", updated_by: frm.solicitante || "Equipe"
          });
        }
      }
    }
    onDone();
    setSyncMsg("✅ Cobrança salva.");
    await loadData();
  }

  async function salvarResposta() {
    if (!respModal || !respForm.responsavel.trim()) {alert("Informe o responsável.");return;}
    if (!respForm.resposta) {alert("Selecione uma resposta.");return;}
    const tipo = respModal.tipo;
    for (const item of respModal.grupo.titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "COBRANCA", event_subtype: `RESP_${tipo.toUpperCase()}`,
        event_date: hojeISO, status: "Em Cobrança", motive: respForm.resposta,
        note: respForm.obs || null, event_user: respForm.responsavel.trim()
      });
      const existing = records.find((r) => r.id === item.id);
      if (existing?._dbId) {
        await base44.entities.Titulo.update(existing._dbId, {
          current_status: "Em Cobrança", workflow_status: "normal",
          updated_by: respForm.responsavel.trim()
        });
      }
    }
    setRespModal(null);
    setSyncMsg("✅ Resposta registrada. Cliente devolvido para a Carteira.");
    await loadData();
  }

  // ── LIMPEZA DE DUPLICATAS NO BANCO ──
  // Remove fisicamente registros duplicados, mantendo apenas o mais recente por buildId.
  // Seguro: nunca apaga ChargeEvents, apenas Titulos duplicados (active=true ou false).
  async function limparDuplicatasBanco() {
    setCleanupMsg("⏳ Verificando duplicatas no banco...");
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const allTitulos = await base44.entities.Titulo.list("client_name", 5000);
    const byKey = new Map();
    for (const r of (allTitulos || [])) {
      // CRÍTICO: usar dbToItem para garantir a MESMA normalização que a importação usa
      const asItem = dbToItem(r);
      const key = asItem.id;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }
    let removed = 0;
    let idx = 0;
    for (const [, group] of byKey) {
      if (group.length <= 1) continue;
      // Ordenar: manter o mais recente (maior updated_date ou created_date)
      group.sort((a, b) => {
        const da = a.updated_date || a.created_date || "";
        const db2 = b.updated_date || b.created_date || "";
        return db2.localeCompare(da);
      });
      // Deletar todos exceto o primeiro (mais recente)
      for (let i = 1; i < group.length; i++) {
        await base44.entities.Titulo.delete(group[i].id);
        removed++;
        idx++;
        if (idx % 3 === 0) await sleep(600);
      }
    }
    setCleanupMsg(removed > 0 ? `✅ ${removed} duplicata(s) removida(s) do banco.` : "✅ Nenhuma duplicata encontrada no banco.");
    if (removed > 0) await loadData();
  }

  // ── IMPORTAÇÃO ──
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function syncImport(source, imported, fileName) {
    try {
      const existingAll = await base44.entities.Titulo.filter({ source }, "client_name", 2000);

      // ── Mapear por CHAVE DE COBRANÇA (buildId) ──
      // Se houver duplicatas no banco com a mesma chave, manter o mais recente (pelo updated_date)
      // para garantir que o upsert não cria novos registros quando já existe um.
      const existMap = new Map();
      for (const r of existingAll || []) {
        // Usar dbToItem para garantir que a chave seja gerada com os mesmos critérios de normalização
        const asItem = dbToItem(r);
        const cobrancaKey = asItem.id;
        const prev = existMap.get(cobrancaKey);
        // Manter o mais recente; se não há anterior, inserir
        if (!prev || (r.updated_date || r.created_date) >= (prev.updated_date || prev.created_date)) {
          existMap.set(cobrancaKey, r);
        }
      }

      // ── Chaves presentes na nova importação ──
      const importKeys = new Set(imported.map((i) => i.id)); // i.id já é buildId(...)

      // ── Proteção contra baixa indevida por planilha parcial ──
      // Só executar baixa automática se a importação trouxe pelo menos 50% do que havia
      // OU se não há nenhum registro existente ainda (primeira importação).
      const existCount = existMap.size;
      const importCount = imported.length;
      const isCarteirCompleta = existCount === 0 || (importCount >= existCount * 0.5);

      let ins = 0, upd = 0, deact = 0, baixados = 0;
      let valorBaixado = 0;

      const DELAY = 1000;       // 1s entre batches de updates
      const BATCH_UPDATE = 3;   // updates individuais: 3 por vez
      const BULK_SIZE = 20;     // novos registros: bulkCreate de 20 por vez
      const BATCH_BAIXA = 2;

      // Separar novos de existentes
      const toCreate = [];
      const toUpdate = [];
      for (const item of imported) {
        const old = existMap.get(item.id);
        const payload = {
          source: item.origem, client_code: item.nrCli, client_name: item.nomeCli,
          doc_type: item.tp || null, serie: item.ser || null, title_number: item.titulo,
          seq: item.seq || null, nf_servico: item.nfServico || null,
          issue_date: item.emissao || null, due_date: item.vencimento || null,
          original_value: Number(item.valorOriginal || 0),
          portador: item.portador || null, active: true,
          import_file: fileName,
          current_status: old?.current_status || "Não Contatado",
          current_motive: old?.current_motive || null,
          current_contact_type: old?.current_contact_type || null,
          promise_date: old?.promise_date || null,
          last_contact_date: old?.last_contact_date || null,
          last_note: old?.last_note || null,
          contact_count: Number(old?.contact_count || 0),
          protest_requested_by: old?.protest_requested_by || null,
          workflow_status: old?.workflow_status || "normal",
          updated_by: "Importação"
        };
        if (old) toUpdate.push({ dbId: old.id, payload });
        else toCreate.push(payload);
      }

      // 1a. Novos registros: bulkCreate em lotes de BULK_SIZE (muito mais eficiente)
      for (let i = 0; i < toCreate.length; i += BULK_SIZE) {
        const chunk = toCreate.slice(i, i + BULK_SIZE);
        await base44.entities.Titulo.bulkCreate(chunk);
        ins += chunk.length;
        if (i + BULK_SIZE < toCreate.length) await sleep(DELAY);
      }

      // 1b. Updates existentes: sequencial com throttle
      for (let i = 0; i < toUpdate.length; i++) {
        await base44.entities.Titulo.update(toUpdate[i].dbId, toUpdate[i].payload);
        upd++;
        if ((i + 1) % BATCH_UPDATE === 0) await sleep(DELAY);
      }

      // 2. Baixa automática — SOMENTE se a importação é uma carteira completa (≥ 50% do volume atual)
      let deactIdx = 0;
      if (isCarteirCompleta) {
        for (const r of existingAll || []) {
          const asItem2 = dbToItem(r);
          const cobrancaKey = asItem2.id;
          const jaFoiBaixado = ["Baixado", "Recebido", "Pago", "Encerrado"].includes(r.current_status);
          if (!importKeys.has(cobrancaKey) && r.active && !jaFoiBaixado) {
            const valorTit = Number(r.original_value || 0);
            valorBaixado += valorTit;

            await base44.entities.Titulo.update(r.id, {
              active: false,
              current_status: "Baixado",
              current_motive: "Saiu da carteira em aberto — baixa automática por importação",
              last_contact_date: hojeISO,
              workflow_status: "baixado",
              updated_by: "Importação"
            });

            await base44.entities.ChargeEvent.create({
              titulo_id: r.id,
              client_code: r.client_code,
              client_name: r.client_name,
              event_type: "BAIXA",
              event_subtype: "SAIU_IMPORTACAO",
              event_date: hojeISO,
              status: "Baixado",
              motive: "Título não presente na nova importação — presumido como recebido/baixado",
              note: `Arquivo importado: ${fileName}. Valor original: R$ ${valorTit.toFixed(2).replace(".", ",")}`,
              event_user: "Importação Automática"
            });

            deact++;
            baixados++;
            deactIdx++;
            if (deactIdx % BATCH_BAIXA === 0) await sleep(1200);
          }
        }
      }

      await base44.entities.ImportLog.create({
        file_name: fileName, source, total_read: imported.length,
        inserted_count: ins, updated_count: upd, deactivated_count: deact
      });

      return { ins, upd, deact, baixados, valorBaixado, isCarteirCompleta, error: null };
    } catch (err) {
      console.error("Erro em syncImport:", err);
      throw err;
    }
  }

  async function importarArquivo(e) {
    const file = e.target.files?.[0];if (!file) return;
    
    // Validar formato do arquivo
    const nomeArq = file.name.toLowerCase();
    const tipoMime = file.type.toLowerCase();
    const extensoesValidas = [".csv", ".xlsx", ".xls"];
    const mimeValidos = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    
    const temExtensaoValida = extensoesValidas.some(ext => nomeArq.endsWith(ext));
    const temMimeValido = mimeValidos.some(mime => tipoMime.includes(mime)) || tipoMime === "";
    
    if (!temExtensaoValida && !temMimeValido) {
      setImportStatus({ ok: false, msg: "❌ Formato de arquivo não permitido. Envie um arquivo CSV, XLSX ou XLS." });
      e.target.value = "";
      return;
    }
    
    setImportStatus(null);
    setIsImporting(true);
    const buf = await file.arrayBuffer();

    // Detectar se é CSV com separador ";"
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const wb = isCsv ?
    XLSX.read(buf, { type: "array", FS: ";" }) :
    XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Limpar BOM e espaços dos cabeçalhos
    const cleanRows = rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k.replace(/^\uFEFF/, "").trim()] = v;
      }
      return out;
    });

    try {
      if (isCobrCsv(cleanRows)) {
        // CSV de clientes cobrados: atualiza status dos títulos existentes
        let atualizados = 0,naoEncontrados = 0, csvIdx = 0;
        for (const row of cleanRows) {
          const nrCli = String(row["Nº"] || row["Nr"] || row["N"] || "").trim();
          const nomeCli = String(row["Cliente"] || "").trim();
          const statusNovo = String(row["Status"] || "").trim() || "Em Cobrança";
          const encaminhar = String(row["Encaminhar"] || "").trim().toLowerCase();
          const promessa = String(row["Promessa"] || "").trim();
          const obs = String(row["Observação"] || row["Observacao"] || "").trim();

          if (!nomeCli) continue;

          // Encontrar títulos correspondentes por número ou nome
          const cands = records.filter((r2) => {
            if (nrCli && r2.nrCli && String(r2.nrCli).trim() === nrCli) return true;
            return normText(r2.nomeCli) === normText(nomeCli);
          });

          if (!cands.length) {naoEncontrados++;continue;}

          for (const item of cands) {
            // Criar evento de cobrança
            await base44.entities.ChargeEvent.create({
              titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
              event_type: "COBRANCA", event_date: hojeISO, status: statusNovo,
              motive: encaminhar || null, contact_type: null,
              promise_date: dateISO(promessa) || null, note: obs || null,
              event_user: "Importação CSV"
            });
            // Atualizar título
            if (item._dbId) {
              await base44.entities.Titulo.update(item._dbId, {
                current_status: statusNovo,
                current_motive: encaminhar || null,
                promise_date: dateISO(promessa) || null,
                last_contact_date: hojeISO,
                last_note: obs || null,
                contact_count: (item.qtd || 0) + 1,
                workflow_status: encaminhar || "normal",
                updated_by: "Importação CSV"
              });
            }
            atualizados++;
          }
          csvIdx++;
          if (csvIdx % 3 === 0) await sleep(600);
        }
        setImportStatus({ ok: true, msg: `✅ CSV Cobrados importado — ${atualizados} títulos atualizados${naoEncontrados > 0 ? `, ${naoEncontrados} clientes não encontrados na carteira` : ""}.` });
        e.target.value = "";
        await loadData();
        return;
      }

      if (isCobrDia(cleanRows.length ? cleanRows : rows)) {
        // Cobrança do dia — atualiza eventos + status dos títulos
        const sourceRows = cleanRows.length ? cleanRows : rows;
        const uniq = uniqCobr(sourceRows);
        let evtCount = 0,updCount = 0,naoEnc = 0,diaIdx = 0;
        for (const row of uniq) {
          const nomeN = normText(pick(row, ["Cliente"]) || "");
          const nrCliRow = String(pick(row, ["N", "Nº", "Nr", "N°"]) || "").replace(/\./g, "").trim();
          const statusNovo2 = String(pick(row, ["Status"]) || "").trim() || "Em Cobrança";
          const motivoNovo = String(pick(row, ["Motivo"]) || "").trim();
          const tipoNovo = String(pick(row, ["Tipo de Contato"]) || "").trim();
          const dtCont = dateISO(pick(row, ["Data do Contato"])) || hojeISO;
          const dtProm = dateISO(pick(row, ["Data da Promessa"]));
          const obsNova = String(pick(row, ["Observação", "Observacao"]) || "").trim();
          // Buscar por número do cliente OU nome
          let cands = records.filter((i) => {
            if (nrCliRow && String(i.nrCli).replace(/\./g, "").trim() === nrCliRow) return true;
            return nomeN && normText(i.nomeCli) === nomeN;
          });
          if (!cands.length) {naoEnc++;continue;}
          for (const item of cands) {
            await base44.entities.ChargeEvent.create({
              titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
              event_type: "COBRANCA", event_date: dtCont, status: statusNovo2,
              motive: motivoNovo || null, contact_type: tipoNovo || null,
              promise_date: dtProm || null, note: obsNova || null, event_user: "Importação"
            });
            evtCount++;
            // Atualizar o título também
            if (item._dbId) {
              await base44.entities.Titulo.update(item._dbId, {
                current_status: statusNovo2,
                current_motive: motivoNovo || null,
                current_contact_type: tipoNovo || null,
                promise_date: dtProm || null,
                last_contact_date: dtCont,
                last_note: obsNova || null,
                contact_count: (item.qtd || 0) + 1,
                updated_by: "Importação"
              });
              updCount++;
            }
          }
          diaIdx++;
          if (diaIdx % 3 === 0) await sleep(600);
        }
        setImportStatus({ ok: true, msg: `✅ Cobrança do dia — ${uniq.length} clientes processados, ${evtCount} eventos, ${updCount} títulos atualizados${naoEnc > 0 ? `, ${naoEnc} não encontrados` : ""}.` });
      } else {
        const source = detectSrc(file.name);
        const imported = source === "FINR1253" ?
        parseRows1253(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })) :
        parseRows7007(rows);
        if (imported.length === 0) {
          setImportStatus({ ok: false, msg: `❌ Nenhum título válido em "${file.name}".` });
          e.target.value = "";
          setIsImporting(false);
          return;
        }
        
        // Log para debug FINR1253
        if (source === "FINR1253") {
          const totalValorPorParsing = imported.reduce((s, x) => s + (x.valorOriginal || 0), 0);
          console.log(`💰 FINR1253 Debug: ${imported.length} títulos, valor total parser = ${fmtM(totalValorPorParsing)}`);
        }
        
        const r = await syncImport(source, imported, file.name);
        const baixaMsg = r?.baixados > 0 ? ` | ${r.baixados} baixados (${fmtM(r.valorBaixado)} lançado no Impacto no Caixa)` : "";
        const parcialMsg = r?.isCarteirCompleta === false ? " ⚠️ Planilha parcial detectada — baixa automática não aplicada." : "";
        setImportStatus({ ok: true, msg: `✅ "${file.name}" [${source === "FINR1253" ? "Topcon" : "EB"}] — ${r?.ins || 0} novos, ${r?.upd || 0} atualizados${baixaMsg}${parcialMsg}` });
      }
      e.target.value = "";
      // CORREÇÃO: recarregar dados após importação para atualizar cards e tabela
      await loadData();
    } catch (err) {
      console.error("Erro na importação:", err);
      e.target.value = "";
      setImportStatus({ ok: false, msg: `❌ Erro na importação: ${err.message}. Carteira pode ter ficado parcialmente atualizada. Verifique o banco de dados.` });
    } finally {
      setIsImporting(false);
    }
  }

  const thS = { background: t.th, padding: "9px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .4, color: t.muted, position: "sticky", top: 0, zIndex: 10 };
  const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: `1px solid ${t.bor}`, ...ex });

  function encBadge(enc) {
    if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
    if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
    return <span style={{ color: t.muted, fontSize: 11 }}>—</span>;
  }

  const CH = (props) => <ColHeader {...props} t={t} sortCfg={scCart} onSort={handleSort} />;

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: t.bg, minHeight: "100vh", color: t.txt }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={importarArquivo} />

      {/* HEADER */}
      <header style={{ background: t.head, borderBottom: `1px solid ${t.bor}`, padding: "0 20px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: t.shad }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 4, color: t.txt }}>SISTEMA DE COBRANÇA</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setIsDark((x) => !x)} style={{ background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{isDark ? "☀️" : "🌙"}</button>
          <Btn t={t} sm onClick={() => setEmailModal(true)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>📧 Enviar PDF</Btn>
          <Btn t={t} sm onClick={() => exportarPDFExecutivo({ grouped, filteredCart: sortedCart, dash, faixaAtraso, filtroOrigem, hojeISO })} style={{ background: "#0369a1", border: "none", color: "#fff" }}>📊 Baixar Relatório</Btn>
          <Btn t={t} sm onClick={() => { if (window.confirm("⚠️ AÇÃO IRREVERSÍVEL\n\nIsso vai remover PERMANENTEMENTE duplicatas físicas do banco de dados, mantendo apenas o registro mais recente por título.\n\nEssa ação não pode ser desfeita. Use apenas para manutenção.\n\nDeseja continuar?")) limparDuplicatasBanco(); }} style={{ background: "#64748b", border: "none", color: "#fff" }} title="Remover duplicatas do banco (irreversível)">🧹 Limpar BD</Btn>
          <Btn t={t} sm onClick={() => fileRef.current?.click()} disabled={isImporting} style={{ background: isImporting ? "#ccc" : t.p, border: "none", color: isImporting ? "#999" : "#fff", cursor: isImporting ? "not-allowed" : "pointer" }}>⬆️ {isImporting ? "Importando..." : "Importar"}</Btn>
        </div>
      </header>

      <main style={{ padding: "14px 16px", maxWidth: "100%", margin: "0 auto" }}>
        {/* Status import */}
        {importStatus &&
        <div style={{ background: importStatus.ok ? isDark ? "#052e16" : "#f0fdf4" : isDark ? "#2d0a0a" : "#fef2f2", border: `1px solid ${importStatus.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: importStatus.ok ? "#16a34a" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{importStatus.msg}</span>
            <button onClick={() => setImportStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        }
        {/* Status limpeza de duplicatas */}
        {cleanupMsg &&
        <div style={{ background: isDark ? "#0c1a2e" : "#eff6ff", border: "1px solid #3b82f6", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{cleanupMsg}</span>
            <button onClick={() => setCleanupMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        }

        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>{isImporting ? "⏳ Importando relatório, aguarde... (não feche a tela)" : loading ? "⏳ Carregando..." : syncMsg}</div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 8, paddingTop: 8, scrollbarWidth: "thin", WebkitOverflowScrolling: "touch", alignItems: "stretch", justifyContent: "flex-start", borderBottom: `1px solid ${t.bor}` }} className="bg-transparent">
          <TabBtn t={t} active={activeTab === "carteira"} onClick={() => setActiveTab("carteira")} badge={dash.devolvidos} badgeColor="#10b981">📋 Carteira Geral</TabBtn>
          <TabBtn t={t} active={activeTab === "cobrados"} onClick={() => setActiveTab("cobrados")}>✅ Histórico / Promessas</TabBtn>
          <TabBtn t={t} active={activeTab === "verificacao"} onClick={() => setActiveTab("verificacao")} badge={dash.pendVerif} badgeColor="#3b82f6">🔍 Conferência de Pagamento</TabBtn>
          <TabBtn t={t} active={activeTab === "protesto"} onClick={() => setActiveTab("protesto")} badge={dash.pendProt} badgeColor="#ef4444">⚖️ Aprovação do Gestor</TabBtn>
          <TabBtn t={t} active={activeTab === "produtividade"} onClick={() => setActiveTab("produtividade")}>👥 Produtividade / Metas</TabBtn>
          <TabBtn t={t} active={activeTab === "fluxo"} onClick={() => setActiveTab("fluxo")}>📈 Impacto no Caixa</TabBtn>
        </div>

        {/* DASHBOARD KPIs — Carteira Geral */}
        {activeTab === "carteira" && (
          <>
            <div className="kpi-container kpi-container-8">
              <KPI t={t} label="Total em Aberto" color="#F59E0B" value={fmtM(dash.vTot)} sub="com multa/juros" />
              <KPI t={t} label="A Cobrar" color="#EF4444" value={fmtM(dash.aCobrar)} sub="sem contato" onClick={() => setKpiFilter(p => p === "aCobrar" ? null : "aCobrar")} active={kpiFilter === "aCobrar"} />
              <KPI t={t} label="Cobrado" color="#10B981" value={fmtM(dash.cobrado)} sub="já contactados" onClick={() => setKpiFilter(p => p === "cobrado" ? null : "cobrado")} active={kpiFilter === "cobrado"} />
              <KPI t={t} label="Cobrados Hoje" color="#FBBF24" value={dash.cobHoje} sub={`${dash.perc.toFixed(1).replace(".", ",")}% do total`} onClick={() => setKpiFilter(p => p === "cobHoje" ? null : "cobHoje")} active={kpiFilter === "cobHoje"} />
              <KPI t={t} label="Faltam Cobrar" color="#EF4444" value={dash.faltando} sub="sem contato hoje" onClick={() => setKpiFilter(p => p === "faltando" ? null : "faltando")} active={kpiFilter === "faltando"} />
              <KPI t={t} label="Nº Clientes" color="#6B7280" value={dash.numCli} sub="ativos" />
              <KPI t={t} label="Nº Títulos" color="#6B7280" value={dash.numTit} sub="ativos" />
              <KPI t={t} label="Val. Original" color="#10B981" value={fmtM(dash.vOrig)} sub="sem multa/juros" />
            </div>
            {kpiFilter && (
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <button onClick={() => setKpiFilter(null)} style={{ background: t.p, border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>✕ Limpar Filtro</button>
              </div>
            )}
          </>
        )}

        {/* KPIs Verificação */}
        {activeTab === "verificacao" && (
          <div className="kpi-container kpi-container-2">
            <KPI t={t} label="Pendentes de Verificação" color="#3B82F6" value={verifLista.length} sub="aguardando resposta" />
            <KPI t={t} label="Valor em Verificação" color="#3B82F6" value={fmtM(verifLista.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total a validar" />
          </div>
        )}

        {/* KPIs Protesto */}
         {activeTab === "protesto" && (
           <div className="kpi-container kpi-container-2">
             <KPI t={t} label="Pendentes de Aprovação" color="#EF4444" value={protestoLista.length} sub="aguardando gestor" />
             <KPI t={t} label="Valor em Protesto" color="#EF4444" value={fmtM(protestoLista.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total a autorizar" />
           </div>
         )}


















        

        {/* FILTROS GLOBAIS — somente Carteira, Verificação e Protesto */}
         {(activeTab === "carteira" || activeTab === "verificacao" || activeTab === "protesto") &&
         <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
             <FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} />
             <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 11, fontWeight: 700, color: t.txt, whiteSpace: "nowrap" }}>
               <input type="checkbox" checked={filtroSentinela} onChange={(e) => setFiltroSentinela(e.target.checked)} style={{ accentColor: "#ef4444", width: 16, height: 16 }} />
               🚨 Sentinela (+90d)
             </label>
             <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
               <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Categoria:</span>
               <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}>
                 <option value="">Todas</option>
                 <option value="Portador">Portador</option>
                 <option value="Imobiliário">Imobiliário</option>
                 <option value="Parceiros">Parceiros</option>
                 <option value="Bancos">Bancos</option>
               </select>
             </div>
             <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
               <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span>
               <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}>
                 <option value="">Todos</option>
                 <option value="FINR1253">Topcon (FINR1253)</option>
                 <option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option>
               </select>
             </div>
             <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}>
               <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>📄 Título:</span>
               <input
               type="text"
               placeholder="Buscar por nº ou nome..."
               value={buscaTitulo}
               onChange={(e) => setBuscaTitulo(e.target.value)}
               style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />

               {buscaTitulo &&
             <button onClick={() => setBuscaTitulo("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
             }
             </div>
             <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}>
               <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span>
               <input
               type="text"
               placeholder="Buscar por nome ou nº..."
               value={buscaCliente}
               onChange={(e) => setBuscaCliente(e.target.value)}
               style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />

               {buscaCliente &&
             <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
             }
             </div>

            {activeTab === "carteira" &&
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 11, fontWeight: 700, color: t.txt, whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} style={{ accentColor: t.p, width: 16, height: 16 }} />
                  👁️ Mostrar pagos
                </label>
                <div style={{ position: "relative" }}>
                  <button onClick={() => setShowColMenu((x) => !x)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    ☰ Colunas {hiddenCols.size > 0 ? `(${hiddenCols.size} ocultas)` : ""}
                  </button>
                {showColMenu &&
            <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "8px", zIndex: 300, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {[
              { key: "nrCli", label: "Nº" }, { key: "nomeCli", label: "CLIENTE" }, { key: "qtd", label: "QTD." },
              { key: "venc", label: "VENCIMENTO" }, { key: "atraso", label: "ATRASO" }, { key: "vOrig", label: "VAL. ORIG" },
              { key: "multa", label: "MULTA" }, { key: "juros", label: "JUROS" }, { key: "total", label: "TOTAL" },
              { key: "status", label: "STATUS" }, { key: "enc", label: "ENCAMINHAR" }, { key: "origem", label: "ORIG." },
              { key: "contato", label: "DT. CONTATO" }, { key: "prom", label: "PROMESSA" },
              { key: "sugest", label: "SUGESTÃO" }, { key: "obs", label: "OBSERVAÇÃO" }].
              map((c) =>
              <label key={c.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, background: hiddenCols.has(c.key) ? t.surf2 : "transparent" }}>
                        <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => setHiddenCols((p) => {const n = new Set(p);n.has(c.key) ? n.delete(c.key) : n.add(c.key);return n;})} style={{ accentColor: t.p }} />
                        {c.label}
                      </label>
              )}
                    <button onClick={() => {setHiddenCols(new Set());setShowColMenu(false);}} style={{ gridColumn: "1/-1", marginTop: 4, background: t.p, color: "#fff", border: "none", borderRadius: 4, padding: "4px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Mostrar Todas</button>
                  </div>
                }
                </div>
              </div>
          }
          </div>
        }

        {/* ═══ CARTEIRA ═══ */}
        {activeTab === "carteira" &&
        <div>
            {selected.size > 0 &&
          <div style={{ background: t.p, borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{selected.size} selecionado(s)</span>
                <button onClick={() => {setBatchForm(emptyForm());setBatchModal(true);}} style={{ background: "#fff", color: t.p, border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏️ Cobrança em Lote</button>
                {selGroups.length === 1 &&
            <button onClick={() => setNegModal(selGroups[0])} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🤝 Negociar</button>
            }
                <Btn t={t} ghost sm onClick={() => setSelected(new Set())} style={{ color: "#fff", borderColor: "#fff" }}>✕ Deselecionar</Btn>
              </div>
          }
            <TabelaCarteira
            sortedCart={sortedCart} baseCart={baseCart} fCart={fCart} setFCart={setFCart}
            selected={selected} toggleSel={toggleSel} toggleAll={toggleAll}
            scCart={scCart} handleSort={handleSort}
            setModal={setModal} setForm={setForm} setHistModal={setHistModal}
            openCli={openCli} setOpenCli={setOpenCli} emptyForm={emptyForm}
            isDark={isDark} t={t}
            makeColData={makeColData} fieldVal={fieldVal} applyExcelFilter={applyExcelFilter}
            setNegModal={setNegModal}
            hiddenCols={hiddenCols} setHiddenCols={setHiddenCols}
            onClickFilter={(val) => setBuscaCliente(val)}
            onEncaminharSugestao={async (g, enc) => {
              for (const item of g.titulos) {
                await base44.entities.ChargeEvent.create({
                  titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
                  event_type: "COBRANCA", event_subtype: enc, event_date: hojeISO,
                  status: g.statusConsolidado || "Em Cobrança", motive: enc,
                  event_user: "Sistema"
                });
                if (item._dbId) {
                  await base44.entities.Titulo.update(item._dbId, { workflow_status: enc, updated_by: "Sistema" });
                }
              }
              setSyncMsg(`✅ ${g.nomeCli} encaminhado para ${enc === "protesto" ? "Protesto" : enc === "verificacao" ? "Verificação" : enc}.`);
              await loadData();
            }} />
          
          </div>
        }

        {/* ═══ COBRADOS + PROMESSAS ═══ */}
        {activeTab === "cobrados" &&
        <>
            {/* 1. Sub-abas — acima dos indicadores */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button onClick={() => setSubTabCobr("historico")} style={{ background: subTabCobr === "historico" ? t.p : t.surf2, color: subTabCobr === "historico" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "historico" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✅ Histórico de Cobrança</button>
              <button onClick={() => setSubTabCobr("promessas")} style={{ background: subTabCobr === "promessas" ? t.p : t.surf2, color: subTabCobr === "promessas" ? "#fff" : t.txt, border: `1px solid ${subTabCobr === "promessas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📅 Promessas & Calendário</button>
            </div>

            {/* 2. KPIs da aba */}
            <div className="kpi-container kpi-container-6">
              <KPI t={t} label="Total Cobrados" color="#10B981" value={cobrados.length} sub="clientes contactados" />
              <KPI t={t} label="Valor Cobrado" color="#10B981" value={fmtM(cobrados.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total em aberto" />
              <KPI t={t} label="Com Promessa" color="#FBBF24" value={cobrados.filter((g) => g.dataPromessa).length} sub="clientes com data" />
              <KPI t={t} label="Prometeu Pagar" color="#A78BFA" value={cobrados.filter((g) => g.statusConsolidado === "Prometeu Pagar").length} sub="status atual" />
              <KPI t={t} label="Pago Aguard. Baixa" color="#3B82F6" value={cobrados.filter((g) => g.statusConsolidado === "Pago Aguard. Baixa").length} sub="aguardando baixa" />
              <KPI t={t} label="Sem Retorno" color="#EF4444" value={cobrados.filter((g) => g.statusConsolidado === "Sem Retorno").length} sub="sem resposta" />
            </div>

            {/* 3. Filtros da aba (abaixo dos KPIs) */}
            <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span>
                <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" }}>
                  <option value="">Todos</option>
                  <option value="FINR1253">Topcon (FINR1253)</option>
                  <option value="RPT_7007_CONS_CAR_EB">EB (RPT_7007)</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 200px", minWidth: 180 }}>
                <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔍 Cliente:</span>
                <input type="text" placeholder="Buscar por nome ou nº..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", flex: 1, minWidth: 0 }} />
                {buscaCliente && <button onClick={() => setBuscaCliente("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>}
              </div>

            </div>

            {/* 4. Conteúdo da sub-aba */}
            {subTabCobr === "historico" &&
          <TabelaCobrados data={cobrados} t={t} setHistModal={setHistModal} dlCsv={dlCsv} />
          }

            {subTabCobr === "promessas" &&
          <MonitorPromessas grouped={groupedFiltrado} t={t} />
          }
          </>
        }

        {/* ═══ VERIFICAÇÃO ═══ */}
        {activeTab === "verificacao" &&
        <TabelaVerificacao data={verifLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />
        }

        {/* ═══ PROTESTO ═══ */}
        {activeTab === "protesto" &&
        <TabelaProtesto data={protestoLista} t={t} setRespModal={setRespModal} setRespForm={setRespForm} />
        }


        {/* ═══ PRODUTIVIDADE / METAS (unificada) ═══ */}
        {activeTab === "produtividade" &&
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPIs Produtividade */}
            <div className="kpi-container kpi-container-4">
              <KPI t={t} label="Total de Contatos" color="#3B82F6" value={events.filter(e => e.event_type === "COBRANCA").length} sub="no período" />
              <KPI t={t} label="Promessas Obtidas" color="#FBBF24" value={events.filter(e => e.status === "Prometeu Pagar").length} sub="confirmadas" />
              <KPI t={t} label="Pagamentos Confirmados" color="#10B981" value={events.filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado").length} sub="verificados" />
              <KPI t={t} label="Taxa de Sucesso" color="#A78BFA" value={`${events.length > 0 ? ((events.filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Prometeu Pagar").length / events.length) * 100).toFixed(1) : 0}%`} sub="conversão" />
            </div>
            
            {/* Sub-abas internas */}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSubTabProd("produtividade")} style={{ background: subTabProd === "produtividade" ? t.p : t.surf2, color: subTabProd === "produtividade" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "produtividade" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>👥 Produtividade da Cobrança</button>
              <button onClick={() => setSubTabProd("metas")} style={{ background: subTabProd === "metas" ? t.p : t.surf2, color: subTabProd === "metas" ? "#fff" : t.txt, border: `1px solid ${subTabProd === "metas" ? t.p : t.bor}`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🎯 Metas de Cobrança</button>
            </div>
            {subTabProd === "produtividade" &&
          <>
                <PainelProdutividade events={events} t={t} />
                <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "16px", boxShadow: t.shad }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📊 Analytics & Exportação</div>
                  <AnalyticsDashboard grouped={grouped} events={events} t={t} />
                </div>
              </>
          }
            {subTabProd === "metas" &&
          <PainelMetas grouped={grouped} events={events} t={t} />
          }
          </div>
        }

        {/* ═══ FLUXO DE CAIXA ═══ */}
        {activeTab === "fluxo" &&
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* KPIs Fluxo */}
          <div className="kpi-container kpi-container-4">
            <KPI t={t} label="Previsão 30 Dias" color="#3B82F6" value={fmtM(grouped.filter(g => g.maiorAtraso <= 30).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="próximo mês" />
            <KPI t={t} label="Previsão 60 Dias" color="#FBBF24" value={fmtM(grouped.filter(g => g.maiorAtraso > 30 && g.maiorAtraso <= 60).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="até 60 dias" />
            <KPI t={t} label="Previsão 90 Dias" color="#A78BFA" value={fmtM(grouped.filter(g => g.maiorAtraso > 60 && g.maiorAtraso <= 90).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="até 90 dias" />
            <KPI t={t} label="Débitos Críticos" color="#EF4444" value={fmtM(grouped.filter(g => g.maiorAtraso > 90).reduce((s, g) => s + g.valorTotalDebito, 0))} sub="acima 90 dias" />
          </div>
          <PrevisaoFluxo grouped={grouped} t={t} />
          {/* ═══ TABELA DE CLIENTES PAGOS ═══ */}
          {(() => {
            const pagosArr = grouped.filter((g) => (
              g.statusConsolidado === "Encerrado" ||
              g.statusConsolidado === "Baixado" ||
              g.statusConsolidado === "Pago Aguard. Baixa" ||
              g.statusConsolidado === "Confirmado"
            ));
            const totalPagosVal = pagosArr.reduce((s, g) => s + (g.valorTotalDebito || 0), 0);
            const totalPagosTit = pagosArr.reduce((s, g) => s + (g.qtdTitulos || 0), 0);
            return (
              <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>💰 Clientes Pagos (Impacto no Caixa)</div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: t.muted }}>
                    <span><b style={{ color: "#10b981" }}>{pagosArr.length}</b> clientes</span>
                    <span><b style={{ color: "#10b981" }}>{totalPagosTit}</b> títulos</span>
                    <span>Total: <b style={{ color: "#10b981" }}>{fmtM(totalPagosVal)}</b></span>
                  </div>
                </div>
                {pagosArr.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: t.muted, fontSize: 12 }}>
                    Nenhum cliente pago no momento.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: t.th, color: t.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${t.bor}` }}>N°</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${t.bor}` }}>Cliente</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Qtd. Títulos</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${t.bor}` }}>Val. Original</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${t.bor}` }}>Total Pago</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Último Contato</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${t.bor}` }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosArr
                          .sort((a, b) => (b.valorTotalDebito || 0) - (a.valorTotalDebito || 0))
                          .map((g) => (
                          <tr key={g.clientKey} style={{ borderBottom: `1px solid ${t.bor}` }}>
                            <td style={{ padding: "8px 10px", color: t.txt, fontWeight: 600 }}>{g.nrCli}</td>
                            <td style={{ padding: "8px 10px", color: t.txt }}>{g.nomeCli}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: t.txt }}>{g.qtdTitulos}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: t.muted }}>{fmtM(g.valorOriginal)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: t.muted }}>{g.ultimoContato ? fmtD(g.ultimoContato) : "—"}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <span style={{ background: "#10b98122", color: "#10b981", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                                {g.statusConsolidado || "Pago"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        }
      </main>

      {/* MODAIS */}
      {modal &&
      <ModalCobranca
        title="✏️ Registrar Cobrança" frm={form} setFrm={setForm}
        onSave={() => salvarCobranca(form, modal.titulos, () => setModal(null))}
        onClose={() => setModal(null)} t={t} isDark={isDark}
        info={<div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${t.bor}` }}><b>{modal.nomeCli}</b><div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>Cliente {modal.nrCli} · {modal.qtdTitulos} título(s) · <b style={{ color: t.p }}>{fmtM(modal.valorTotalDebito)}</b></div></div>} />

      }
      {batchModal &&
      <ModalCobranca
        title={`✏️ Cobrança em Lote — ${selGroups.length} clientes`} frm={batchForm} setFrm={setBatchForm}
        onSave={() => salvarCobranca(batchForm, selGroups.flatMap((g) => g.titulos), () => {setBatchModal(false);setSelected(new Set());})}
        onClose={() => setBatchModal(false)} t={t} isDark={isDark}
        info={<div style={{ background: t.surf2, borderRadius: 8, padding: "8px 12px", marginBottom: 14, border: `1px solid ${t.bor}`, maxHeight: 100, overflowY: "auto" }}>{selGroups.map((g) => <div key={g.clientKey} style={{ fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between" }}><b>{g.nomeCli}</b><span style={{ color: t.p, fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</span></div>)}</div>} />

      }
      <ModalResposta respModal={respModal} respForm={respForm} setRespForm={setRespForm} onSave={salvarResposta} onClose={() => setRespModal(null)} t={t} isDark={isDark} />
      <ModalHistorico histModal={histModal} onClose={() => setHistModal(null)} t={t} />
      {negModal && <ModalNegociacao grupo={negModal} onClose={() => setNegModal(null)} t={t} isDark={isDark} />}
      {emailModal &&
      <ModalEnviarPDF
        grouped={grouped} filteredCart={sortedCart} dash={dash}
        faixaAtraso={faixaAtraso} filtroOrigem={filtroOrigem} hojeISO={hojeISO}
        t={t} onClose={() => setEmailModal(false)} />

      }
    </div>);

}