import React, { useMemo } from "react";
import { fmtM } from "@/lib/cobranca";
import { rankingConfiancaCliente } from "@/lib/rankingConfianca";

const hoje = new Date().toISOString().slice(0, 10);
const mesAtual = hoje.slice(0, 7);

export default function PrevisaoFluxo({ grouped, events = [], t }) {
  const dadosRanking = useMemo(() => grouped.map(g => ({ ...g, ranking: rankingConfiancaCliente(g, events) })), [grouped, events]);

  const resumo = useMemo(() => {
    const totalCarteira = dadosRanking.reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0);
    const promessasValidas = dadosRanking.filter(g => g.dataPromessa && g.dataPromessa >= hoje && !["Encerrado", "Pago Aguard. Baixa", "Baixado", "Pagamento confirmado"].includes(g.statusConsolidado));
    const recuperadoMes = events
      .filter(e => e.event_date?.startsWith(mesAtual) && ["Pago Aguard. Baixa", "Encerrado", "Pagamento confirmado"].includes(e.status))
      .reduce((s, e) => s + Number(e.total_value || 0), 0);
    const risco = dadosRanking
      .filter(g => g.ranking?.nivel === 4 && g.dataPromessa && g.dataPromessa < hoje && !["Encerrado", "Pago Aguard. Baixa", "Pagamento confirmado"].includes(g.statusConsolidado))
      .reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0);

    const rankingResumo = [
      { nivel: 1, key: "rank1", label: "Ranking 1", desc: "Cliente confiável", cor: "#10b981" },
      { nivel: 2, key: "rank2", label: "Ranking 2", desc: "Segunda chance", cor: "#f59e0b" },
      { nivel: 3, key: "rank3", label: "Ranking 3", desc: "Baixa confiabilidade", cor: "#f97316" },
      { nivel: 4, key: "nao", label: "Não confiável", desc: "Ação necessária", cor: "#ef4444" },
    ].map(r => {
      const arr = dadosRanking.filter(g => g.ranking?.nivel === r.nivel);
      return {
        ...r,
        qtd: arr.length,
        prometido: arr.filter(g => g.dataPromessa).reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0),
        risco: arr.filter(g => g.dataPromessa && g.dataPromessa < hoje).reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0),
      };
    });

    return { totalCarteira, promessasValidas, recuperadoMes, risco, rankingResumo };
  }, [dadosRanking, events]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { label: "Carteira Total", value: fmtM(resumo.totalCarteira), sub: "com multa e juros", color: "#ef4444" },
          { label: "Recuperado no Mês", value: fmtM(resumo.recuperadoMes), sub: "baixas no mês", color: "#22c55e" },
          { label: "Promessas Ativas", value: resumo.promessasValidas.length, sub: "clientes com promessa", color: "#f59e0b" },
          { label: "Valor em Risco", value: fmtM(resumo.risco), sub: "clientes não confiáveis", color: "#ef4444" },
        ].map(k => (
          <div key={k.label} style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${k.color}`, borderRadius: 10, padding: "12px 16px", flex: "1 1 130px", minWidth: 120, maxWidth: 190, boxShadow: t.shad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", letterSpacing: .7, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
            <div style={{ fontSize: 9, color: t.muted }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {resumo.rankingResumo.map(r => (
          <div key={r.key} style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${r.cor}`, borderRadius: 10, padding: "10px 12px", flex: "1 1 150px" }}>
            <div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", fontWeight: 800 }}>{r.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: r.cor }}>{r.qtd}</div>
            <div style={{ fontSize: 10, color: t.txt, fontWeight: 700 }}>{r.desc}</div>
            <div style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>Prometido: {fmtM(r.prometido)}</div>
            <div style={{ fontSize: 10, color: r.risco > 0 ? "#ef4444" : t.muted }}>Risco: {fmtM(r.risco)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
