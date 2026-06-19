import { useMemo, useState } from "react";
import { fmtM, hojeISO } from "@/lib/cobranca";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const META_PADRAO = 50000;

function toMoney(value) {
  return Number(value || 0);
}

function ProgressBar({ value, color, t }) {
  const pct = Math.max(0, Math.min(Number(value || 0), 100));
  return (
    <div style={{ background: t.surf2, borderRadius: 8, height: 18, overflow: "hidden", border: `1px solid ${t.bor}` }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .4s" }} />
    </div>
  );
}

function Card({ label, value, sub, color, t }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.bor}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 14px", boxShadow: t.shad }}>
      <div style={{ fontSize: 9, color: t.muted, textTransform: "uppercase", letterSpacing: .7, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function PainelMetas({ grouped, events, t }) {
  const [metaMensal, setMetaMensal] = useState(() => {
    const saved = Number(localStorage.getItem("sc_meta_mensal_cobranca") || META_PADRAO);
    return Number.isFinite(saved) && saved > 0 ? saved : META_PADRAO;
  });
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaInput, setMetaInput] = useState(String(metaMensal));

  const mesAtual = hojeISO.slice(0, 7);
  const [ano, mes] = mesAtual.split("-");
  const mesLabel = `${MESES_LABEL[Number(mes) - 1]}/${ano.slice(2)}`;

  const evtsMes = useMemo(() =>
    events.filter(e => e.event_date?.startsWith(mesAtual) && e.event_type === "COBRANCA"),
    [events, mesAtual]
  );

  const resumo = useMemo(() => {
    const valorRecuperado = evtsMes
      .filter(e => ["Pago Aguard. Baixa", "Encerrado", "Pagamento confirmado", "Baixado", "Confirmado"].includes(e.status))
      .reduce((s, e) => s + toMoney(e.total_value), 0);

    const totalClientes = grouped.length;
    const clientesCobrados = grouped.filter(g => g.ultimoContato?.startsWith(mesAtual)).length;
    const contatos = evtsMes.length;
    const promessas = evtsMes.filter(e => e.status === "Prometeu Pagar").length;
    const clientesUnicos = new Set(evtsMes.map(e => e.client_code || e.client_name).filter(Boolean)).size;
    const cobertura = totalClientes > 0 ? (clientesCobrados / totalClientes) * 100 : 0;
    const conversao = contatos > 0 ? (promessas / contatos) * 100 : 0;
    const progressoMeta = metaMensal > 0 ? (valorRecuperado / metaMensal) * 100 : 0;

    return { valorRecuperado, totalClientes, clientesCobrados, contatos, promessas, clientesUnicos, cobertura, conversao, progressoMeta };
  }, [evtsMes, grouped, mesAtual, metaMensal]);

  const porUsuario = useMemo(() => {
    const map = new Map();
    for (const e of evtsMes) {
      const user = (e.event_user || "Não informado").trim();
      if (!user || user === "Importação" || user === "Importação CSV") continue;
      if (!map.has(user)) map.set(user, { nome: user, contatos: 0, promessas: 0, pagos: 0, valorPago: 0 });
      const item = map.get(user);
      item.contatos += 1;
      if (e.status === "Prometeu Pagar") item.promessas += 1;
      if (["Pago Aguard. Baixa", "Encerrado", "Pagamento confirmado", "Baixado", "Confirmado"].includes(e.status)) {
        item.pagos += 1;
        item.valorPago += toMoney(e.total_value);
      }
    }
    return [...map.values()]
      .map(u => ({ ...u, conversao: u.contatos > 0 ? (u.promessas / u.contatos) * 100 : 0 }))
      .sort((a, b) => b.contatos - a.contatos);
  }, [evtsMes]);

  function salvarMeta() {
    const valor = Number(String(metaInput).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(valor) && valor > 0) {
      setMetaMensal(valor);
      localStorage.setItem("sc_meta_mensal_cobranca", String(valor));
    }
    setEditandoMeta(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: t.txt }}>Produtividade e Metas — {mesLabel}</div>
            <div style={{ fontSize: 11, color: t.muted }}>Tela simplificada: meta, resultado do mês e desempenho por usuário.</div>
          </div>
          {editandoMeta ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={metaInput} onChange={e => setMetaInput(e.target.value)} placeholder="Meta mensal" style={{ background: t.inp, border: `1px solid ${t.bor}`, color: t.txt, borderRadius: 6, padding: "7px 10px", width: 130, fontSize: 12 }} />
              <button onClick={salvarMeta} style={{ background: t.p, color: "#fff", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>Salvar</button>
              <button onClick={() => setEditandoMeta(false)} style={{ background: "transparent", color: t.muted, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => { setMetaInput(String(metaMensal)); setEditandoMeta(true); }} style={{ background: t.surf2, color: t.txt, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "7px 12px", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>Editar meta</button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
          <Card label="Meta do mês" value={fmtM(metaMensal)} sub="objetivo definido" color="#64748b" t={t} />
          <Card label="Recuperado" value={fmtM(resumo.valorRecuperado)} sub="baixado/confirmado" color="#10b981" t={t} />
          <Card label="Falta recuperar" value={fmtM(Math.max(metaMensal - resumo.valorRecuperado, 0))} sub="para bater a meta" color="#ef4444" t={t} />
          <Card label="Contatos no mês" value={resumo.contatos} sub={`${resumo.clientesUnicos} clientes únicos`} color={t.p} t={t} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: t.txt, fontWeight: 800 }}>
              <span>Meta de recuperação</span><span>{Math.min(resumo.progressoMeta, 999).toFixed(1)}%</span>
            </div>
            <ProgressBar value={resumo.progressoMeta} color={resumo.progressoMeta >= 100 ? "#10b981" : t.p} t={t} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: t.txt, fontWeight: 800 }}>
              <span>Cobertura da carteira</span><span>{resumo.cobertura.toFixed(1)}%</span>
            </div>
            <ProgressBar value={resumo.cobertura} color="#3b82f6" t={t} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: t.txt, fontWeight: 800 }}>
              <span>Promessas por contato</span><span>{resumo.conversao.toFixed(1)}%</span>
            </div>
            <ProgressBar value={resumo.conversao} color="#f59e0b" t={t} />
          </div>
        </div>
      </div>

      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.bor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: t.txt }}>Produtividade por usuário</div>
          <div style={{ fontSize: 11, color: t.muted }}>{porUsuario.length} usuário(s)</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: t.th, color: t.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: .6 }}>
              <th style={{ padding: "9px 12px" }}>Usuário</th>
              <th style={{ padding: "9px 12px" }}>Contatos</th>
              <th style={{ padding: "9px 12px" }}>Promessas</th>
              <th style={{ padding: "9px 12px" }}>Pagos</th>
              <th style={{ padding: "9px 12px" }}>Valor pago</th>
              <th style={{ padding: "9px 12px" }}>Conversão</th>
            </tr>
          </thead>
          <tbody>
            {porUsuario.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: t.muted }}>Sem movimentação de cobrança no mês.</td></tr>
            )}
            {porUsuario.map((u, i) => (
              <tr key={u.nome} style={{ background: i % 2 === 0 ? t.surf : t.alt, borderBottom: `1px solid ${t.bor}` }}>
                <td style={{ padding: "9px 12px", fontWeight: 800, color: t.txt }}>{u.nome}</td>
                <td style={{ padding: "9px 12px", color: t.txt }}>{u.contatos}</td>
                <td style={{ padding: "9px 12px", color: "#f59e0b", fontWeight: 800 }}>{u.promessas}</td>
                <td style={{ padding: "9px 12px", color: "#10b981", fontWeight: 800 }}>{u.pagos}</td>
                <td style={{ padding: "9px 12px", color: "#10b981", fontWeight: 800 }}>{fmtM(u.valorPago)}</td>
                <td style={{ padding: "9px 12px", color: t.p, fontWeight: 800 }}>{u.conversao.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
