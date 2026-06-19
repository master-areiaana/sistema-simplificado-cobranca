import { useState } from "react";
import { fmtD, fmtM, hojeISO, manualObservationText } from "@/lib/cobranca";
import { PromBadge } from "./UI";
import { base44 } from "@/api/base44Client";

export default function ModalHistorico({ histModal, onClose, t }) {
  const [chatMsg, setChatMsg] = useState("");
  const [chatUser, setChatUser] = useState("");
  const [sending, setSending] = useState(false);
  const [localMsgs, setLocalMsgs] = useState([]);

  if (!histModal) return null;

  const allHistory = [...(histModal.historicoCliente || []), ...localMsgs]
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

  async function enviarMensagem() {
    if (!chatMsg.trim() || !chatUser.trim()) return;
    setSending(true);
    try {
      await base44.entities.ChargeEvent.create({
        client_code: histModal.nrCli,
        client_name: histModal.nomeCli,
        event_type: "MENSAGEM",
        event_date: hojeISO,
        status: histModal.statusConsolidado || "Em Cobrança",
        note: chatMsg.trim(),
        event_user: chatUser.trim(),
      });
      setLocalMsgs(prev => [...prev, {
        data: hojeISO, tipo: "Chat", status: "Mensagem", obs: chatMsg.trim(),
        usuario: chatUser.trim(), subtype: "MENSAGEM", motivo: "", dataPromessa: "",
      }]);
      setChatMsg("");
    } finally {
      setSending(false);
    }
  }

  const inpS = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: t.txt, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.surf, borderRadius: 12, width: 700, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${t.bor}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${t.bor}`, flexShrink: 0 }}>
          <b style={{ fontSize: 15 }}>📜 Histórico — {histModal.nomeCli}</b>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Info do cliente */}
        <div style={{ background: t.surf2, margin: "12px 20px 0", borderRadius: 8, padding: "10px 12px", border: `1px solid ${t.bor}`, flexShrink: 0 }}>
          <div style={{ color: t.muted, fontSize: 12 }}>Cliente {histModal.nrCli} · {histModal.qtdTitulos} título(s) · <b style={{ color: t.p }}>{fmtM(histModal.valorTotalDebito)}</b></div>
        </div>

        {/* Histórico de eventos */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {allHistory.length === 0
            ? <div style={{ color: t.muted, textAlign: "center", padding: 30 }}>Nenhum registro ainda.</div>
            : allHistory.map((h, i) => {
                const isMsg = h.subtype === "MENSAGEM" || h.event_type === "MENSAGEM";
                const isVerif = h.subtype?.startsWith("RESP_VERIF") || h.subtype === "verificacao";
                const isProt = h.subtype?.startsWith("RESP_PROT") || h.subtype === "protesto";
                const cor = isMsg ? "#7c3aed" : isVerif ? "#3b82f6" : isProt ? "#ef4444" : t.bor;
                return (
                  <div key={i} style={{ background: isMsg ? (t.surf2) : t.surf2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${cor}`, borderLeft: `3px solid ${cor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>
                        {isMsg ? "💬 " : isVerif ? "🔍 " : isProt ? "⚖️ " : ""}{isMsg ? "Mensagem" : h.status}
                      </span>
                      <span style={{ fontSize: 11, color: t.muted }}>{fmtD(h.data)} · {h.tipo || (isMsg ? "Chat" : "—")} · {h.usuario || "—"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: t.txt }}>{manualObservationText(h.obs, h.usuario) || "Sem observação manual"}</div>
                    {h.motivo && !isMsg && <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>Encaminhamento: <b>{h.motivo}</b></div>}
                    {h.dataPromessa && <div style={{ fontSize: 11, marginTop: 4 }}><PromBadge date={h.dataPromessa} t={t} /></div>}
                  </div>
                );
              })
          }
        </div>

        {/* Área de nova mensagem */}
        <div style={{ borderTop: `1px solid ${t.bor}`, padding: "14px 20px", flexShrink: 0, background: t.surf }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>💬 Nova mensagem sobre o cliente</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{ ...inpS, width: 160 }}
              placeholder="Seu nome *"
              value={chatUser}
              onChange={e => setChatUser(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              rows={2}
              style={{ ...inpS, flex: 1, resize: "none" }}
              placeholder="Digite uma observação, solicitação ou recado sobre este cliente..."
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } }}
            />
            <button
              onClick={enviarMensagem}
              disabled={sending || !chatMsg.trim() || !chatUser.trim()}
              style={{ background: chatMsg.trim() && chatUser.trim() ? "#7c3aed" : t.surf2, color: chatMsg.trim() && chatUser.trim() ? "#fff" : t.muted, border: "none", borderRadius: 6, padding: "0 16px", fontWeight: 700, fontSize: 12, cursor: chatMsg.trim() && chatUser.trim() ? "pointer" : "not-allowed", flexShrink: 0, minWidth: 80 }}
            >
              {sending ? "..." : "Enviar"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>Enter para enviar · Shift+Enter para nova linha</div>
        </div>
      </div>
    </div>
  );
}
