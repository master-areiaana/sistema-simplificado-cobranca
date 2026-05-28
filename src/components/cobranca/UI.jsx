import { useState } from "react";
import { fmtD, fmtM, promAlerta, prioCor, promessaClassif } from "@/lib/cobranca";

const KPI_OCULTOS = new Set([
  "COBRADO",
  "VALOR COBRADO",
  "Nº CLIENTES",
  "N° CLIENTES",
  "N CLIENTES",
  "Nº TÍTULOS",
  "N° TÍTULOS",
  "N TITULOS",
  "Nº TITULOS",
  "VAL. ORIGINAL",
  "VAL ORIGINAL"
]);

const ABAS_OCULTAS = [
  "CONFERENCIA DE PAGAMENTO",
  "APROVACAO DO GESTOR",
  "PRODUTIVIDADE",
  "METAS",
  "IMPACTO NO CAIXA",
  "ASSESSORIA"
];

function normalizarInterfaceLabel(v) {
  return String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9º°\.\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function Btn({ children, onClick, ghost = false, sm = false, style = {}, t, color }) {
  const bg = color || (ghost ? "transparent" : t.p);
  const clr = ghost ? color || t.p : "#fff";
  const bdr = ghost ? `1px solid ${color || t.p}` : "none";
  return (
    <button onClick={onClick} style={{ background: bg, color: clr, border: bdr, borderRadius: 5, padding: sm ? "3px 9px" : "7px 14px", cursor: "pointer", fontSize: sm ? 11 : 12, fontWeight: 700, whiteSpace: "nowrap", ...style }}>
      {children}
    </button>
  );
}

export function Inp({ style, t, ...props }) {
  return <input {...props} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "6px 8px", fontSize: 12, color: t.txt, outline: "none", boxSizing: "border-box", width: "100%", ...style }} />;
}

export function Sl({ style, t, ...props }) {
  return <select {...props} style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "6px 8px", fontSize: 12, color: t.txt, outline: "none", boxSizing: "border-box", width: "100%", ...style }} />;
}

export function Lbl({ children, t }) {
  return <label style={{ fontSize: 11, color: t.muted, display: "block", marginBottom: 4, fontWeight: 600 }}>{children}</label>;
}

export function KPI({ label, value, sub, color, t, onClick, active }) {
  const labelNorm = normalizarInterfaceLabel(label);
  if (KPI_OCULTOS.has(labelNorm)) return null;

  return (
    <div
      className={`kpi-card ${active ? "active" : ""} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${color} !important`,
        background: `${t.card} !important`,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color, marginBottom: 4, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: t.muted, fontWeight: 500, lineHeight: 1.2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function Badge({ label, color = "#64748b", dot = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: color, color: "#fff" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />}
      {label}
    </span>
  );
}

export function PrioBadge({ label }) {
  return <Badge label={label} color={prioCor(label)} />;
}

export function PromBadge({ date, t }) {
  const al = promAlerta(date);
  if (!date) return <span style={{ color: t.muted }}>—</span>;
  if (!al) return <span style={{ color: t.muted }}>{fmtD(date)}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: al.cor, color: "#fff" }}>
      {al.icon} {fmtD(date)} · {al.label}
    </span>
  );
}

export function PromessaClassifBadge({ qtd }) {
  const c = promessaClassif(qtd);
  if (!c) return <span style={{ color: "#64748b", fontSize: 10 }}>—</span>;
  return <Badge label={c.label} color={c.cor} />;
}

export function TabBtn({ active, children, badge, badgeColor = "#ef4444", onClick, t }) {
  const labelNorm = normalizarInterfaceLabel(children);
  if (ABAS_OCULTAS.some((aba) => labelNorm.includes(aba))) return null;

  return (
    <button onClick={onClick} style={{ position: "relative", background: active ? t.p : "transparent", color: active ? "#fff" : t.txt, border: "none", borderBottom: `3px solid ${active ? t.p : "transparent"}`, borderRadius: 0, padding: "10px 16px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.3, transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
      {badge > 0 && <span style={{ position: "absolute", top: -8, right: 4, background: badgeColor, color: "#fff", borderRadius: "50%", minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, padding: "0 4px", boxShadow: "0 2px 6px rgba(0,0,0,.3)", border: "2px solid " + t.bg, zIndex: 1 }}>{badge}</span>}
    </button>
  );
}

export function ObsCell({ text, t }) {
  const [exp, setExp] = useState(false);
  if (!text) return <span style={{ color: t.muted }}>—</span>;
  const short = text.length > 45 ? text.slice(0, 45) + "…" : text;
  return (
    <div style={{ maxWidth: 220 }}>
      <span style={{ fontSize: 11, color: t.txt, whiteSpace: exp ? "normal" : "nowrap", overflow: "hidden", display: "block" }}>{exp ? text : short}</span>
      {text.length > 45 && <button onClick={(e) => { e.stopPropagation(); setExp((x) => !x); }} style={{ background: "none", border: "none", color: t.p, cursor: "pointer", fontSize: 10, padding: "1px 0", fontWeight: 700 }}>{exp ? "▲ menos" : "▼ mais"}</button>}
    </div>
  );
}

export function SugestaoEncBadge({ sugestao }) {
  if (!sugestao) return <span style={{ color: "#64748b", fontSize: 10 }}>—</span>;
  return <Badge label={sugestao.label} color={sugestao.cor} />;
}
