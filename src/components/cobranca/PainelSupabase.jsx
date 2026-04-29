import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { fmtM } from "@/lib/cobranca";

const TABLES = ["charge_events", "import_logs", "titles", "vw_carteira_ativa"];

export default function PainelSupabase({ t }) {
  const [table, setTable] = useState("charge_events");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [project, setProject] = useState("");
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await base44.functions.invoke("supabaseLogs", { table, filters: { limit } });
      setRows(res.data?.rows || []);
      setProject(res.data?.project || "");
    } catch (e) {
      setMsg("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [table, limit]);

  const cols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 10) : [];

  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>🗄️ Supabase Explorer</span>
        {project && <span style={{ fontSize: 11, color: t.muted }}>Projeto: <b>{project}</b></span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <select value={table} onChange={e => setTable(e.target.value)} style={inp}>
            {TABLES.map(tb => <option key={tb} value={tb}>{tb}</option>)}
          </select>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ ...inp, width: 80 }}>
            {[25, 50, 100, 200].map(l => <option key={l} value={l}>{l} linhas</option>)}
          </select>
          <button onClick={load} disabled={loading} style={{ background: t.p, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "⏳ Carregando..." : "🔍 Consultar"}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: "#fef2f2", border: "1px solid #dc2626", color: "#dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{msg}</div>
      )}

      {rows.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 60, color: t.muted }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🗄️</div>
          <div style={{ fontWeight: 700 }}>Selecione uma tabela e clique em Consultar</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Tabelas disponíveis: {TABLES.join(", ")}</div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}><b style={{ color: t.txt }}>{rows.length}</b> registros da tabela <b style={{ color: t.p }}>{table}</b></div>
          <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${t.bor}`, maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c} style={{ background: t.th, padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: t.muted, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, position: "sticky", top: 0 }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? t.surf : t.alt }}>
                    {cols.map(c => {
                      const v = row[c];
                      const isNum = typeof v === "number";
                      const isDate = typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
                      return (
                        <td key={c} style={{ padding: "6px 10px", borderBottom: `1px solid ${t.bor}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: isNum ? t.p : t.txt, fontWeight: isNum ? 700 : 400 }}>
                          {v === null || v === undefined ? <span style={{ color: t.muted }}>—</span> : isDate ? String(v).slice(0, 10) : String(v).slice(0, 100)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}