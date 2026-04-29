import { VERIF_RESP, PROT_RESP, fmtM } from "@/lib/cobranca";
import { Btn, Inp, Lbl } from "./UI";

export default function ModalResposta({ respModal, respForm, setRespForm, onSave, onClose, t, isDark }) {
  if (!respModal) return null;
  const isVerif = respModal.tipo === "verificacao";
  const resps = isVerif ? VERIF_RESP : PROT_RESP;
  const cor = isVerif ? "#3b82f6" : "#ef4444";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.surf, borderRadius: 12, padding: 24, width: 480, maxWidth: "95vw", border: `2px solid ${cor}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
          <div>
            <b style={{ fontSize: 15, color: cor }}>{isVerif ? "🔍 Verificar Pagamento" : "⚖️ Decisão de Protesto"}</b>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>Após confirmar, o cliente retorna para a Carteira</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <div style={{ background: t.surf2, borderRadius: 8, padding: "10px 12px", marginBottom: 14, border: `1px solid ${cor}` }}>
          <b>{respModal.grupo.nomeCli}</b>
          <div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>Cliente {respModal.grupo.nrCli} · <b style={{ color: t.p }}>{fmtM(respModal.grupo.valorTotalDebito)}</b></div>
          {respModal.grupo.obsConsolidada && <div style={{ fontSize: 11, color: t.muted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${t.bor}` }}><b>Obs. cobrança:</b> {respModal.grupo.obsConsolidada}</div>}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <Lbl t={t}>Responsável *</Lbl>
            <Inp t={t} style={{ borderColor: cor }} value={respForm.responsavel} onChange={e => setRespForm(x => ({ ...x, responsavel: e.target.value }))} placeholder="Seu nome" />
          </div>
          <div>
            <Lbl t={t}>Resposta *</Lbl>
            <div style={{ display: "grid", gap: 5 }}>
              {resps.map(r => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 7, border: `2px solid ${respForm.resposta === r ? cor : t.bor}`, cursor: "pointer", background: respForm.resposta === r ? (isDark ? "rgba(0,0,0,.3)" : t.surf2) : t.surf }}>
                  <input type="radio" name="resp" value={r} checked={respForm.resposta === r} onChange={() => setRespForm(x => ({ ...x, resposta: r }))} style={{ accentColor: cor }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: r === "Devolver para cobrança" ? "#f59e0b" : respForm.resposta === r ? cor : t.txt }}>{r === "Devolver para cobrança" ? "↩️ " + r : r}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Lbl t={t}>Observação</Lbl>
            <textarea rows={3} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: t.txt, width: "100%", resize: "vertical", boxSizing: "border-box", outline: "none" }} value={respForm.obs} onChange={e => setRespForm(x => ({ ...x, obs: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <Btn t={t} ghost onClick={onClose}>Cancelar</Btn>
          <Btn t={t} onClick={onSave} style={{ background: cor, border: "none", color: "#fff" }}>✅ Confirmar</Btn>
        </div>
      </div>
    </div>
  );
}