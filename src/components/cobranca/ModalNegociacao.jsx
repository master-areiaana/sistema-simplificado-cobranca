import { useState, useMemo } from "react";
import { fmtM, fmtD, hojeISO } from "@/lib/cobranca";
import { Btn, Inp, Sl, Lbl } from "./UI";

const TAXA_JUROS_MENSAL = 0.01; // 1% ao mês
const TAXA_MULTA = 0.02;        // 2%

function calcParcelamento(total, numParcelas, entrada, jurosAdicional = 0) {
  const entradaVal = Number(entrada) || 0;
  const saldo = total - entradaVal;
  if (saldo <= 0) return [];
  const taxa = TAXA_JUROS_MENSAL + jurosAdicional;
  const parcela = taxa > 0
    ? (saldo * taxa * Math.pow(1 + taxa, numParcelas)) / (Math.pow(1 + taxa, numParcelas) - 1)
    : saldo / numParcelas;
  return Array.from({ length: numParcelas }, (_, i) => {
    const venc = new Date(`${hojeISO}T00:00:00`);
    venc.setMonth(venc.getMonth() + i + 1);
    return {
      num: i + 1,
      valor: parcela,
      vencimento: venc.toISOString().slice(0, 10),
    };
  });
}

function gerarTermoPDF({ grupo, parcelas, entrada, desconto, responsavel, obs }) {
  const dataHoje = new Date().toLocaleDateString("pt-BR");
  const totalOriginal = grupo.valorTotalDebito;
  const descontoVal = (totalOriginal * (Number(desconto) / 100));
  const totalFinal = totalOriginal - descontoVal;
  const entradaVal = Number(entrada) || 0;
  const totalParcelas = parcelas.reduce((s, p) => s + p.valor, 0);
  const grandTotal = entradaVal + totalParcelas;

  const rowsParcelas = parcelas.map(p => `
    <tr>
      <td style="text-align:center">${p.num}ª</td>
      <td style="text-align:center">${new Date(`${p.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}</td>
      <td style="text-align:right;font-weight:700">${fmtM(p.valor)}</td>
    </tr>`).join("");

  const w = window.open("", "_blank");
  if (!w) { alert("Habilite popups para gerar o Termo."); return; }
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8" /><title>Termo de Acordo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 50px; font-size: 12px; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 18px; text-align: center; margin-bottom: 4px; font-weight: 900; letter-spacing: 2px; }
    .sub { text-align: center; color: #666; font-size: 10px; margin-bottom: 30px; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #E87722; padding-bottom: 4px; margin-bottom: 10px; color: #E87722; }
    .row { display: flex; gap: 16px; margin-bottom: 6px; }
    .row label { font-weight: 700; min-width: 160px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f1f5f9; font-weight: 700; padding: 6px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 2px solid #ddd; }
    td { padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
    .total-row { background: #fff7ed; font-weight: 900; }
    .assinatura { display: flex; gap: 60px; margin-top: 60px; }
    .assin-bloco { flex: 1; border-top: 1px solid #333; padding-top: 8px; text-align: center; font-size: 10px; }
    .aviso { margin-top: 20px; font-size: 9px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { body { padding: 20px; } @page { margin: 1.5cm; } }
  </style>
</head><body>
  <h1>TERMO DE ACORDO DE PARCELAMENTO</h1>
  <div class="sub">Documento gerado em ${dataHoje} · Sistema de Cobrança</div>

  <div class="section">
    <h2>1. Partes Envolvidas</h2>
    <div class="row"><label>Cliente / Devedor:</label><span><b>${grupo.nomeCli}</b></span></div>
    <div class="row"><label>Código do Cliente:</label><span>${grupo.nrCli || "—"}</span></div>
    <div class="row"><label>Responsável pela negociação:</label><span>${responsavel || "—"}</span></div>
    <div class="row"><label>Data do acordo:</label><span>${dataHoje}</span></div>
  </div>

  <div class="section">
    <h2>2. Detalhamento da Dívida</h2>
    <div class="row"><label>Valor original da dívida:</label><span>${fmtM(grupo.valorOriginal)}</span></div>
    <div class="row"><label>Multas e juros acumulados:</label><span>${fmtM(grupo.valorMulta + grupo.valorJuros)}</span></div>
    <div class="row"><label>Total com encargos:</label><span><b>${fmtM(totalOriginal)}</b></span></div>
    ${desconto > 0 ? `<div class="row"><label>Desconto concedido (${desconto}%):</label><span style="color:#10b981">- ${fmtM(descontoVal)}</span></div>` : ""}
    <div class="row"><label>Total a ser pago:</label><span><b style="color:#E87722">${fmtM(totalFinal)}</b></span></div>
  </div>

  <div class="section">
    <h2>3. Condições de Pagamento</h2>
    ${entradaVal > 0 ? `<div class="row"><label>Entrada (à vista):</label><span><b>${fmtM(entradaVal)}</b> — a pagar até ${dataHoje}</span></div>` : ""}
    <table>
      <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
      <tbody>
        ${entradaVal > 0 ? `<tr style="background:#f0fdf4"><td style="text-align:center">Entrada</td><td style="text-align:center">${dataHoje}</td><td style="text-align:right;font-weight:700;color:#10b981">${fmtM(entradaVal)}</td></tr>` : ""}
        ${rowsParcelas}
        <tr class="total-row"><td colspan="2" style="text-align:right">Total do Acordo:</td><td style="text-align:right;color:#E87722">${fmtM(grandTotal + entradaVal)}</td></tr>
      </tbody>
    </table>
  </div>

  ${obs ? `<div class="section"><h2>4. Observações</h2><p>${obs}</p></div>` : ""}

  <div class="section">
    <h2>${obs ? "5" : "4"}. Cláusulas e Condições</h2>
    <p style="font-size:10px;color:#444;margin-bottom:6px">1. O não pagamento de qualquer parcela na data acordada implicará no vencimento antecipado de todas as parcelas restantes, com restabelecimento imediato dos encargos originais.</p>
    <p style="font-size:10px;color:#444;margin-bottom:6px">2. O desconto concedido neste termo é válido exclusivamente mediante o cumprimento integral do acordo.</p>
    <p style="font-size:10px;color:#444">3. Este termo é válido como instrumento de confissão de dívida.</p>
  </div>

  <div class="assinatura">
    <div class="assin-bloco"><div>${grupo.nomeCli}</div><div style="color:#666">Devedor</div></div>
    <div class="assin-bloco"><div>${responsavel || "______________________________"}</div><div style="color:#666">Responsável pela Cobrança</div></div>
    <div class="assin-bloco"><div>______________________________</div><div style="color:#666">Testemunha</div></div>
  </div>

  <div class="aviso">Documento gerado eletronicamente pelo Sistema de Cobrança em ${new Date().toLocaleString("pt-BR")}.</div>
  <script>setTimeout(() => window.print(), 600)</script>
</body></html>`);
  w.document.close();
}

