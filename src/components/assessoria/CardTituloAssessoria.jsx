import React from "react";
import { fmtD, fmtM, normText } from "@/lib/cobranca";
import { eventDateLabel, eventKindLabel } from "@/lib/assessoriaNotifications";

function statusColor(status) {
  const s = normText(status);
  if (s.includes("INCOBRAVEL") || s.includes("SEM CONTATO")) return "#ef4444";
  if (s.includes("PROMESSA") || s.includes("NEGOCI")) return "#f59e0b";
  if (s.includes("PAGO") || s.includes("ENCERRADO")) return "#10b981";
  return "#64748b";
}

const muted = { color: "#666", fontSize: 11 };
const inp = { width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 7, boxSizing: "border-box", fontSize: 12 };
const orangeBtn = { border: 0, background: "#f97316", color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };

export default function CardTituloAssessoria({
  item,
  form,
  historico,
  aberto,
  onToggle,
  onFormChange,
  onSalvarRetorno,
  chatValue,
  onChatChange,
  onEnviarChat,
  isEmpresa
}) {
  return (
    <section style={{ background: "#fff", border: "1px solid #ddd", borderLeft: `5px solid ${statusColor(item.status)}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 130px 1fr 140px 120px 120px auto", gap: 8, alignItems: "center", padding: 12, borderBottom: "1px solid #eee" }}>
        <div><small style={muted}>Processo/Título</small><br/><b>{item.titulo}{item.seq ? `/${item.seq}` : ""}</b></div>
        <div><small style={muted}>Saldo</small><br/><b>{fmtM(item.valorTotalDebito)}</b></div>
        <div><small style={muted}>Devedor</small><br/><b>{item.nomeCli}</b><br/><span style={muted}>{item.nrCli} · {item.portador || item.tp || item.origem}</span></div>
        <div><small style={muted}>Status</small><br/><span style={{ background: `${statusColor(item.status)}22`, color: statusColor(item.status), padding: "4px 7px", borderRadius: 8, fontWeight: 800 }}>{item.status}</span></div>
        <div><small style={muted}>Vencimento</small><br/>{fmtD(item.vencimento)}<br/><span style={{ color: item.diasAtraso > 0 ? "#ef4444" : "#666", fontSize: 11 }}>{item.diasAtraso > 0 ? `${item.diasAtraso} dias` : "em dia"}</span></div>
        <div><small style={muted}>Registros</small><br/><b>{historico.length}</b></div>
        <button onClick={onToggle} style={{ border: 0, borderRadius: 8, padding: "8px 10px", background: aberto ? "#111827" : "#f97316", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{aberto ? "Fechar" : "Acompanhar"}</button>
      </div>

      {aberto && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(320px, .9fr)", gap: 14, padding: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 10px" }}>Retorno da assessoria / ação no título</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select value={form.status || ""} onChange={e => onFormChange({ status: e.target.value })} style={inp}>
                <option value="">Status do retorno...</option>
                <option>SEM CONTATO</option><option>INCOBRÁVEL</option><option>Em Cobrança</option><option>Prometeu Pagar</option><option>Pago Aguard. Baixa</option><option>Encerrado</option><option>Aguardando retorno da empresa</option>
              </select>
              <input type="date" value={form.promessa || ""} onChange={e => onFormChange({ promessa: e.target.value, status: e.target.value ? "Prometeu Pagar" : form.status })} style={inp} />
            </div>
            <textarea rows={3} placeholder="Observação/ação da assessoria..." value={form.obs || ""} onChange={e => onFormChange({ obs: e.target.value })} style={{ ...inp, resize: "vertical", marginTop: 8 }} />
            <label style={{ display: "block", fontSize: 11, marginTop: 8 }}><input type="checkbox" checked={!!form.devolver} onChange={e => onFormChange({ devolver: e.target.checked })} /> Devolver para carteira da empresa</label>
            <button onClick={onSalvarRetorno} style={{ ...orangeBtn, marginTop: 10 }}>Salvar retorno no histórico</button>

            <h3 style={{ margin: "18px 0 10px" }}>Chat empresa ↔ assessoria</h3>
            <textarea rows={3} placeholder={isEmpresa ? "Mensagem da empresa para a assessoria..." : "Mensagem da assessoria para a empresa..."} value={chatValue || ""} onChange={e => onChatChange(e.target.value)} style={{ ...inp, resize: "vertical" }} />
            <button onClick={onEnviarChat} style={{ marginTop: 8, border: 0, background: "#0ea5e9", color: "#fff", borderRadius: 8, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Enviar mensagem e registrar</button>
          </div>

          <div>
            <h3 style={{ margin: "0 0 10px" }}>Histórico completo do título</h3>
            <div style={{ maxHeight: 390, overflowY: "auto", display: "grid", gap: 8, paddingRight: 4 }}>
              {historico.length === 0 && <div style={{ color: "#777", fontSize: 12 }}>Ainda não existe histórico para este título.</div>}
              {historico.map((e, idx) => {
                const isChat = e.event_type === "CHAT_ASSESSORIA";
                const fromEmpresa = e.event_subtype === "EMPRESA_PARA_ASSESSORIA";
                return (
                  <div key={`${e.id || idx}-${idx}`} style={{ border: "1px solid #eee", borderLeft: `4px solid ${isChat ? (fromEmpresa ? "#0ea5e9" : "#f97316") : statusColor(e.status)}`, borderRadius: 10, padding: 9, background: isChat ? "#f8fafc" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#666", marginBottom: 4 }}>
                      <b style={{ color: "#111" }}>{eventKindLabel(e)}</b><span>{eventDateLabel(e)}</span>
                    </div>
                    <div style={{ fontSize: 12 }}><b>{e.event_user || "Usuário"}</b>{e.status ? ` · ${e.status}` : ""}</div>
                    {e.promise_date && <div style={{ fontSize: 12, color: "#f59e0b" }}>Promessa: {fmtD(e.promise_date)}</div>}
                    {e.note && <div style={{ marginTop: 5, whiteSpace: "pre-wrap", fontSize: 12 }}>{e.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
