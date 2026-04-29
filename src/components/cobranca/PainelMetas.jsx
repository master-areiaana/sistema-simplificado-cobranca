import { useMemo, useState } from "react";
import { fmtM, hojeISO } from "@/lib/cobranca";

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Meta padrão configurável
const META_PADRAO = 50000;

export default function PainelMetas({ grouped, events, t }) {
  const [metaMensal, setMetaMensal] = useState(META_PADRAO);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaInput, setMetaInput] = useState(String(META_PADRAO));

  const mesAtual = hojeISO.slice(0, 7);

  // Contatos e recuperações do mês atual
  const evtsMes = useMemo(() =>
    events.filter(e => e.event_date?.startsWith(mesAtual) && e.event_type === "COBRANCA"),
    [events, mesAtual]
  );

  // Valor recuperado (status pagos) no mês — por enquanto usamos contatos como proxy
  const valorRecuperadoMes = useMemo(() =>
    evtsMes.filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado")
      .reduce((s, e) => s + (Number(e.total_value) || 0), 0),
    [evtsMes]
  );

  // Contatos realizados no mês
  const contatosMes = evtsMes.length;
  const clientesContatados = new Set(evtsMes.map(e => e.client_code || e.client_name)).size;
  const promessasMes = evtsMes.filter(e => e.status === "Prometeu Pagar").length;

  // Progresso de clientes cobrados vs total
  const totalClientes = grouped.length;
  const cobradosMes = grouped.filter(g => g.ultimoContato?.startsWith(mesAtual)).length;
  const percCobrados = totalClientes > 0 ? (cobradosMes / totalClientes) * 100 : 0;

  // Valor encarteirado vs cobrado
  const valorTotal = grouped.reduce((s, g) => s + g.valorTotalDebito, 0);
  const valorCobrado = grouped.filter(g => g.foiCobrado).reduce((s, g) => s + g.valorTotalDebito, 0);
  const percValor = valorTotal > 0 ? (valorCobrado / valorTotal) * 100 : 0;

  // Progresso da meta de recuperação
  const percMeta = metaMensal > 0 ? Math.min((valorRecuperadoMes / metaMensal) * 100, 100) : 0;

  // Por cobrador no mês
  const porCobrador = useMemo(() => {
    const map = new Map();
    for (const e of evtsMes) {
      const user = (e.event_user || "Não informado").trim();
      if (user === "Importação" || user === "Importação CSV") continue;
      if (!map.has(user)) map.set(user, { nome: user, contatos: 0, promessas: 0, pagos: 0 });
      const d = map.get(user);
      d.contatos++;
      if (e.status === "Prometeu Pagar") d.promessas++;
      if (e.status === "Pago Aguard. Baixa" || e.status === "Encerrado") d.pagos++;
    }
    return [...map.values()].sort((a, b) => b.contatos - a.contatos);
  }, [evtsMes]);

  // Últimos 6 meses para tendência
  const historico = useMemo(() => {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      meses.push(d.toISOString().slice(0, 7));
    }
    return meses.map(m => {
      const evts = events.filter(e => e.event_date?.startsWith(m) && e.event_type === "COBRANCA");
      const [a, ms] = m.split("-");
      return {
        mes: m,
        label: `${MESES_LABEL[Number(ms)-1]}/${a.slice(2)}`,
        contatos: evts.length,
        promessas: evts.filter(e => e.status === "Prometeu Pagar").length,
        isAtual: m === mesAtual,
      };
    });
  }, [events, mesAtual]);

  const maxHist = Math.max(...historico.map(h => h.contatos), 1);

  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", width: 150 };

  const metaLabel = mesAtual.split("-");
  const mesLabel = `${MESES_LABEL[Number(metaLabel[1])-1]}/${metaLabel[0].slice(2)}`;

  function salvarMeta() {
    const v = parseFloat(String(metaInput).replace(/\./g, "").replace(",", "."));
    if (!isNaN(v) && v > 0) setMetaMensal(v);
    setEditandoMeta(false);
  }

  const cores = ["#E87722","#3b82f6","#10b981","#7c3aed","#f59e0b","#ef4444"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Meta de Recuperação ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>🎯 Meta de Recuperação — {mesLabel}</div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>Acompanhe o progresso em relação à meta mensal definida</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {editandoMeta ? (
              <>
                <input value={metaInput} onChange={e => setMetaInput(e.target.value)} style={{ ...inp, width: 140 }} placeholder="Ex: 50000" />
                <button onClick={salvarMeta} style={{ background: t.p, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Salvar</button>
                <button onClick={() => setEditandoMeta(false)} style={{ background: "transparent", color: t.muted, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>✕</button>
              </>
            ) : (
              <button onClick={() => { setMetaInput(String(metaMensal)); setEditandoMeta(true); }} style={{ background: t.surf2, color: t.txt, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>⚙️ Editar Meta</button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Meta do Mês", value: fmtM(metaMensal), cor: "#64748b" },
            { label: "Recuperado", value: fmtM(valorRecuperadoMes), cor: "#10b981" },
            { label: "Falta Recuperar", value: fmtM(Math.max(metaMensal - valorRecuperadoMes, 0)), cor: "#ef4444" },
          ].map(k => (
            <div key={k.label} style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${k.cor}` }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: t.muted, fontWeight: 700 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.txt, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Barra de progresso da meta */}
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.txt }}>Progresso da Meta</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: percMeta >= 100 ? "#10b981" : t.p }}>{percMeta.toFixed(1)}%</span>
        </div>
        <div style={{ background: t.surf2, borderRadius: 8, height: 22, overflow: "hidden", position: "relative" }}>
          <div style={{ background: percMeta >= 100 ? "#10b981" : percMeta >= 60 ? "#f59e0b" : "#ef4444", height: "100%", width: `${percMeta}%`, borderRadius: 8, transition: "width .5s", display: "flex", alignItems: "center", paddingLeft: 10 }}>
            {percMeta > 15 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 800 }}>{fmtM(valorRecuperadoMes)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 9, color: t.muted }}>R$ 0</span>
          <span style={{ fontSize: 9, color: t.muted }}>{fmtM(metaMensal)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* ── Progresso de Cobertura ── */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📞 Cobertura de Cobrança — {mesLabel}</div>
          {[
            { label: "Clientes cobrados no mês", atual: cobradosMes, total: totalClientes, pct: percCobrados, cor: t.p },
            { label: "Clientes com promessa", atual: promessasMes, total: contatosMes, pct: contatosMes > 0 ? (promessasMes/contatosMes)*100 : 0, cor: "#eab308" },
            { label: "Valor carteira cobrada", atual: valorCobrado, total: valorTotal, pct: percValor, cor: "#10b981", isMoney: true },
          ].map(item => (
            <div key={item.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: t.muted }}>{item.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: item.cor }}>{item.pct.toFixed(1)}%</span>
              </div>
              <div style={{ background: t.surf2, borderRadius: 6, height: 14, overflow: "hidden" }}>
                <div style={{ background: item.cor, height: "100%", width: `${item.pct}%`, borderRadius: 6, transition: "width .4s" }} />
              </div>
              <div style={{ fontSize: 9, color: t.muted, marginTop: 3 }}>
                {item.isMoney ? `${fmtM(item.atual)} de ${fmtM(item.total)}` : `${item.atual} de ${item.total}`}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tendência Histórica ── */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📈 Contatos — Últimos 6 Meses</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {historico.map(h => {
              const height = Math.max(Math.round((h.contatos / maxHist) * 90), h.contatos > 0 ? 4 : 0);
              return (
                <div key={h.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>{h.contatos || ""}</div>
                  <div style={{ background: h.isAtual ? t.p : `${t.p}66`, width: "100%", borderRadius: "4px 4px 0 0", height: `${height}px`, minHeight: h.contatos > 0 ? 3 : 0 }} title={`${h.label}: ${h.contatos} contatos`} />
                  <div style={{ fontSize: 9, color: h.isAtual ? t.p : t.muted, fontWeight: h.isAtual ? 800 : 400, marginTop: 4 }}>{h.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {[
              { label: "Contatos/mês", value: contatosMes, cor: t.p },
              { label: "Promessas", value: promessasMes, cor: "#eab308" },
              { label: "Clientes únicos", value: clientesContatados, cor: "#10b981" },
            ].map(k => (
              <div key={k.label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: k.cor }}>{k.value}</div>
                <div style={{ fontSize: 9, color: t.muted }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desempenho por Cobrador ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>👥 Desempenho por Cobrador — {mesLabel}</div>
        {porCobrador.length === 0 && (
          <div style={{ color: t.muted, fontSize: 12, textAlign: "center", padding: 24 }}>Sem dados de cobrança no mês.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {porCobrador.map((c, i) => {
            const metaInd = metaMensal / Math.max(porCobrador.length, 1);
            const cor = cores[i % cores.length];
            const pct = Math.round((c.contatos / Math.max(...porCobrador.map(x => x.contatos), 1)) * 100);
            const rankIcon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}º`;
            return (
              <div key={c.nome} style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{rankIcon}</span>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.txt }}>{c.nome}</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
                    <span style={{ color: t.muted }}><b style={{ color: t.txt }}>{c.contatos}</b> contatos</span>
                    <span style={{ color: "#eab308" }}><b>{c.promessas}</b> promessas</span>
                    <span style={{ color: "#10b981" }}><b>{c.pagos}</b> pagos</span>
                  </div>
                </div>
                <div style={{ background: t.surf, borderRadius: 4, height: 10, overflow: "hidden" }}>
                  <div style={{ background: cor, height: "100%", width: `${pct}%`, borderRadius: 4, transition: "width .4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}