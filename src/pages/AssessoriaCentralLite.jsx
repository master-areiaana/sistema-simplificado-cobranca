import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtM, hojeISO, normText } from "@/lib/cobranca";
import PainelNotificacoesAssessoria from "@/components/assessoria/PainelNotificacoesAssessoria";
import CardTituloAssessoria from "@/components/assessoria/CardTituloAssessoria";
import {
  buildAssessoriaNotifications,
  loadAssessoriaReadIds,
  saveAssessoriaReadIds,
  updateAssessoriaUnreadCount
} from "@/lib/assessoriaNotifications";

function sameTitleEvent(e, item) {
  const byId = e.titulo_id && item.id && String(e.titulo_id) === String(item.id);
  const byClient = String(e.client_code || "").trim() === String(item.nrCli || "").trim() && normText(e.client_name || "") === normText(item.nomeCli || "");
  return byId || byClient;
}

function Card({ label, value, color = "#111" }) {
  return <div style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: 14 }}><div style={{ color: "#666", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>{label}</div><div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div></div>;
}

export default function AssessoriaCentralLite() {
  const usuarioAtual = "empresa";
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [readIds, setReadIds] = useState(() => loadAssessoriaReadIds(usuarioAtual));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [formById, setFormById] = useState({});
  const [chatById, setChatById] = useState({});
  const [openItemId, setOpenItemId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [titulos, evts] = await Promise.all([
        base44.entities.Titulo.filter({ active: true }, "client_name", 3000),
        base44.entities.ChargeEvent.list("-created_date", 3000)
      ]);
      const emAssessoria = (titulos || []).map(dbToItem).filter(x => x.encaminhar === "assessoria");
      setRecords(emAssessoria);
      setEvents(evts || []);
      setMsg(`Atualizado: ${emAssessoria.length} título(s) em assessoria.`);
    } catch (err) {
      setMsg(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const notifications = useMemo(() => buildAssessoriaNotifications(events, [], readIds), [events, readIds]);
  const unreadCount = notifications.filter(n => !n.lida).length;
  useEffect(() => { updateAssessoriaUnreadCount(unreadCount); }, [unreadCount]);

  const assessoria = useMemo(() => {
    const b = normText(busca);
    return records.filter(r => {
      const histTxt = events.filter(e => sameTitleEvent(e, r)).map(e => `${e.status || ""} ${e.note || ""} ${e.event_user || ""}`).join(" ");
      if (b && !normText(`${r.nrCli} ${r.nomeCli} ${r.titulo} ${r.seq} ${histTxt}`).includes(b)) return false;
      if (statusFiltro && r.status !== statusFiltro) return false;
      return true;
    }).sort((a, b2) => (b2.valorTotalDebito || 0) - (a.valorTotalDebito || 0));
  }, [records, events, busca, statusFiltro]);

  const resumo = useMemo(() => ({
    clientes: new Set(assessoria.map(r => `${r.nrCli}|${normText(r.nomeCli)}`)).size,
    titulos: assessoria.length,
    total: assessoria.reduce((s, r) => s + (r.valorTotalDebito || 0), 0),
    vencidos: assessoria.filter(r => r.diasAtraso > 0).length,
    semRetorno: assessoria.filter(r => !events.some(e => sameTitleEvent(e, r) && (e.event_type === "ASSESSORIA" || e.event_type === "CHAT_ASSESSORIA"))).length,
  }), [assessoria, events]);

  function historicoDoTitulo(item) {
    return events.filter(e => sameTitleEvent(e, item)).sort((a, b) => String(b.event_date || b.created_date || "").localeCompare(String(a.event_date || a.created_date || "")));
  }

  function persistRead(next) {
    setReadIds(next);
    saveAssessoriaReadIds(usuarioAtual, next);
  }

  function openNotification(n) {
    const next = new Set(readIds);
    next.add(n.id);
    persistRead(next);
    if (n.tituloId) {
      const item = records.find(r => String(r.id) === String(n.tituloId));
      if (item) setOpenItemId(item.id);
    }
  }

  function markAllRead() {
    const next = new Set(readIds);
    notifications.forEach(n => next.add(n.id));
    persistRead(next);
  }

  function updateForm(id, patch) {
    setFormById(p => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  }

  async function salvarRetorno(item) {
    const frm = formById[item.id] || {};
    if (!frm.status) return alert("Selecione o status do retorno.");
    if (!frm.obs?.trim()) return alert("Preencha a observação/retorno da assessoria.");
    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: "ASSESSORIA",
        event_subtype: "RETORNO_ASSESSORIA",
        event_date: hojeISO,
        status: frm.status,
        motive: frm.devolver ? "devolver_carteira" : "assessoria",
        promise_date: frm.promessa || null,
        note: frm.obs,
        event_user: "Empresa / Assessoria"
      });
      if (item._dbId) {
        await base44.entities.Titulo.update(item._dbId, {
          current_status: frm.status,
          current_motive: frm.devolver ? "devolver_carteira" : "assessoria",
          promise_date: frm.promessa || null,
          last_contact_date: hojeISO,
          last_note: frm.obs,
          workflow_status: frm.devolver ? "normal" : "assessoria",
          updated_by: "Empresa / Assessoria"
        });
      }
      updateForm(item.id, { obs: "" });
      setMsg("Retorno salvo, histórico atualizado e notificação gerada.");
      await loadData();
    } catch (err) {
      setMsg(`Erro ao salvar retorno: ${err.message}`);
    }
  }

  async function enviarChat(item) {
    const text = (chatById[item.id] || "").trim();
    if (!text) return alert("Digite uma mensagem para registrar no chat do título.");
    try {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id,
        client_code: item.nrCli,
        client_name: item.nomeCli,
        event_type: "CHAT_ASSESSORIA",
        event_subtype: "EMPRESA_PARA_ASSESSORIA",
        event_date: hojeISO,
        status: item.status || "Em Cobrança",
        motive: "chat_assessoria",
        note: text,
        event_user: "Empresa"
      });
      setChatById(p => ({ ...p, [item.id]: "" }));
      setMsg("Mensagem registrada e notificação gerada.");
      await loadData();
    } catch (err) {
      setMsg(`Erro ao enviar mensagem: ${err.message}`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "Segoe UI, sans-serif", color: "#111" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #ddd", padding: "14px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 4 }}>SISTEMA DE COBRANÇA</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Central de Assessoria · Acompanhamento por título</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/" style={headerBtn}>← Sistema interno</a>
          <button onClick={loadData} disabled={loading} style={{ ...headerBtn, background: "#0ea5e9", color: "#fff" }}>Atualizar</button>
        </div>
      </header>
      <main style={{ padding: 18 }}>
        <PainelNotificacoesAssessoria notifications={notifications} unreadCount={unreadCount} showNotifications={showNotifications} setShowNotifications={setShowNotifications} onOpenNotification={openNotification} onMarkAllRead={markAllRead} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Card label="Clientes" value={resumo.clientes} />
          <Card label="Títulos" value={resumo.titulos} />
          <Card label="Vencidos" value={resumo.vencidos} color="#ef4444" />
          <Card label="Sem retorno" value={resumo.semRetorno} color="#f59e0b" />
          <Card label="Saldo em Assessoria" value={fmtM(resumo.total)} color="#f97316" />
        </div>
        <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Filtros</span>
          <input placeholder="Buscar por cliente, título, mensagem ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 9, border: "1px solid #ddd", borderRadius: 8 }} />
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: 9, border: "1px solid #ddd", borderRadius: 8 }}>
            <option value="">Todos os status</option>
            <option>Não Contatado</option><option>Em Cobrança</option><option>Sem Retorno</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option><option>Incobrável</option><option>SEM CONTATO</option>
          </select>
        </section>
        {msg && <div style={{ marginBottom: 10, fontSize: 12, color: msg.startsWith("Erro") ? "#dc2626" : "#16a34a" }}>{msg}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          {assessoria.length === 0 && <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 26, textAlign: "center", color: "#777" }}>Nenhum título encaminhado para assessoria.</div>}
          {assessoria.map(item => <CardTituloAssessoria key={item.id} item={item} form={formById[item.id] || {}} historico={historicoDoTitulo(item)} aberto={openItemId === item.id} onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)} onFormChange={patch => updateForm(item.id, patch)} onSalvarRetorno={() => salvarRetorno(item)} chatValue={chatById[item.id] || ""} onChatChange={v => setChatById(p => ({ ...p, [item.id]: v }))} onEnviarChat={() => enviarChat(item)} isEmpresa={true} />)}
        </div>
      </main>
    </div>
  );
}

const headerBtn = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };
