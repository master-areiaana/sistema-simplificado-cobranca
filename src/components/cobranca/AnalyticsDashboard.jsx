import { useMemo, useState } from "react";
import { fmtM, fmtD, hojeISO } from "@/lib/cobranca";
import * as XLSX from "xlsx";

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function dlCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function dlExcel(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, filename);
}

function openPDFReport({ title, subtitle, headers, rows, totalsRow }) {
  const w = window.open("", "_blank");
  if (!w) { alert("Habilite popups para exportar o PDF."); return; }
  const tbody = rows.map((r, i) =>
    `<tr style="background:${i%2===0?"#fff":"#f9fafb"}">${r.map((v,j) => `<td style="text-align:${j>1?"right":"left"}">${v}</td>`).join("")}</tr>`
  ).join("");
  const tfoot = totalsRow ? `<tfoot><tr style="background:#fff7ed;font-weight:800">${totalsRow.map(v=>`<td>${v}</td>`).join("")}</tr></tfoot>` : "";
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${title}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:28px;font-size:11px;color:#111}
    h1{font-size:18px;font-weight:900;color:#E87722}p{font-size:10px;color:#666;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:10px}
    th{background:#f1f5f9;font-weight:700;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ddd}
    td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
    .footer{margin-top:24px;font-size:9px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:8px}
    @media print{@page{margin:1.5cm;size:A4 landscape}body{padding:0}}</style>
  </head><body>
    <h1>${title}</h1><p>${subtitle}</p>
    <table>
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${tbody}</tbody>${tfoot}
    </table>
    <div class="footer">Sistema de Cobrança · ${new Date().toLocaleString("pt-BR")}</div>
    <script>setTimeout(()=>window.print(),600)</script>
  </body></html>`);
  w.document.close();
}

export default function AnalyticsDashboard({ grouped, events, t }) {
  const [exportFilter, setExportFilter] = useState({ status: "", faixa: 0, origem: "" });
  const [reportType, setReportType] = useState("carteira");

  // ── Tendência mensal de recuperação (últimos 6 meses) ──
  const tendenciaMensal = useMemo(() => {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); d.setMonth(d.getMonth() - i);
      meses.push(d.toISOString().slice(0, 7));
    }
    return meses.map(m => {
      const evts = events.filter(e => e.event_date?.startsWith(m) && e.event_type === "COBRANCA");
      const contatos = evts.length;
      const promessas = evts.filter(e => e.status === "Prometeu Pagar").length;
      const pagos = evts.filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado").length;
      const recuperado = evts.reduce((s, e) => s + (Number(e.total_value) || 0), 0);
      const clientes = new Set(evts.map(e => e.client_code || e.client_name)).size;
      const [a, ms] = m.split("-");
      return { mes: m, label: `${MESES_LABEL[Number(ms)-1]}/${a.slice(2)}`, contatos, promessas, pagos, recuperado, clientes };
    });
  }, [events]);

  // ── Status breakdown ──
  const statusBreakdown = useMemo(() => {
    const map = {};
    grouped.forEach(g => {
      const s = g.statusConsolidado || "Não Contatado";
      map[s] = (map[s] || 0) + 1;
    });
    const total = grouped.length || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([status, qtd]) => ({ status, qtd, pct: ((qtd / total) * 100).toFixed(1) }));
  }, [grouped]);

  // ── Aging breakdown ──
  const agingBkd = useMemo(() => {
    const faixas = [
      { label: "0–7d", min: 0, max: 7, cor: "#10b981" },
      { label: "8–15d", min: 8, max: 15, cor: "#3b82f6" },
      { label: "16–30d", min: 16, max: 30, cor: "#f59e0b" },
      { label: "31–60d", min: 31, max: 60, cor: "#f97316" },
      { label: "61–90d", min: 61, max: 90, cor: "#ef4444" },
      { label: ">90d", min: 91, max: Infinity, cor: "#7c3aed" },
    ];
    const total = grouped.reduce((s, g) => s + g.valorTotalDebito, 0) || 1;
    return faixas.map(f => {
      const gs = grouped.filter(g => g.maiorAtraso >= f.min && g.maiorAtraso <= f.max);
      const valor = gs.reduce((s, g) => s + g.valorTotalDebito, 0);
      return { ...f, qtd: gs.length, valor, pct: ((valor / total) * 100).toFixed(1) };
    });
  }, [grouped]);

  const maxTend = Math.max(...tendenciaMensal.map(m => m.contatos), 1);
  const maxAging = Math.max(...agingBkd.map(f => f.valor), 1);
  const maxStatus = Math.max(...statusBreakdown.map(s => s.qtd), 1);

  // ── Exportar dados filtrados ──
  function getFilteredData() {
    return grouped.filter(g => {
      if (exportFilter.status && g.statusConsolidado !== exportFilter.status) return false;
      if (exportFilter.faixa > 0 && g.maiorAtraso < exportFilter.faixa) return false;
      if (exportFilter.origem && !g.titulos?.some(ti => ti.origem === exportFilter.origem)) return false;
      return true;
    });
  }

  function exportCSV() {
    const data = getFilteredData();
    const headers = ["Nº Cliente","Nome","Qtd. Títulos","Val. Original","Val. Total","Maior Atraso","Status","Encaminhar","Último Contato","Promessa","Observação","Prioridade"];
    const rows = [headers, ...data.map(g => [g.nrCli||"",g.nomeCli,g.qtdTitulos,g.valorOriginal.toFixed(2),g.valorTotalDebito.toFixed(2),g.maiorAtraso,g.statusConsolidado,g.encaminharConsolidado||"",g.ultimoContato||"",g.dataPromessa||"",g.obsConsolidada||"",g.prioridadeCliente])];
    dlCSV(`carteira_${hojeISO}.csv`, rows);
  }

  function exportExcel() {
    const data = getFilteredData();
    const carteira = [
      ["Nº","Nome","Qtd.","Val. Original","Val. Total","Atraso (dias)","Status","Encaminhar","Último Contato","Promessa","Observação","Prioridade"],
      ...data.map(g => [g.nrCli||"",g.nomeCli,g.qtdTitulos,g.valorOriginal,g.valorTotalDebito,g.maiorAtraso,g.statusConsolidado,g.encaminharConsolidado||"",g.ultimoContato||"",g.dataPromessa||"",g.obsConsolidada||"",g.prioridadeCliente])
    ];
    const aging = [
      ["Faixa","Qtd. Clientes","Valor Total","% do Total"],
      ...agingBkd.map(f => [f.label, f.qtd, f.valor, `${f.pct}%`])
    ];
    const status = [
      ["Status","Qtd. Clientes","% do Total"],
      ...statusBreakdown.map(s => [s.status, s.qtd, `${s.pct}%`])
    ];
    const tendencia = [
      ["Mês","Contatos","Promessas","Pagos","Clientes","Recuperado"],
      ...tendenciaMensal.map(m => [m.label, m.contatos, m.promessas, m.pagos, m.clientes, m.recuperado])
    ];
    dlExcel(`analytics_cobranca_${hojeISO}.xlsx`, [
      { name: "Carteira", data: carteira },
      { name: "Aging", data: aging },
      { name: "Status", data: status },
      { name: "Tendência Mensal", data: tendencia },
    ]);
  }

  function exportPDF() {
    const data = getFilteredData();
    openPDFReport({
      title: "Relatório de Carteira",
      subtitle: `Filtros: ${exportFilter.status||"Todos os status"} · Atraso ≥${exportFilter.faixa||0}d · ${exportFilter.origem||"Todas as origens"} · ${data.length} clientes · Gerado em ${new Date().toLocaleString("pt-BR")}`,
      headers: ["Nº","Nome","Qtd.","Val. Total","Atraso","Status","Promessa","Prioridade"],
      rows: data.map(g => [g.nrCli||"—",g.nomeCli,g.qtdTitulos,fmtM(g.valorTotalDebito),g.maiorAtraso>0?`${g.maiorAtraso}d`:"—",g.statusConsolidado,fmtD(g.dataPromessa)||"—",g.prioridadeCliente]),
      totalsRow: ["","TOTAL",data.reduce((s,g)=>s+g.qtdTitulos,0),fmtM(data.reduce((s,g)=>s+g.valorTotalDebito,0)),"","","",""],
    });
  }

  const STATUS_OPTS = ["","Não Contatado","Em Cobrança","Sem Retorno","Prometeu Pagar","Pago Aguard. Baixa","Em Permuta","Encerrado"];
  const FAIXA_OPTS = [0,7,15,30,60,90];
  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, color: t.txt, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Tendência Mensal ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📈 Tendência de Contatos — 6 Meses</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {tendenciaMensal.map((m, i) => {
              const h = Math.max(Math.round((m.contatos / maxTend) * 100), m.contatos > 0 ? 4 : 0);
              const isLast = i === tendenciaMensal.length - 1;
              return (
                <div key={m.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>{m.contatos || ""}</div>
                  <div style={{ background: isLast ? t.p : `${t.p}88`, width: "100%", borderRadius: "4px 4px 0 0", height: `${h}px`, minHeight: m.contatos > 0 ? 4 : 0, transition: "height .3s" }} title={`${m.label}: ${m.contatos} contatos`} />
                  <div style={{ fontSize: 9, color: isLast ? t.p : t.muted, fontWeight: isLast ? 800 : 400, marginTop: 4 }}>{m.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Promessas", vals: tendenciaMensal.map(m => m.promessas), cor: "#eab308" },
              { label: "Pagos", vals: tendenciaMensal.map(m => m.pagos), cor: "#10b981" },
            ].map(serie => (
              <div key={serie.label} style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: serie.cor, marginBottom: 6 }}>{serie.label}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
                  {tendenciaMensal.map((m, i) => {
                    const maxV = Math.max(...serie.vals, 1);
                    const h = Math.max(Math.round((serie.vals[i] / maxV) * 36), serie.vals[i] > 0 ? 2 : 0);
                    return <div key={m.mes} style={{ flex: 1, background: serie.cor, borderRadius: "2px 2px 0 0", height: `${h}px` }} title={`${m.label}: ${serie.vals[i]}`} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Aging breakdown ── */}
        <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>⏱️ Distribuição por Faixa de Atraso</div>
          {agingBkd.map(f => (
            <div key={f.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: f.cor }}>{f.label}</span>
                <span style={{ fontSize: 10, color: t.muted }}>{f.qtd} clientes · {fmtM(f.valor)} <b style={{ color: f.cor }}>({f.pct}%)</b></span>
              </div>
              <div style={{ background: t.surf2, borderRadius: 4, height: 14, overflow: "hidden" }}>
                <div style={{ background: f.cor, height: "100%", width: `${Math.max((f.valor / maxAging) * 100, f.qtd > 0 ? 1 : 0)}%`, borderRadius: 4, transition: "width .4s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status breakdown ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>📊 Distribuição por Status da Carteira</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statusBreakdown.map((s, i) => {
            const cores = ["#E87722","#3b82f6","#10b981","#7c3aed","#f59e0b","#ef4444","#64748b"];
            const cor = cores[i % cores.length];
            const pct = (s.qtd / maxStatus) * 100;
            return (
              <div key={s.status} style={{ flex: "1 1 160px", background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${cor}` }}>
                <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>{s.status}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: cor }}>{s.qtd}</div>
                <div style={{ background: `${cor}22`, borderRadius: 4, height: 6, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ background: cor, height: "100%", width: `${pct}%`, borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 9, color: t.muted, marginTop: 4 }}>{s.pct}% da carteira</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Exportação ── */}
      <div style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.txt, marginBottom: 14 }}>⬇️ Exportar Relatório</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Status</div>
            <select value={exportFilter.status} onChange={e => setExportFilter(p => ({ ...p, status: e.target.value }))} style={inp}>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s || "Todos"}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Atraso mín. (dias)</div>
            <select value={exportFilter.faixa} onChange={e => setExportFilter(p => ({ ...p, faixa: Number(e.target.value) }))} style={inp}>
              {FAIXA_OPTS.map(f => <option key={f} value={f}>{f === 0 ? "Todos" : `≥ ${f} dias`}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Origem</div>
            <select value={exportFilter.origem} onChange={e => setExportFilter(p => ({ ...p, origem: e.target.value }))} style={inp}>
              <option value="">Todas</option>
              <option value="FINR1253">Topcon</option>
              <option value="RPT_7007_CONS_CAR_EB">EB</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: t.muted, marginLeft: "auto", alignSelf: "flex-end", paddingBottom: 2 }}>
            <b style={{ color: t.txt }}>{getFilteredData().length}</b> clientes selecionados
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            📄 CSV
          </button>
          <button onClick={exportExcel} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            📊 Excel (4 abas)
          </button>
          <button onClick={exportPDF} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🖨️ PDF Relatório
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: t.muted }}>
          O Excel exporta 4 abas: <b>Carteira</b>, <b>Aging</b>, <b>Status</b> e <b>Tendência Mensal</b>.
        </div>
      </div>

    </div>
  );
}