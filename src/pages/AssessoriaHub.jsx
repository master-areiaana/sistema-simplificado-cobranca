import { useMemo, useState } from "react";
import Assessoria from "./Assessoria";

const PORTAL_CREDOR_URL = "https://portal-recuperacob.cobcloud.com.br/login";

function getTheme() {
  const isDark = (() => {
    try { return (localStorage.getItem("sc_theme") || "dark") === "dark"; } catch { return true; }
  })();
  return isDark
    ? { bg: "#0b0b0b", head: "#141414", surf: "#1a1a1a", surf2: "#222", bor: "#333", txt: "#f3f4f6", muted: "#9ca3af", p: "#f97316" }
    : { bg: "#f5f5f5", head: "#fff", surf: "#fff", surf2: "#f3f4f6", bor: "#ddd", txt: "#111827", muted: "#6b7280", p: "#f97316" };
}

function TabAssessoria({ active, children, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? t.p : t.surf2,
        color: active ? "#fff" : t.txt,
        border: `1px solid ${active ? t.p : t.bor}`,
        borderRadius: 10,
        padding: "13px 26px",
        minWidth: 260,
        fontSize: 18,
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: active ? "0 0 0 1px rgba(249,115,22,.25)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function PortalCredor({ t }) {
  return (
    <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: t.txt }}>Portal do Credor</div>
          <div style={{ fontSize: 11, color: t.muted }}>Acompanhamento da cobrança da assessoria dentro do sistema.</div>
        </div>
        <a href={PORTAL_CREDOR_URL} style={{ background: "#2563eb", color: "#fff", textDecoration: "none", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 800 }}>
          Abrir nesta página
        </a>
      </div>
      <iframe
        title="Portal do Credor"
        src={PORTAL_CREDOR_URL}
        style={{ width: "100%", height: "72vh", border: 0, background: "#fff" }}
      />
      <div style={{ padding: "8px 12px", fontSize: 11, color: t.muted, borderTop: `1px solid ${t.bor}` }}>
        Se o portal bloquear carregamento interno, use o botão acima para abrir na mesma página do navegador.
      </div>
    </div>
  );
}

export default function AssessoriaHub() {
  const [modo, setModo] = useState("transferencia");
  const t = useMemo(() => getTheme(), []);

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.txt, fontFamily: "Segoe UI, system-ui, sans-serif", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <TabAssessoria active={modo === "transferencia"} onClick={() => setModo("transferencia")} t={t}>
          Transf. Assessoria
        </TabAssessoria>
        <TabAssessoria active={modo === "portal"} onClick={() => setModo("portal")} t={t}>
          Portal do Credor
        </TabAssessoria>
      </div>

      {modo === "transferencia" ? (
        <div style={{ background: t.bg, borderRadius: 12, overflow: "hidden" }}>
          <Assessoria />
        </div>
      ) : (
        <PortalCredor t={t} />
      )}
    </div>
  );
}
