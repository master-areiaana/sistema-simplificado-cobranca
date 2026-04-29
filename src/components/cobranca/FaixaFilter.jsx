import { FAIXAS_ATRASO } from "@/lib/cobranca";

export default function FaixaFilter({ faixaAtual, setFaixa, t }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, marginRight: 4 }}>Atraso:</span>
      {FAIXAS_ATRASO.map(f => (
        <button
          key={f.value}
          onClick={() => setFaixa(f.value)}
          style={{
            background: faixaAtual === f.value ? t.p : t.surf2,
            color: faixaAtual === f.value ? "#fff" : t.muted,
            border: `1px solid ${faixaAtual === f.value ? t.p : t.bor}`,
            borderRadius: 20,
            padding: "3px 12px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}