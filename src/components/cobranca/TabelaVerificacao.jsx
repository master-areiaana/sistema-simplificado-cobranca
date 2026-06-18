import React, { useState, useMemo } from "react";
import ColHeader from "./ColHeader";
import { Btn, ObsCell, Badge } from "./UI";
import { fmtM, fmtD } from "@/lib/cobranca";

const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });

function getResposta(g) {
  const lastResp = g.historicoCliente.find(h => h.subtype?.startsWith("RESP_VERIF"));
  return lastResp?.motivo || "Aguardando";
}

function fieldVal(g, field) {
  switch (field) {
    case "nrCli": return g.nrCli || "(Vazio)";
    case "nomeCli": return g.nomeCli || "(Vazio)";
    case "qtdTitulos": return String(g.qtdTitulos ?? 0);
    case "valorTotalDebito": return fmtM(g.valorTotalDebito);
    case "atrasoLabel": return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—";
    case "statusConsolidado": return g.statusConsolidado || "(Vazio)";
    case "ultimoContato": return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)";
    case "obsConsolidada": return g.obsConsolidada || "(Sem observação)";
    case "resposta": return getResposta(g);
    case "acao": return "Responder";
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

export default function TabelaVerificacao({ data, t, setRespModal, setRespForm }) {
  const [filters, setFilters] = useState({});
  const colData = (field) => data.map(g => ({ [field]: fieldVal(g, field) }));
  const hasFilter = Object.values(filters).some(v => v !== null && v !== undefined);
  const filtered = useMemo(() => applyFilters(data, filters), [data, filters]);

  const CH = (props) => <ColHeader {...props} t={t} />;

  return (
    <div>
      <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(59,130,246,.07)", border: "2px solid #3b82f6", borderRadius: 8, fontSize: 12, color: "#3b82f6", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>🔍 Clientes encaminhados para verificação de pagamento.</span>
        <span style={{ fontSize: 11, color: t.muted }}>
          {hasFilter && <button onClick={() => setFilters({})} style={{ background: "none", border: `1px solid #ef4444`, color: "#ef4444", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700, marginRight: 8 }}>✕ Limpar filtros</button>}
          <b style={{ color: "#3b82f6" }}>{filtered.length}</b> de {data.length}
        </span>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #3b82f6", maxHeight: "65vh", overflowY: "auto" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "auto" }}>
          <thead>
            <tr>
              <CH label="Nº"          field="nrCli"               data={colData("nrCli")}               filters={filters} setFilters={setFilters} width={80} />
              <CH label="CLIENTE"     field="nomeCli"             data={colData("nomeCli")}             filters={filters} setFilters={setFilters} width={190} />
              <CH label="QTD."        field="qtdTitulos"          data={colData("qtdTitulos")}          filters={filters} setFilters={setFilters} width={80} />
              <CH label="TOTAL"       field="valorTotalDebito"    data={colData("valorTotalDebito")}    filters={filters} setFilters={setFilters} width={130} />
              <CH label="ATRASO"      field="atrasoLabel"         data={colData("atrasoLabel")}         filters={filters} setFilters={setFilters} width={95} />
              <CH label="STATUS"      field="statusConsolidado"   data={colData("statusConsolidado")}   filters={filters} setFilters={setFilters} width={130} />
              <CH label="CONTATO"     field="ultimoContato"       data={colData("ultimoContato")}       filters={filters} setFilters={setFilters} width={110} />
              <CH label="OBSERVAÇÃO"  field="obsConsolidada"      data={colData("obsConsolidada")}      filters={filters} setFilters={setFilters} width={190} />
              <CH label="RESPOSTA"    field="resposta"            data={colData("resposta")}            filters={filters} setFilters={setFilters} width={160} />
              <CH label="AÇÃO"        field="acao"                data={colData("acao")}                filters={filters} setFilters={setFilters} width={140} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 44, color: t.muted }}>Nenhum cliente aguardando verificação.</td></tr>
            )}
            {filtered.map((g, i) => {
              const lastResp = g.historicoCliente.find(h => h.subtype?.startsWith("RESP_VERIF"));
              return (
                <tr key={g.clientKey} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderLeft: "4px solid #3b82f6" }}>
                  <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                  <td style={tdS()}><b>{g.nomeCli}</b></td>
                  <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                  <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                  <td style={{ ...tdS(), color: "#ef4444", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
                  <td style={tdS()}>{g.statusConsolidado}</td>
                  <td style={{ ...tdS(), color: t.muted }}>{fmtD(g.ultimoContato)}</td>
                  <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                  <td style={tdS()}>{lastResp ? <Badge label={lastResp.motivo} color={lastResp.motivo === "Confirmado" ? "#10b981" : "#64748b"} /> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ Aguardando</span>}</td>
                  <td style={tdS()}><Btn t={t} sm onClick={() => { setRespModal({ tipo: "verificacao", grupo: g }); setRespForm({ responsavel: "", resposta: "", obs: "" }); }} style={{ background: "#3b82f6", color: "#fff" }}>🔍 Responder</Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
