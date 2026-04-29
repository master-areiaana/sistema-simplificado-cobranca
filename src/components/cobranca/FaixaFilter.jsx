import { FAIXAS_ATRASO } from "@/lib/cobranca";

export default function FaixaFilter({ faixaAtual, setFaixa, t }) {
  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: t.txt, outline: "none", fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: t.muted, fontWeight: 700 }}>Atraso:</span>
      <select value={faixaAtual} onChange={e => setFaixa(Number(e.target.value))} style={inp}>
        {FAIXAS_ATRASO.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}