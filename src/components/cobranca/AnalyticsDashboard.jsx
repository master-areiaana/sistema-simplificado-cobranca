import { useMemo, useState } from "react";
import { fmtM, fmtD, hojeISO } from "@/lib/cobranca";
import * as XLSX from "xlsx";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">${r.map((v, j) => `<td style="text-align:${j > 1 ? "right" : "left"}">${v}</td>`).join("")}</tr>`
  ).join("");
  const tfoot = totalsRow ? `<tfoot><tr style="background:#fff7ed;font-weight:800">${totalsRow.map(v => `<td>${v}</td>`).join("")}</tr></tfoot>` : "";
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
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${tbody}</tbody>${tfoot}</table>
    <div class="footer">Sistema de Cobrança · ${new Date().toLocaleString("pt-BR")}</div>
    <script>setTimeout(()=>window.print(),600)</script>
  </body></html>`);
  w.document.close();
}

function MiniBars({ data, max, t }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "0 8px" }}>
      {data.map((m, i) => {
        const h = Math.max(Math.round((m.contatos / max) * 92), m.contatos > 0 ? 4 : 0);
        const isLast = i === data.length - 1;
        return (
          <div key={m.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
            <div style={{ fontSize: 9, color: t.muted, minHeight: 12 }}>{m.contatos || ""}</div>
            <div style={{ background: isLast ? t.p : `${t.p}88`, width: "72%", maxWidth: 54, borderRadius: "4px 4px 0 0", height: h, minHeight: m.contatos > 0 ? 4 : 0 }} />
            <div style={{ fontSize: 9, color: isLast ? t.p : t.muted, fontWeight: isLast ? 800 : 500, marginTop: 5 }}>{m.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsDashboard({ grouped, events, t }) {
  const [exportFilter, setExportFilter] = useState({ status: "", faixa: 0, origem: "" });

  const tendenciaMensal = useMemo(() => {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      meses.push(d.toISOString().slice(0, 7));
    }
    return meses.map(m => {
      const evts = events.filter(e => e.event_date?.startsWith(m) && e.event_type === "COBRANCA");
      const [a, ms] = m.split("-");
      return {
        mes: m,
        label: `${MESES_LABEL[Number(ms) - 1]}/${a.slice(2)}`,
        contatos: evts.length,
        promessas: evts.filter(e => e.status === "Prometeu Pagar" || e.status === "Promessa ativa").length,
        pagos: evts.filter(e => e.status === "Pago Aguard. Baixa" || e.status === "Encerrado" || e.status === "Pagamento confirmado").length,
      };
    });
  }, [events]);

  const agingBkd = useMemo(() => {
    const faixas = [
      { label: "0–7d", min: 0, max: 7, cor: "#10b981" },
      { label: "8–15d", min: 8, max: 15, cor: "#3b82f6" },
      { label: "16–30d", min: 16, max: 30, cor: "#f59e0b" },
      { label: "31–60d", min: 31, max: 60, cor: "#f97316" },
      { label: "61–90d", min: 61, max: 90, cor: "#ef4444" },
      { label: ">90d", min: 91, max: Infinity, cor: "#7c3aed" },
    ];
    const total = grouped.reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0) || 1;
    return faixas.map(f => {
      const gs = grouped.filter(g => Number(g.maiorAtraso || 0) >= f.min && Number(g.maiorAtraso || 0) <= f.max);
      const valor = gs.reduce((s, g) => s + Number(g.valorTotalDebito || 0), 0);
      return { ...f, qtd: gs.length, valor, pct: ((valor / total) * 100).toFixed(1) };
    });
  }, [grouped]);

  const statusBreakdown = useMemo(() => {
    const map = {};
    grouped.forEach(g => {
      const s = g.statusConsolidado || "Não Contatado";
      map[s] = (map[s] || 0) + 1;
    });
    const total = grouped.length || 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([status, qtd]) => ({ status, qtd, pct: ((qtd / total) * 100).toFixed(1) }));
  }, [grouped]);

  const maxTend = Math.max(...tendenciaMensal.map(m => m.contatos), 1);
  const maxAging = Math.max(...agingBkd.map(f => f.valor), 1);
  const maxStatus = Math.max(...statusBreakdown.map(s => s.qtd), 1);

  const STATUS_OPTS = ["", "Não Contatado", "Em Cobrança", "Sem Retorno", "Prometeu Pagar", "Pago Aguard. Baixa", "Em Permuta", "Encerrado"];
  const FAIXA_OPTS = [0, 7, 15, 30, 60, 90];
  const inp = { background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, color: t.txt, outline: "none" };

  function getFilteredData() {
    return grouped.filter(g => {
      if (exportFilter.status && g.statusConsolidado !== exportFilter.status) return false;
      if (exportFilter.faixa > 0 && Number(g.maiorAtraso || 0) < exportFilter.faixa) return false;
      if (exportFilter.origem && !g.titulos?.some(ti => ti.origem === exportFilter.origem)) return false;
      return true;
    });
  }

  function exportExcel() {
    const data = getFilteredData();
    const sistemaHeader = ["Origem", "Numero_Cliente", "Cliente", "Tipo_Documento", "Titulo", "Sequencia", "Vencimento", "Dias_Atraso", "Valor_Original", "Total_Atualizado", "Status", "Encaminhamento", "Ultimo_Contato", "Promessa", "Categoria", "Observacao"];
    const sistemaRows = [];
    for (const g of data) {
      for (const ti of (g.titulos || [])) {
        sistemaRows.push([ti.origem === "FINR1253" ? "TOPCON" : "EB", g.nrCli || "", g.nomeCli || "", ti.tp || "", ti.titulo || "", ti.seq || "", ti.vencimento || "", ti.diasAtraso || 0, Number(ti.valorOriginal || 0), Number(ti.valorTotalDebito || 0), g.statusConsolidado || "", g.encaminharConsolidado || "", g.ultimoContato || "", g.dataPromessa || "", ti.clientCategory || "", g.obsConsolidada || ""]);
      }
    }
    dlExcel(`analytics_cobranca_${hojeISO}.xlsx`, [
      { name: "Sistema", data: [sistemaHeader, ...sistemaRows] },
      { name: "Carteira", data: [["Nº", "Nome", "Qtd.", "Val. Original", "Val. Total", "Atraso", "Status"], ...data.map(g => [g.nrCli || "", g.nomeCli, g.qtdTitulos, g.valorOriginal, g.valorTotalDebito, g.maiorAtraso, g.statusConsolidado])] },
      { name: "Aging", data: [["Faixa", "Qtd. Clientes", "Valor Total", "% do Total"], ...agingBkd.map(f => [f.label, f.qtd, f.valor, `${f.pct}%`])] },
      { name: "Status", data: [["Status", "Qtd. Clientes", "% do Total"], ...statusBreakdown.map(s => [s.status, s.qtd, `${s.pct}%`])] },
    ]);
  }

  function exportPDF() {
    const data = getFilteredData();
    openPDFReport({
      title: "Relatório de Carteira",
      subtitle: `Filtros: ${exportFilter.status || "Todos os status"} · Atraso ≥${exportFilter.faixa || 0}d · ${exportFilter.origem || "Todas as origens"} · ${data.length} clientes`,
      headers: ["Nº", "Nome", "Qtd.", "Val. Total", "Atraso", "Status", "Promessa"],
      rows: data.map(g => [g.nrCli || "—", g.nomeCli, g.qtdTitulos, fmtM(g.valorTotalDebito), g.maiorAtraso > 0 ? `${g.maiorAtraso}d` : "—", g.statusConsolidado, fmtD(g.dataPromessa) || "—"]),
      totalsRow: ["", "TOTAL", data.reduce((s, g) => s + g.qtdTitulos, 0), fmtM(data.reduce((s, g) => s + g.valorTotalDebito, 0)), "", "", ""],
    });
  }

  return (
    <section style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: t.txt }}>📊 Analytics & Exportação</div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(300px, 1fr)", gap: 12 }}>
        <div style={{ background: t.card || t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: t.txt, marginBottom: 10 }}>📈 Tendência de Contatos — 6 Meses</div>
          <MiniBars data={tendenciaMensal} max={maxTend} t={t} />
          <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 10, fontWeight: 800 }}>
            <span style={{ color: "#eab308" }}>Promessas</span>
            <span style={{ color: "#10b981" }}>Pagos</span>
          </div>
        </div>

        <div style={{ background: t.card || t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: t.txt, marginBottom: 10 }}>⏱️ Distribuição por Faixa de Atraso</div>
          {agingBkd.map(f => (
            <div key={f.label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: f.cor }}>{f.label}</span>
                <span style={{ fontSize: 9, color: t.muted }}>{f.qtd} clientes · {fmtM(f.valor)} <b style={{ color: f.cor }}>({f.pct}%)</b></span>
              </div>
              <div style={{ background: t.surf2, borderRadius: 4, height: 12, overflow: "hidden" }}>
                <div style={{ background: f.cor, height: "100%", width: `${Math.max((f.valor / maxAging) * 100, f.qtd > 0 ? 1 : 0)}%`, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: t.card || t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: t.txt, marginBottom: 10 }}>📊 Distribuição por Status da Carteira</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {statusBreakdown.map((s, i) => {
            const cores = ["#E87722", "#3b82f6", "#10b981", "#7c3aed", "#f59e0b", "#ef4444", "#64748b"];
            const cor = cores[i % cores.length];
            const pct = (s.qtd / maxStatus) * 100;
            return (
              <div key={s.status} style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${cor}` }}>
                <div style={{ fontSize: 9, color: t.muted, fontWeight: 800 }}>{s.status}</div>
                <div style={{ fontSize: 18, fontWeight: 950, color: cor }}>{s.qtd}</div>
                <div style={{ background: `${cor}22`, borderRadius: 4, height: 6, marginTop: 6, overflow: "hidden" }}><div style={{ background: cor, height: "100%", width: `${pct}%` }} /></div>
                <div style={{ fontSize: 9, color: t.muted, marginTop: 4 }}>{s.pct}% da carteira</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: t.card || t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: t.txt, marginBottom: 10 }}>⬇️ Exportar Relatório</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Status</div><select value={exportFilter.status} onChange={e => setExportFilter(p => ({ ...p, status: e.target.value }))} style={inp}>{STATUS_OPTS.map(s => <option key={s} value={s}>{s || "Todos"}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Atraso mín. (dias)</div><select value={exportFilter.faixa} onChange={e => setExportFilter(p => ({ ...p, faixa: Number(e.target.value) }))} style={inp}>{FAIXA_OPTS.map(f => <option key={f} value={f}>{f === 0 ? "Todos" : `≥ ${f} dias`}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 4 }}>Origem</div><select value={exportFilter.origem} onChange={e => setExportFilter(p => ({ ...p, origem: e.target.value }))} style={inp}><option value="">Todas</option><option value="FINR1253">Topcon</option><option value="RPT_7007_CONS_CAR_EB">EB</option></select></div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: t.muted, alignSelf: "center" }}><b style={{ color: t.txt }}>{getFilteredData().length}</b> clientes selecionados</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={exportExcel} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>📊 Excel (4 abas)</button>
          <button onClick={exportPDF} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>🖨️ PDF Relatório</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 9, color: t.muted }}>O Excel exporta abas: Sistema, Carteira, Aging e Status.</div>
      </div>
    </section>
  );
}
