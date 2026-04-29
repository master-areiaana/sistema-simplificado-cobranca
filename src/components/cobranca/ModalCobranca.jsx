import { STATUS_OPC, ENCAMINHAR_OPC, CONTATO_OPC, fmtM, fmtD, hojeISO } from "@/lib/cobranca";
import { Btn, Inp, Sl, Lbl } from "./UI";

export default function ModalCobranca({ title, frm, setFrm, onSave, onClose, info, t, isDark }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.surf, borderRadius: 12, padding: 24, width: 500, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `2px solid ${t.p}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
          <b style={{ fontSize: 15, color: t.p }}>{title}</b>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {info}
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <Lbl t={t}>Status</Lbl>
            <Sl t={t} value={frm.status} onChange={e => setFrm(x => ({ ...x, status: e.target.value }))}>
              <option value="">Selecionar...</option>
              {STATUS_OPC.map(s => <option key={s}>{s}</option>)}
            </Sl>
          </div>
          <div>
            <Lbl t={t}>Encaminhar para</Lbl>
            <div style={{ display: "grid", gap: 6 }}>
              {ENCAMINHAR_OPC.map(op => (
                <label key={op.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `2px solid ${frm.encaminhar === op.value ? t.p : t.bor}`, cursor: "pointer", background: frm.encaminhar === op.value ? (isDark ? "rgba(232,119,34,.12)" : "rgba(232,119,34,.07)") : t.surf2 }}>
                  <input type="radio" name="enc" value={op.value} checked={frm.encaminhar === op.value} onChange={() => setFrm(x => ({ ...x, encaminhar: op.value }))} style={{ accentColor: t.p }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: frm.encaminhar === op.value ? t.p : t.txt }}>{op.label}</span>
                </label>
              ))}
            </div>
          </div>
          {frm.encaminhar === "protesto" && (
            <div style={{ background: "rgba(239,68,68,.08)", borderRadius: 8, padding: 12, border: "1px solid #ef4444" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>⚖️ Solicitação de Protesto</div>
              <Lbl t={t}>Quem está solicitando *</Lbl>
              <Inp t={t} value={frm.solicitante} onChange={e => setFrm(x => ({ ...x, solicitante: e.target.value }))} placeholder="Seu nome" />
            </div>
          )}
          {frm.encaminhar === "verificacao" && (
            <div style={{ background: "rgba(59,130,246,.08)", borderRadius: 8, padding: 10, border: "1px solid #3b82f6", fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>
              🔍 O cliente aparecerá na aba Verificar Pagamento.
            </div>
          )}
          <div>
            <Lbl t={t}>Tipo de Contato</Lbl>
            <Sl t={t} value={frm.tipo} onChange={e => setFrm(x => ({ ...x, tipo: e.target.value }))}>
              <option value="">Selecionar...</option>
              {CONTATO_OPC.map(c => <option key={c}>{c}</option>)}
            </Sl>
          </div>
          <div>
            <Lbl t={t}>Data Promessa</Lbl>
            <Inp t={t} type="date" value={frm.dataPromessa} onChange={e => setFrm(x => ({ ...x, dataPromessa: e.target.value }))} />
          </div>
          <div style={{ fontSize: 11, color: t.muted, background: isDark ? "rgba(232,119,34,.1)" : "rgba(232,119,34,.06)", padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.p}44` }}>
            📅 Data do contato registrada automaticamente como hoje ({fmtD(hojeISO)})
          </div>
          <div>
            <Lbl t={t}>Observação</Lbl>
            <textarea rows={3} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: t.txt, width: "100%", resize: "vertical", boxSizing: "border-box", outline: "none" }} value={frm.obs} onChange={e => setFrm(x => ({ ...x, obs: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <Btn t={t} ghost onClick={onClose}>Cancelar</Btn>
          <Btn t={t} onClick={onSave}>Salvar Cobrança</Btn>
        </div>
      </div>
    </div>
  );
}