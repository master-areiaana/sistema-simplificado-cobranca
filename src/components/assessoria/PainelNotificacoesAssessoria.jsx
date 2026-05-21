import React from "react";

const cardStyle = (lida) => ({
  border: "1px solid #e5e7eb",
  borderLeft: `5px solid ${lida ? "#94a3b8" : "#ef4444"}`,
  borderRadius: 10,
  padding: 10,
  cursor: "pointer",
  background: lida ? "#fff" : "#fff7ed"
});

const th = { padding: "8px 9px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
const td = { padding: "8px 9px", verticalAlign: "top" };

export default function PainelNotificacoesAssessoria({
  notifications = [],
  unreadCount = 0,
  showNotifications,
  setShowNotifications,
  onOpenNotification,
  onMarkAllRead
}) {
  return (
    <>
      <section style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${unreadCount > 0 ? "#ef4444" : "#10b981"}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              Assessoria {unreadCount > 0 ? <span style={{ color: "#ef4444" }}>🔴 {unreadCount}</span> : <span style={{ color: "#10b981" }}>✓</span>}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Notificações de mensagens, retornos, status, usuários e movimentações da assessoria.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowNotifications(x => !x)} style={{ border: "1px solid #ddd", background: showNotifications ? "#111827" : "#fff", color: showNotifications ? "#fff" : "#111", borderRadius: 8, padding: "8px 10px", fontWeight: 800, cursor: "pointer" }}>
              {showNotifications ? "Ocultar notificações" : "Ver notificações"}
            </button>
            <button onClick={onMarkAllRead} style={{ border: 0, background: "#10b981", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 800, cursor: "pointer" }}>Marcar todas como lidas</button>
          </div>
        </div>
        {showNotifications && (
          <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
            {notifications.length === 0 && <div style={{ color: "#777", fontSize: 12 }}>Nenhuma notificação registrada ainda.</div>}
            {notifications.slice(0, 8).map(n => (
              <div key={n.id} onClick={() => onOpenNotification(n)} style={cardStyle(n.lida)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <b>{n.lida ? "" : "🔴 "}{n.titulo}</b>
                  <span style={{ fontSize: 11, color: "#666" }}>{n.dataHora}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{n.texto}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "#666" }}>
                  <span>Cliente: <b>{n.cliente}</b></span>
                  <span>Usuário: <b>{n.usuario}</b></span>
                  <span>Tipo: <b>{n.tipo}</b></span>
                  <span>Prioridade: <b>{n.prioridade}</b></span>
                  <span>Status: <b>{n.statusNovo}</b></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 10px" }}>Histórico de Notificações</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f1f5f9", color: "#475569", fontSize: 10, textTransform: "uppercase" }}>
              <tr>
                <th style={th}>Data e hora</th>
                <th style={th}>Tipo</th>
                <th style={th}>Título do caso</th>
                <th style={th}>Cliente</th>
                <th style={th}>Usuário</th>
                <th style={th}>Responsável</th>
                <th style={th}>Status anterior</th>
                <th style={th}>Status novo</th>
                <th style={th}>Lida?</th>
                <th style={th}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 && <tr><td colSpan="10" style={{ padding: 18, textAlign: "center", color: "#777" }}>Sem notificações.</td></tr>}
              {notifications.slice(0, 80).map(n => (
                <tr key={`hist-${n.id}`} style={{ borderBottom: "1px solid #eee", background: n.lida ? "#fff" : "#fff7ed" }}>
                  <td style={td}>{n.dataHora}</td>
                  <td style={td}>{n.tipo}</td>
                  <td style={td}>{n.caso}</td>
                  <td style={td}>{n.cliente}</td>
                  <td style={td}>{n.usuario}</td>
                  <td style={td}>{n.responsavel}</td>
                  <td style={td}>{n.statusAnterior}</td>
                  <td style={td}>{n.statusNovo}</td>
                  <td style={td}>{n.lida ? "Sim" : "Não"}</td>
                  <td style={td}><button onClick={() => onOpenNotification(n)} style={{ border: 0, background: "#0ea5e9", color: "#fff", borderRadius: 6, padding: "5px 8px", fontWeight: 700, cursor: "pointer" }}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
