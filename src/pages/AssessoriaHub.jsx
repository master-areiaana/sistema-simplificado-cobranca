import { useState } from "react";
import Assessoria from "./Assessoria";

const TRANSF_URL = "https://master-areiaana.github.io/Sistema-Simplificado-Cobranca/#/assessoria";
const PORTAL_CREDOR_URL = "https://portal-recuperacob.cobcloud.com.br/login";

function CardOpcao({ titulo, descricao, url, cor, children, onClick }) {
  return (
    <section style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderLeft: `5px solid ${cor}`,
      borderRadius: 14,
      padding: 22,
      minHeight: 190,
      boxShadow: "0 10px 26px rgba(15,23,42,.08)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: 14,
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginBottom: 8 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.55 }}>{descricao}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 12, wordBreak: "break-all" }}>{url}</div>
      </div>
      {children || (
        <button onClick={onClick} style={{
          background: cor,
          color: "#fff",
          border: 0,
          borderRadius: 9,
          padding: "10px 14px",
          fontSize: 12,
          fontWeight: 900,
          cursor: "pointer",
          width: "100%",
        }}>
          Abrir
        </button>
      )}
    </section>
  );
}

export default function AssessoriaHub() {
  const [modo, setModo] = useState("menu");

  if (modo === "transferencia") {
    return <Assessoria />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "Segoe UI, sans-serif", color: "#111827" }}>
      <header style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 4 }}>SISTEMA DE COBRANÇA</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>Central da Assessoria</div>
        </div>
        <a href="/#/" style={{ textDecoration: "none", color: "#111827", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800 }}>
          ← Sistema interno
        </a>
      </header>

      <main style={{ maxWidth: 1050, margin: "0 auto", padding: "42px 18px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#111827" }}>Assessoria</div>
          <div style={{ width: 2, height: 34, background: "#d1d5db", margin: "14px auto 0" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 1px minmax(260px, 1fr)", gap: 28, alignItems: "stretch" }}>
          <CardOpcao
            titulo="Transf. Assessoria"
            descricao="Encaminhar para a assessoria cobrar os clientes. Aqui ficam os títulos enviados para cobrança externa, com relatório e controle operacional."
            url={TRANSF_URL}
            cor="#f97316"
            onClick={() => setModo("transferencia")}
          />

          <div style={{ background: "#d1d5db", width: 1, minHeight: 190 }} />

          <CardOpcao
            titulo="Portal do Credor"
            descricao="Acompanhar a cobrança da assessoria diretamente no portal externo do credor/RecuperaCob."
            url={PORTAL_CREDOR_URL}
            cor="#2563eb"
          >
            <a href={PORTAL_CREDOR_URL} target="_blank" rel="noopener noreferrer" style={{
              background: "#2563eb",
              color: "#fff",
              border: 0,
              borderRadius: 9,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              width: "100%",
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              boxSizing: "border-box",
            }}>
              Abrir Portal do Credor
            </a>
          </CardOpcao>
        </div>
      </main>
    </div>
  );
}
