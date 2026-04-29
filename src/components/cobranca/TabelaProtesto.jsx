import React, { useState, useMemo } from "react";
import ColHeader from "./ColHeader";
import { Btn, ObsCell, Badge } from "./UI";
import { fmtM, fmtD } from "@/lib/cobranca";

const thPlain = (t) => ({ background: t.th, padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .4, color: t.muted, position: "sticky", top: 0, zIndex: 10 });
const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });

function fieldVal(g, field) {
  switch (field) {
    case "nrCli": return g.nrCli || "(Vazio)";
    case "nomeCli": return g.nomeCli || "(Vazio)";
    case "valorTotalDebito": return fmtM(g.valorTotalDebito);
    case "atrasoLabel": return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—";
    case "statusConsolidado": return g.statusConsolidado || "(Vazio)";
    case "solicitanteProtestoConsolidado": return g.solicitanteProtestoConsolidado || "(Vazio)";
    case "obsConsolidada": return g.obsConsolidada || "(Sem observação)";
    default: return "";
  }
}

function applyFilters(arr, filters) {
  return arr.filter(g => {
    for (const [field, vals] of Object.entries(filters)) {
      if (!vals) continue;
      if (vals.length === 0) return false;
      if (!vals.includes(fieldVal(g, field))) return false;
    }
    return true;
  });
}

export default function TabelaProtesto({ data, t, setRespModal, setRespForm }) {
  const [filters, setFilters] = useState({});
  const colData = (field) => data.map(g => ({ [field]: fieldVal(g, field) }));
  const hasFilter = Object.values(filters).some(v => v !== null && v !== undefined);
  const filtered = useMemo(() => applyFilters(data, filters), [data, filters]);

  const CH = (props) => <ColHeader {...props} t={t} />;

  return (
    <div>
      <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "2px solid #ef4444", borderRadius: 8, fontSize: 12, color: "#ef4444", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>⚖️ Solicitações de protesto pendentes de aprovação.</span>
        <span style={{ fontSize: 11, color: t.muted }}>
          {hasFilter && <button onClick={() => setFilters({})} style={{ background: "none", border: `1px solid #ef4444`, color: "#ef4444", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, marginRight: 8 }}>✕ Limpar filtros</button>}
          <b style={{ color: "#ef4444" }}>{filtered.length}</b> de {data.length}
        </span>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #ef4444", maxHeight: "65vh", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <CH label="Nº"            field="nrCli"                          data={colData("nrCli")}                          filters={filters} setFilters={setFilters} />
              <CH label="CLIENTE"       field="nomeCli"                        data={colData("nomeCli")}                        filters={filters} setFilters={setFilters} />
              <th style={thPlain(t)}>QTD.</th>
              <CH label="TOTAL"         field="valorTotalDebito"               data={colData("valorTotalDebito")}               filters={filters} setFilters={setFilters} />
              <CH label="ATRASO"        field="atrasoLabel"                    data={colData("atrasoLabel")}                    filters={filters} setFilters={setFilters} />
              <CH label="STATUS"        field="statusConsolidado"              data={colData("statusConsolidado")}              filters={filters} setFilters={setFilters} />
              <CH label="SOLICITADO POR" field="solicitanteProtestoConsolidado" data={colData("solicitanteProtestoConsolidado")} filters={filters} setFilters={setFilters} />
              <CH label="OBSERVAÇÃO"    field="obsConsolidada"                 data={colData("obsConsolidada")}                 filters={filters} setFilters={setFilters} />
              <th style={thPlain(t)}>DECISÃO</th>
              <th style={thPlain(t)}>AÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhuma solicitação de protesto.</td></tr>
            )}
            {filtered.map((g, i) => {
              const lastResp = g.historicoCliente.find(h => h.subtype?.startsWith("RESP_PROT"));
              return (
                <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: "4px solid #ef4444" }}>
                  <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                  <td style={tdS()}><b>{g.nomeCli}</b></td>
                  <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                  <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                  <td style={{ ...tdS(), color: "#ef4444", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
                  <td style={tdS()}>{g.statusConsolidado}</td>
                  <td style={{ ...tdS(), color: "#ef4444", fontWeight: 600 }}>{g.solicitanteProtestoConsolidado || "—"}</td>
                  <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                  <td style={tdS()}>{lastResp ? <Badge label={lastResp.motivo} color={lastResp.motivo === "Aprovado" ? "#10b981" : "#64748b"} /> : <Badge label="Pendente" color="#f59e0b" dot />}</td>
                  <td style={tdS()}><Btn t={t} sm onClick={() => { setRespModal({ tipo: "protesto", grupo: g }); setRespForm({ responsavel: "", resposta: "", obs: "" }); }} style={{ background: "#ef4444", color: "#fff" }}>⚖️ Decidir</Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}