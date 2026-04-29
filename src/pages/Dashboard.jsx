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

  const [fCart, setFCart] = useState({});
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [fCob, setFCob] = useState({});
  const [fVerif, setFVerif] = useState({});
  const [fProt, setFProt] = useState({});
  const [kpiFilter, setKpiFilter] = useState(null); // "aCobrar" | "cobrado" | "cobHoje" | "faltando" | "pendVerif" | "pendProt" | null

  // ── Carregar dados do Base44 ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
      base44.entities.Titulo.filter({ active: true }, "client_name", 2000),
      base44.entities.ChargeEvent.list("-created_date", 2000)]
      );
      setRecords((titulos || []).map(dbToItem));
      setEvents(evts || []);
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${(titulos || []).length} títulos carregados`);
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
    records.forEach((item) => {
      const k = cliKey(item);
      if (!map.has(k)) map.set(k, { clientKey: k, nrCli: item.nrCli, nomeCli: item.nomeCli, titulos: [] });
      map.get(k).titulos.push(item);
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
    return grouped.filter((g) => {
      if (faixaAtraso > 0 && g.maiorAtraso < faixaAtraso) return false;
      if (filtroOrigem && !g.titulos.some((ti) => ti.origem === filtroOrigem)) return false;
      if (busca && !normText(g.nomeCli).includes(busca) && !String(g.nrCli || "").includes(buscaCliente)) return false;
      return true;
    });
  }, [grouped, faixaAtraso, filtroOrigem, buscaCliente]);

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
    return {
      cobHoje, faltando: tot - cobHoje, perc: tot ? cobHoje / tot * 100 : 0,
      numCli: tot, numTit: base.reduce((s, x) => s + x.qtdTitulos, 0),
      vOrig: base.reduce((s, x) => s + x.valorOriginal, 0),
      vTot: base.reduce((s, x) => s + x.valorTotalDebito, 0),
      pendVerif: verifLista.length, pendProt: protestoLista.length,
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

  // ── IMPORTAÇÃO (corrigida: chama loadData após sync) ──
  async function syncImport(source, imported, fileName) {
    const existingAll = await base44.entities.Titulo.filter({ source }, "client_name", 2000);
    const existMap = new Map((existingAll || []).map((r) => [r.id || buildId({ origem: r.source, nrCli: r.client_code, tp: r.doc_type, ser: r.serie, titulo: r.title_number, seq: r.seq, nfServico: r.nf_servico }), r]));
    const importIds = new Set(imported.map((i) => i.id));
    let ins = 0,upd = 0,deact = 0;

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
      if (old) {
        await base44.entities.Titulo.update(old.id, payload);
        upd++;
      } else {
        await base44.entities.Titulo.create(payload);
        ins++;
      }
    }

    // Desativar títulos removidos
    for (const r of existingAll || []) {
      const rId = r.id || "";
      if (!importIds.has(rId) && r.active) {
        await base44.entities.Titulo.update(r.id, { active: false, updated_by: "Importação" });
        deact++;
      }
    }

    await base44.entities.ImportLog.create({ file_name: fileName, source, total_read: imported.length, inserted_count: ins, updated_count: upd, deactivated_count: deact });
    return { ins, upd, deact };
  }

  async function importarArquivo(e) {
    const file = e.target.files?.[0];if (!file) return;
    setImportStatus(null);
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

    if (isCobrCsv(cleanRows)) {
      // CSV de clientes cobrados: atualiza status dos títulos existentes
      let atualizados = 0,naoEncontrados = 0;
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
      let evtCount = 0,updCount = 0,naoEnc = 0;
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
      }
      setImportStatus({ ok: true, msg: `✅ Cobrança do dia — ${uniq.length} clientes processados, ${evtCount} eventos, ${updCount} títulos atualizados${naoEnc > 0 ? `, ${naoEnc} não encontrados` : ""}.` });
    } else {
      const source = detectSrc(file.name);
      const imported = source === "FINR1253" ?
      parseRows1253(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })) :
      parseRows7007(rows);
      if (imported.length === 0) {
        setImportStatus({ ok: false, msg: `❌ Nenhum título válido em "${file.name}".` });
        e.target.value = "";return;
      }
      const r = await syncImport(source, imported, file.name);
      setImportStatus({ ok: true, msg: `✅ "${file.name}" [${source === "FINR1253" ? "Topcon" : "EB"}] — ${r?.ins || 0} novos, ${r?.upd || 0} atualizados, ${r?.deact || 0} desativados.` });
    }
    e.target.value = "";
    // CORREÇÃO: recarregar dados após importação para atualizar cards e tabela
    await loadData();
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
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importarArquivo} />

      {/* HEADER */}
      <header style={{ background: t.head, borderBottom: `1px solid ${t.bor}`, padding: "0 20px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: t.shad }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 4, color: t.txt }}>SISTEMA DE COBRANÇA</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setIsDark((x) => !x)} style={{ background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{isDark ? "☀️" : "🌙"}</button>
          <Btn t={t} sm onClick={() => setEmailModal(true)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>📧 Enviar PDF</Btn>
          <Btn t={t} sm onClick={() => exportarPDFExecutivo({ grouped, filteredCart: sortedCart, dash, faixaAtraso, filtroOrigem, hojeISO })} style={{ background: "#0369a1", border: "none", color: "#fff" }}>📊 Baixar Relatório</Btn>
          <Btn t={t} sm onClick={() => fileRef.current?.click()} style={{ background: t.p, border: "none", color: "#fff" }}>⬆️ Importar</Btn>
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

        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>{loading ? "⏳ Carregando..." : syncMsg}</div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 6, paddingTop: 4, scrollbarWidth: "thin", WebkitOverflowScrolling: "touch", alignItems: "center", justifyContent: "center" }} className="bg-transparent">
          <TabBtn t={t} active={activeTab === "carteira"} onClick={() => setActiveTab("carteira")}>📋 Carteira Geral</TabBtn>
          <TabBtn t={t} active={activeTab === "cobrados"} onClick={() => setActiveTab("cobrados")}>✅ Histórico / Promessas</TabBtn>
          <TabBtn t={t} active={activeTab === "verificacao"} onClick={() => setActiveTab("verificacao")} badge={dash.pendVerif} badgeColor="#3b82f6">🔍 Conferência de Pagamento</TabBtn>
          <TabBtn t={t} active={activeTab === "protesto"} onClick={() => setActiveTab("protesto")} badge={dash.pendProt} badgeColor="#ef4444">⚖️ Aprovação do Gestor</TabBtn>
          <TabBtn t={t} active={activeTab === "produtividade"} onClick={() => setActiveTab("produtividade")}>👥 Produtividade / Metas</TabBtn>
          <TabBtn t={t} active={activeTab === "fluxo"} onClick={() => setActiveTab("fluxo")}>📈 Impacto no Caixa</TabBtn>
        </div>

        {/* DASHBOARD KPIs — Carteira Geral */}
        {activeTab === "carteira" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 }}>
            {kpiFilter && (
              <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 11, color: t.p }}>
                <span>🔍 Filtrando por indicador</span>
                <button onClick={() => setKpiFilter(null)} style={{ background: t.p, border: "none", borderRadius: 4, padding: "2px 8px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>✕ Limpar</button>
              </div>
            )}
            <KPI t={t} label="Total em Aberto" color={t.p} value={fmtM(dash.vTot)} sub="com multa/juros" />
            <KPI t={t} label="A Cobrar" color="#ef4444" value={fmtM(dash.aCobrar)} sub="sem contato" onClick={() => setKpiFilter(p => p === "aCobrar" ? null : "aCobrar")} active={kpiFilter === "aCobrar"} />
            <KPI t={t} label="Cobrado" color="#10b981" value={fmtM(dash.cobrado)} sub="já contactados" onClick={() => setKpiFilter(p => p === "cobrado" ? null : "cobrado")} active={kpiFilter === "cobrado"} />
            <KPI t={t} label="Cobrados Hoje" color="#f59e0b" value={dash.cobHoje} sub={`${dash.perc.toFixed(1).replace(".", ",")}% do total`} onClick={() => setKpiFilter(p => p === "cobHoje" ? null : "cobHoje")} active={kpiFilter === "cobHoje"} />
            <KPI t={t} label="Faltam Cobrar" color="#ef4444" value={dash.faltando} sub="sem contato hoje" onClick={() => setKpiFilter(p => p === "faltando" ? null : "faltando")} active={kpiFilter === "faltando"} />
            <KPI t={t} label="Nº Clientes" color="#555" value={dash.numCli} sub="ativos" />
            <KPI t={t} label="Nº Títulos" color="#888" value={dash.numTit} sub="ativos" />
            <KPI t={t} label="Val. Original" color="#10b981" value={fmtM(dash.vOrig)} sub="sem multa/juros" />
            <KPI t={t} label="Verif. Pendentes" color="#3b82f6" value={dash.pendVerif} sub="aguard. resposta" onClick={() => setKpiFilter(p => p === "pendVerif" ? null : "pendVerif")} active={kpiFilter === "pendVerif"} />
            <KPI t={t} label="Protesto Pendentes" color="#ef4444" value={dash.pendProt} sub="aguard. aprovação" onClick={() => setKpiFilter(p => p === "pendProt" ? null : "pendProt")} active={kpiFilter === "pendProt"} />
          </div>
        )}

        





















        

        {/* FILTROS GLOBAIS — somente Carteira, Verificação e Protesto */}
        {(activeTab === "carteira" || activeTab === "verificacao" || activeTab === "protesto") &&
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 }}>
              <KPI t={t} label="Total Cobrados" color="#10b981" value={cobrados.length} sub="clientes contactados" />
              <KPI t={t} label="Valor Cobrado" color="#10b981" value={fmtM(cobrados.reduce((s, x) => s + x.valorTotalDebito, 0))} sub="total em aberto" />
              <KPI t={t} label="Com Promessa" color="#f59e0b" value={cobrados.filter((g) => g.dataPromessa).length} sub="clientes com data" />
              <KPI t={t} label="Prometeu Pagar" color="#7c3aed" value={cobrados.filter((g) => g.statusConsolidado === "Prometeu Pagar").length} sub="status atual" />
              <KPI t={t} label="Pago Aguard. Baixa" color="#3b82f6" value={cobrados.filter((g) => g.statusConsolidado === "Pago Aguard. Baixa").length} sub="aguardando baixa" />
              <KPI t={t} label="Sem Retorno" color="#ef4444" value={cobrados.filter((g) => g.statusConsolidado === "Sem Retorno").length} sub="sem resposta" />
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
        <PrevisaoFluxo grouped={grouped} t={t} />
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