import { useMemo, useState } from "react";
import { fmtM, hojeISO } from "@/lib/cobranca";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function PainelProdutividadeIndividual({ events = [], t }) {
  const [mesFiltro, setMesFiltro] = useState(hojeISO.slice(0, 7));

  const meses = useMemo(() => {
    const s = new Set();
    events.forEach(e => { if (e.event_date) s.add(String(e.event_date).slice(0, 7)); });
    return [...s].sort().reverse().slice(0, 6);
  }, [events]);

  const evts = useMemo(() => events.filter(e => e.event_type === "COBRANCA" && e.event_date && String(e.event_date).startsWith(mesFiltro)), [events, mesFiltro]);

  const dados = useMemo(() => {
    const map = new Map();
    evts.forEach(e => {
      const nome = (e.event_user || "Não informado").trim();
      if (!map.has(nome)) map.set(nome, { nome, contatos: 0, clientes: new Set(), dias: new Set(), promessas: 0, pagos: 0, valorRecuperado: 0 });
      const d = map.get(nome);
      d.contatos += 1;
      d.clientes.add(e.client_code || e.client_name || "");
      d.dias.add(e.event_date);
      if (["Prometeu Pagar", "Promessa ativa"].includes(e.status)) d.promessas += 1;
      if (["Pago Aguard. Baixa", "Pagamento confirmado", "Encerrado"].includes(e.status)) {
        d.pagos += 1;
        d.valorRecuperado += Number(e.total_value || 0);
      }
    });
    return [...map.values()].map(d => ({
      ...d,
      clientes: d.clientes.size,
      dias: d.dias.size,
      mediaDia: d.dias.size ? (d.contatos / d.dias.size).toFixed(1) : "0.0",
      conversao: d.contatos ? ((d.pagos / d.contatos) * 100).toFixed(1) : "0.0"
    })).sort((a, b) => b.contatos - a.contatos);
  }, [evts]);

  const kpis = useMemo(() => ({
    contatos: evts.length,
    responsaveis: dados.length,
    clientes: new Set(evts.map(e => e.client_code || e.client_name)).size,
    promessas: dados.reduce((s, d) => s + d.promessas, 0),
    recuperado: dados.reduce((s, d) => s + d.valorRecuperado, 0)
  }), [evts, dados]);

  const th = { background: t.th, padding: "8px 10px", fontSize: 10, textAlign: "left", color: t.muted, borderBottom: `1px solid ${t.bor}` };
  const td = { padding: "8px 10px", fontSize: 11, borderBottom: `1px solid ${t.bor}55` };

  return <div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <b style={{ fontSize: 11, color: t.muted }}>Período:</b>
      {meses.length === 0 && <span style={{ fontSize: 11, color: t.muted }}>Sem dados de eventos.</span>}
      {meses.map(m => { const [a, mm] = m.split("-"); return <button key={m} onClick={() => setMesFiltro(m)} style={{ background: mesFiltro === m ? t.p : t.surf2, color: mesFiltro === m ? "#fff" : t.muted, border: `1px solid ${mesFiltro === m ? t.p : t.bor}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{MESES[Number(mm) - 1]}/{a.slice(2)}</button>; })}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
      {[
        ["Total de contatos", kpis.contatos, t.p],
        ["Responsáveis ativos", kpis.responsaveis, "#3b82f6"],
        ["Clientes movimentados", kpis.clientes, "#10b981"],
        ["Promessas registradas", kpis.promessas, "#eab308"],
        ["Recuperado", fmtM(kpis.recuperado), "#7c3aed"]
      ].map(([label, value, cor]) => <div key={label} style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: 12 }}><div style={{ color: t.muted, fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>{label}</div><div style={{ color: t.txt, fontSize: 20, fontWeight: 900 }}>{value}</div></div>)}
    </div>

    <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${t.bor}` }}><b style={{ color: t.txt, fontSize: 12 }}>Produtividade individual por usuário responsável</b></div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>#</th><th style={th}>Usuário responsável</th><th style={{ ...th, textAlign: "center" }}>Contatos</th><th style={{ ...th, textAlign: "center" }}>Clientes</th><th style={{ ...th, textAlign: "center" }}>Dias ativos</th><th style={{ ...th, textAlign: "center" }}>Média/dia</th><th style={{ ...th, textAlign: "center" }}>Promessas</th><th style={{ ...th, textAlign: "center" }}>Pagos</th><th style={{ ...th, textAlign: "center" }}>Conversão</th><th style={{ ...th, textAlign: "right" }}>Recuperado</th><th style={{ ...th, textAlign: "center" }}>Ranking individual</th></tr></thead>
        <tbody>
          {dados.length === 0 && <tr><td colSpan={11} style={{ ...td, textAlign: "center", color: t.muted, padding: 26 }}>Nenhum registro no período.</td></tr>}
          {dados.map((d, i) => <tr key={d.nome} style={{ background: i % 2 ? t.alt : t.surf }}><td style={td}>{i + 1}</td><td style={td}><b style={{ color: t.txt }}>{d.nome}</b></td><td style={{ ...td, textAlign: "center", color: t.p, fontWeight: 800 }}>{d.contatos}</td><td style={{ ...td, textAlign: "center" }}>{d.clientes}</td><td style={{ ...td, textAlign: "center" }}>{d.dias}</td><td style={{ ...td, textAlign: "center" }}>{d.mediaDia}</td><td style={{ ...td, textAlign: "center", color: "#eab308", fontWeight: 800 }}>{d.promessas}</td><td style={{ ...td, textAlign: "center", color: "#10b981", fontWeight: 800 }}>{d.pagos}</td><td style={{ ...td, textAlign: "center" }}>{d.conversao}%</td><td style={{ ...td, textAlign: "right", color: "#7c3aed", fontWeight: 800 }}>{fmtM(d.valorRecuperado)}</td><td style={{ ...td, textAlign: "center" }}>{i === 0 ? "1º" : `${i + 1}º`}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
