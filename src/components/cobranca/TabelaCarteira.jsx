import React, { useState } from "react";
import ColHeader from "./ColHeader";
import { Btn, PromBadge, ObsCell, Badge, PromessaClassifBadge, SugestaoEncBadge } from "./UI";
import { fmtM, fmtD, prioCor, sugestaoEncaminhamento } from "@/lib/cobranca";

// Colunas visíveis por padrão e suas configs
const COLS_DEF = [
  { key: "check",    label: "",           width: 32,   fixed: true },
  { key: "expand",   label: "",           width: 28,   fixed: true },
  { key: "nrCli",   label: "Nº",         width: 52 },
  { key: "nomeCli", label: "CLIENTE",    width: "13%", minWidth: 120 },
  { key: "qtd",     label: "QTD.",       width: 36 },
  { key: "venc",    label: "VENCIMENTO", width: 80 },
  { key: "atraso",  label: "ATRASO",     width: 56 },
  { key: "vOrig",   label: "VAL. ORIG",  width: 80 },
  { key: "multa",   label: "MULTA",      width: 68 },
  { key: "juros",   label: "JUROS",      width: 64 },
  { key: "total",   label: "TOTAL",      width: 84 },
  { key: "status",  label: "STATUS",     width: 100 },
  { key: "enc",     label: "ENCAMINHAR", width: 84 },
  { key: "origem",  label: "ORIG.",      width: 44 },
  { key: "contato", label: "DT. CONTATO",width: 78 },
  { key: "prom",    label: "PROMESSA",   width: 82 },
  { key: "classif", label: "CLASSIF.",   width: 68 },
  { key: "sugest",  label: "SUGESTÃO",   width: 86 },
  { key: "obs",     label: "OBSERVAÇÃO", width: "14%", minWidth: 100 },
  { key: "acoes",   label: "AÇÕES",      width: 96,   fixed: true },
];

