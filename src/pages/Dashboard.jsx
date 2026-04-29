import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import {
  hoje, hojeISO, fmtM, fmtD, normText, cliKey, buildItem, buildId, dbToItem,
  detectSrc, parseRows1253, parseRows7007, calcFin, dateISO, num, pick,
  dlCsv, openPrint, prioLabel, prioCor, sugestaoEncaminhamento, diffDias
} from "@/lib/cobranca";
import { DARK, LIGHT, loadL, saveL } from "@/lib/theme";
import { KPI, TabBtn, Badge, PrioBadge, PromBadge, ObsCell, Btn, PromessaClassifBadge, SugestaoEncBadge } from "@/components/cobranca/UI";
import ColHeader from "@/components/cobranca/ColHeader";
import TabelaCarteira from "@/components/cobranca/TabelaCarteira";
import ModalCobranca from "@/components/cobranca/ModalCobranca";
import ModalResposta from "@/components/cobranca/ModalResposta";
import ModalHistorico from "@/components/cobranca/ModalHistorico";
import FaixaFilter from "@/components/cobranca/FaixaFilter";

const LOCAL_THEME = "sc_theme";
const LOCAL_TAB = "sc_tab";
const STATUS_OPC = ["Não Contatado","Em Cobrança","Sem Retorno","Prometeu Pagar","Pago Aguard. Baixa","Em Permuta","Encerrado"];
const VERIF_RESP = ["Confirmado","Não localizado","Baixado","Erro","Duplicidade","Devolver para cobrança"];
const PROT_RESP = ["Aprovado","Reprovado","Devolver para cobrança"];

function isCobrDia(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const h = Object.keys(rows[0] || {}).map(x => normText(x));
  return h.includes("CLIENTE") && h.includes("TOTAL") && h.includes("STATUS") && h.includes("MOTIVO");
}

