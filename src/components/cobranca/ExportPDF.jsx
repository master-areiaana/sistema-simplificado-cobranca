import { fmtM, fmtD, prioCor } from "@/lib/cobranca";

// Gera e abre o PDF executivo de inadimplência
export default function exportarPDFExecutivo({ grouped, filteredCart, dash, faixaAtraso, filtroOrigem, hojeISO }) {
  const w = window.open("", "_blank");
  if (!w) { alert("Habilite popups para exportar o PDF."); return; }

  // Distribuição de atrasos
  const faixas = [
    { label: "0-7 dias", min: 0, max: 7 },
    { label: "8-15 dias", min: 8, max: 15 },
    { label: "16-30 dias", min: 16, max: 30 },
    { label: "31-60 dias", min: 31, max: 60 },
    { label: "61-90 dias", min: 61, max: 90 },
    { label: "91-180 dias", min: 91, max: 180 },
    { label: ">180 dias", min: 181, max: Infinity },
  ];
  const distrib = faixas.map(f => ({
    ...f,
    qtd: grouped.filter(g => g.maiorAtraso >= f.min && g.maiorAtraso <= f.max).length,
    valor: grouped.filter(g => g.maiorAtraso >= f.min && g.maiorAtraso <= f.max).reduce((s, g) => s + g.valorTotalDebito, 0),
  }));
  const maxQtd = Math.max(...distrib.map(d => d.qtd), 1);

  const cores = { critico: "#ef4444", alto: "#f97316", medio: "#eab308", baixo: "#64748b" };

  // Top 20 devedores
  const top20 = [...filteredCart].sort((a, b) => b.valorTotalDebito - a.valorTotalDebito).slice(0, 20);

  const rows = top20.map((g, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
      <td>${i + 1}</td>
      <td>${g.nrCli || "—"}</td>
      <td style="font-weight:600">${g.nomeCli}</td>
      <td style="text-align:center">${g.qtdTitulos}</td>
      <td style="color:#ef4444;font-weight:700;text-align:right">${g.maiorAtraso > 0 ? g.maiorAtraso + "d" : "—"}</td>
      <td style="text-align:right">${fmtM(g.valorOriginal)}</td>
      <td style="text-align:right;font-weight:800;color:#E87722">${fmtM(g.valorTotalDebito)}</td>
      <td style="text-align:center"><span style="background:${prioCor(g.prioridadeCliente)};color:#fff;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700">${g.prioridadeCliente}</span></td>
      <td>${g.statusConsolidado}</td>
      <td>${fmtD(g.dataPromessa)}</td>
    </tr>`).join("");

  const barras = distrib.map(d => `
    <tr>
      <td style="font-size:10px;white-space:nowrap;padding:3px 8px">${d.label}</td>
      <td style="width:100%;padding:3px 8px">
        <div style="background:#f1f5f9;border-radius:4px;height:18px;position:relative">
          <div style="background:#E87722;height:18px;border-radius:4px;width:${Math.round((d.qtd / maxQtd) * 100)}%;min-width:${d.qtd > 0 ? 2 : 0}px;transition:width .3s"></div>
        </div>
      </td>
      <td style="font-size:10px;text-align:center;padding:3px 6px;font-weight:700">${d.qtd}</td>
      <td style="font-size:10px;text-align:right;padding:3px 8px;color:#E87722;font-weight:700">${fmtM(d.valor)}</td>
    </tr>`).join("");

  const filtroDesc = [
    faixaAtraso > 0 ? `Atraso ≥ ${faixaAtraso} dias` : "",
    filtroOrigem === "FINR1253" ? "Topcon" : filtroOrigem === "RPT_7007_CONS_CAR_EB" ? "EB" : "",
  ].filter(Boolean).join(" · ") || "Todos os registros";

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8" />
  <title>Relatório Executivo de Inadimplência</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a1a; padding: 32px; font-size: 11px; }
    h1 { font-size: 20px; font-weight: 900; color: #E87722; letter-spacing: 1px; }
    h2 { font-size: 13px; font-weight: 800; color: #1a1a1a; margin: 24px 0 10px; border-bottom: 2px solid #E87722; padding-bottom: 4px; }
    .sub { font-size: 10px; color: #666; margin-top: 2px; }
    .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .card { border-radius: 8px; padding: 12px 16px; flex: 1 1 120px; border: 1px solid #ddd; border-left: 4px solid; }
    .card .v { font-size: 20px; font-weight: 900; margin-top: 6px; }
    .card .l { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px; }
    th { background: #f1f5f9; font-weight: 700; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 2px solid #ddd; }
    td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    .footer { margin-top: 32px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { @page { margin: 1.5cm; size: A4 landscape; } body { padding: 0; } }
  </style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div>
      <h1>Relatório Executivo de Inadimplência</h1>
      <div class="sub">Emitido em ${new Date().toLocaleString("pt-BR")} · Filtro: ${filtroDesc}</div>
    </div>
    <div style="font-size:10px;color:#666;text-align:right">
      <div><b>Total de clientes:</b> ${grouped.length}</div>
      <div><b>Exibindo:</b> ${filteredCart.length} clientes (top 20 detalhados)</div>
    </div>
  </div>

  <div class="cards">
    <div class="card" style="border-left-color:#E87722"><div class="l">Total em Aberto</div><div class="v" style="color:#E87722">${fmtM(dash.vTot)}</div><div class="sub">com multa e juros</div></div>
    <div class="card" style="border-left-color:#ef4444"><div class="l">A Cobrar</div><div class="v" style="color:#ef4444">${fmtM(dash.aCobrar)}</div><div class="sub">sem contato</div></div>
    <div class="card" style="border-left-color:#10b981"><div class="l">Cobrado</div><div class="v" style="color:#10b981">${fmtM(dash.cobrado)}</div><div class="sub">já contactados</div></div>
    <div class="card" style="border-left-color:#7c3aed"><div class="l">Recuperado Mês</div><div class="v" style="color:#7c3aed">${fmtM(dash.recuperadoMes)}</div><div class="sub">${hojeISO.slice(0,7)}</div></div>
    <div class="card" style="border-left-color:#3b82f6"><div class="l">Verif. Pendentes</div><div class="v" style="color:#3b82f6">${dash.pendVerif}</div></div>
    <div class="card" style="border-left-color:#ef4444"><div class="l">Protestos Pend.</div><div class="v" style="color:#ef4444">${dash.pendProt}</div></div>
    <div class="card" style="border-left-color:#555"><div class="l">Nº Clientes</div><div class="v">${dash.numCli}</div></div>
    <div class="card" style="border-left-color:#888"><div class="l">Nº Títulos</div><div class="v">${dash.numTit}</div></div>
  </div>

  <h2>Distribuição por Faixa de Atraso</h2>
  <table><thead><tr><th>Faixa</th><th>Clientes</th><th>Qtd.</th><th>Valor Total</th></tr></thead><tbody>${barras}</tbody></table>

  <h2>Top 20 Maiores Devedores</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Nº</th><th>Cliente</th><th style="text-align:center">Tít.</th>
      <th style="text-align:center">Atraso</th><th style="text-align:right">Val. Orig.</th>
      <th style="text-align:right">Total c/ Encargos</th><th style="text-align:center">Prioridade</th>
      <th>Status</th><th>Promessa</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#fff7ed;font-weight:800">
      <td colspan="5">TOTAL (top 20)</td>
      <td style="text-align:right">${fmtM(top20.reduce((s,g) => s+g.valorOriginal,0))}</td>
      <td style="text-align:right;color:#E87722">${fmtM(top20.reduce((s,g) => s+g.valorTotalDebito,0))}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>

  <div class="footer">Sistema de Cobrança · Relatório gerado automaticamente · ${new Date().toLocaleString("pt-BR")}</div>
  <script>setTimeout(() => window.print(), 600)</script>
</body></html>`);
  w.document.close();
}