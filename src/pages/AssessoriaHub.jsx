import { useEffect, useMemo, useState } from "react";
import Assessoria from "./Assessoria";

const PORTAL_CREDOR_URL = "https://portal-recuperacob.cobcloud.com.br/login";

function readThemeMode() {
  try { return localStorage.getItem("sc_theme") || "dark"; } catch { return "dark"; }
}

function getTheme(mode) {
  const isDark = mode === "dark";
  return isDark
    ? { bg: "#050505", surf: "#111111", surf2: "#1f1f1f", bor: "#2f2f2f", txt: "#f3f4f6", muted: "#9ca3af", p: "#f97316" }
    : { bg: "#f5f5f5", surf: "#ffffff", surf2: "#f3f4f6", bor: "#d1d5db", txt: "#111827", muted: "#6b7280", p: "#f97316" };
}

function TabAssessoria({ active, children, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? t.p : t.surf2,
        color: active ? "#fff" : t.txt,
        border: `1px solid ${active ? t.p : t.bor}`,
        borderRadius: 9,
        padding: "12px 24px",
        minWidth: 230,
        fontSize: 14,
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: active ? "0 0 0 1px rgba(249,115,22,.22)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function PortalCredor({ t }) {
  return (
    <div style={{
      background: t.bg,
      border: `1px solid ${t.bor}`,
      borderRadius: 10,
      minHeight: "72vh",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <iframe
        title="Portal do Credor"
        src={PORTAL_CREDOR_URL}
        style={{ width: "100%", height: "72vh", border: 0, background: "#fff" }}
      />
    </div>
  );
}

export default function AssessoriaHub() {
  const [modo, setModo] = useState("transferencia");
  const [themeMode, setThemeMode] = useState(() => readThemeMode());
  const t = useMemo(() => getTheme(themeMode), [themeMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      const atual = readThemeMode();
      setThemeMode((prev) => prev === atual ? prev : atual);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.txt,
        fontFamily: "Segoe UI, system-ui, sans-serif",
        padding: "12px 10px 18px",
        boxSizing: "border-box",
        "--ass-bg": t.bg,
        "--ass-surf": t.surf,
        "--ass-surf2": t.surf2,
        "--ass-bor": t.bor,
        "--ass-txt": t.txt,
        "--ass-muted": t.muted,
        "--ass-primary": t.p,
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <TabAssessoria active={modo === "transferencia"} onClick={() => setModo("transferencia")} t={t}>
          Transf. Assessoria
        </TabAssessoria>
        <TabAssessoria active={modo === "portal"} onClick={() => setModo("portal")} t={t}>
          Portal do Credor
        </TabAssessoria>
      </div>

      {modo === "transferencia" ? (
        <div style={{ background: t.bg, borderRadius: 10, overflow: "hidden", minHeight: "72vh" }}>
          <Assessoria />
        </div>
      ) : (
        <PortalCredor t={t} />
      )}
    </div>
  );
}
