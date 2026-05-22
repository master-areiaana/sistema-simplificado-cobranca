import React, { useMemo, useState } from "react";
import ColHeader from "./ColHeader";
import { Btn, PromBadge, ObsCell, Badge, SugestaoEncBadge } from "./UI";
import { fmtM, fmtD, prioCor, sugestaoEncaminhamento } from "@/lib/cobranca";

const COLS_DEF = [
  { key: "check", label: "", width: 32, fixed: true },
  { key: "expand", label: "", width: 28, fixed: true },
  { key: "nrCli", label: "Nº", width: 52 },
  { key: "nomeCli", label: "CLIENTE", width: "13%", minWidth: 120 },
  { key: "qtd", label: "QTD.", width: 36 },
  { key: "venc", label: "VENCIMENTO", width: 80 },
  { key: "atraso", label: "ATRASO", width: 56 },
  { key: "vOrig", label: "VAL. ORIG", width: 80 },
  { key: "multa", label: "MULTA", width: 68 },
  { key: "juros", label: "JUROS", width: 64 },
  { key: "total", label: "TOTAL", width: 84 },
  { key: "status", label: "STATUS", width: 100 },
  { key: "acao", label: "AÇÃO A FAZER", width: 120 },
  { key: "enc", label: "ENCAMINHAR", width: 84 },
  { key: "origem", label: "ORIG.", width: 44 },
  { key: "cat", label: "CATEGORIA", width: 80 },
  { key: "contato", label: "DT. CONTATO", width: 78 },
  { key: "prom", label: "PROMESSA", width: 82 },
  { key: "sugest", label: "SUGESTÃO", width: 86 },
  { key: "obs", label: "OBSERVAÇÃO", width: "14%", minWidth: 100 },
  { key: "acoes", label: "AÇÕES", width: 96, fixed: true },
];

