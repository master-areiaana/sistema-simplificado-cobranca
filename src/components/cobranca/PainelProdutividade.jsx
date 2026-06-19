import { useMemo } from "react";
import { hojeISO } from "@/lib/cobranca";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function PainelProdutividade({ events, t }) {
  const mesesDisp = useMemo(() => {
    const meses = new Set();
    events.forEach((e) => { if (e.event_date) meses.add(e.event_date.slice(0, 7)); });
    return [...meses].sort().reverse();
  }, [events]);

  const mesFiltro = mesesDisp[0] || hojeISO.slice(0, 7);
  const [ano, mes] = mesFiltro.split("-");
  const mesLabel = `${MESES_LABEL[Number(mes || 1) - 1]}/${String(ano || "").slice(2)}`;

  const evtsMes = useMemo(() =>
    events.filter((e) => e.event_date && e.event_date.startsWith(mesFiltro) && e.event_type === "COBRANCA"),
    [events, mesFiltro]
  );

  const evolucaoDiaria = useMemo(() => {
    const map = new Map();
    evtsMes.forEach((e) => {
      const dia = e.event_date?.slice(8, 10);
      if (!dia) return;
      map.set(dia, (map.get(dia) || 0) + 1);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, qtd]) => ({ dia, qtd }));
  }, [evtsMes]);

  const maxDia = Math.max(...evolucaoDiaria.map((x) => x.qtd), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section style={{
        background: t.surf,
        border: `1px solid ${t.bor}`,
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: t.shad,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: t.txt }}>📈 Movimentações por Dia</div>
          <div style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>{mesLabel}</div>
        </div>

        {evolucaoDiaria.length === 0 ? (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: t.muted, fontSize: 12 }}>
            Sem movimentações de cobrança no período.
          </div>
        ) : (
          <div style={{ height: 120, display: "flex", alignItems: "flex-end", gap: 14, overflowX: "auto", padding: "4px 12px 0" }}>
            {evolucaoDiaria.map(({ dia, qtd }) => (
              <div key={dia} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minWidth: 28, height: "100%" }}>
                <div style={{ fontSize: 10, color: t.txt, fontWeight: 800, marginBottom: 4 }}>{qtd}</div>
                <div
                  title={`Dia ${dia}: ${qtd} movimentações`}
                  style={{
                    width: 24,
                    height: `${Math.max(8, Math.round((qtd / maxDia) * 82))}px`,
                    borderRadius: "4px 4px 0 0",
                    background: t.p,
                    boxShadow: "0 2px 8px rgba(232,119,34,.35)",
                  }}
                />
                <div style={{ fontSize: 10, color: t.muted, marginTop: 5 }}>{dia}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
