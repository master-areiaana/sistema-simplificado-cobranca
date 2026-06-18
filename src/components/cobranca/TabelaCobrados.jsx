import React, { useState, useMemo } from "react";
import ColHeader from "./ColHeader";
import { Btn, PromBadge, ObsCell, Badge } from "./UI";
import { fmtM, fmtD, prioCor } from "@/lib/cobranca";
import { rankingConfiancaCliente } from "@/lib/rankingConfianca";

const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });

function encBadge(enc, t) {
  if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
  if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
  if (enc === "assessoria") return <Badge label="→ Assessoria" color="#f97316" />;
  return <span style={{ color: t.muted }}>—</span>;
}

function fieldVal(g, field, fmtD, fmtM) {
  switch (field) {
    case "nrCli": return g.nrCli || "(Vazio)";
    case "nomeCli": return g.nomeCli || "(Vazio)";
    case "qtdTitulos": return String(g.qtdTitulos ?? 0);
    case "rankingConfianca": return g.rankingConfianca?.label || "Sem ranking";
    case "statusConsolidado": return g.statusConsolidado || "(Vazio)";
    case "encaminharConsolidado": return g.encaminharConsolidado || "Sem encaminhamento";
    case "ultimoContato": return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)";
    case "dataPromessa": return g.dataPromessa ? fmtD(g.dataPromessa) : "(Vazio)";
    case "valorTotalDebito": return fmtM(g.valorTotalDebito);
    case "obsConsolidada": return g.obsConsolidada || "(Sem observação)";
    case "hist": return "Histórico";
    default: return "";
  }
}

function applyFilters(arr, filters, fmtD, fmtM) {
  return arr.filter(g => {
    for (const [field, vals] of Object.entries(filters)) {
      if (!vals) continue;
      if (vals.length === 0) return false;
      const v = fieldVal(g, field, fmtD, fmtM);
      if (!vals.includes(v)) return false;
    }
    return true;
  });
}

export default function TabelaCobrados({ data, events = [], t, setHistModal, dlCsv }) {
  const [filters, setFilters] = useState({});
  const dataRanked = useMemo(() => data.map(g => ({ ...g, rankingConfianca: rankingConfiancaCliente(g, events) })), [data, events]);
  const colData = (field) => dataRanked.map(g => ({ [field]: fieldVal(g, field, fmtD, fmtM) }));
  const hasFilter = Object.values(filters).some(v => v !== null && v !== undefined);
  const filtered = useMemo(() => applyFilters(dataRanked, filters, fmtD, fmtM), [dataRanked, filters]);
  const CH = (props) => <ColHeader {...props} t={t} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasFilter && <button onClick={() => setFilters({})} style={{ background: "none", border: `1px solid #ef4444`, color: "#ef4444", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕ Limpar filtros</button>}
        </div>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "65vh", overflowY: "auto" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "auto" }}>
          <thead>
            <tr>
              <CH label="Nº" field="nrCli" data={colData("nrCli")} filters={filters} setFilters={setFilters} width={80} />
              <CH label="CLIENTE" field="nomeCli" data={colData("nomeCli")} filters={filters} setFilters={setFilters} width={190} />
              <CH label="QTD." field="qtdTitulos" data={colData("qtdTitulos")} filters={filters} setFilters={setFilters} width={80} />
              <CH label="TOTAL" field="valorTotalDebito" data={colData("valorTotalDebito")} filters={filters} setFilters={setFilters} width={130} />
              <CH label="STATUS" field="statusConsolidado" data={colData("statusConsolidado")} filters={filters} setFilters={setFilters} width={130} />
              <CH label="RANKING DE CONFIABILIDADE" field="rankingConfianca" data={colData("rankingConfianca")} filters={filters} setFilters={setFilters} width={230} />
              <CH label="ENCAMINHAR" field="encaminharConsolidado" data={colData("encaminharConsolidado")} filters={filters} setFilters={setFilters} width={130} />
              <CH label="CONTATO" field="ultimoContato" data={colData("ultimoContato")} filters={filters} setFilters={setFilters} width={110} />
              <CH label="PROMESSA" field="dataPromessa" data={colData("dataPromessa")} filters={filters} setFilters={setFilters} width={110} />
              <CH label="OBSERVAÇÃO" field="obsConsolidada" data={colData("obsConsolidada")} filters={filters} setFilters={setFilters} width={190} />
              <CH label="HIST." field="hist" data={colData("hist")} filters={filters} setFilters={setFilters} width={90} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhum resultado.</td></tr>}
            {filtered.map((g, i) => (
              <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: `4px solid ${prioCor(g.prioridadeCliente)}` }}>
                <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                <td style={tdS()}><b>{g.nomeCli}</b></td>
                <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                <td style={tdS()}>{g.statusConsolidado}</td>
                <td style={{ ...tdS(), textAlign: "center" }}><span style={{ background: g.rankingConfianca?.cor || "#64748b", color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{g.rankingConfianca?.label || "Sem ranking"}</span></td>
                <td style={tdS()}>{encBadge(g.encaminharConsolidado, t)}</td>
                <td style={{ ...tdS(), color: t.muted }}>{fmtD(g.ultimoContato)}</td>
                <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>
                <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                <td style={tdS()}><Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
