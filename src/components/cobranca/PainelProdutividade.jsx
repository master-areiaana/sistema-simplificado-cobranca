import { useMemo, useState } from "react";
import { fmtM, fmtD, hojeISO } from "@/lib/cobranca";

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function calcMesAno(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7);
}

export default function PainelProdutividade({ events, t }) {
  const [mesFiltro, setMesFiltro] = useState(hojeISO.slice(0, 7));

  // Todos os meses disponíveis nos eventos
  const mesesDisp = useMemo(() => {
    const s = new Set();
    events.forEach(e => { if (e.event_date) s.add(e.event_date.slice(0, 7)); });
    return [...s].sort().reverse().slice(0, 6);
  }, [events]);

  // Filtrar eventos do mês
  const evtsMes = useMemo(() =>
    events.filter(e => e.event_date && e.event_date.startsWith(mesFiltro) && e.event_type === "COBRANCA"),
    [events, mesFiltro]
  );

  // Métricas por cobrador (event_user)
  const porCobrador = useMemo(() => {
    const map = new Map();
    for (const e of evtsMes) {
      const user = (e.event_user || "Não informado").trim();
      if (!map.has(user)) map.set(user, {
        nome: user, contatos: 0, promessas: 0, pagos: 0,
        valorPromessas: 0, valorRecuperado: 0,
        clientes: new Set(), diasAtivos: new Set(),
      });
      const d = map.get(user);
      d.contatos++;
      d.clientes.add(e.client_code || e.client_name || "");
      if (e.event_date) d.diasAtivos.add(e.event_date);
      if (e.status === "Prometeu Pagar") { d.promessas++; }
      if (e.status === "Pago Aguard. Baixa" || e.status === "Encerrado") { d.pagos++; d.valorRecuperado += Number(e.total_value || 0); }
    }

    return [...map.values()].map(d => ({
      ...d,
      clientes: d.clientes.size,
      diasAtivos: d.diasAtivos.size,
      taxaConversao: d.contatos > 0 ? ((d.promessas / d.contatos) * 100).toFixed(1) : "0.0",
      mediaDia: d.diasAtivos.size > 0 ? (d.contatos / d.diasAtivos.size).toFixed(1) : "0.0",
    })).sort((a, b) => b.contatos - a.contatos);
  }, [evtsMes]);

  // KPIs do mês
  const kpis = useMemo(() => ({
    totalContatos: evtsMes.length,
    totalCobradores: porCobrador.length,
    totalPromessas: porCobrador.reduce((s, c) => s + c.promessas, 0),
    totalRecuperado: porCobrador.reduce((s, c) => s + c.valorRecuperado, 0),
    totalClientes: new Set(evtsMes.map(e => e.client_code || e.client_name)).size,
  }), [evtsMes, porCobrador]);

  // Evolução diária de contatos no mês
  const evolucaoDiaria = useMemo(() => {
    const map = {};
    evtsMes.forEach(e => {
      if (!e.event_date) return;
      const dia = e.event_date.slice(8, 10);
      map[dia] = (map[dia] || 0) + 1;
    });
    const dias = Object.keys(map).sort();
    return dias.map(d => ({ dia: d, qtd: map[d] }));
  }, [evtsMes]);

  const maxDia = Math.max(...evolucaoDiaria.map(x => x.qtd), 1);

  const thS = { background: t.th, padding: "7px 10px", fontSize: 10, fontWeight: 700, textAlign: "left", borderBottom: `1px solid ${t.bor}`, color: t.muted, whiteSpace: "nowrap", letterSpacing: .5 };
  const tdS = { padding: "7px 10px", borderBottom: `1px solid ${t.bor}44`, fontSize: 11, verticalAlign: "middle" };

  function barColor(i) {
    const cores = ["#E87722","#3b82f6","#10b981","#7c3aed","#f59e0b","#ef4444","#64748b","#ec4899"];
    return cores[i % cores.length];
  }

  return (
    <div>
      {/* Filtro de mês */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Período:</span>
        {mesesDisp.length === 0 && (
          <span style={{ fontSize: 11, color: t.muted }}>Sem dados de eventos ainda.</span>
        )}
        {mesesDisp.map(m => {
          const [a, ms] = m.split("-");
          return (
            <button key={m} onClick={() => setMesFiltro(m)} style={{ background: mesFiltro === m ? t.p : t.surf2, color: mesFiltro === m ? "#fff" : t.muted, border: `1px solid ${mesFiltro === m ? t.p : t.bor}`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {MESES_LABEL[Number(ms) - 1]}/{a.slice(2)}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Total Contatos", value: kpis.totalContatos, cor: t.p },
          { label: "Cobradores Ativos", value: kpis.totalCobradores, cor: "#3b82f6" },
          { label: "Promessas Obtidas", value: kpis.totalPromessas, cor: "#eab308" },
          { label: "Clientes Contactados", value: kpis.totalClientes, cor: "#10b981" },
          { label: "Recuperado no Período", value: fmtM(kpis.totalRecuperado), cor: "#7c3aed" },
        ].map(k => (
          <div key={k.label} style={{ flex: "1 1 130px", background: t.card, border: `1px solid ${t.bor}`, borderLeft: `3px solid ${k.cor}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: t.muted, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.txt, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Gráfico de barras por cobrador */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.txt, marginBottom: 12 }}>📊 Contatos por Cobrador</div>
          {porCobrador.length === 0 && <div style={{ color: t.muted, fontSize: 11, textAlign: "center", padding: 20 }}>Sem dados no período.</div>}
          {porCobrador.map((c, i) => {
            const pct = Math.round((c.contatos / Math.max(...porCobrador.map(x => x.contatos), 1)) * 100);
            return (
              <div key={c.nome} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.txt }}>{c.nome}</span>
                  <span style={{ fontSize: 11, color: t.muted }}>{c.contatos} contatos · {c.clientes} clientes</span>
                </div>
                <div style={{ background: t.surf2, borderRadius: 4, height: 16, position: "relative", overflow: "hidden" }}>
                  <div style={{ background: barColor(i), height: "100%", width: `${pct}%`, borderRadius: 4, transition: "width .4s", display: "flex", alignItems: "center", paddingLeft: 6 }}>
                    {pct > 15 && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{pct}%</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Evolução diária */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.txt, marginBottom: 12 }}>📈 Contatos por Dia</div>
          {evolucaoDiaria.length === 0 && <div style={{ color: t.muted, fontSize: 11, textAlign: "center", padding: 20 }}>Sem dados no período.</div>}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, overflowX: "auto" }}>
            {evolucaoDiaria.map(({ dia, qtd }) => (
              <div key={dia} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", minWidth: 22 }}>
                <div style={{ fontSize: 8, color: t.muted, marginBottom: 2 }}>{qtd}</div>
                <div style={{ background: t.p, width: 16, borderRadius: "3px 3px 0 0", height: `${Math.round((qtd / maxDia) * 90)}px`, minHeight: 3 }} title={`Dia ${dia}: ${qtd} contatos`} />
                <div style={{ fontSize: 8, color: t.muted, marginTop: 2 }}>{dia}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bor}` }}>
          <b style={{ fontSize: 12, color: t.txt }}>Desempenho Individual — {mesFiltro}</b>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={thS}>#</th>
                <th style={thS}>COBRADOR</th>
                <th style={{ ...thS, textAlign: "center" }}>CONTATOS</th>
                <th style={{ ...thS, textAlign: "center" }}>CLIENTES</th>
                <th style={{ ...thS, textAlign: "center" }}>DIAS ATIVOS</th>
                <th style={{ ...thS, textAlign: "center" }}>MÉDIA/DIA</th>
                <th style={{ ...thS, textAlign: "center" }}>PROMESSAS</th>
                <th style={{ ...thS, textAlign: "center" }}>PAGOS</th>
                <th style={{ ...thS, textAlign: "center" }}>CONV. %</th>
                <th style={{ ...thS, textAlign: "right" }}>RECUPERADO</th>
                <th style={{ ...thS, textAlign: "center" }}>RANKING</th>
              </tr>
            </thead>
            <tbody>
              {porCobrador.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 32, color: t.muted }}>Nenhum dado de cobrança no período selecionado.</td></tr>
              )}
              {porCobrador.map((c, i) => {
                const cor = barColor(i);
                const rankIcon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
                return (
                  <tr key={c.nome} style={{ background: i % 2 === 0 ? t.surf : t.alt }}>
                    <td style={{ ...tdS, color: t.muted }}>{i + 1}</td>
                    <td style={tdS}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }} />
                        <b style={{ color: t.txt }}>{c.nome}</b>
                      </div>
                    </td>
                    <td style={{ ...tdS, textAlign: "center", fontWeight: 800, color: t.p }}>{c.contatos}</td>
                    <td style={{ ...tdS, textAlign: "center" }}>{c.clientes}</td>
                    <td style={{ ...tdS, textAlign: "center", color: t.muted }}>{c.diasAtivos}</td>
                    <td style={{ ...tdS, textAlign: "center" }}>{c.mediaDia}</td>
                    <td style={{ ...tdS, textAlign: "center", color: "#eab308", fontWeight: 700 }}>{c.promessas}</td>
                    <td style={{ ...tdS, textAlign: "center", color: "#10b981", fontWeight: 700 }}>{c.pagos}</td>
                    <td style={{ ...tdS, textAlign: "center" }}>
                      <span style={{ background: Number(c.taxaConversao) >= 20 ? "#10b98133" : "#ef444422", color: Number(c.taxaConversao) >= 20 ? "#10b981" : "#ef4444", borderRadius: 12, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>
                        {c.taxaConversao}%
                      </span>
                    </td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 800, color: "#7c3aed" }}>{fmtM(c.valorRecuperado)}</td>
                    <td style={{ ...tdS, textAlign: "center", fontSize: 14 }}>{rankIcon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}