export default function ModalNegociacao({ grupo, onClose, t, isDark }) {
  const [numParcelas, setNumParcelas] = useState(3);
  const [entrada, setEntrada] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [jurosAd, setJurosAd] = useState(0);
  const [responsavel, setResponsavel] = useState("");
  const [obs, setObs] = useState("");

  const totalOriginal = grupo.valorTotalDebito;
  const descontoVal = totalOriginal * (Number(desconto) / 100);
  const totalFinal = totalOriginal - descontoVal;
  const entradaVal = Number(entrada) || 0;

  const parcelas = useMemo(() =>
    calcParcelamento(totalFinal, numParcelas, entradaVal, Number(jurosAd) / 100),
    [totalFinal, numParcelas, entradaVal, jurosAd]
  );

  const totalAcordo = entradaVal + parcelas.reduce((s, p) => s + p.valor, 0);

  const inpS = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 4, padding: "6px 8px", fontSize: 12, color: t.txt, outline: "none", boxSizing: "border-box", width: "100%" };
  const secS = { background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.surf, borderRadius: 14, width: 720, maxWidth: "98vw", maxHeight: "92vh", overflowY: "auto", border: `2px solid #7c3aed`, boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
        {/* Header */}
        <div style={{ background: "#7c3aed", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>🤝 Assistente de Negociação</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{grupo.nomeCli} · {grupo.nrCli} · {grupo.qtdTitulos} título(s)</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {/* Resumo da dívida */}
          <div style={{ ...secS, borderLeft: "4px solid #ef4444" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Dívida Atual</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 9, color: t.muted }}>Valor Original</div><div style={{ fontSize: 15, fontWeight: 800, color: t.txt }}>{fmtM(grupo.valorOriginal)}</div></div>
              <div><div style={{ fontSize: 9, color: t.muted }}>Multa (2%)</div><div style={{ fontSize: 15, fontWeight: 800, color: "#f97316" }}>{fmtM(grupo.valorMulta)}</div></div>
              <div><div style={{ fontSize: 9, color: t.muted }}>Juros</div><div style={{ fontSize: 15, fontWeight: 800, color: "#eab308" }}>{fmtM(grupo.valorJuros)}</div></div>
              <div><div style={{ fontSize: 9, color: t.muted }}>Atraso</div><div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444" }}>{grupo.maiorAtraso}d</div></div>
              <div><div style={{ fontSize: 9, color: t.muted }}>Total c/ Encargos</div><div style={{ fontSize: 18, fontWeight: 900, color: "#E87722" }}>{fmtM(totalOriginal)}</div></div>
            </div>
          </div>

          {/* Parâmetros da negociação */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={secS}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Parâmetros</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <Lbl t={t}>Nº de Parcelas</Lbl>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 9, 12].map(n => (
                      <button key={n} onClick={() => setNumParcelas(n)} style={{ background: numParcelas === n ? "#7c3aed" : t.surf2, color: numParcelas === n ? "#fff" : t.txt, border: `1px solid ${numParcelas === n ? "#7c3aed" : t.bor}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{n}x</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Lbl t={t}>Entrada (R$)</Lbl>
                  <input style={inpS} type="number" min="0" placeholder="0,00" value={entrada} onChange={e => setEntrada(e.target.value)} />
                </div>
                <div>
                  <Lbl t={t}>Desconto (%)</Lbl>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {[0, 5, 10, 15, 20, 30].map(d => (
                      <button key={d} onClick={() => setDesconto(d)} style={{ background: desconto === d ? "#10b981" : t.surf2, color: desconto === d ? "#fff" : t.txt, border: `1px solid ${desconto === d ? "#10b981" : t.bor}`, borderRadius: 6, padding: "5px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d}%</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Lbl t={t}>Juros Adicional/mês (%)</Lbl>
                  <input style={inpS} type="number" min="0" step="0.1" placeholder="0.0" value={jurosAd} onChange={e => setJurosAd(e.target.value)} />
                  <div style={{ fontSize: 9, color: t.muted, marginTop: 3 }}>Já incluído 1% base. Ex: 0.5 = 1.5% total/mês</div>
                </div>
              </div>
            </div>

            {/* Resumo do acordo */}
            <div style={{ ...secS, borderLeft: "4px solid #7c3aed" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Resumo do Acordo</div>
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {desconto > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: t.muted }}>Desconto ({desconto}%)</span><span style={{ color: "#10b981", fontWeight: 700 }}>- {fmtM(descontoVal)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: t.muted }}>Total negociado</span><span style={{ fontWeight: 700 }}>{fmtM(totalFinal)}</span></div>
                {entradaVal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: t.muted }}>Entrada</span><span style={{ fontWeight: 700, color: "#10b981" }}>{fmtM(entradaVal)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: t.muted }}>Saldo parcelado</span><span style={{ fontWeight: 700 }}>{fmtM(totalFinal - entradaVal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${t.bor}`, paddingTop: 6 }}><span style={{ fontWeight: 700 }}>Total do acordo</span><span style={{ fontWeight: 900, color: "#7c3aed", fontSize: 15 }}>{fmtM(totalAcordo)}</span></div>
                {numParcelas > 0 && parcelas.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: t.muted }}>{numParcelas}x de</span><span style={{ fontWeight: 800, color: t.p }}>{fmtM(parcelas[0]?.valor)}</span></div>
                )}
              </div>

              <div>
                <Lbl t={t}>Responsável pela negociação *</Lbl>
                <input style={inpS} placeholder="Seu nome" value={responsavel} onChange={e => setResponsavel(e.target.value)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Lbl t={t}>Observações</Lbl>
                <textarea rows={2} style={{ ...inpS, resize: "vertical" }} placeholder="Condições especiais, notas..." value={obs} onChange={e => setObs(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Tabela de parcelas */}
          <div style={{ ...secS, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📅 Simulação de Parcelas</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: t.th }}>
                    <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: t.muted, fontSize: 10 }}>Parcela</th>
                    <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: t.muted, fontSize: 10 }}>Vencimento</th>
                    <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: t.muted, fontSize: 10 }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {entradaVal > 0 && (
                    <tr style={{ background: "#10b98110" }}>
                      <td style={{ padding: "5px 10px", textAlign: "center", fontWeight: 700, color: "#10b981" }}>Entrada</td>
                      <td style={{ padding: "5px 10px", textAlign: "center" }}>{fmtD(hojeISO)}</td>
                      <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 800, color: "#10b981" }}>{fmtM(entradaVal)}</td>
                    </tr>
                  )}
                  {parcelas.map(p => (
                    <tr key={p.num} style={{ borderBottom: `1px solid ${t.bor}44` }}>
                      <td style={{ padding: "5px 10px", textAlign: "center", color: t.muted }}>{p.num}ª</td>
                      <td style={{ padding: "5px 10px", textAlign: "center" }}>{fmtD(p.vencimento)}</td>
                      <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700 }}>{fmtM(p.valor)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: t.surf2, borderTop: `2px solid ${t.bor}` }}>
                    <td colSpan={2} style={{ padding: "6px 10px", fontWeight: 800, textAlign: "right" }}>TOTAL DO ACORDO:</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 900, color: "#7c3aed", fontSize: 13 }}>{fmtM(totalAcordo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Btn t={t} ghost onClick={onClose}>Cancelar</Btn>
            <button
              onClick={() => {
                if (!responsavel.trim()) { alert("Informe o responsável pela negociação."); return; }
                gerarTermoPDF({ grupo, parcelas, entrada: entradaVal, desconto, responsavel, obs });
              }}
              style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
            >
              📄 Gerar Termo de Acordo (PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}