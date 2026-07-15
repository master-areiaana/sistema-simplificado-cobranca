import { useState } from "react";
import exportarPDFExecutivo from "./ExportPDF";

export default function ModalEnviarPDF({ grouped, filteredCart, dash, faixaAtraso, filtroOrigem, hojeISO, t, onClose }) {
  const [email, setEmail] = useState("");
  const [resultado, setResultado] = useState(null);
  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, color: t.txt, outline: "none", width: "100%", boxSizing: "border-box" };

  function fmt(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function prepararEmail() {
    const destinatario = email.trim();
    if (!destinatario || !destinatario.includes("@")) {
      setResultado({ ok: false, msg: "Informe um e-mail válido." });
      return;
    }

    const cobradosHoje = grouped.filter((group) => group.ultimoContato === hojeISO).length;
    const subject = `Resumo Executivo de Cobranças — ${new Date().toLocaleDateString("pt-BR")}`;
    const body = [
      "Resumo Executivo de Cobranças",
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      `Total em aberto: ${fmt(dash.vTot)}`,
      `Clientes cobrados hoje: ${cobradosHoje}`,
      `Conferências pendentes: ${dash.pendVerif || 0}`,
      `Aprovações pendentes: ${dash.pendProt || 0}`,
      "",
      "O PDF pode ser gerado no botão Abrir PDF e anexado manualmente.",
    ].join("\n");

    window.location.href = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setResultado({ ok: true, msg: "O aplicativo de e-mail foi aberto. Anexe o PDF gerado antes de enviar." });
  }

  function abrirPDF() {
    exportarPDFExecutivo({ grouped, filteredCart, dash, faixaAtraso, filtroOrigem, hojeISO });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 14, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.txt, marginBottom: 6 }}>📧 Preparar Resumo Executivo</div>
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 20 }}>Gere o PDF e abra uma mensagem no aplicativo de e-mail. O sistema não depende mais da integração da Base44.</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginBottom: 5 }}>E-mail do destinatário</div>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="gestor@empresa.com.br" style={inp} type="email" />
        </div>
        {resultado && <div style={{ background: resultado.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${resultado.ok ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: resultado.ok ? "#16a34a" : "#dc2626" }}>{resultado.msg}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={abrirPDF} style={{ flex: "1 1 160px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🖨️ Abrir PDF</button>
          <button onClick={prepararEmail} style={{ flex: "1 1 160px", background: t.p, color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>📧 Abrir E-mail</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}><button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 12 }}>Fechar</button></div>
      </div>
    </div>
  );
}
