import { useMemo, useState } from "react";
import { fmtM, fmtD } from "@/lib/cobranca";
import { rankingConfiancaCliente } from "@/lib/rankingConfianca";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function classifPromessa(dataPromessa, status) {
  if (!dataPromessa) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prom = new Date(`${dataPromessa}T00:00:00`);
  const diff = Math.floor((prom - hoje) / 86400000);
  const pago = ["Pago Aguard. Baixa","Encerrado","Pagamento confirmado"].includes(status);
  if (pago) return { tipo: "pago", cor: "#10b981", label: "✅ Pago" };
  if (diff < 0) return { tipo: "vencida", cor: "#ef4444", label: "🔴 Descumprida" };
  if (diff === 0) return { tipo: "hoje", cor: "#f97316", label: "🟠 Vence Hoje" };
  if (diff <= 3) return { tipo: "proxima", cor: "#eab308", label: "🟡 Próxima" };
  return { tipo: "futura", cor: "#3b82f6", label: "🔵 Futura" };
}

export default function MonitorPromessas({ grouped, events = [], t }) {
  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [filtro, setFiltro] = useState("todas");

  const promessas = useMemo(() => grouped.filter(g => g.dataPromessa).map(g => {
    const classif = classifPromessa(g.dataPromessa, g.statusConsolidado);
    const ranking = rankingConfiancaCliente(g, events);
    return { ...g, classif, ranking };
  }).filter(g => g.classif), [grouped, events]);

  const stats = useMemo(() => ({
    total: promessas.length,
    vencidas: promessas.filter(p => p.classif.tipo === "vencida").length,
    hoje: promessas.filter(p => p.classif.tipo === "hoje").length,
    proximas: promessas.filter(p => p.classif.tipo === "proxima").length,
    futuras: promessas.filter(p => p.classif.tipo === "futura").length,
    pagas: promessas.filter(p => p.classif.tipo === "pago").length,
    valorVencido: promessas.filter(p => p.classif.tipo === "vencida").reduce((s,p) => s+p.valorTotalDebito, 0),
    rank1: promessas.filter(p => p.ranking?.nivel === 1).length,
    rank2: promessas.filter(p => p.ranking?.nivel === 2).length,
    rank3: promessas.filter(p => p.ranking?.nivel === 3).length,
    naoConfiavel: promessas.filter(p => p.ranking?.nivel === 4).length,
  }), [promessas]);

  const promMes = useMemo(() => promessas.filter(p => { const d = new Date(`${p.dataPromessa}T00:00:00`); return d.getMonth() === mesAtual && d.getFullYear() === anoAtual; }), [promessas, mesAtual, anoAtual]);
  const diaMap = useMemo(() => { const m = {}; for (const p of promMes) { const d = new Date(`${p.dataPromessa}T00:00:00`).getDate(); if (!m[d]) m[d] = []; m[d].push(p); } return m; }, [promMes]);
  const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
  const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
  const celulas = Array(primeiroDia).fill(null).concat(Array.from({length: diasNoMes}, (_, i) => i + 1));
  while (celulas.length % 7 !== 0) celulas.push(null);
  const hojeStr = new Date().toISOString().slice(0,10);
  const listaFiltrada = useMemo(() => { const arr = filtro === "todas" ? promessas : promessas.filter(p => p.classif.tipo === filtro); return arr.sort((a, b) => String(a.dataPromessa).localeCompare(String(b.dataPromessa))); }, [promessas, filtro]);
  function navMes(delta) { let m = mesAtual + delta, a = anoAtual; if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; } setMesAtual(m); setAnoAtual(a); }

  const thS = { background: t.th, padding: "8px 10px", fontSize: 10, fontWeight: 700, textAlign: "left", borderBottom: `1px solid ${t.bor}`, color: t.muted, letterSpacing: .5 };
  const tdS = { padding: "7px 10px", borderBottom: `1px solid ${t.bor}44`, fontSize: 11 };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Descumpridas", value: stats.vencidas, cor: "#ef4444", tipo: "vencida", sub: fmtM(stats.valorVencido) },
          { label: "Vencem Hoje", value: stats.hoje, cor: "#f97316", tipo: "hoje" },
          { label: "Próximas (3d)", value: stats.proximas, cor: "#eab308", tipo: "proxima" },
          { label: "Cumpridas", value: stats.pagas, cor: "#10b981", tipo: "pago" },
          { label: "Ranking 1", value: stats.rank1, cor: "#10b981", tipo: "todas", sub: "Cliente confiável" },
          { label: "Não confiáveis", value: stats.naoConfiavel, cor: "#ef4444", tipo: "todas", sub: "Ação necessária" },
        ].map(s => <button key={s.label} onClick={() => setFiltro(s.tipo)} style={{ flex: "1 1 100px", background: filtro === s.tipo && !s.label.includes("Ranking") && !s.label.includes("Não") ? s.cor : t.card, border: `2px solid ${filtro === s.tipo && !s.label.includes("Ranking") && !s.label.includes("Não") ? s.cor : t.bor}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", transition: "all .15s" }}><div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: filtro === s.tipo && !s.label.includes("Ranking") && !s.label.includes("Não") ? "#fff" : t.muted, fontWeight: 700 }}>{s.label}</div><div style={{ fontSize: 22, fontWeight: 900, color: filtro === s.tipo && !s.label.includes("Ranking") && !s.label.includes("Não") ? "#fff" : s.cor, marginTop: 4 }}>{s.value}</div>{s.sub && <div style={{ fontSize: 9, color: t.muted, marginTop: 2 }}>{s.sub}</div>}</button>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16, boxShadow: t.shad }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}><button onClick={() => navMes(-1)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: t.txt, fontSize: 14 }}>‹</button><b style={{ fontSize: 13, color: t.txt }}>{MESES[mesAtual]} {anoAtual}</b><button onClick={() => navMes(1)} style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: t.txt, fontSize: 14 }}>›</button></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>{DIAS_SEMANA.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 800, color: t.muted, padding: "3px 0", textTransform: "uppercase" }}>{d}</div>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>{celulas.map((dia, i) => { if (!dia) return <div key={i} />; const proms = diaMap[dia] || []; const dataStr = `${anoAtual}-${String(mesAtual+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`; const ehHoje = dataStr === hojeStr; const temVenc = proms.some(p => p.classif.tipo === "vencida"); const temHoje = proms.some(p => p.classif.tipo === "hoje"); const temProx = proms.some(p => p.classif.tipo === "proxima"); const temFut = proms.some(p => p.classif.tipo === "futura"); const temPago = proms.some(p => p.classif.tipo === "pago"); const bordeCor = temVenc ? "#ef4444" : temHoje ? "#f97316" : temProx ? "#eab308" : temFut ? "#3b82f6" : temPago ? "#10b981" : "transparent"; return <div key={i} title={proms.map(p => `${p.nomeCli}: ${p.classif.label} · ${p.ranking?.label || "Sem ranking"}`).join("\n")} style={{ minHeight: 36, background: ehHoje ? `${t.p}22` : proms.length > 0 ? `${bordeCor}18` : t.surf2, border: `2px solid ${ehHoje ? t.p : bordeCor}`, borderRadius: 6, padding: "3px 4px", cursor: proms.length > 0 ? "pointer" : "default", position: "relative" }}><div style={{ fontSize: 11, fontWeight: ehHoje ? 900 : 600, color: ehHoje ? t.p : t.txt }}>{dia}</div>{proms.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 1, marginTop: 2 }}>{proms.slice(0, 3).map((p, idx) => <div key={idx} style={{ width: 6, height: 6, borderRadius: "50%", background: p.classif.cor }} title={p.nomeCli} />)}{proms.length > 3 && <div style={{ fontSize: 8, color: t.muted, fontWeight: 700 }}>+{proms.length - 3}</div>}</div>}</div>; })}</div>
        </div>

        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, boxShadow: t.shad, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 12, color: t.txt }}>Promessas & Ranking <span style={{ marginLeft: 8, background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700, color: t.muted }}>{listaFiltrada.length}</span></b><button onClick={() => setFiltro("todas")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 11 }}>Ver todas</button></div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 420 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr><th style={thS}>Cliente</th><th style={{ ...thS, textAlign: "center" }}>Promessa</th><th style={{ ...thS, textAlign: "right" }}>Valor</th><th style={{ ...thS, textAlign: "center" }}>Status</th><th style={{ ...thS, textAlign: "center" }}>Ranking de Confiabilidade</th></tr></thead><tbody>{listaFiltrada.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: t.muted }}>Nenhuma promessa nesta categoria.</td></tr>}{listaFiltrada.map(p => <tr key={p.clientKey} style={{ background: p.classif.tipo === "vencida" ? `${p.classif.cor}0d` : "transparent" }}><td style={tdS}><div style={{ fontWeight: 700, color: t.txt }}>{p.nomeCli}</div><div style={{ fontSize: 10, color: t.muted }}>{p.nrCli} · {p.qtdTitulos} título(s)</div></td><td style={{ ...tdS, textAlign: "center" }}><div style={{ fontWeight: 700, color: p.classif.cor }}>{fmtD(p.dataPromessa)}</div></td><td style={{ ...tdS, textAlign: "right", fontWeight: 800, color: t.p }}>{fmtM(p.valorTotalDebito)}</td><td style={{ ...tdS, textAlign: "center" }}><span style={{ background: p.classif.cor, color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{p.classif.label}</span></td><td style={{ ...tdS, textAlign: "center" }}><span style={{ background: p.ranking?.cor || "#64748b", color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{p.ranking?.label || "Sem ranking"}</span></td></tr>)}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
