import { fmtD, fmtM, promAlerta, prioCor, promessaClassif } from "@/lib/cobranca";
import { useState } from "react";

export function Btn({ children, onClick, ghost = false, sm = false, style = {}, t, color }) {
  const bg = color || (ghost ? "transparent" : t.p);
  const clr = ghost ? (color || t.p) : "#fff";
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

export function KPI({ label, value, sub, color, t }) {
  return (
    <div style={{ background: t.card, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bor}`, borderLeft: `3px solid ${color}`, flex: "1 1 130px", minWidth: 120, maxWidth: 220, boxShadow: t.shad }}>
      <div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: t.txt, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: t.muted, marginTop: 3 }}>{sub}</div>}
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
  return (
    <button onClick={onClick} style={{ position: "relative", background: active ? t.p : "transparent", color: active ? "#fff" : t.txt, border: `2px solid ${active ? t.p : t.bor}`, borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
      {children}
      {badge > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: badgeColor, color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>{badge}</span>}
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
      {text.length > 45 && <button onClick={e => { e.stopPropagation(); setExp(x => !x); }} style={{ background: "none", border: "none", color: t.p, cursor: "pointer", fontSize: 10, padding: "1px 0", fontWeight: 700 }}>{exp ? "▲ menos" : "▼ mais"}</button>}
    </div>
  );
}

export function SugestaoEncBadge({ sugestao }) {
  if (!sugestao) return <span style={{ color: "#64748b", fontSize: 10 }}>—</span>;
  return <Badge label={sugestao.label} color={sugestao.cor} />;
}