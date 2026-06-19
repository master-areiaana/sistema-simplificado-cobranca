import { useEffect, useMemo, useRef, useState } from "react";
import Assessoria from "./Assessoria";

const PORTAL_CREDOR_URL = "https://portal-recuperacob.cobcloud.com.br/login";

function readThemeMode() {
  try { return localStorage.getItem("sc_theme") || "dark"; } catch { return "dark"; }
}

function getTheme(mode) {
  const isDark = mode === "dark";
  return isDark
    ? { bg: "#050505", surf: "#111111", surf2: "#1f1f1f", bor: "#2f2f2f", txt: "#f3f4f6", muted: "#9ca3af", p: "#f97316", inp: "#e8f0fe" }
    : { bg: "#f5f5f5", surf: "#ffffff", surf2: "#f3f4f6", bor: "#d1d5db", txt: "#111827", muted: "#6b7280", p: "#f97316", inp: "#e8f0fe" };
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

function syncAssessoriaTheme(root, t) {
  if (!root) return;
  const isLight = t.bg === "#f5f5f5";
  const nodes = Array.from(root.querySelectorAll("*"));

  root.style.background = t.bg;
  root.style.color = t.txt;

  for (const el of nodes) {
    const bg = String(el.style.background || el.style.backgroundColor || "").toLowerCase().replace(/\s/g, "");
    const color = String(el.style.color || "").toLowerCase().replace(/\s/g, "");
    const border = String(el.style.border || el.style.borderBottom || "").toLowerCase().replace(/\s/g, "");

    if (bg === "#f5f5f5" || bg === "rgb(245,245,245)") {
      el.style.background = t.bg;
      el.style.color = t.txt;
    }
    if (bg === "#fff" || bg === "#ffffff" || bg === "rgb(255,255,255)") {
      el.style.background = t.surf;
      el.style.color = t.txt;
    }
    if (bg === "#f8fafc" || bg === "rgb(248,250,252)") {
      el.style.background = t.surf2;
      el.style.color = t.txt;
    }
    if (!isLight && (color === "#111" || color === "#111827" || color === "rgb(17,17,17)" || color === "rgb(17,24,39)")) {
      el.style.color = t.txt;
    }
    if (!isLight && (color === "#666" || color === "#555" || color === "#777" || color === "rgb(102,102,102)" || color === "rgb(85,85,85)" || color === "rgb(119,119,119)")) {
      el.style.color = t.muted;
    }
    if (border.includes("#ddd") || border.includes("#eee") || border.includes("rgb(221,221,221)") || border.includes("rgb(238,238,238)")) {
      el.style.borderColor = t.bor;
    }
  }

  const firstPanel = root.querySelector("div[style]");
  if (firstPanel) {
    firstPanel.style.background = t.bg;
    firstPanel.style.color = t.txt;
  }
}

export default function AssessoriaHub() {
  const [modo, setModo] = useState("transferencia");
  const [themeMode, setThemeMode] = useState(() => readThemeMode());
  const t = useMemo(() => getTheme(themeMode), [themeMode]);
  const assessoriaRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const atual = readThemeMode();
      setThemeMode((prev) => prev === atual ? prev : atual);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (modo !== "transferencia") return;
    syncAssessoriaTheme(assessoriaRef.current, t);
    const timer = setInterval(() => syncAssessoriaTheme(assessoriaRef.current, t), 450);
    return () => clearInterval(timer);
  }, [modo, t]);

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
        <div ref={assessoriaRef} style={{ background: t.bg, color: t.txt, borderRadius: 10, overflow: "hidden", minHeight: "72vh" }}>
          <Assessoria />
        </div>
      ) : (
        <PortalCredor t={t} />
      )}
    </div>
  );
}
