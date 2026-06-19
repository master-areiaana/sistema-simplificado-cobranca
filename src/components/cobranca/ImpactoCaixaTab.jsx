import { useMemo } from "react";
import { fmtM, fmtD } from "@/lib/cobranca";

const th = (t) => ({ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${t.bor}` });
const thR = (t) => ({ ...th(t), textAlign: "right" });
const thC = (t) => ({ ...th(t), textAlign: "center" });

const hoje = new Date().toISOString().slice(0, 10);
const mesAtual = hoje.slice(0, 7);

function ResumoCard({ label, value, sub, color, t }) {
  return (
    <div style={{
      background: t.card,
      border: `1px solid ${t.bor}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      padding: "12px 16px",
      flex: "1 1 170px",
      minWidth: 150,
      maxWidth: 260,
      boxShadow: t.shad,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", letterSpacing: .7, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 9, color: t.muted }}>{sub}</div>
    </div>
  );
}

function TabelaImpacto({ rows, t, isDark, corValor, corBadgeBg, corBadgeTxt, renderTipo }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: t.th, color: t.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>
            <th style={th(t)}>N°</th>
            <th style={th(t)}>Cliente</th>
            <th style={thC(t)}>Qtd.</th>
            <th style={thR(t)}>Val. Original</th>
            <th style={thR(t)}>Total Atualizado</th>
            <th style={thC(t)}>Último Contato</th>
            <th style={thC(t)}>Status</th>
            <th style={thC(t)}>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].sort((a, b) => (b.valorTotalDebito || 0) - (a.valorTotalDebito || 0)).map((g) => (
            <tr key={g.clientKey} style={{ borderBottom: `1px solid ${t.bor}` }}>
              <td style={{ padding: "8px 10px", color: t.txt, fontWeight: 600 }}>{g.nrCli || "—"}</td>
              <td style={{ padding: "8px 10px", color: t.txt, fontWeight: 700 }}>{g.nomeCli}</td>
              <td style={{ padding: "8px 10px", textAlign: "center", color: t.txt }}>{g.qtdTitulos}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: t.muted }}>{fmtM(g.valorOriginal)}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: corValor, fontWeight: 700 }}>{fmtM(g.valorTotalDebito)}</td>
              <td style={{ padding: "8px 10px", textAlign: "center", color: t.muted }}>{g.ultimoContato ? fmtD(g.ultimoContato) : "—"}</td>
              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                <span style={{ background: `${corValor}22`, color: corValor, padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                  {g.statusConsolidado || "Não Contatado"}
                </span>
              </td>
              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                {renderTipo(g)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImpactoCaixaTab({ grouped, baixadosImportacao = [], events = [], t, isDark }) {
  const pagosArr = useMemo(() => grouped.filter((g) =>
    g.statusConsolidado === "Encerrado" ||
    g.statusConsolidado === "Baixado" ||
    g.statusConsolidado === "Pago Aguard. Baixa" ||
    g.statusConsolidado === "Confirmado" ||
    g.statusConsolidado === "Pagamento confirmado" ||
    g.titulos.some((ti) => ti.encaminhar === "pago_importacao" || ti.workflow_status === "pago_importacao")
  ), [grouped]);

  const semCarteiraArr = useMemo(() => grouped.filter((g) => {
    if (pagosArr.some((p) => p.clientKey === g.clientKey)) return false;
    return g.titulos.some((ti) => ti.workflow_status_diagnostico === "sem_carteira" || ti.workflow_status === "sem_carteira");
  }), [grouped, pagosArr]);

  const totalPagosVal = pagosArr.reduce((s, g) => s + (g.valorTotalDebito || 0), 0);
  const totalSCVal = semCarteiraArr.reduce((s, g) => s + (g.valorTotalDebito || 0), 0);
  const totalBaixadosImportacao = baixadosImportacao.reduce((sum, item) => sum + Number(item.valorEmAberto || item.valorOriginal || 0), 0);
  const totalCarteira = grouped.reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0);
  const promessasAtivas = grouped.filter((g) => g.dataPromessa && g.dataPromessa >= hoje && !pagosArr.some((p) => p.clientKey === g.clientKey));
  const recuperadoMesEventos = events
    .filter((e) => e.event_date?.startsWith(mesAtual) && ["Pago Aguard. Baixa", "Encerrado", "Pagamento confirmado", "Baixado", "Confirmado"].includes(e.status))
    .reduce((s, e) => s + Number(e.total_value || 0), 0);
  const recuperadoMes = totalBaixadosImportacao || recuperadoMesEventos || totalPagosVal;
  const valorRisco = grouped
    .filter((g) => g.dataPromessa && g.dataPromessa < hoje && !pagosArr.some((p) => p.clientKey === g.clientKey))
    .reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 2, flexWrap: "wrap", justifyContent: "center" }}>
        <ResumoCard label="Carteira Total" value={fmtM(totalCarteira)} sub="com multa e juros" color="#ef4444" t={t} />
        <ResumoCard label="Recuperado no Mês" value={fmtM(recuperadoMes)} sub="baixas via importação" color="#22c55e" t={t} />
        <ResumoCard label="Promessas Ativas" value={promessasAtivas.length} sub="clientes com promessa" color="#f59e0b" t={t} />
        <ResumoCard label="Valor em Risco" value={fmtM(valorRisco)} sub="clientes não confiáveis" color="#ef4444" t={t} />
      </div>

      {/* ── Seção 1: Sem Carteira (cruzamento EB x TOPCON) ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #f59e0b", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>⚠️ Sem Carteira — Diagnóstico de cruzamento (EB ↔ TOPCON)</div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: t.muted }}>
            <span><b style={{ color: "#f59e0b" }}>{semCarteiraArr.length}</b> clientes</span>
            <span>Total: <b style={{ color: "#f59e0b" }}>{fmtM(totalSCVal)}</b></span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>
          Clientes presentes em apenas uma carteira ou com divergência de cruzamento. Eles permanecem visíveis na Carteira Geral quando possuem saldo em aberto.
        </div>
        {semCarteiraArr.length === 0
          ? <div style={{ padding: 16, textAlign: "center", color: t.muted, fontSize: 12 }}>Nenhum cliente sem carteira correspondente. ✅</div>
          : <TabelaImpacto
              rows={semCarteiraArr}
              t={t}
              isDark={isDark}
              corValor="#f59e0b"
              renderTipo={(g) => {
                const origens = [...new Set(g.titulos.map((ti) => ti.origem))].map((o) => o === "FINR1253" ? "TOPCON" : "EB").join(", ");
                return <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>⚠️ Só {origens}</span>;
              }}
            />
        }
      </div>

      {/* ── Seção 2: Pagos / Baixados ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>💰 Clientes Pagos</div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: t.muted }}>
            <span><b style={{ color: "#10b981" }}>{pagosArr.length}</b> clientes</span>
            <span>Total: <b style={{ color: "#10b981" }}>{fmtM(totalPagosVal)}</b></span>
          </div>
        </div>
        {pagosArr.length === 0
          ? <div style={{ padding: 24, textAlign: "center", color: t.muted, fontSize: 12 }}>Nenhum cliente pago no momento.</div>
          : <TabelaImpacto
              rows={pagosArr}
              t={t}
              isDark={isDark}
              corValor="#10b981"
              renderTipo={(g) => {
                const pagoViaImportacao = g.titulos.some((ti) => ti.encaminhar === "pago_importacao" || ti.workflow_status === "pago_importacao");
                return pagoViaImportacao
                  ? <span style={{ background: "#dbeafe", color: "#1d4ed8", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>📥 Importação</span>
                  : <span style={{ color: t.muted, fontSize: 10 }}>Manual</span>;
              }}
            />
        }
      </div>

      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderLeft: "4px solid #64748b", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.txt }}>Baixados por importação</div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: t.muted }}>
            <span><b style={{ color: "#64748b" }}>{baixadosImportacao.length}</b> título(s)</span>
            <span>Saldo anterior: <b style={{ color: "#64748b" }}>{fmtM(totalBaixadosImportacao)}</b></span>
          </div>
        </div>
        <div style={{ color: t.muted, fontSize: 11, marginBottom: 10 }}>
          Títulos ausentes em uma importação completa e confirmada. Os registros não foram apagados.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: t.th, color: t.muted, textTransform: "uppercase", fontSize: 10 }}>
                <th style={th(t)}>Cliente</th>
                <th style={th(t)}>Título</th>
                <th style={thC(t)}>Vencimento</th>
                <th style={thR(t)}>Saldo anterior</th>
                <th style={thC(t)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {baixadosImportacao.length === 0 && (
                <tr><td colSpan={5} style={{ color: t.muted, padding: 16, textAlign: "center" }}>Nenhum título baixado por ausência.</td></tr>
              )}
              {baixadosImportacao.map((item) => (
                <tr key={item._dbId || item.id} style={{ borderBottom: `1px solid ${t.bor}` }}>
                  <td style={{ padding: "8px 10px", color: t.txt, fontWeight: 700 }}>{item.nrCli || "—"} · {item.nomeCli}</td>
                  <td style={{ padding: "8px 10px", color: t.txt }}>{item.titulo}{item.seq ? `/${item.seq}` : ""}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: t.muted }}>{item.vencimento ? fmtD(item.vencimento) : "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#64748b", fontWeight: 700 }}>{fmtM(item.valorEmAberto || item.valorOriginal || 0)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: "#64748b", fontWeight: 700 }}>Baixado</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
