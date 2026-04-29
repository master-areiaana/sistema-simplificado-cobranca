import { fmtD, fmtM } from "@/lib/cobranca";
import { PromBadge } from "./UI";

export default function ModalHistorico({ histModal, onClose, t }) {
  if (!histModal) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.surf, borderRadius: 12, padding: 24, width: 640, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${t.bor}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "center" }}>
          <b style={{ fontSize: 15 }}>📜 Histórico — {histModal.nomeCli}</b>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${t.bor}` }}>
          <div style={{ color: t.muted, fontSize: 12 }}>Cliente {histModal.nrCli} · {histModal.qtdTitulos} título(s) · {fmtM(histModal.valorTotalDebito)}</div>
        </div>
        {(histModal.historicoCliente || []).length === 0
          ? <div style={{ color: t.muted, textAlign: "center", padding: 30 }}>Nenhum registro ainda.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(histModal.historicoCliente || []).map((h, i) => {
              const isVerif = h.subtype?.startsWith("RESP_VERIF") || h.subtype === "verificacao";
              const isProt = h.subtype?.startsWith("RESP_PROT") || h.subtype === "protesto";
              const cor = isVerif ? "#3b82f6" : isProt ? "#ef4444" : t.bor;
              return (
                <div key={i} style={{ background: t.surf2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${cor}`, borderLeft: `3px solid ${cor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{isVerif ? "🔍 " : isProt ? "⚖️ " : ""}{h.status}</span>
                    <span style={{ fontSize: 11, color: t.muted }}>{fmtD(h.data)} · {h.tipo || "—"} · {h.usuario || "—"}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{h.obs || "Sem observação"}</div>
                  {h.motivo && <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>Encaminhamento: <b>{h.motivo}</b></div>}
                  {h.dataPromessa && <div style={{ fontSize: 11, marginTop: 4 }}><PromBadge date={h.dataPromessa} t={t} /></div>}
                </div>
              );
            })}
          </div>
        }
      </div>
    </div>
  );
}