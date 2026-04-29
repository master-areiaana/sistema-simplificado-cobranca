import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { fmtM, fmtD } from "@/lib/cobranca";

function addDias(dateStr, dias) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const hoje = new Date().toISOString().slice(0, 10);

export default function PrevisaoFluxo({ grouped, t }) {
  const { faixas, totalCarteira, totalProjetado, promessasValidas } = useMemo(() => {
    const limite30 = addDias(hoje, 30);
    const limite60 = addDias(hoje, 60);
    const limite90 = addDias(hoje, 90);

    const com = (g) => g.statusConsolidado !== "Encerrado" && g.statusConsolidado !== "Pago Aguard. Baixa";

    const promessasValidas = grouped.filter(g => g.dataPromessa && g.dataPromessa >= hoje && com(g));

    const p30 = promessasValidas.filter(g => g.dataPromessa <= limite30).reduce((s, g) => s + g.valorTotalDebito, 0);
    const p60 = promessasValidas.filter(g => g.dataPromessa > limite30 && g.dataPromessa <= limite60).reduce((s, g) => s + g.valorTotalDebito, 0);
    const p90 = promessasValidas.filter(g => g.dataPromessa > limite60 && g.dataPromessa <= limite90).reduce((s, g) => s + g.valorTotalDebito, 0);

    const totalCarteira = grouped.reduce((s, g) => s + g.valorTotalDebito, 0);
    const totalProjetado = p30 + p60 + p90;

    const faixas = [
      { label: "0-30 dias", valor: p30, qtd: promessasValidas.filter(g => g.dataPromessa <= limite30).length, cor: "#10b981" },
      { label: "31-60 dias", valor: p60, qtd: promessasValidas.filter(g => g.dataPromessa > limite30 && g.dataPromessa <= limite60).length, cor: "#3b82f6" },
      { label: "61-90 dias", valor: p90, qtd: promessasValidas.filter(g => g.dataPromessa > limite60 && g.dataPromessa <= limite90).length, cor: "#7c3aed" },
    ];

    return { faixas, totalCarteira, totalProjetado, promessasValidas };
  }, [grouped]);

  const perc = totalCarteira > 0 ? (totalProjetado / totalCarteira * 100) : 0;

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #10b981", borderRadius: 10, padding: "14px 18px", flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: t.muted, textTransform: "uppercase", marginBottom: 6 }}>Projeção Total (90d)</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981" }}>{fmtM(totalProjetado)}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>{perc.toFixed(1)}% da carteira total</div>
        </div>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #ef4444", borderRadius: 10, padding: "14px 18px", flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: t.muted, textTransform: "uppercase", marginBottom: 6 }}>Carteira Total</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#ef4444" }}>{fmtM(totalCarteira)}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>com multa e juros</div>
        </div>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #f59e0b", borderRadius: 10, padding: "14px 18px", flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: t.muted, textTransform: "uppercase", marginBottom: 6 }}>Promessas Ativas</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b" }}>{promessasValidas.length}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>clientes com promessa</div>
        </div>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #6366f1", borderRadius: 10, padding: "14px 18px", flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: t.muted, textTransform: "uppercase", marginBottom: 6 }}>Gap não projetado</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#6366f1" }}>{fmtM(totalCarteira - totalProjetado)}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>sem promessa nos 90 dias</div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: t.txt }}>Taxa de cobertura por promessas</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#10b981" }}>{perc.toFixed(1)}%</span>
        </div>
        <div style={{ background: t.bor, borderRadius: 8, height: 14, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(90deg, #10b981, #3b82f6)`, width: `${Math.min(perc, 100)}%`, height: "100%", borderRadius: 8, transition: "width .5s" }} />
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.txt, marginBottom: 12 }}>Projeção de Recuperação por Período</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={faixas} margin={{ top: 4, right: 10, bottom: 4, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={`${t.bor}`} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: t.muted }} />
            <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: t.muted }} />
            <Tooltip formatter={(v) => fmtM(v)} labelStyle={{ color: "#111" }} contentStyle={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
              {faixas.map((f, i) => <Cell key={i} fill={f.cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela detalhada */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: t.th, padding: "10px 14px", fontSize: 11, fontWeight: 700, color: t.muted, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${t.bor}` }}>
          Detalhamento por Período
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Período", "Qtd. Clientes", "Valor Projetado", "% da Carteira", "Status"].map(h => (
                <th key={h} style={{ background: t.th, padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: t.muted, borderBottom: `1px solid ${t.bor}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? t.surf : t.alt }}>
                <td style={{ padding: "9px 14px", fontWeight: 700 }}>
                  <span style={{ background: `${f.cor}22`, color: f.cor, border: `1px solid ${f.cor}55`, borderRadius: 6, padding: "2px 8px" }}>{f.label}</span>
                </td>
                <td style={{ padding: "9px 14px", textAlign: "center" }}><b>{f.qtd}</b></td>
                <td style={{ padding: "9px 14px", fontWeight: 800, color: f.cor }}>{fmtM(f.valor)}</td>
                <td style={{ padding: "9px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ background: t.bor, borderRadius: 4, height: 8, flex: 1 }}>
                      <div style={{ background: f.cor, width: `${totalCarteira > 0 ? Math.min(f.valor / totalCarteira * 100, 100) : 0}%`, height: "100%", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 10, color: t.muted, minWidth: 36 }}>{totalCarteira > 0 ? (f.valor / totalCarteira * 100).toFixed(1) : 0}%</span>
                  </div>
                </td>
                <td style={{ padding: "9px 14px" }}>
                  <span style={{ fontSize: 10, color: f.valor > 0 ? "#10b981" : t.muted, fontWeight: 700 }}>{f.valor > 0 ? "✅ Com cobertura" : "⚠️ Sem promessas"}</span>
                </td>
              </tr>
            ))}
            <tr style={{ background: t.surf2, borderTop: `2px solid ${t.bor}` }}>
              <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>Total 90 dias</td>
              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800 }}>{promessasValidas.length}</td>
              <td style={{ padding: "10px 14px", fontWeight: 900, color: "#10b981", fontSize: 14 }}>{fmtM(totalProjetado)}</td>
              <td style={{ padding: "10px 14px", fontWeight: 800 }}>{perc.toFixed(1)}%</td>
              <td style={{ padding: "10px 14px" }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}