const thS = (t) => ({ background: t.th, padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .3, color: t.muted, position: "sticky", top: 0, zIndex: 10 });
const tdS = (ex = {}) => ({ padding: "6px 8px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });

function encBadge(enc) {
  if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
  if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
  return null;
}

export default function TabelaCarteira({ sortedCart, baseCart, fCart, setFCart, selected, toggleSel, toggleAll, scCart, handleSort, setModal, setForm, setHistModal, openCli, setOpenCli, emptyForm, isDark, t, makeColData, fieldVal, applyExcelFilter, setNegModal, onEncaminharSugestao }) {
  const hasAnyFilter = (f) => Object.values(f).some(v => v !== null && v !== undefined);
  // Colunas ocultas pelo usuário (keys)
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [showColMenu, setShowColMenu] = useState(false);

  const toggleCol = (key) => setHiddenCols(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const visibleCols = COLS_DEF.filter(c => c.fixed || !hiddenCols.has(c.key));

  const CH = (props) => (
    <ColHeader {...props} t={t} sortCfg={scCart} onSort={handleSort} />
  );

  const vis = visibleCols;
  const colCount = vis.length;

  // Renderiza célula de linha de cliente pelo key da coluna
  function renderCell(key, g) {
    const sugestao = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito);
    switch(key) {
      case "nrCli":   return <td style={{ ...tdS(), color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nrCli}</td>;
      case "nomeCli": return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.nomeCli}><b>{g.nomeCli}</b></td>;
      case "qtd":     return <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>;
      case "venc":    return <td style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtD(g.primeiroVencimento)}</td>;
      case "atraso":  return <td style={{ ...tdS(), color: g.maiorAtraso > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>;
      case "vOrig":   return <td style={{ ...tdS(), fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorOriginal)}</td>;
      case "multa":   return <td style={{ ...tdS(), color: "#f97316", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorMulta)}</td>;
      case "juros":   return <td style={{ ...tdS(), color: "#eab308", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorJuros)}</td>;
      case "total":   return <td style={{ ...tdS(), fontWeight: 800, color: t.p, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorTotalDebito)}</td>;
      case "status":  return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{g.statusConsolidado}</td>;
      case "enc":     return <td style={tdS()}>{encBadge(g.encaminharConsolidado)}</td>;
      case "origem":  return <td style={tdS()}>{[...new Set(g.titulos.map(x => x.origem))].map(o => <span key={o} style={{ display: "inline-block", fontSize: 8, background: o === "FINR1253" ? "#7c3aed22" : "#0369a122", color: o === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{o === "FINR1253" ? "TC" : "EB"}</span>)}</td>;
      case "contato": return <td style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtD(g.ultimoContato)}</td>;
      case "prom":    return <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>;
      case "classif": return <td style={tdS()}><PromessaClassifBadge qtd={g.qtdTotal} /></td>;
      case "sugest":  return (
        <td style={tdS()}>
          {sugestao ? (
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <SugestaoEncBadge sugestao={sugestao} />
              {onEncaminharSugestao && (sugestao.label === "Protesto" || sugestao.label === "Verificar" || sugestao.label === "Assessoria" || sugestao.label === "Jurídico") && (
                <button title={`Encaminhar para ${sugestao.label === "Verificar" ? "verificação" : "protesto"}`}
                  onClick={() => onEncaminharSugestao(g, sugestao.label === "Verificar" ? "verificacao" : "protesto")}
                  style={{ background: sugestao.cor, color: "#fff", border: "none", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>→</button>
              )}
            </div>
          ) : null}
        </td>
      );
      case "obs":   return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><ObsCell text={g.obsConsolidada} t={t} /></td>;
      default:      return null;
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {hasAnyFilter(fCart) && (
          <>
            <span style={{ fontSize: 11, color: t.p }}>🔍 Filtros ativos</span>
            <button onClick={() => setFCart({})} style={{ background: t.p, border: "none", borderRadius: 4, padding: "2px 8px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>✕ Limpar</button>
          </>
        )}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <button onClick={() => setShowColMenu(x => !x)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            ☰ Colunas {hiddenCols.size > 0 ? `(${hiddenCols.size} ocultas)` : ""}
          </button>
          {showColMenu && (
            <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "8px", zIndex: 200, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,.2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {COLS_DEF.filter(c => !c.fixed && c.key !== "check" && c.key !== "expand").map(c => (
                <label key={c.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, background: hiddenCols.has(c.key) ? t.surf2 : "transparent" }}>
                  <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} style={{ accentColor: t.p }} />
                  {c.label || c.key}
                </label>
              ))}
              <button onClick={() => { setHiddenCols(new Set()); setShowColMenu(false); }} style={{ gridColumn: "1/-1", marginTop: 4, background: t.p, color: "#fff", border: "none", borderRadius: 4, padding: "4px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Mostrar Todas</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "65vh", overflowY: "auto", overflowX: "hidden", width: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            {vis.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.minWidth || undefined }} />)}
          </colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
            <tr>
              {vis.map(c => {
                if (c.key === "check") return <th key="check" style={{ ...thS(t), textAlign: "center", width: 32 }}><input type="checkbox" checked={selected.size === sortedCart.length && sortedCart.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} /></th>;
                if (c.key === "expand") return <th key="expand" style={thS(t)} />;
                if (c.key === "acoes") return <th key="acoes" style={thS(t)}>AÇÕES</th>;
                if (c.key === "qtd") return <th key="qtd" style={thS(t)}>QTD.</th>;
                if (c.key === "multa") return <th key="multa" style={thS(t)}>MULTA</th>;
                if (c.key === "juros") return <th key="juros" style={thS(t)}>JUROS</th>;
                if (c.key === "classif") return <th key="classif" style={thS(t)}>CLASSIF.</th>;
                if (c.key === "sugest") return <th key="sugest" style={thS(t)}>SUGESTÃO</th>;
                // ColHeader para colunas filtráveis
                const fieldMap = { nrCli:"nrCli", nomeCli:"nomeCli", venc:"vencimento", atraso:"atrasoLabel", vOrig:"valorOriginal", total:"valorTotalDebito", status:"statusConsolidado", enc:"encaminharConsolidado", origem:"origem", contato:"ultimoContato", prom:"dataPromessa", obs:"obsConsolidada" };
                const sortMap = { nrCli:"numero", nomeCli:"cliente", atraso:"atraso", vOrig:"valorOriginal", total:"valorTotalDebito" };
                const field = fieldMap[c.key];
                return field ? <CH key={c.key} label={c.label} field={field} data={makeColData(baseCart, field)} filters={fCart} setFilters={setFCart} sortKey={sortMap[c.key]} /> : <th key={c.key} style={thS(t)}>{c.label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {sortedCart.length === 0 && (
              <tr><td colSpan={colCount} style={{ textAlign: "center", padding: 44, color: t.muted, background: t.surf }}>Nenhum resultado. Verifique os filtros.</td></tr>
            )}
            {sortedCart.map((g, i) => {
              const open = !!openCli[g.clientKey], isSel = selected.has(g.clientKey);
              const leftClr = g.encaminharConsolidado === "verificacao" ? "#3b82f6" : g.encaminharConsolidado === "protesto" ? "#ef4444" : prioCor(g.prioridadeCliente);
              const rowBg = isSel ? (isDark ? "rgba(232,119,34,.15)" : "rgba(232,119,34,.07)") : (i % 2 === 0 ? t.surf : t.alt);
              return (
                <React.Fragment key={g.clientKey}>
                  <tr style={{ background: rowBg, borderLeft: `4px solid ${leftClr}` }}>
                    {vis.map(c => {
                      if (c.key === "check") return <td key="check" style={{ ...tdS(), textAlign: "center" }}><input type="checkbox" checked={isSel} onChange={() => toggleSel(g.clientKey)} style={{ cursor: "pointer", accentColor: t.p }} /></td>;
                      if (c.key === "expand") return <td key="expand" style={tdS()}><button onClick={() => setOpenCli(p => ({ ...p, [g.clientKey]: !p[g.clientKey] }))} style={{ background: "transparent", border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11 }}>{open ? "−" : "+"}</button></td>;
                      if (c.key === "acoes") return <td key="acoes" style={tdS()}><div style={{ display: "flex", gap: 3 }}><Btn t={t} sm onClick={() => { setModal(g); setForm({ ...emptyForm(), status: g.statusConsolidado || "", encaminhar: g.encaminharConsolidado || "", tipo: g.titulos[0]?.tipoContato || "", dataPromessa: g.dataPromessa || "", obs: g.obsConsolidada || "" }); }}>✏️</Btn><Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn>{setNegModal && <Btn t={t} sm onClick={() => setNegModal(g)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>🤝</Btn>}</div></td>;
                      return React.cloneElement(renderCell(c.key, g), { key: c.key });
                    })}
                  </tr>
                  {open && g.titulos.map(item => (
                    <tr key={item.id} style={{ background: t.surf2 }}>
                      {vis.map((c, ci) => {
                        if (c.key === "check") return <td key="check" style={tdS()} />;
                        if (c.key === "expand") return <td key="expand" style={tdS()} />;
                        if (c.key === "nrCli") return <td key="nrCli" style={{ ...tdS(), color: t.muted }}>{item.nrCli}</td>;
                        if (c.key === "nomeCli") return <td key="nomeCli" style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.titulo}/{item.seq || "—"} · <span style={{ fontSize: 8, background: item.origem === "FINR1253" ? "#7c3aed22" : "#0369a122", color: item.origem === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{item.origem === "FINR1253" ? "TC" : "EB"}</span></td>;
                        if (c.key === "qtd") return <td key="qtd" style={{ ...tdS(), textAlign: "center" }}>1</td>;
                        if (c.key === "venc") return <td key="venc" style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(item.vencimento)}</td>;
                        if (c.key === "atraso") return <td key="atraso" style={{ ...tdS(), color: item.diasAtraso > 0 ? "#ef4444" : "#10b981" }}>{item.diasAtraso > 0 ? `${item.diasAtraso}d` : "—"}</td>;
                        if (c.key === "vOrig") return <td key="vOrig" style={tdS()}>{fmtM(item.valorOriginal)}</td>;
                        if (c.key === "multa") return <td key="multa" style={{ ...tdS(), color: "#f97316" }}>{fmtM(item.valorMulta)}</td>;
                        if (c.key === "juros") return <td key="juros" style={{ ...tdS(), color: "#eab308" }}>{fmtM(item.valorJuros)}</td>;
                        if (c.key === "total") return <td key="total" style={{ ...tdS(), fontWeight: 700, color: t.p }}>{fmtM(item.valorTotalDebito)}</td>;
                        if (c.key === "status") return <td key="status" style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{item.status}</td>;
                        if (c.key === "enc") return <td key="enc" style={tdS()}>{encBadge(item.encaminhar)}</td>;
                        return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{item.portador || "—"}</td>;
                      })}
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