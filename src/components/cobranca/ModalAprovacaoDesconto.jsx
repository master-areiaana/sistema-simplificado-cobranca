import { useState } from "react";
import { fmtM } from "@/lib/cobranca";
import { base44 } from "@/api/base44Client";

export default function ModalAprovacaoDesconto({ solicitacao, onClose, onAprovado, onReprovado, t, isDark }) {
  const [gestor, setGestor] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  if (!solicitacao) return null;

  const { grupo, desconto, valorOriginal, valorComDesconto, parcelas, solicitante } = solicitacao;

  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, color: t.txt, outline: "none", width: "100%" };

  async function aprovar() {
    if (!gestor.trim()) { alert("Informe o nome do gestor."); return; }
    setLoading(true);
    // Registrar evento de aprovação
    for (const item of grupo.titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "NEGOCIACAO", event_subtype: "APROVADO",
        event_date: new Date().toISOString().slice(0, 10),
        status: "Em Cobrança",
        motive: `Desconto ${desconto}% aprovado por ${gestor.trim()}`,
        note: obs || null,
        event_user: gestor.trim(),
      });
    }
    setLoading(false);
    onAprovado && onAprovado(gestor.trim(), obs);
    onClose();
  }

  async function reprovar() {
    if (!gestor.trim()) { alert("Informe o nome do gestor."); return; }
    setLoading(true);
    for (const item of grupo.titulos) {
      await base44.entities.ChargeEvent.create({
        titulo_id: item.id, client_code: item.nrCli, client_name: item.nomeCli,
        event_type: "NEGOCIACAO", event_subtype: "REPROVADO",
        event_date: new Date().toISOString().slice(0, 10),
        status: "Em Cobrança",
        motive: `Desconto ${desconto}% reprovado por ${gestor.trim()}`,
        note: obs || null,
        event_user: gestor.trim(),
      });
    }
    setLoading(false);
    onReprovado && onReprovado(gestor.trim(), obs);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: t.surf, border: `2px solid #f59e0b`, borderRadius: 14, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ background: "#fef3c7", borderRadius: 8, padding: "6px 10px", fontSize: 20 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.txt }}>Aprovação de Desconto</div>
            <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>Desconto acima do limite — requer autorização do gestor</div>
          </div>
        </div>

        {/* Info da negociação */}
        <div style={{ background: t.surf2, borderRadius: 10, padding: "14px 16px", marginBottom: 20, border: `1px solid ${t.bor}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: t.txt, marginBottom: 8 }}>{grupo.nomeCli}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            <div><span style={{ color: t.muted }}>Valor original:</span> <b style={{ color: t.txt }}>{fmtM(valorOriginal)}</b></div>
            <div><span style={{ color: t.muted }}>Desconto:</span> <b style={{ color: "#ef4444" }}>{desconto}%</b></div>
            <div><span style={{ color: t.muted }}>Valor negociado:</span> <b style={{ color: "#10b981", fontSize: 13 }}>{fmtM(valorComDesconto)}</b></div>
            <div><span style={{ color: t.muted }}>Parcelas:</span> <b style={{ color: t.txt }}>{parcelas}x</b></div>
            <div style={{ gridColumn: "span 2" }}><span style={{ color: t.muted }}>Solicitado por:</span> <b style={{ color: t.txt }}>{solicitante}</b></div>
          </div>
        </div>

        {/* Campos */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginBottom: 5 }}>Nome do Gestor / Aprovador *</div>
          <input value={gestor} onChange={e => setGestor(e.target.value)} placeholder="Ex: João Silva" style={inp} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginBottom: 5 }}>Observações (opcional)</div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Justificativa ou condições especiais..." style={{ ...inp, height: 70, resize: "vertical" }} />
        </div>

        {/* Ações */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={reprovar} disabled={loading} style={{ flex: 1, background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ✕ Reprovar
          </button>
          <button onClick={aprovar} disabled={loading} style={{ flex: 1, background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ✓ Aprovar
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 12 }}>Cancelar — voltar à negociação</button>
        </div>
      </div>
    </div>
  );
}