const thS = (t) => ({ background: t.th, padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.bor}`, letterSpacing: .3, color: t.muted, position: "sticky", top: 0, zIndex: 10 });
const tdS = (ex = {}) => ({ padding: "6px 8px", borderBottom: "1px solid #0002", fontSize: 11, ...ex });
const cleanText = (v) => String(v ?? "").trim();
const hasLetters = (v) => /[A-Za-zÀ-ÿ]/.test(cleanText(v));

function encBadge(enc) {
  if (enc === "verificacao") return <Badge label="→ Verificar" color="#3b82f6" />;
  if (enc === "protesto") return <Badge label="→ Protesto" color="#ef4444" />;
  if (enc === "assessoria") return <Badge label="→ Assessoria" color="#f97316" />;
  return null;
}

function categoriaBadge(cat) {
  const cores = { Portador: "#8b5cf6", Imobiliário: "#06b6d4", Parceiros: "#f59e0b", Bancos: "#10b981" };
  if (!cat) return null;
  return <Badge label={cat} color={cores[cat] || "#64748b"} />;
}

function isGenericClientName(v) {
  const s = cleanText(v);
  const n = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  const termosQueNaoSaoCliente = new Set(["NFE", "NF", "FAT", "TC", "EB", "NFSE", "CTE", "DUP", "DUPL", "TITULO", "PARCELA"]);
  return !s || s === "—" || /^\d+$/.test(s) || /^cliente\s*\d+$/i.test(s) || termosQueNaoSaoCliente.has(n);
}

function splitCodeAndName(v) {
  const s = cleanText(v);
  const m = s.match(/^(\d{1,10})\s*[\/\-–]\s*(.{2,})$/);
  if (!m) return null;
  const nome = cleanText(m[2]);
  if (!hasLetters(nome) || isGenericClientName(nome)) return null;
  return { nrCli: cleanText(m[1]), nomeCli: nome };
}

function getDisplayClient(g) {
  const candidates = [];
  const fromGroup = splitCodeAndName(g.nomeCli);
  if (fromGroup) candidates.push(fromGroup);
  if (!isGenericClientName(g.nomeCli) && hasLetters(g.nomeCli)) candidates.push({ nrCli: cleanText(g.nrCli), nomeCli: cleanText(g.nomeCli) });
  for (const item of g.titulos || []) {
    const fromItemName = splitCodeAndName(item.nomeCli);
    if (fromItemName) candidates.push(fromItemName);
    if (!isGenericClientName(item.nomeCli) && hasLetters(item.nomeCli)) candidates.push({ nrCli: cleanText(item.nrCli || g.nrCli), nomeCli: cleanText(item.nomeCli) });
  }
  const best = candidates.filter(c => c.nomeCli && hasLetters(c.nomeCli) && !isGenericClientName(c.nomeCli)).sort((a, b) => b.nomeCli.length - a.nomeCli.length)[0];
  return { nrCli: best?.nrCli || cleanText(g.nrCli), nomeCli: best?.nomeCli || (!isGenericClientName(g.nomeCli) ? cleanText(g.nomeCli) : "—") };
}

function getOrigemLabel(origem) {
  return origem === "FINR1253" ? "TC" : "EB";
}

function renderTituloDetalhe(item, grupo) {
  const cliente = getDisplayClient(grupo);
  const titulo = cleanText(item.titulo);
  const seq = cleanText(item.seq);
  const tituloPareceCliente = splitCodeAndName(`${titulo}/${seq}`);
  if (tituloPareceCliente) {
    const doc = cleanText(grupo.nrCli);
    return doc ? `${doc}/1` : "—";
  }
  if (titulo && seq) return `${titulo}/${seq}`;
  if (titulo) return titulo;
  if (cliente.nrCli && cleanText(item.nrCli) !== cliente.nrCli) return cleanText(item.nrCli);
  return "—";
}

function itemFilterValue(item, grupo, field) {
  const cliente = getDisplayClient(grupo);
  const sugestao = sugestaoEncaminhamento(Number(item.diasAtraso || 0), Number(item.valorTotalDebito || 0));
  switch (field) {
    case "nrCli": return cliente.nrCli || item.nrCli || "(Vazio)";
    case "nomeCli": return cliente.nomeCli || "(Vazio)";
    case "qtd": return "1";
    case "venc": return item.vencimento ? fmtD(item.vencimento) : "(Vazio)";
    case "atraso": return item.diasAtraso > 0 ? `${item.diasAtraso}d` : "—";
    case "vOrig": return fmtM(item.valorOriginal);
    case "multa": return fmtM(item.valorMulta);
    case "juros": return fmtM(item.valorJuros);
    case "total": return fmtM(item.valorTotalDebito);
    case "status": return item.status || "(Vazio)";
    case "acao": return item.acaoAfazer || "(Vazio)";
    case "enc": return item.encaminhar || "Sem encaminhamento";
    case "origem": return getOrigemLabel(item.origem) || "(Vazio)";
    case "cat": return item.clientCategory || "(Vazio)";
    case "contato": return item.dataContato ? fmtD(item.dataContato) : "(Vazio)";
    case "prom": return item.dataPromessa ? fmtD(item.dataPromessa) : "(Vazio)";
    case "sugest": return sugestao ? sugestao.label : "(Sem sugestão)";
    case "obs": return item.obs || grupo.obsConsolidada || item.portador || "(Sem observação)";
    case "titulo": return renderTituloDetalhe(item, grupo);
    default: return "";
  }
}

function filterValue(g, field) {
  const cliente = getDisplayClient(g);
  const sugestao = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito);
  switch (field) {
    case "nrCli": return cliente.nrCli || g.nrCli || "(Vazio)";
    case "nomeCli": return cliente.nomeCli || "(Vazio)";
    case "qtd": return String(g.qtdTitulos ?? 0);
    case "venc": return g.primeiroVencimento ? fmtD(g.primeiroVencimento) : "(Vazio)";
    case "atraso": return g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—";
    case "vOrig": return fmtM(g.valorOriginal);
    case "multa": return fmtM(g.valorMulta);
    case "juros": return fmtM(g.valorJuros);
    case "total": return fmtM(g.valorTotalDebito);
    case "status": return g.statusConsolidado || "(Vazio)";
    case "acao": return g.acaoAfazer || "(Vazio)";
    case "enc": return g.encaminharConsolidado || "Sem encaminhamento";
    case "origem": return [...new Set((g.titulos || []).map(x => getOrigemLabel(x.origem)).filter(Boolean))].join(", ") || "(Vazio)";
    case "cat": return [...new Set((g.titulos || []).map(x => x.clientCategory).filter(Boolean))].join(", ") || "(Vazio)";
    case "contato": return g.ultimoContato ? fmtD(g.ultimoContato) : "(Vazio)";
    case "prom": return g.dataPromessa ? fmtD(g.dataPromessa) : "(Vazio)";
    case "sugest": return sugestao ? sugestao.label : "(Sem sugestão)";
    case "obs": return g.obsConsolidada || "(Sem observação)";
    default: return "";
  }
}

function valuesForFilter(g, field) {
  const values = [filterValue(g, field)];
  for (const item of g.titulos || []) values.push(itemFilterValue(item, g, field));
  return [...new Set(values.map(v => v == null || v === "" ? "(Vazio)" : String(v)))];
}

function matchesAllFiltersByValues(valuesMap, filters) {
  for (const [field, vals] of Object.entries(filters)) {
    if (!vals) continue;
    if (vals.length === 0) return false;
    const values = valuesMap(field);
    if (!values.some(v => vals.includes(v))) return false;
  }
  return true;
}

function groupMatchesFilters(g, filters) {
  return matchesAllFiltersByValues((field) => valuesForFilter(g, field), filters);
}
function itemMatchesFilters(item, grupo, filters) {
  return matchesAllFiltersByValues((field) => [itemFilterValue(item, grupo, field)], filters);
}
function visibleTitlesForGroup(g, filters) {
  const hasActiveFilter = Object.values(filters).some(v => v !== null && v !== undefined);
  if (!hasActiveFilter) return g.titulos || [];
  const matchedItems = (g.titulos || []).filter(item => itemMatchesFilters(item, g, filters));
  return matchedItems.length > 0 ? matchedItems : (g.titulos || []);
}
function applyLocalFilters(arr, filters) {
  return arr.filter((g) => groupMatchesFilters(g, filters));
}

export default function TabelaCarteira({ sortedCart, baseCart, fCart, setFCart, selected, toggleSel, toggleAll, scCart, handleSort, setModal, setForm, setHistModal, openCli, setOpenCli, emptyForm, isDark, t, setNegModal, onEncaminharSugestao, hiddenCols, onClickFilter }) {
  const [tableFilters, setTableFilters] = useState({});
  const hasAnyFilter = (f) => Object.values(f).some(v => v !== null && v !== undefined);
  const hasAnyTableFilter = hasAnyFilter(tableFilters);
  const visibleCols = COLS_DEF.filter(c => !["acao", "sugest"].includes(c.key) && (c.fixed || !hiddenCols.has(c.key)));
  const CH = (props) => <ColHeader {...props} t={t} sortCfg={scCart} onSort={handleSort} />;
  const vis = visibleCols;
  const colCount = vis.length;
  const filteredCart = useMemo(() => applyLocalFilters(sortedCart, tableFilters), [sortedCart, tableFilters]);
  const headerData = useMemo(() => {
    const source = baseCart?.length ? baseCart : sortedCart;
    return Object.fromEntries(COLS_DEF.map(c => [c.key, source.flatMap(g => valuesForFilter(g, c.key).map(value => ({ [c.key]: value })))]));
  }, [baseCart, sortedCart]);

  function clearAllFilters() {
    setTableFilters({});
    setFCart && setFCart({});
  }

  function renderCell(key, g) {
    const sugestao = sugestaoEncaminhamento(g.maiorAtraso, g.valorTotalDebito);
    const cliente = getDisplayClient(g);
    switch (key) {
      case "nrCli": return <td style={{ ...tdS(), color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliente.nrCli || g.nrCli}</td>;
      case "nomeCli": return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cliente.nomeCli}><b style={{ cursor: "pointer" }} onClick={() => onClickFilter && onClickFilter(cliente.nomeCli)}>{cliente.nomeCli}</b></td>;
      case "qtd": return <td style={{ ...tdS(), textAlign: "center" }}>{g.qtdTitulos}</td>;
      case "venc": return <td style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtD(g.primeiroVencimento)}</td>;
      case "atraso": return <td style={{ ...tdS(), color: g.maiorAtraso > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—"}</td>;
      case "vOrig": return <td style={{ ...tdS(), fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorOriginal)}</td>;
      case "multa": return <td style={{ ...tdS(), color: "#f97316", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorMulta)}</td>;
      case "juros": return <td style={{ ...tdS(), color: "#eab308", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorJuros)}</td>;
      case "total": return <td style={{ ...tdS(), fontWeight: 800, color: t.p, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtM(g.valorTotalDebito)}</td>;
      case "status": return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}><span onClick={() => onClickFilter && onClickFilter(g.statusConsolidado)} style={{ cursor: "pointer" }}>{g.statusConsolidado}</span></td>;
      case "enc": return <td onClick={() => g.encaminharConsolidado && onClickFilter && onClickFilter(g.encaminharConsolidado)} style={{ ...tdS(), cursor: g.encaminharConsolidado ? "pointer" : "default" }}>{encBadge(g.encaminharConsolidado)}</td>;
      case "origem": return <td style={tdS()}>{[...new Set(g.titulos.map(x => x.origem))].map(o => <span key={o} style={{ display: "inline-block", fontSize: 8, background: o === "FINR1253" ? "#7c3aed22" : "#0369a122", color: o === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{getOrigemLabel(o)}</span>)}</td>;
      case "cat": return <td style={tdS()}>{[...new Set(g.titulos.map(x => x.clientCategory).filter(Boolean))].map(cat => <div key={cat} style={{ marginBottom: 4 }}>{categoriaBadge(cat)}</div>)}</td>;
      case "contato": return <td style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtD(g.ultimoContato)}</td>;
      case "prom": return <td style={tdS()}><PromBadge date={g.dataPromessa} t={t} /></td>;
      case "obs": return <td style={{ ...tdS(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><ObsCell text={g.obsConsolidada} t={t} /></td>;
      case "sugest": return <td style={tdS()}>{sugestao ? <SugestaoEncBadge sugestao={sugestao} /> : null}</td>;
      default: return null;
    }
  }

  return (
    <div>
      {(hasAnyFilter(fCart) || hasAnyTableFilter) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: t.p }}>🔍 Filtros ativos</span>
          <button onClick={clearAllFilters} style={{ background: t.p, border: "none", borderRadius: 4, padding: "2px 8px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>✕ Limpar</button>
        </div>
      )}
      <div style={{ borderRadius: 10, border: `1px solid ${t.bor}`, boxShadow: t.shad, maxHeight: "65vh", overflowY: "auto", overflowX: "hidden", width: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>{vis.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.minWidth || undefined }} />)}</colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
            <tr>
              {vis.map(c => {
                if (c.key === "check") return <th key="check" style={{ ...thS(t), textAlign: "center", width: 32 }}><input type="checkbox" checked={selected.size === filteredCart.length && filteredCart.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} /></th>;
                if (c.key === "expand") return <th key="expand" style={thS(t)} />;
                if (c.key === "acoes") return <th key="acoes" style={thS(t)}>AÇÕES</th>;
                const sortMap = { nrCli: "numero", nomeCli: "cliente", atraso: "atraso", vOrig: "valorOriginal", total: "valorTotalDebito" };
                return <CH key={c.key} label={c.label} field={c.key} data={headerData[c.key] || []} filters={tableFilters} setFilters={setTableFilters} sortKey={sortMap[c.key]} />;
              })}
            </tr>
          </thead>
          <tbody>
            {filteredCart.length === 0 && <tr><td colSpan={colCount} style={{ textAlign: "center", padding: 44, color: t.muted, background: t.surf }}>Nenhum resultado. Verifique os filtros.</td></tr>}
            {filteredCart.map((g, i) => {
              const open = !!openCli[g.clientKey];
              const isSel = selected.has(g.clientKey);
              const leftClr = g.encaminharConsolidado === "verificacao" ? "#3b82f6" : g.encaminharConsolidado === "protesto" ? "#ef4444" : prioCor(g.prioridadeCliente);
              const rowBg = isSel ? (isDark ? "rgba(232,119,34,.15)" : "rgba(232,119,34,.07)") : (i % 2 === 0 ? t.surf : t.alt);
              const titulosVisiveis = visibleTitlesForGroup(g, tableFilters);
              return (
                <React.Fragment key={g.clientKey}>
                  <tr style={{ background: rowBg, borderLeft: `4px solid ${leftClr}` }}>
                    {vis.map(c => {
                      if (c.key === "check") return <td key="check" style={{ ...tdS(), textAlign: "center" }}><input type="checkbox" checked={isSel} onChange={() => toggleSel(g.clientKey)} style={{ cursor: "pointer", accentColor: t.p }} /></td>;
                      if (c.key === "expand") return <td key="expand" style={tdS()}><button onClick={() => setOpenCli(p => ({ ...p, [g.clientKey]: !p[g.clientKey] }))} title={open ? "Recolher títulos do cliente" : "Expandir títulos do cliente"} style={{ background: t.p, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>{open ? "−" : "+"}</button></td>;
                      if (c.key === "acoes") return <td key="acoes" style={tdS()}><div style={{ display: "flex", gap: 3 }}><Btn t={t} sm onClick={() => { setModal(g); setForm({ ...emptyForm(), status: g.statusConsolidado || "", encaminhar: g.encaminharConsolidado || "", tipo: g.titulos[0]?.tipoContato || "", dataPromessa: g.dataPromessa || "", obs: g.obsConsolidada || "" }); }}>✏️</Btn><Btn t={t} sm ghost onClick={() => setHistModal(g)}>🕐</Btn>{setNegModal && <Btn t={t} sm onClick={() => setNegModal(g)} style={{ background: "#7c3aed", border: "none", color: "#fff" }}>🤝</Btn>}</div></td>;
                      return React.cloneElement(renderCell(c.key, g), { key: c.key });
                    })}
                  </tr>
                  {open && titulosVisiveis.map(item => (
                    <tr key={item.id} style={{ background: t.surf2 }}>
                      {vis.map(c => {
                        const cliente = getDisplayClient(g);
                        const tituloDetalhe = renderTituloDetalhe(item, g);
                        if (c.key === "check" || c.key === "expand") return <td key={c.key} style={tdS()} />;
                        if (c.key === "nrCli") return <td key="nrCli" style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tituloDetalhe}</td>;
                        if (c.key === "nomeCli") return <td key="nomeCli" style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cliente.nomeCli}>{cliente.nomeCli || "—"}</td>;
                        if (c.key === "qtd") return <td key="qtd" style={{ ...tdS(), textAlign: "center" }}>1</td>;
                        if (c.key === "venc") return <td key="venc" style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(item.vencimento)}</td>;
                        if (c.key === "atraso") return <td key="atraso" style={{ ...tdS(), color: item.diasAtraso > 0 ? "#ef4444" : "#10b981" }}>{item.diasAtraso > 0 ? `${item.diasAtraso}d` : "—"}</td>;
                        if (c.key === "vOrig") return <td key="vOrig" style={tdS()}>{fmtM(item.valorOriginal)}</td>;
                        if (c.key === "multa") return <td key="multa" style={{ ...tdS(), color: "#f97316" }}>{fmtM(item.valorMulta)}</td>;
                        if (c.key === "juros") return <td key="juros" style={{ ...tdS(), color: "#eab308" }}>{fmtM(item.valorJuros)}</td>;
                        if (c.key === "total") return <td key="total" style={{ ...tdS(), fontWeight: 700, color: t.p }}>{fmtM(item.valorTotalDebito)}</td>;
                        if (c.key === "status") return <td key="status" style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{item.status}</td>;
                        if (c.key === "enc") return <td key="enc" style={tdS()}>{encBadge(item.encaminhar)}</td>;
                        if (c.key === "origem") return <td key="origem" style={tdS()}><span style={{ display: "inline-block", fontSize: 8, background: item.origem === "FINR1253" ? "#7c3aed22" : "#0369a122", color: item.origem === "FINR1253" ? "#7c3aed" : "#0369a1", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{getOrigemLabel(item.origem)}</span></td>;
                        if (c.key === "cat") return <td key="cat" style={tdS()}>{item.clientCategory ? categoriaBadge(item.clientCategory) : "—"}</td>;
                        if (c.key === "contato") return <td key="contato" style={{ ...tdS(), color: t.muted, fontSize: 10 }}>{fmtD(item.dataContato)}</td>;
                        if (c.key === "prom") return <td key="prom" style={tdS()}><PromBadge date={item.dataPromessa} t={t} /></td>;
                        if (c.key === "obs") return <td key="obs" style={{ ...tdS(), color: t.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.obs || item.portador || "—"}</td>;
                        if (c.key === "acoes") return <td key="acoes" style={tdS()} />;
                        return <td key={c.key} style={{ ...tdS(), color: t.muted, fontSize: 10 }}>—</td>;
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.bor}`, fontSize: 11, color: t.muted, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><b style={{ color: t.txt }}>{filteredCart.length}</b> de {baseCart.length} clientes</span>
          {(hasAnyFilter(fCart) || hasAnyTableFilter) && <button onClick={clearAllFilters} style={{ background: "none", border: `1px solid ${t.p}`, color: t.p, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕ Limpar filtros</button>}
        </div>
      </div>
    </div>
  );
}
