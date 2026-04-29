import React, { useMemo, useState } from "react";
import { fmtM, fmtD } from "@/lib/cobranca";

function diffDias(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function atrasoCliente(g) {
  return g.maiorAtraso || 0;
}

export default function PainelNotificacoes({ grouped, events, t }) {
  const [filtro, setFiltro] = useState("todos");

  const notificacoes = useMemo(() => {
    const lista = [];
    const hoje = new Date().toISOString().slice(0, 10);

    for (const g of (grouped || [])) {
      // Promessa vencendo hoje ou amanhã
      if (g.dataPromessa) {
        const diff = diffDias(g.dataPromessa);
        if (diff !== null && diff >= -1 && diff <= 1 && g.statusConsolidado !== "Pago Aguard. Baixa" && g.statusConsolidado !== "Encerrado") {
          lista.push({
            id: `prom-${g.clientKey}`,
            tipo: "promessa",
            urgencia: diff <= 0 ? "HOJE" : "AMANHÃ",
            cor: diff <= 0 ? "#ef4444" : "#f59e0b",
            icone: "📅",
            titulo: `Promessa vencendo ${diff <= 0 ? "HOJE" : "AMANHÃ"}`,
            cliente: g.nomeCli,
            nrCli: g.nrCli,
            detalhe: `Data: ${fmtD(g.dataPromessa)} · Valor: ${fmtM(g.valorTotalDebito)}`,
            data: g.dataPromessa,
          });
        }
      }

      // Título crítico (>30 dias sem contato)
      const atraso = atrasoCliente(g);
      if (atraso > 30 && !g.foiCobrado) {
        lista.push({
          id: `crit-${g.clientKey}`,
          tipo: "critico",
          urgencia: atraso > 90 ? "CRÍTICO" : "ALTO",
          cor: atraso > 90 ? "#dc2626" : "#f97316",
          icone: "🔴",
          titulo: `${atraso > 90 ? "CRÍTICO" : "ALTO"}: Cliente sem contato há ${atraso} dias`,
          cliente: g.nomeCli,
          nrCli: g.nrCli,
          detalhe: `Atraso: ${atraso}d · Valor: ${fmtM(g.valorTotalDebito)} · ${g.qtdTitulos} título(s)`,
          data: hoje,
        });
      }
    }

    // Alertas do sistema (eventos tipo ALERTA)
    const alertasSist = (events || []).filter(e => e.event_type === "ALERTA");
    for (const e of alertasSist.slice(0, 10)) {
      lista.push({
        id: `sist-${e.id}`,
        tipo: "sistema",
        urgencia: e.status || "INFO",
        cor: e.status === "CRÍTICO" ? "#dc2626" : e.status === "HOJE" ? "#ef4444" : "#3b82f6",
        icone: "⚙️",
        titulo: e.motive || "Alerta do sistema",
        cliente: e.client_name,
        nrCli: e.client_code,
        detalhe: e.note || "",
        data: e.event_date,
      });
    }

    return lista.sort((a, b) => {
      const ord = { CRÍTICO: 0, HOJE: 1, ALTO: 2, AMANHÃ: 3, INFO: 4 };
      return (ord[a.urgencia] ?? 5) - (ord[b.urgencia] ?? 5);
    });
  }, [grouped, events]);

  const filtradas = useMemo(() => {
    if (filtro === "todos") return notificacoes;
    return notificacoes.filter(n => n.tipo === filtro);
  }, [notificacoes, filtro]);

  const contagem = useMemo(() => ({
    todos: notificacoes.length,
    promessa: notificacoes.filter(n => n.tipo === "promessa").length,
    critico: notificacoes.filter(n => n.tipo === "critico").length,
    sistema: notificacoes.filter(n => n.tipo === "sistema").length,
  }), [notificacoes]);

  return (
    <div>
      {/* Header + KPI */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { key: "todos", label: "🔔 Todas", cor: t.p },
          { key: "promessa", label: "📅 Promessas", cor: "#f59e0b" },
          { key: "critico", label: "🔴 Críticos", cor: "#ef4444" },
          { key: "sistema", label: "⚙️ Sistema", cor: "#3b82f6" },
        ].map(op => (
          <button key={op.key} onClick={() => setFiltro(op.key)}
            style={{ background: filtro === op.key ? op.cor : t.surf2, color: filtro === op.key ? "#fff" : t.muted, border: `2px solid ${filtro === op.key ? op.cor : t.bor}`, borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {op.label}
            {contagem[op.key] > 0 && <span style={{ background: filtro === op.key ? "rgba(255,255,255,.3)" : op.cor, color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 800 }}>{contagem[op.key]}</span>}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: t.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Sem notificações pendentes</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Todas as promessas e títulos estão em dia.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtradas.map(n => (
            <div key={n.id} style={{ background: t.surf, border: `2px solid ${n.cor}22`, borderLeft: `4px solid ${n.cor}`, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{n.icone}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ background: n.cor, color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>{n.urgencia}</span>
                  <b style={{ fontSize: 12, color: t.txt }}>{n.titulo}</b>
                </div>
                <div style={{ fontSize: 12, color: t.txt }}><b>{n.nrCli && `[${n.nrCli}]`} {n.cliente}</b></div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{n.detalhe}</div>
              </div>
              <span style={{ fontSize: 10, color: t.muted, whiteSpace: "nowrap" }}>{fmtD(n.data)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}