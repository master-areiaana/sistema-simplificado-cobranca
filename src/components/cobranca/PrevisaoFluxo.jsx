import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { fmtM } from "@/lib/cobranca";
import { rankingConfiancaCliente } from "@/lib/rankingConfianca";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

function addDias(dateStr, dias) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function parseValorBaixa(e) {
  const direto = Number(e?.total_value || e?.totalValue || e?.valor || e?.amount || 0);
  if (Number.isFinite(direto) && direto > 0) return direto;

  const note = String(e?.note || "");
  const match = note.match(/Valor(?:\s+original)?\s*:\s*R\$\s*([\d.,]+)/i);
  if (!match) return 0;

  const v = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

const hoje = new Date().toISOString().slice(0, 10);
const mesAtual = hoje.slice(0, 7);

export default function PrevisaoFluxo({ grouped, events = [], t }) {
  const { data: baixaEvents = [] } = useQuery({
    queryKey: ["baixa_events"],
    queryFn: () => base44.entities.ChargeEvent.filter({ event_type: "BAIXA" }, "-event_date", 1000),
  });

  const dadosRanking = useMemo(() => grouped.map(g => ({ ...g, ranking: rankingConfiancaCliente(g, events) })), [grouped, events]);

  const { faixas, totalCarteira, totalProjetado, promessasValidas, recuperadoImportacao, recuperadoMes, rankingResumo } = useMemo(() => {
    const limite30 = addDias(hoje, 30);
    const limite60 = addDias(hoje, 60);
    const limite90 = addDias(hoje, 90);
    const com = (g) => !["Encerrado", "Pago Aguard. Baixa", "Baixado", "Pagamento confirmado"].includes(g.statusConsolidado);
    const promessasValidas = dadosRanking.filter(g => g.dataPromessa && g.dataPromessa >= hoje && com(g));

    const p30 = promessasValidas.filter(g => g.dataPromessa <= limite30).reduce((s, g) => s + g.valorTotalDebito, 0);
    const p60 = promessasValidas.filter(g => g.dataPromessa > limite30 && g.dataPromessa <= limite60).reduce((s, g) => s + g.valorTotalDebito, 0);
    const p90 = promessasValidas.filter(g => g.dataPromessa > limite60 && g.dataPromessa <= limite90).reduce((s, g) => s + g.valorTotalDebito, 0);
    const totalCarteira = dadosRanking.reduce((s, g) => s + g.valorTotalDebito, 0);
    const totalProjetado = p30 + p60 + p90;

    const faixas = [
      { label: "0-30 dias", valor: p30, qtd: promessasValidas.filter(g => g.dataPromessa <= limite30).length, cor: "#10b981" },
      { label: "31-60 dias", valor: p60, qtd: promessasValidas.filter(g => g.dataPromessa > limite30 && g.dataPromessa <= limite60).length, cor: "#3b82f6" },
      { label: "61-90 dias", valor: p90, qtd: promessasValidas.filter(g => g.dataPromessa > limite60 && g.dataPromessa <= limite90).length, cor: "#7c3aed" },
    ];

    const baixaDoMes = baixaEvents.filter(e => e.event_date && e.event_date.startsWith(mesAtual));
    const recuperadoImportacao = baixaDoMes.reduce((s, e) => s + parseValorBaixa(e), 0);

    const gruposRanking = [
      { nivel: 1, key: "rank1", label: "Ranking 1", desc: "Cliente confiável", cor: "#10b981" },
      { nivel: 2, key: "rank2", label: "Ranking 2", desc: "Segunda chance", cor: "#f59e0b" },
      { nivel: 3, key: "rank3", label: "Ranking 3", desc: "Baixa confiabilidade", cor: "#f97316" },
      { nivel: 4, key: "nao", label: "Não confiável", desc: "Ação necessária", cor: "#ef4444" },
    ];
    const rankingResumo = gruposRanking.map(r => {
      const arr = dadosRanking.filter(g => g.ranking?.nivel === r.nivel);
      const prometido = arr.filter(g => g.dataPromessa).reduce((s, g) => s + g.valorTotalDebito, 0);
      const vencidas = arr.filter(g => g.dataPromessa && g.dataPromessa < hoje && !["Encerrado", "Pago Aguard. Baixa", "Pagamento confirmado"].includes(g.statusConsolidado));
      return {
        ...r,
        qtd: arr.length,
        prometido,
        pago: arr.filter(g => ["Encerrado", "Pago Aguard. Baixa", "Pagamento confirmado"].includes(g.statusConsolidado)).reduce((s, g) => s + g.valorTotalDebito, 0),
        risco: vencidas.reduce((s, g) => s + g.valorTotalDebito, 0),
        vencidas: vencidas.length,
      };
    });

    return { faixas, totalCarteira, totalProjetado, promessasValidas, recuperadoImportacao, recuperadoMes: recuperadoImportacao, rankingResumo };
  }, [dadosRanking, baixaEvents]);

  const perc = totalCarteira > 0 ? (totalProjetado / totalCarteira * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { label: "Projeção Total (90d)", value: fmtM(totalProjetado), sub: `${perc.toFixed(1)}% da carteira total`, color: "#10b981" },
          { label: "Carteira Total", value: fmtM(totalCarteira), sub: "com multa e juros", color: "#ef4444" },
          { label: "Recuperado no Mês", value: fmtM(recuperadoMes), sub: "baixas via importação", color: "#22c55e" },
          { label: "Promessas Ativas", value: promessasValidas.length, sub: "clientes com promessa", color: "#f59e0b" },
          { label: "Valor em Risco", value: fmtM(rankingResumo.find(r => r.nivel === 4)?.risco || 0), sub: "clientes não confiáveis", color: "#ef4444" },
        ].map(k => <div key={k.label} style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${k.color}`, borderRadius: 10, padding: "12px 16px", flex: "1 1 130px", minWidth: 120, maxWidth: 190, boxShadow: t.shad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 3 }}><div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", letterSpacing: .7, fontWeight: 700 }}>{k.label}</div><div style={{ fontSize: 17, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div><div style={{ fontSize: 9, color: t.muted }}>{k.sub}</div></div>)}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {rankingResumo.map(r => <div key={r.key} style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${r.cor}`, borderRadius: 10, padding: "10px 12px", flex: "1 1 150px" }}><div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", fontWeight: 800 }}>{r.label}</div><div style={{ fontSize: 18, fontWeight: 900, color: r.cor }}>{r.qtd}</div><div style={{ fontSize: 10, color: t.txt, fontWeight: 700 }}>{r.desc}</div><div style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>Prometido: {fmtM(r.prometido)}</div><div style={{ fontSize: 10, color: t.muted }}>Pago: {fmtM(r.pago)}</div><div style={{ fontSize: 10, color: r.risco > 0 ? "#ef4444" : t.muted }}>Risco: {fmtM(r.risco)} · vencidas: {r.vencidas}</div></div>)}
      </div>

      {recuperadoImportacao > 0 && <div style={{ background: "#052e1688", border: "1px solid #16a34a55", borderLeft: "4px solid #22c55e", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 20 }}>💰</span><div><div style={{ fontSize: 12, fontWeight: 800, color: "#22c55e" }}>Valor recuperado este mês via baixa automática: {fmtM(recuperadoImportacao)}</div><div style={{ fontSize: 11, color: t.muted }}>Títulos que saíram da carteira em aberto nas últimas importações e foram presumidos como recebidos.</div></div></div>}

      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 700, color: t.txt }}>Taxa de cobertura por promessas</span><span style={{ fontSize: 12, fontWeight: 800, color: "#10b981" }}>{perc.toFixed(1)}%</span></div><div style={{ background: t.bor, borderRadius: 8, height: 14, overflow: "hidden" }}><div style={{ background: `linear-gradient(90deg, #10b981, #3b82f6)`, width: `${Math.min(perc, 100)}%`, height: "100%", borderRadius: 8, transition: "width .5s" }} /></div></div>

      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 700, color: t.txt, marginBottom: 12 }}>Projeção de Recuperação por Período</div><ResponsiveContainer width="100%" height={200}><BarChart data={faixas} margin={{ top: 4, right: 10, bottom: 4, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke={`${t.bor}`} /><XAxis dataKey="label" tick={{ fontSize: 11, fill: t.muted }} /><YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: t.muted }} /><Tooltip formatter={(v) => fmtM(v)} labelStyle={{ color: "#111" }} contentStyle={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, fontSize: 12 }} /><Bar dataKey="valor" radius={[6, 6, 0, 0]}>{faixas.map((f, i) => <Cell key={i} fill={f.cor} />)}</Bar></BarChart></ResponsiveContainer></div>

      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, overflow: "hidden" }}><div style={{ background: t.th, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: t.muted, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${t.bor}` }}>Detalhamento por Período</div><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["Período", "Qtd. Clientes", "Valor Projetado", "% da Carteira", "Status"].map(h => <th key={h} style={{ background: t.th, padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: t.muted, borderBottom: `1px solid ${t.bor}` }}>{h}</th>)}</tr></thead><tbody>{faixas.map((f, i) => <tr key={i} style={{ background: i % 2 === 0 ? t.surf : t.alt }}><td style={{ padding: "9px 14px", fontWeight: 700 }}><span style={{ background: `${f.cor}22`, color: f.cor, border: `1px solid ${f.cor}55`, borderRadius: 6, padding: "2px 8px" }}>{f.label}</span></td><td style={{ padding: "9px 14px", textAlign: "center" }}><b>{f.qtd}</b></td><td style={{ padding: "9px 14px", fontWeight: 800, color: f.cor }}>{fmtM(f.valor)}</td><td style={{ padding: "9px 14px" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ background: t.bor, borderRadius: 4, height: 8, flex: 1 }}><div style={{ background: f.cor, width: `${totalCarteira > 0 ? Math.min(f.valor / totalCarteira * 100, 100) : 0}%`, height: "100%", borderRadius: 4 }} /></div><span style={{ fontSize: 10, color: t.muted, minWidth: 36 }}>{totalCarteira > 0 ? (f.valor / totalCarteira * 100).toFixed(1) : 0}%</span></div></td><td style={{ padding: "9px 14px" }}><span style={{ fontSize: 10, color: f.valor > 0 ? "#10b981" : t.muted, fontWeight: 700 }}>{f.valor > 0 ? "✅ Com cobertura" : "⚠️ Sem promessas"}</span></td></tr>)}<tr style={{ background: t.surf2, borderTop: `2px solid ${t.bor}` }}><td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>Total 90 dias</td><td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800 }}>{promessasValidas.length}</td><td style={{ padding: "10px 14px", fontWeight: 900, color: "#10b981", fontSize: 14 }}>{fmtM(totalProjetado)}</td><td style={{ padding: "10px 14px", fontWeight: 800 }}>{perc.toFixed(1)}%</td><td style={{ padding: "10px 14px" }} /></tr></tbody></table></div>
    </div>
  );
}
