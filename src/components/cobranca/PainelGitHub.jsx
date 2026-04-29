import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const LABEL_COLORS = {
  bug: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  enhancement: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  melhoria: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  default: { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

function IssueBadge({ label }) {
  const lname = (label?.name || "").toLowerCase();
  const style = LABEL_COLORS[lname] || LABEL_COLORS.default;
  return (
    <span style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}`, borderRadius: 12, padding: "1px 8px", fontSize: 10, fontWeight: 700, marginRight: 4, display: "inline-block" }}>
      {label?.name}
    </span>
  );
}

export default function PainelGitHub({ t }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all | bug | enhancement
  const [stateFilter, setStateFilter] = useState("open");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", type: "bug" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const params = { state: stateFilter };
      if (filter !== "all") params.label_filter = filter === "melhoria" ? "enhancement" : filter;
      const res = await base44.functions.invoke("githubIssues", params);
      setIssues(res.data?.issues || []);
    } catch (e) {
      setMsg({ ok: false, text: "Erro ao carregar issues: " + e.message });
    } finally {
      setLoading(false);
    }
  }, [filter, stateFilter]);

  useEffect(() => { load(); }, [load]);

  async function criarIssue() {
    if (!form.title.trim()) { setMsg({ ok: false, text: "Título obrigatório." }); return; }
    setSaving(true);
    try {
      const labels = form.type === "bug" ? ["bug"] : ["enhancement"];
      await base44.functions.invoke("githubIssues", { action: "create", title: form.title, bodyText: form.body, labels });
      setMsg({ ok: true, text: "✅ Issue criada com sucesso!" });
      setForm({ title: "", body: "", type: "bug" });
      setShowForm(false);
      load();
    } catch (e) {
      setMsg({ ok: false, text: "Erro: " + e.message });
    } finally {
      setSaving(false);
    }
  }

  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: t.txt, width: "100%", boxSizing: "border-box", outline: "none" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>🐙 GitHub Issues</span>
        <span style={{ fontSize: 11, color: t.muted }}>master-areiaana/Sistema-de-cobranca</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setShowForm(x => !x)} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showForm ? "✕ Cancelar" : "+ Nova Issue"}
          </button>
          <button onClick={load} style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.muted, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>🔄</button>
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div style={{ background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#16a34a" : "#dc2626"}`, color: msg.ok ? "#16a34a" : "#dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
          {msg.text}<button onClick={() => setMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Formulário nova issue */}
      {showForm && (
        <div style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.txt, marginBottom: 10 }}>Nova Issue</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["bug", "enhancement"].map(tp => (
              <button key={tp} onClick={() => setForm(x => ({ ...x, type: tp }))}
                style={{ background: form.type === tp ? (tp === "bug" ? "#dc2626" : "#7c3aed") : t.surf, color: form.type === tp ? "#fff" : t.muted, border: `1px solid ${t.bor}`, borderRadius: 20, padding: "3px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {tp === "bug" ? "🐛 Bug" : "✨ Melhoria"}
              </button>
            ))}
          </div>
          <input style={{ ...inp, marginBottom: 8 }} placeholder="Título da issue *" value={form.title} onChange={e => setForm(x => ({ ...x, title: e.target.value }))} />
          <textarea style={{ ...inp, resize: "vertical", marginBottom: 10 }} rows={4} placeholder="Descrição detalhada (opcional)..." value={form.body} onChange={e => setForm(x => ({ ...x, body: e.target.value }))} />
          <button onClick={criarIssue} disabled={saving} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Criando..." : "Criar Issue"}
          </button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Tipo:</span>
        {[["all", "📋 Todas"], ["bug", "🐛 Bug"], ["melhoria", "✨ Melhoria"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? t.p : t.surf2, color: filter === v ? "#fff" : t.muted, border: `1px solid ${filter === v ? t.p : t.bor}`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginLeft: 8 }}>Estado:</span>
        {[["open", "Abertas"], ["closed", "Fechadas"], ["all", "Todas"]].map(([v, l]) => (
          <button key={v} onClick={() => setStateFilter(v)} style={{ background: stateFilter === v ? "#10b981" : t.surf2, color: stateFilter === v ? "#fff" : t.muted, border: `1px solid ${stateFilter === v ? "#10b981" : t.bor}`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: t.muted, marginLeft: "auto" }}><b style={{ color: t.txt }}>{issues.length}</b> issues</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: t.muted }}>⏳ Carregando issues...</div>
      ) : issues.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: t.muted }}>Nenhuma issue encontrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {issues.map(issue => (
            <div key={issue.id} style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 16, marginTop: 1 }}>{issue.state === "open" ? "🟢" : "🔴"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  <a href={issue.html_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 13, color: t.p, textDecoration: "none" }}>#{issue.number} {issue.title}</a>
                  {(issue.labels || []).map(l => <IssueBadge key={l.id} label={l} />)}
                </div>
                <div style={{ fontSize: 11, color: t.muted }}>
                  Aberta por <b>{issue.user?.login}</b> · {new Date(issue.created_at).toLocaleDateString("pt-BR")}
                  {issue.comments > 0 && <span> · 💬 {issue.comments}</span>}
                </div>
                {issue.body && <div style={{ fontSize: 11, color: t.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 600 }}>{issue.body.slice(0, 120)}{issue.body.length > 120 ? "..." : ""}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}