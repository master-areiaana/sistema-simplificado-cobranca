import { useState } from "react";
import { base44 } from "@/api/base44Client";
import exportarPDFExecutivo from "./ExportPDF";

export default function ModalEnviarPDF({ grouped, filteredCart, dash, faixaAtraso, filtroOrigem, hojeISO, t, onClose }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, color: t.txt, outline: "none", width: "100%" };

  async function gerarEEnviar() {
    if (!email.trim() || !email.includes("@")) { alert("Informe um e-mail válido."); return; }
    setEnviando(true);
    setResultado(null);

    // Monta resumo executivo em texto (HTML) para enviar por email
    const top10 = [...filteredCart].sort((a, b) => b.valorTotalDebito - a.valorTotalDebito).slice(0, 10);
    const fmt = v => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—";

    const tabelaHtml = top10.map((g, i) => `
      <tr style="background:${i%2===0?"#fff":"#f9fafb"}">
        <td style="padding:5px 8px">${i+1}. ${g.nomeCli}</td>
        <td style="padding:5px 8px;text-align:right">${g.qtdTitulos}</td>
        <td style="padding:5px 8px;text-align:right;color:#E87722;font-weight:700">${fmt(g.valorTotalDebito)}</td>
        <td style="padding:5px 8px;text-align:center">${g.statusConsolidado}</td>
        <td style="padding:5px 8px;text-align:center;color:#ef4444">${g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
      </tr>
    `).join("");

    const cobHoje = grouped.filter(g => g.ultimoContato === hojeISO).length;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><style>
  body { font-family: Arial, sans-serif; color: #222; font-size: 13px; background: #fff; }
  h1 { color: #E87722; font-size: 20px; margin-bottom: 4px; }
  h2 { color: #333; font-size: 14px; border-bottom: 2px solid #E87722; padding-bottom: 4px; margin-top: 24px; }
  .kpi { display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #E87722; border-radius: 8px; padding: 10px 16px; margin: 4px; min-width: 140px; }
  .kpi .v { font-size: 20px; font-weight: 900; color: #E87722; }
  .kpi .l { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { background: #f1f5f9; padding: 7px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
  td { border-bottom: 1px solid #f0f0f0; }
  .footer { margin-top: 28px; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
</style></head>
<body>
  <h1>📊 Resumo Executivo de Cobranças</h1>
  <p style="color:#666">Data: ${new Date().toLocaleDateString("pt-BR")} · Gerado automaticamente pelo Sistema de Cobrança</p>

  <h2>Indicadores do Dia</h2>
  <div>
    <div class="kpi"><div class="l">Total em Aberto</div><div class="v">${fmt(dash.vTot)}</div></div>
    <div class="kpi"><div class="l">Cobrados Hoje</div><div class="v">${cobHoje}</div></div>
    <div class="kpi"><div class="l">Recuperado no Mês</div><div class="v">${fmt(dash.recuperadoMes)}</div></div>
    <div class="kpi"><div class="l">Verif. Pendentes</div><div class="v">${dash.pendVerif}</div></div>
    <div class="kpi"><div class="l">Protestos Pend.</div><div class="v">${dash.pendProt}</div></div>
    <div class="kpi"><div class="l">Nº Clientes</div><div class="v">${dash.numCli}</div></div>
  </div>

  <h2>Top 10 Maiores Devedores</h2>
  <table>
    <thead><tr>
      <th>Cliente</th><th style="text-align:right">Títulos</th>
      <th style="text-align:right">Total c/ Encargos</th>
      <th style="text-align:center">Status</th>
      <th style="text-align:center">Atraso</th>
    </tr></thead>
    <tbody>${tabelaHtml}</tbody>
  </table>

  <div class="footer">Sistema de Cobrança · Envio automático em ${new Date().toLocaleString("pt-BR")}</div>
</body>
</html>`;

    try {
      await base44.integrations.Core.SendEmail({
        to: email.trim(),
        subject: `📊 Resumo Executivo de Cobranças — ${new Date().toLocaleDateString("pt-BR")}`,
        body: html,
      });
      setResultado({ ok: true, msg: `✅ Resumo enviado para ${email}` });
    } catch (err) {
      setResultado({ ok: false, msg: `❌ Erro ao enviar: ${err.message}` });
    } finally {
      setEnviando(false);
    }
  }

  function abrirPDF() {
    exportarPDFExecutivo({ grouped, filteredCart, dash, faixaAtraso, filtroOrigem, hojeISO });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 14, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.txt, marginBottom: 6 }}>📧 Enviar Resumo Executivo</div>
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 20 }}>Gera e envia um resumo das cobranças do dia por e-mail, ou abre o PDF para impressão.</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginBottom: 5 }}>E-mail do destinatário *</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="gestor@empresa.com.br" style={inp} type="email" />
        </div>

        {resultado && (
          <div style={{ background: resultado.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${resultado.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: resultado.ok ? "#16a34a" : "#dc2626" }}>
            {resultado.msg}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={abrirPDF} style={{ flex: 1, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            🖨️ Abrir PDF
          </button>
          <button onClick={gerarEEnviar} disabled={enviando} style={{ flex: 1, background: t.p, color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: enviando ? .7 : 1 }}>
            {enviando ? "⏳ Enviando..." : "📧 Enviar E-mail"}
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 12 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}