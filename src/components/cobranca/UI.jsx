import { useState } from "react";
import { fmtD, promAlerta, prioCor, promessaClassif, sugestaoEncaminhamento } from "@/lib/cobranca";

const KPI_OCULTOS = new Set([
  "COBRADO", "VALOR COBRADO", "Nº CLIENTES", "N° CLIENTES", "N CLIENTES",
  "Nº TÍTULOS", "N° TÍTULOS", "N TITULOS", "Nº TITULOS",
  "VAL. ORIGINAL", "VAL ORIGINAL", "EM ABERTO POR RELATORIO", "EM ABERTO POR RELATÓRIO"
]);

const KPI_ORDEM = {
  "FALTAM COBRAR": 1,
  "COBRADOS HOJE": 2,
  "A COBRAR": 3,
  "TOTAL EM ABERTO": 4
};

function normalizarInterfaceLabel(v) {
  return String(v ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9º°\.\s]/g, "").replace(/\s+/g, " ").trim();
}

function fmtReal(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Btn({ children, onClick, ghost = false, sm = false, style = {}, t, color, disabled = false }) {
  const bg = color || (ghost ? "transparent" : t.p);
  const clr = ghost ? color || t.p : "#fff";
  const bdr = ghost ? `1px solid ${color || t.p}` : "none";
  return <button disabled={disabled} onClick={onClick} style={{ background: bg, color: clr, border: bdr, borderRadius: 5, padding: sm ? "3px 9px" : "7px 14px", cursor: disabled ? "not-allowed" : "pointer", fontSize: sm ? 11 : 12, fontWeight: 700, whiteSpace: "nowrap", opacity: disabled ? 0.65 : 1, ...style }}>{children}</button>;
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

  const valorFinal = value;
  const subFinal = sub;

  return (
    <div className={`kpi-card ${active ? "active" : ""} ${onClick ? "cursor-pointer" : ""}`} onClick={onClick} style={{ order: KPI_ORDEM[labelNorm] || 99, borderLeft: `4px solid ${color} !important`, background: `${t.card} !important` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginBottom: 4, lineHeight: 1 }}>{valorFinal}</div>
      {subFinal && <div style={{ fontSize: 11, color: t.muted, fontWeight: 500, lineHeight: 1.2 }}>{subFinal}</div>}
    </div>
  );
}

export function Badge({ label, color = "#64748b", dot = false }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: color, color: "#fff" }}>{dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />}{label}</span>;
}

export function PrioBadge({ label }) {
  return <Badge label={label} color={prioCor(label)} />;
}

export function PromBadge({ date, t }) {
  const al = promAlerta(date);
  if (!date) return <span style={{ color: t.muted }}>—</span>;
  if (!al) return <span style={{ color: t.muted }}>{fmtD(date)}</span>;
  return <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: al.cor, color: "#fff" }}>{al.icon} {fmtD(date)} · {al.label}</span>;
}

export function PromessaClassifBadge({ qtd }) {
  const c = promessaClassif(qtd);
  if (!c) return <span style={{ color: "#64748b", fontSize: 10 }}>—</span>;
  return <Badge label={c.label} color={c.cor} />;
}

export function ObsCell({ text, t }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span style={{ color: t.muted }}>—</span>;
  const short = text.length > 60 ? text.slice(0, 60) + "…" : text;
  return <span onClick={() => setExpanded((x) => !x)} style={{ cursor: text.length > 60 ? "pointer" : "default", color: t.txt, fontSize: 11 }} title={text}>{expanded ? text : short}</span>;
}

export function SugestaoEncBadge({ diasAtraso, valor }) {
  const s = sugestaoEncaminhamento(diasAtraso, valor);
  if (!s) return null;
  return <Badge label={s.label} color={s.cor} />;
}

export function TabBtn({ active, children, badge, badgeColor = "#ef4444", onClick, t }) {
  return <button onClick={onClick} style={{ position: "relative", background: active ? t.p : t.surf, color: active ? "#fff" : t.txt, border: `1px solid ${active ? t.p : t.bor}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{children}{badge > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: badgeColor, color: "#fff", borderRadius: 999, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, padding: "0 4px" }}>{badge}</span>}</button>;
}