function uniqCobr(rows) {
  const seen = new Set(), out = [];
  rows.forEach(r => {
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
  const [activeTab, setActiveTab] = useState(() => loadL(LOCAL_TAB, "carteira"));

  const [modal, setModal] = useState(null);
  const [histModal, setHistModal] = useState(null);
  const [openCli, setOpenCli] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [batchModal, setBatchModal] = useState(false);
  const [respModal, setRespModal] = useState(null);
  const [respForm, setRespForm] = useState({ responsavel: "", resposta: "", obs: "" });

  const emptyForm = () => ({ status: "", encaminhar: "", tipo: "", solicitante: "", dataPromessa: "", obs: "" });
  const [form, setForm] = useState(emptyForm());
  const [batchForm, setBatchForm] = useState(emptyForm());

  const [scCart, setScCart] = useState({ key: "cliente", dir: "asc" });
  const [faixaAtraso, setFaixaAtraso] = useState(0); // 0 = todos
  const [filtroOrigem, setFiltroOrigem] = useState(""); // "" = todos, "FINR1253", "RPT_7007_CONS_CAR_EB"

  const [fCart, setFCart] = useState({});
  const [fCob, setFCob] = useState({});
  const [fVerif, setFVerif] = useState({});
  const [fProt, setFProt] = useState({});

  // ── Carregar dados do Base44 ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 2000),
        base44.entities.ChargeEvent.list("-created_date", 2000),
      ]);
      setRecords((titulos || []).map(dbToItem));
      setEvents(evts || []);
      setSyncMsg(`✅ ${new Date().toLocaleTimeString("pt-BR")} — ${(titulos || []).length} títulos carregados`);
    } catch (err) {
      setSyncMsg(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { saveL(LOCAL_THEME, isDark ? "dark" : "light"); }, [isDark]);
  useEffect(() => { saveL(LOCAL_TAB, activeTab); }, [activeTab]);

  // Real-time
  useEffect(() => {
    const unsub1 = base44.entities.Titulo.subscribe(() => loadData());
    const unsub2 = base44.entities.ChargeEvent.subscribe(() => loadData());
    return () => { unsub1(); unsub2(); };
  }, [loadData]);

  // ── Histórico por cliente ──
  const histMap = useMemo(() => {
    const out = {}, seen = new Map();
    for (const e of events) {
      const k = [e.client_code || "", normText(e.client_name || ""), e.event_date || "", e.status || "", e.motive || "", e.note || "", e.event_user || ""].join("|");
      if (!seen.has(k)) seen.set(k, e);
    }
    for (const e of seen.values()) {
      const key = `${String(e.client_code || "").trim()}||${normText(e.client_name || "")}`;
      if (!out[key]) out[key] = [];
      out[key].push({ ...e, data: e.event_date || "", tipo: e.contact_type || "", status: e.status || "", motivo: e.motive || "", obs: e.note || "", usuario: e.event_user || "", dataPromessa: e.promise_date || "", subtype: e.event_subtype || "" });
    }
    Object.keys(out).forEach(k => out[k].sort((a, b) => String(b.data).localeCompare(String(a.data))));
    return out;
  }, [events]);

  // ── Agrupamento por cliente ──
  const grouped = useMemo(() => {
    const map = new Map();
    records.forEach(item => {
      const k = cliKey(item);
      if (!map.has(k)) map.set(k, { clientKey: k, nrCli: item.nrCli, nomeCli: item.nomeCli, titulos: [] });
      map.get(k).titulos.push(item);
    });
    return Array.from(map.values()).map(g => {
      const ts = g.titulos;
      const vOrig = ts.reduce((s, x) => s + Number(x.valorOriginal || 0), 0);
      const vMult = ts.reduce((s, x) => s + Number(x.valorMulta || 0), 0);
      const vJuro = ts.reduce((s, x) => s + Number(x.valorJuros || 0), 0);
      const vTot = ts.reduce((s, x) => s + Number(x.valorTotalDebito || 0), 0);
      const mAtr = ts.reduce((m, x) => Math.max(m, Number(x.diasAtraso || 0)), 0);
      const qtdT = ts.reduce((s, x) => s + Number(x.qtd || 0), 0);
      const ultCont = ts.map(x => x.dataContato || "").filter(Boolean).sort().slice(-1)[0] || "";
      const dataProm = ts.map(x => x.dataPromessa || "").filter(Boolean).sort().slice(-1)[0] || "";
      const statusC = ts.map(x => x.status).filter(Boolean).sort().slice(-1)[0] || "Não Contatado";
      const obsC = ts.map(x => x.obs).filter(Boolean).slice(-1)[0] || "";
      const encC = ts.map(x => x.encaminhar).filter(Boolean).slice(-1)[0] || "";
      const solProt = ts.map(x => x.solicitanteProtesto).filter(Boolean).slice(-1)[0] || "";
      const prio = mAtr > 90 || qtdT >= 3 ? "CRÍTICO" : mAtr > 30 || qtdT >= 2 ? "ALTO" : mAtr > 0 || qtdT >= 1 ? "MÉDIO" : "BAIXO";
      const foiCobrado = ts.some(x => (x.qtd || 0) > 0 || !!x.dataContato);
      // Vencimentos
      const vencimentos = ts.map(x => x.vencimento).filter(Boolean).sort();
      const primeiroVencimento = vencimentos[0] || "";
      return { ...g, valorOriginal: vOrig, valorMulta: vMult, valorJuros: vJuro, valorTotalDebito: vTot, maiorAtraso: mAtr, qtdTitulos: ts.length, qtdTotal: qtdT, ultimoContato: ultCont, dataPromessa: dataProm, statusConsolidado: statusC, obsConsolidada: obsC, encaminharConsolidado: encC, solicitanteProtestoConsolidado: solProt, prioridadeCliente: prio, foiCobrado, historicoCliente: histMap[g.clientKey] || [], primeiroVencimento };
    });
  }, [records, histMap]);

  // ── Helpers para filtros Excel ──
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
      case "origem": return [...new Set(g.titulos?.map(ti => ti.origem))].map(o => o === "FINR1253" ? "Topcon" : "EB").join(", ") || "(Vazio)";
      case "valorOriginal": return fmtM(g.valorOriginal);
      case "valorTotalDebito": return fmtM(g.valorTotalDebito);
      default: return "";
    }
  }
  function makeColData(arr, field) { return arr.map(g => ({ [field]: fieldVal(g, field) })); }
  function applyExcelFilter(arr, filters) {
    return arr.filter(g => {
      for (const [field, vals] of Object.entries(filters)) {
        if (!vals) continue;
        if (vals.length === 0) return false;
        const v = fieldVal(g, field);
        if (!vals.includes(v)) return false;
      }
      return true;
    });
  }

  // ── Aplicar filtro faixa + origem ──
  function applyFaixaOrigem(arr) {
    return arr.filter(g => {
      if (faixaAtraso > 0 && g.maiorAtraso < faixaAtraso) return false;
      if (filtroOrigem && !g.titulos.some(ti => ti.origem === filtroOrigem)) return false;
      return true;
    });
  }

  // ── Sort + filtros ──
  const baseCart = useMemo(() => {
    let arr = applyFaixaOrigem([...grouped]);
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
  }, [grouped, scCart, faixaAtraso, filtroOrigem]);

  const sortedCart = useMemo(() => applyExcelFilter(baseCart, fCart), [baseCart, fCart]);
  const cobrados = useMemo(() => applyExcelFilter(applyFaixaOrigem(grouped.filter(g => g.foiCobrado)), fCob), [grouped, fCob, faixaAtraso, filtroOrigem]);
  const verifLista = useMemo(() => applyExcelFilter(applyFaixaOrigem(grouped.filter(g => g.encaminharConsolidado === "verificacao")), fVerif), [grouped, fVerif, faixaAtraso, filtroOrigem]);
  const protestoLista = useMemo(() => applyExcelFilter(applyFaixaOrigem(grouped.filter(g => g.encaminharConsolidado === "protesto")), fProt), [grouped, fProt, faixaAtraso, filtroOrigem]);
  const selGroups = useMemo(() => sortedCart.filter(g => selected.has(g.clientKey)), [sortedCart, selected]);

  const dash = useMemo(() => {
    const cobHoje = grouped.filter(x => x.ultimoContato === hojeISO).length;
    const tot = grouped.length;
    const recuperadoMes = events
      .filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado")
      .filter(e => e.event_date && e.event_date.startsWith(hojeISO.slice(0, 7)))
      .reduce((s, e) => s + (e.total_value || 0), 0);
    return {
      cobHoje, faltando: tot - cobHoje, perc: tot ? (cobHoje / tot * 100) : 0,
      numCli: tot, numTit: grouped.reduce((s, x) => s + x.qtdTitulos, 0),
      vOrig: grouped.reduce((s, x) => s + x.valorOriginal, 0),
      vTot: grouped.reduce((s, x) => s + x.valorTotalDebito, 0),
      pendVerif: verifLista.length, pendProt: protestoLista.length,
      recuperadoMes,
      aCobrar: grouped.filter(g => !g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0),
      cobrado: grouped.filter(g => g.foiCobrado).reduce((s, x) => s + x.valorTotalDebito, 0),
    };
  }, [grouped, verifLista, protestoLista, events]);

  function handleSort(k) { setScCart(p => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }); }
  function toggleSel(k) { setSelected(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function toggleAll() { setSelected(p => p.size === sortedCart.length && sortedCart.length > 0 ? new Set() : new Set(sortedCart.map(g => g.clientKey))); }
  const hasAnyFilter = (f) => Object.values(f).some(v => v !== null && v !== undefined);

  // ── Salvar cobrança ──
  async function salvarCobranca(frm, titulos, onDone) {
    if (!frm.status) { alert("Selecione um status."); return; }
    if (frm.encaminhar === "protesto" && !frm.solicitante?.trim()) { alert("Informe quem está solicitando o protesto."); return; }
    const enc = frm.encaminhar || "";
    // Salvar eventos
    for (const item of titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "COBRANCA", event_subtype: enc || null, event_date: hojeISO,
        status: frm.status, motive: enc || null, contact_type: frm.tipo || null,
        promise_date: frm.dataPromessa || null, note: frm.obs || null,
        protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
        event_user: frm.solicitante || "Equipe",
      });
      // Atualizar título
      const existing = records.find(r => r.id === item.id);
      if (existing) {
        const dbId = existing._dbId;
        if (dbId) {
          await base44.entities.Titulo.update(dbId, {
            current_status: frm.status, current_motive: enc || null,
            current_contact_type: frm.tipo || null, promise_date: frm.dataPromessa || null,
            last_contact_date: hojeISO, last_note: frm.obs || null,
            contact_count: (item.qtd || 0) + 1,
            protest_requested_by: enc === "protesto" ? frm.solicitante.trim() : null,
            workflow_status: enc || "normal", updated_by: frm.solicitante || "Equipe",
          });
        }
      }
    }
    onDone();
    setSyncMsg("✅ Cobrança salva.");
    await loadData();
  }

  async function salvarResposta() {
    if (!respModal || !respForm.responsavel.trim()) { alert("Informe o responsável."); return; }
    if (!respForm.resposta) { alert("Selecione uma resposta."); return; }
    const tipo = respModal.tipo;
    const retornar = respForm.resposta === "Devolver para cobrança";
    const novoStatus = retornar ? "Em Cobrança" : respModal.grupo.statusConsolidado;
    for (const item of respModal.grupo.titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "COBRANCA", event_subtype: `RESP_${tipo.toUpperCase()}`,
        event_date: hojeISO, status: novoStatus, motive: respForm.resposta,
        note: respForm.obs || null, event_user: respForm.responsavel.trim(),
      });
      const existing = records.find(r => r.id === item.id);
      if (existing?._dbId) {
        await base44.entities.Titulo.update(existing._dbId, {
          current_status: novoStatus, workflow_status: retornar ? "normal" : "done",
          updated_by: respForm.responsavel.trim(),
        });
      }
    }
    setRespModal(null);
    setSyncMsg(retornar ? "✅ Devolvido para a Carteira." : "✅ Resposta registrada.");
    await loadData();
  }

  // ── IMPORTAÇÃO (corrigida: chama loadData após sync) ──
  async function syncImport(source, imported, fileName) {
    const existingAll = await base44.entities.Titulo.filter({ source }, "client_name", 2000);
    const existMap = new Map((existingAll || []).map(r => [r.id || buildId({ origem: r.source, nrCli: r.client_code, tp: r.doc_type, ser: r.serie, titulo: r.title_number, seq: r.seq, nfServico: r.nf_servico }), r]));
    const importIds = new Set(imported.map(i => i.id));
    let ins = 0, upd = 0, deact = 0;

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
        updated_by: "Importação",
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
    for (const r of (existingAll || [])) {
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
    const file = e.target.files?.[0]; if (!file) return;
    setImportStatus(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (isCobrDia(rows)) {
      // Cobrança do dia — atualiza eventos
      const uniq = uniqCobr(rows);
      let evtCount = 0;
      for (const row of uniq) {
        const nomeN = normText(pick(row, ["Cliente"]) || "");
        const statusNovo = String(pick(row, ["Status"]) || "").trim() || "Em Cobrança";
        const motivoNovo = String(pick(row, ["Motivo"]) || "").trim();
        const tipoNovo = String(pick(row, ["Tipo de Contato"]) || "").trim();
        const dtCont = dateISO(pick(row, ["Data do Contato"])) || hojeISO;
        const dtProm = dateISO(pick(row, ["Data da Promessa"]));
        const obsNova = String(pick(row, ["Observação", "Observacao"]) || "").trim();
        let cands = records.filter(i => normText(i.nomeCli) === nomeN);
        if (!cands.length) continue;
        for (const item of cands) {
          await base44.entities.ChargeEvent.create({
            titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
            event_type: "COBRANCA", event_date: dtCont, status: statusNovo,
            motive: motivoNovo || null, contact_type: tipoNovo || null,
            promise_date: dtProm || null, note: obsNova || null, event_user: "Importação",
          });
          evtCount++;
        }
      }
      setImportStatus({ ok: true, msg: `✅ Cobrança do dia — ${uniq.length} clientes, ${evtCount} eventos.` });
    } else {
      const source = detectSrc(file.name);
      const imported = source === "FINR1253"
        ? parseRows1253(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }))
        : parseRows7007(rows);
      if (imported.length === 0) {
        setImportStatus({ ok: false, msg: `❌ Nenhum título válido em "${file.name}".` });
        e.target.value = ""; return;
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
          <button onClick={() => setIsDark(x => !x)} style={{ background: t.surf, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{isDark ? "☀️" : "🌙"}</button>
          <Btn t={t} sm onClick={() => fileRef.current?.click()} style={{ background: t.p, border: "none", color: "#fff" }}>⬆️ Importar</Btn>
        </div>
      </header>

      <main style={{ padding: "16px 20px", maxWidth: 1920, margin: "0 auto" }}>
        {/* Status import */}
        {importStatus && (
          <div style={{ background: importStatus.ok ? (isDark ? "#052e16" : "#f0fdf4") : (isDark ? "#2d0a0a" : "#fef2f2"), border: `1px solid ${importStatus.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: importStatus.ok ? "#16a34a" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{importStatus.msg}</span>
            <button onClick={() => setImportStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        )}

        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>{loading ? "⏳ Carregando..." : syncMsg}</div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <TabBtn t={t} active={activeTab === "carteira"} onClick={() => setActiveTab("carteira")}>📋 Carteira Atual</TabBtn>
          <TabBtn t={t} active={activeTab === "cobrados"} onClick={() => setActiveTab("cobrados")}>✅ Cobrados</TabBtn>
          <TabBtn t={t} active={activeTab === "verificacao"} onClick={() => setActiveTab("verificacao")} badge={dash.pendVerif} badgeColor="#3b82f6">🔍 Verificar Pagamento</TabBtn>
          <TabBtn t={t} active={activeTab === "protesto"} onClick={() => setActiveTab("protesto")} badge={dash.pendProt} badgeColor="#ef4444">⚖️ Protesto</TabBtn>
        </div>

        {/* DASHBOARD KPIs */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, boxShadow: t.shad }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: t.muted, textTransform: "uppercase", marginBottom: 10 }}>Indicadores</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <KPI t={t} label="Total em Aberto" color={t.p} value={fmtM(dash.vTot)} sub="com multa/juros" />
            <KPI t={t} label="A Cobrar" color="#ef4444" value={fmtM(dash.aCobrar)} sub="sem contato" />
            <KPI t={t} label="Cobrado" color="#10b981" value={fmtM(dash.cobrado)} sub="já contactados" />
            <KPI t={t} label="Recuperado no Mês" color="#7c3aed" value={fmtM(dash.recuperadoMes)} sub={hojeISO.slice(0, 7)} />
            <KPI t={t} label="Cobrados hoje" color="#f59e0b" value={dash.cobHoje} sub={`${dash.perc.toFixed(1).replace(".", ",")}% do total`} />
            <KPI t={t} label="Faltam cobrar" color="#ef4444" value={dash.faltando} sub="sem contato hoje" />
            <KPI t={t} label="Nº Clientes" color="#555" value={dash.numCli} sub="ativos" />
            <KPI t={t} label="Nº Títulos" color="#888" value={dash.numTit} sub="ativos" />
            <KPI t={t} label="Val. Original" color="#10b981" value={fmtM(dash.vOrig)} sub="sem multa/juros" />
            <KPI t={t} label="Verif. Pendentes" color="#3b82f6" value={dash.pendVerif} sub="aguard. resposta" />
            <KPI t={t} label="Protesto Pendentes" color="#ef4444" value={dash.pendProt} sub="aguard. aprovação" />
          </div>
        </div>

        {/* FILTROS GLOBAIS */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <FaixaFilter faixaAtual={faixaAtraso} setFaixa={setFaixaAtraso} t={t} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Relatório:</span>
            {[{ label: "Todos", value: "" }, { label: "Topcon (FINR1253)", value: "FINR1253" }, { label: "EB (RPT_7007)", value: "RPT_7007_CONS_CAR_EB" }].map(op => (
              <button key={op.value} onClick={() => setFiltroOrigem(op.value)} style={{ background: filtroOrigem === op.value ? t.p : t.surf2, color: filtroOrigem === op.value ? "#fff" : t.muted, border: `1px solid ${filtroOrigem === op.value ? t.p : t.bor}`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{op.label}</button>
            ))}
          </div>
        </div>

        {/* ═══ CARTEIRA ═══ */}
        {activeTab === "carteira" && (
          <div>
            {selected.size > 0 && (
              <div style={{ background: t.p, borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{selected.size} selecionado(s)</span>
                <button onClick={() => { setBatchForm(emptyForm()); setBatchModal(true); }} style={{ background: "#fff", color: t.p, border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏️ Cobrança em Lote</button>
                <Btn t={t} ghost sm onClick={() => setSelected(new Set())} style={{ color: "#fff", borderColor: "#fff" }}>✕ Deselecionar</Btn>
              </div>
            )}
            <TabelaCarteira
              sortedCart={sortedCart} baseCart={baseCart} fCart={fCart} setFCart={setFCart}
              selected={selected} toggleSel={toggleSel} toggleAll={toggleAll}
              scCart={scCart} handleSort={handleSort}
              setModal={setModal} setForm={setForm} setHistModal={setHistModal}
              openCli={openCli} setOpenCli={setOpenCli} emptyForm={emptyForm}
              isDark={isDark} t={t}
              makeColData={makeColData} fieldVal={fieldVal} applyExcelFilter={applyExcelFilter}
            />
          </div>
        )}

        {/* ═══ COBRADOS ═══ */}
        {activeTab === "cobrados" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn t={t} ghost sm onClick={() => dlCsv("cobrados.csv", [["Nº","Cliente","Qtd.","Total","Status","Contato","Promessa","Obs","Prioridade"], ...cobrados.map(g => [g.nrCli,g.nomeCli,g.qtdTitulos,Number(g.valorTotalDebito).toFixed(2).replace(".",","),g.statusConsolidado,fmtD(g.ultimoContato),fmtD(g.dataPromessa),g.obsConsolidada||"—",g.prioridadeCliente])])}>⬇️ CSV</Btn>
              <span style={{ fontSize: 11, color: t.muted, marginLeft: "auto" }}><b style={{ color: t.txt }}>{cobrados.length}</b> clientes</span>
            </div>
            <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "65vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Nº","CLIENTE","QTD.","TOTAL","STATUS","ENCAMINHAR","CONTATO","PROMESSA","CLASSIF.","OBSERVAÇÃO","PRIORIDADE","HIST."].map(h => <th key={h} style={thS}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cobrados.length === 0 && <tr><td colSpan={12} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhum cliente cobrado.</td></tr>}
                  {cobrados.map((g, i) => (
                    <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: `4px solid ${prioCor(g.prioridadeCliente)}` }}>
                      <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                      <td style={tdS()}><b>{g.nomeCli}</b></td>
                      <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                      <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                      <td style={tdS()}>{g.statusConsolidado}</td>
                      <td style={tdS()}>{encBadge(g.encaminharConsolidado)}</td>
                      <td style={{ ...tdS(), color: t.muted }}>{fmtD(g.ultimoContato)}</td>
                      <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>
                      <td style={tdS()}><PromessaClassifBadge qtd={g.qtdTotal} /></td>
                      <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                      <td style={tdS()}><PrioBadge label={g.prioridadeCliente} /></td>
                      <td style={tdS()}><Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ VERIFICAÇÃO ═══ */}
        {activeTab === "verificacao" && (
          <>
            <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(59,130,246,.07)", border: "2px solid #3b82f6", borderRadius: 8, fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
              🔍 Clientes encaminhados para verificação de pagamento.
            </div>
            <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #3b82f6", maxHeight: "65vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{["Nº","CLIENTE","QTD.","TOTAL","ATRASO","STATUS","CONTATO","OBSERVAÇÃO","RESPOSTA","AÇÃO"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {verifLista.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhum cliente aguardando verificação.</td></tr>}
                  {verifLista.map((g, i) => {
                    const lastResp = g.historicoCliente.find(h => h.subtype?.startsWith("RESP_VERIF"));
                    return (
                      <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: "4px solid #3b82f6" }}>
                        <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                        <td style={tdS()}><b>{g.nomeCli}</b></td>
                        <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                        <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                        <td style={{ ...tdS(), color: "#ef4444", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
                        <td style={tdS()}>{g.statusConsolidado}</td>
                        <td style={{ ...tdS(), color: t.muted }}>{fmtD(g.ultimoContato)}</td>
                        <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                        <td style={tdS()}>{lastResp ? <Badge label={lastResp.motivo} color={lastResp.motivo === "Confirmado" ? "#10b981" : "#64748b"} /> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ Aguardando</span>}</td>
                        <td style={tdS()}><Btn t={t} sm onClick={() => { setRespModal({ tipo: "verificacao", grupo: g }); setRespForm({ responsavel: "", resposta: "", obs: "" }); }} style={{ background: "#3b82f6", color: "#fff" }}>🔍 Responder</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ PROTESTO ═══ */}
        {activeTab === "protesto" && (
          <>
            <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "2px solid #ef4444", borderRadius: 8, fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
              ⚖️ Solicitações de protesto pendentes de aprovação.
            </div>
            <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #ef4444", maxHeight: "65vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{["Nº","CLIENTE","QTD.","TOTAL","ATRASO","STATUS","SOLICITADO POR","OBSERVAÇÃO","DECISÃO","AÇÃO"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {protestoLista.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhuma solicitação de protesto.</td></tr>}
                  {protestoLista.map((g, i) => {
                    const lastResp = g.historicoCliente.find(h => h.subtype?.startsWith("RESP_PROT"));
                    return (
                      <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: "4px solid #ef4444" }}>
                        <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                        <td style={tdS()}><b>{g.nomeCli}</b></td>
                        <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                        <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                        <td style={{ ...tdS(), color: "#ef4444", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
                        <td style={tdS()}>{g.statusConsolidado}</td>
                        <td style={{ ...tdS(), color: "#ef4444", fontWeight: 600 }}>{g.solicitanteProtestoConsolidado || "—"}</td>
                        <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                        <td style={tdS()}>{lastResp ? <Badge label={lastResp.motivo} color={lastResp.motivo === "Aprovado" ? "#10b981" : "#64748b"} /> : <Badge label="Pendente" color="#f59e0b" dot />}</td>
                        <td style={tdS()}><Btn t={t} sm onClick={() => { setRespModal({ tipo: "protesto", grupo: g }); setRespForm({ responsavel: "", resposta: "", obs: "" }); }} style={{ background: "#ef4444", color: "#fff" }}>⚖️ Decidir</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* MODAIS */}
      {modal && (
        <ModalCobranca
          title="✏️ Registrar Cobrança" frm={form} setFrm={setForm}
          onSave={() => salvarCobranca(form, modal.titulos, () => setModal(null))}
          onClose={() => setModal(null)} t={t} isDark={isDark}
          info={<div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${t.bor}` }}><b>{modal.nomeCli}</b><div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>Cliente {modal.nrCli} · {modal.qtdTitulos} título(s) · <b style={{ color: t.p }}>{fmtM(modal.valorTotalDebito)}</b></div></div>}
        />
      )}
      {batchModal && (
        <ModalCobranca
          title={`✏️ Cobrança em Lote — ${selGroups.length} clientes`} frm={batchForm} setFrm={setBatchForm}
          onSave={() => salvarCobranca(batchForm, selGroups.flatMap(g => g.titulos), () => { setBatchModal(false); setSelected(new Set()); })}
          onClose={() => setBatchModal(false)} t={t} isDark={isDark}
          info={<div style={{ background: t.surf2, borderRadius: 8, padding: "8px 12px", marginBottom: 14, border: `1px solid ${t.bor}`, maxHeight: 100, overflowY: "auto" }}>{selGroups.map(g => <div key={g.clientKey} style={{ fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between" }}><b>{g.nomeCli}</b><span style={{ color: t.p, fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</span></div>)}</div>}
        />
      )}
      <ModalResposta respModal={respModal} respForm={respForm} setRespForm={setRespForm} onSave={salvarResposta} onClose={() => setRespModal(null)} t={t} isDark={isDark} />
      <ModalHistorico histModal={histModal} onClose={() => setHistModal(null)} t={t} />
    </div>
  );
}