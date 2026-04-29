import React, { useState } from "react";
import ColHeader from "./ColHeader";
import { Btn, PrioBadge, PromBadge, ObsCell, Badge, PromessaClassifBadge, SugestaoEncBadge } from "./UI";
import { fmtM, fmtD, prioCor, prioLabel, sugestaoEncaminhamento, normText } from "@/lib/cobranca";

const thS = (t) => ({ background: t.th, padding: "9px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .4, color: t.muted, position: "sticky", top: 0, zIndex: 10 });
const tdS = (ex = {}) => ({ padding: "7px 10px", borderBottom: "1px solid #0002", ...ex });

function encBadge(enc) {
  if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
  if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
  return null;
}

export default function TabelaCarteira({ sortedCart, baseCart, fCart, setFCart, selected, toggleSel, toggleAll, scCart, handleSort, setModal, setForm, setHistModal, openCli, setOpenCli, emptyForm, isDark, t, makeColData, fieldVal, applyExcelFilter }) {
  const hasAnyFilter = (f) => Object.values(f).some(v => v !== null && v !== undefined);

  const CH = (props) => (
    <ColHeader {...props} t={t} sortCfg={scCart} onSort={handleSort} />
  );

  return (
    <div>
      {hasAnyFilter(fCart) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 11, color: t.p }}>
          <span>🔍 Filtros ativos</span>
          <button onClick={() => setFCart({})} style={{ background: t.p, border: "none", borderRadius: 4, padding: "2px 8px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>✕ Limpar todos</button>
        </div>
      )}
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "60vh", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thS(t), width: 36, textAlign: "center" }}>
                <input type="checkbox" checked={selected.size === sortedCart.length && sortedCart.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
              </th>
              <th style={thS(t)} />
              <CH label="Nº" field="nrCli" data={makeColData(baseCart, "nrCli")} filters={fCart} setFilters={setFCart} sortKey="numero" />
              <CH label="CLIENTE ▼" field="nomeCli" data={makeColData(baseCart, "nomeCli")} filters={fCart} setFilters={setFCart} sortKey="cliente" width={220} />
              <th style={thS(t)}>QTD.</th>
              <CH label="VENCIMENTO" field="vencimento" data={makeColData(baseCart, "vencimento")} filters={fCart} setFilters={setFCart} />
              <CH label="ATRASO" field="atrasoLabel" data={makeColData(baseCart, "atrasoLabel")} filters={fCart} setFilters={setFCart} sortKey="atraso" />
              <CH label="VAL. ORIG" field="valorOriginal" data={makeColData(baseCart, "valorOriginal")} filters={fCart} setFilters={setFCart} sortKey="valorOriginal" />
              <th style={thS(t)}>MULTA</th>
              <th style={thS(t)}>JUROS</th>
              <CH label="TOTAL" field="valorTotalDebito" data={makeColData(baseCart, "valorTotalDebito")} filters={fCart} setFilters={setFCart} sortKey="valorTotalDebito" />
              <CH label="STATUS" field="statusConsolidado" data={makeColData(baseCart, "statusConsolidado")} filters={fCart} setFilters={setFCart} />
              <CH label="ENCAMINHAR" field="encaminharConsolidado" data={makeColData(baseCart, "encaminharConsolidado")} filters={fCart} setFilters={setFCart} />
              <CH label="ORIGEM" field="origem" data={makeColData(baseCart, "origem")} filters={fCart} setFilters={setFCart} />
              <CH label="DT. CONTATO" field="ultimoContato" data={makeColData(baseCart, "ultimoContato")} filters={fCart} setFilters={setFCart} />
              <CH label="PROMESSA" field="dataPromessa" data={makeColData(baseCart, "dataPromessa")} filters={fCart} setFilters={setFCart} />
              <th style={thS(t)}>CLASSIF. PROM.</th>
              <th style={thS(t)}>SUGESTÃO</th>
              <CH label="OBSERVAÇÃO" field="obsConsolidada" data={makeColData(baseCart, "obsConsolidada")} filters={fCart} setFilters={setFCart} width={200} />
              <CH label="PRIORIDADE" field="prioridadeCliente" data={makeColData(baseCart, "prioridadeCliente")} filters={fCart} setFilters={setFCart} />
              <th style={thS(t)}>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {sortedCart.length === 0 && (
              <tr><td colSpan={21} style={{ textAlign: "center", padding: 44, color: t.muted, background: t.surf }}>Nenhum resultado. Verifique os filtros.</td></tr>
            )}
            {sortedCart.map((g, i) => {
              const open = !!openCli[g.clientKey], isSel = selected.has(g.clientKey);
              const leftClr = g.encaminharConsolidado === "verificacao" ? "#3b82f6" : g.encaminharConsolidado === "protesto" ? "#ef4444" : prioCor(g.prioridadeCliente);
              const sugestao = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito);
              const rowBg = isSel ? (isDark ? "rgba(232,119,34,.15)" : "rgba(232,119,34,.07)") : (i % 2 === 0 ? t.surf : t.alt);
              return (
                <React.Fragment key={g.clientKey}>
                  <tr style={{ background: rowBg, borderLeft: `4px solid ${leftClr}` }}>
                    <td style={{ ...tdS(), textAlign: "center" }}><input type="checkbox" checked={isSel} onChange={() => toggleSel(g.clientKey)} style={{ cursor: "pointer", accentColor: t.p }} /></td>
                    <td style={tdS()}><button onClick={() => setOpenCli(p => ({ ...p, [g.clientKey]: !p[g.clientKey] }))} style={{ background: "transparent", border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 4, cursor: "pointer", padding: "2px 7px" }}>{open ? "−" : "+"}</button></td>
                    <td style={{ ...tdS(), color: t.muted }}>{g.nrCli}</td>
                    <td style={tdS()}><b>{g.nomeCli}</b></td>
                    <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>
                    <td style={{ ...tdS(), color: t.muted, fontSize: 11 }}>{fmtD(g.primeiroVencimento)}</td>
                    <td style={{ ...tdS(), color: g.maiorAtraso > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>
                    <td style={{ ...tdS(), fontWeight: 700 }}>{fmtM(g.valorOriginal)}</td>
                    <td style={{ ...tdS(), color: "#f97316" }}>{fmtM(g.valorMulta)}</td>
                    <td style={{ ...tdS(), color: "#eab308" }}>{fmtM(g.valorJuros)}</td>
                    <td style={{ ...tdS(), fontWeight: 800, color: t.p }}>{fmtM(g.valorTotalDebito)}</td>
                    <td style={tdS()}>{g.statusConsolidado}</td>
                    <td style={tdS()}>{encBadge(g.encaminharConsolidado)}</td>
                    <td style={tdS()}>
                      {[...new Set(g.titulos.map(x => x.origem))].map(o => (
                        <span key={o} style={{ display: "inline-block", fontSize: 9, background: o === "FINR1253" ? "#7c3aed22" : "#0369a122", color: o === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "2px 6px", borderRadius: 4, fontWeight: 700, margin: "1px" }}>{o === "FINR1253" ? "Topcon" : "EB"}</span>
                      ))}
                    </td>
                    <td style={{ ...tdS(), color: t.muted }}>{fmtD(g.ultimoContato)}</td>
                    <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>
                    <td style={tdS()}><PromessaClassifBadge qtd={g.qtdTotal} /></td>
                    <td style={tdS()}><SugestaoEncBadge sugestao={sugestao} /></td>
                    <td style={tdS()}><ObsCell text={g.obsConsolidada} t={t} /></td>
                    <td style={tdS()}><PrioBadge label={g.prioridadeCliente} /></td>
                    <td style={tdS()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn t={t} sm onClick={() => { setModal(g); setForm({ ...emptyForm(), status: g.statusConsolidado || "", encaminhar: g.encaminharConsolidado || "", tipo: g.titulos[0]?.tipoContato || "", dataPromessa: g.dataPromessa || "", obs: g.obsConsolidada || "" }); }}>✏️</Btn>
                        <Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn>
                      </div>
                    </td>
                  </tr>
                  {open && g.titulos.map(item => (
                    <tr key={item.id} style={{ background: t.surf2 }}>
                      <td colSpan={2} style={tdS()} />
                      <td style={{ ...tdS(), color: t.muted }}>{item.nrCli}</td>
                      <td style={{ ...tdS(), color: t.muted, fontSize: 11 }}>{item.titulo}/{item.seq || "—"} · <span style={{ fontSize: 9, background: item.origem === "FINR1253" ? "#7c3aed22" : "#0369a122", color: item.origem === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>{item.origem === "FINR1253" ? "Topcon" : "EB"}</span></td>
                      <td style={{ ...tdS(), textAlign: "center" }}>1</td>
                      <td style={{ ...tdS(), color: t.muted, fontSize: 11 }}>{fmtD(item.vencimento)}</td>
                      <td style={{ ...tdS(), color: item.diasAtraso > 0 ? "#ef4444" : "#10b981" }}>{item.diasAtraso > 0 ? `${item.diasAtraso}d` : "—"}</td>
                      <td style={tdS()}>{fmtM(item.valorOriginal)}</td>
                      <td style={{ ...tdS(), color: "#f97316" }}>{fmtM(item.valorMulta)}</td>
                      <td style={{ ...tdS(), color: "#eab308" }}>{fmtM(item.valorJuros)}</td>
                      <td style={{ ...tdS(), fontWeight: 700, color: t.p }}>{fmtM(item.valorTotalDebito)}</td>
                      <td style={{ ...tdS(), color: t.muted }}>{item.status}</td>
                      <td style={tdS()}>{encBadge(item.encaminhar)}</td>
                      <td colSpan={8} style={{ ...tdS(), color: t.muted, fontSize: 11 }}>{item.portador || "—"}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.bor}`, fontSize: 11, color: t.muted, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><b style={{ color: t.txt }}>{sortedCart.length}</b> de {baseCart.length} clientes</span>
          {hasAnyFilter(fCart) && <button onClick={() => setFCart({})} style={{ background: "none", border: `1px solid ${t.p}`, color: t.p, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕ Limpar filtros</button>}
        </div>
      </div>
    </div>
  );
}