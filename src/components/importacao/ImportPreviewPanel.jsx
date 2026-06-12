import { useRef, useState } from "react";
import * as XLSX from "xlsx";

import { buildImportPreview } from "@/lib/importacao/preview";

const ACCEPTED_FILES =
  ".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SUMMARY_FIELDS = [
  ["totalRPT", "Total RPT"],
  ["totalFINR", "Total FINR"],
  ["totalConsolidados", "Consolidados"],
  ["somenteRPT", "Somente RPT"],
  ["somenteFINR", "Somente FINR"],
  ["emAmbas", "Em ambas"],
  ["comConflito", "Com conflito"],
  ["totalDiagnosticos", "Diagnósticos"],
  ["totalNeedsReview", "Para revisão"],
];

const TABLE_COLUMNS = [
  "Código Cliente",
  "Nome Cliente",
  "Tipo Documento",
  "Número Documento",
  "Sequência",
  "Data Vencimento",
  "Valor Total (R$)",
  "Receb. Parcial (R$)",
  "Saldo Restante (R$)",
  "Multa (R$)",
  "Juros (R$)",
  "Total a Receber (R$)",
];

const MONEY_COLUMNS = new Set([
  "Valor Total (R$)",
  "Receb. Parcial (R$)",
  "Saldo Restante (R$)",
  "Multa (R$)",
  "Juros (R$)",
  "Total a Receber (R$)",
]);

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function cleanObjectRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/^\uFEFF/, "").trim(),
      value,
    ]),
  ));
}

async function readSpreadsheet(file, source) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    ...(file.name.toLowerCase().endsWith(".csv") ? { FS: ";" } : {}),
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) throw new Error("A planilha não possui uma aba legível.");

  if (source === "rpt") {
    return cleanObjectRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
  }

  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function FilePicker({ label, source, fileState, busy, onFile, t }) {
  const inputRef = useRef(null);

  return (
    <div style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: t.muted, fontWeight: 800, marginBottom: 7 }}>{label}</div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        onChange={(event) => onFile(source, event)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          background: t.p,
          border: "none",
          borderRadius: 6,
          color: "#fff",
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: 11,
          fontWeight: 800,
          padding: "7px 12px",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Lendo arquivo..." : "Selecionar arquivo"}
      </button>
      <div style={{ color: fileState.name ? t.txt : t.muted, fontSize: 11, marginTop: 8 }}>
        {fileState.name || "Nenhum arquivo selecionado"}
      </div>
      {fileState.name && (
        <div style={{ color: t.muted, fontSize: 10, marginTop: 3 }}>
          {fileState.rows.length} linha(s) lida(s) localmente
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, t, color = t.p }) {
  return (
    <div style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: "9px 10px" }}>
      <div style={{ color: t.muted, fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function formatCell(column, value) {
  if (MONEY_COLUMNS.has(column)) return moneyFormatter.format(Number(value || 0));
  return String(value ?? "") || "—";
}

function diagnosticDetails(diagnostic) {
  const details = Object.fromEntries(
    Object.entries(diagnostic).filter(([key]) => !["code", "level", "title_key"].includes(key)),
  );
  return Object.keys(details).length > 0 ? JSON.stringify(details) : "—";
}

export default function ImportPreviewPanel({ totalAtivosAnteriores = 0, t }) {
  const [files, setFiles] = useState({
    rpt: { name: "", rows: [] },
    finr: { name: "", rows: [] },
  });
  const [percentuais, setPercentuais] = useState({ multa: "0", juros: "0" });
  const [preview, setPreview] = useState(null);
  const [busySource, setBusySource] = useState("");
  const [error, setError] = useState("");

  const handleFile = async (source, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusySource(source);
    setError("");
    try {
      const rows = await readSpreadsheet(file, source);
      setFiles((current) => ({
        ...current,
        [source]: { name: file.name, rows },
      }));
      setPreview(null);
    } catch (readError) {
      setError(`Não foi possível ler "${file.name}": ${readError.message}`);
    } finally {
      setBusySource("");
    }
  };

  const buildPreview = () => {
    setError("");
    try {
      setPreview(buildImportPreview({
        rptRows: files.rpt.rows,
        finrRows: files.finr.rows,
        totalAtivosAnteriores,
        options: {
          multaPercent: Number(percentuais.multa) || 0,
          jurosPercent: Number(percentuais.juros) || 0,
        },
      }));
    } catch (previewError) {
      setError(`Não foi possível gerar a prévia: ${previewError.message}`);
    }
  };

  const clearPreview = () => {
    setFiles({
      rpt: { name: "", rows: [] },
      finr: { name: "", rows: [] },
    });
    setPreview(null);
    setError("");
  };

  const hasRows = files.rpt.rows.length > 0 || files.finr.rows.length > 0;
  const previewRows = preview?.consolidados.slice(0, 200) || [];

  return (
    <details style={{ background: t.surf, border: `1px solid ${t.bor}`, borderRadius: 10, boxShadow: t.shad, marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", listStyle: "none", padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ color: t.txt, fontSize: 12, fontWeight: 900 }}>Prévia experimental de importação</div>
          <div style={{ color: t.muted, fontSize: 10, marginTop: 3 }}>Área separada do fluxo atual. Nenhuma informação será gravada.</div>
        </div>
        <span style={{ background: "#2563eb22", border: "1px solid #2563eb66", borderRadius: 20, color: "#3b82f6", fontSize: 9, fontWeight: 900, padding: "4px 9px", whiteSpace: "nowrap" }}>
          Somente conferência
        </span>
      </summary>

      <div style={{ borderTop: `1px solid ${t.bor}`, padding: 14 }}>
        <div style={{ background: "#2563eb18", border: "1px solid #2563eb66", borderRadius: 8, color: "#3b82f6", fontSize: 11, fontWeight: 800, marginBottom: 12, padding: "9px 11px" }}>
          Prévia — nenhuma informação foi gravada
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <FilePicker label="RPT_7007" source="rpt" fileState={files.rpt} busy={busySource === "rpt"} onFile={handleFile} t={t} />
          <FilePicker label="FINR1253" source="finr" fileState={files.finr} busy={busySource === "finr"} onFile={handleFile} t={t} />
          <div style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: t.muted, fontWeight: 800, marginBottom: 7 }}>Percentuais para simulação</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                % Multa
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={percentuais.multa}
                  onChange={(event) => setPercentuais((current) => ({ ...current, multa: event.target.value }))}
                  style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 5, color: t.txt, marginTop: 4, padding: "6px 7px", width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ color: t.muted, fontSize: 10, fontWeight: 700 }}>
                % Juros
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={percentuais.juros}
                  onChange={(event) => setPercentuais((current) => ({ ...current, juros: event.target.value }))}
                  style={{ background: t.inp, border: `1px solid ${t.bor}`, borderRadius: 5, color: t.txt, marginTop: 4, padding: "6px 7px", width: "100%", boxSizing: "border-box" }}
                />
              </label>
            </div>
            <div style={{ color: t.muted, fontSize: 10, marginTop: 8 }}>
              Base de comparação: {totalAtivosAnteriores} título(s) ativo(s) atualmente carregado(s).
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={!hasRows || Boolean(busySource)}
            onClick={buildPreview}
            style={{ background: hasRows ? t.p : t.surf2, border: `1px solid ${hasRows ? t.p : t.bor}`, borderRadius: 6, color: hasRows ? "#fff" : t.muted, cursor: hasRows ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 900, padding: "7px 13px" }}
          >
            Gerar prévia segura
          </button>
          <button
            type="button"
            onClick={clearPreview}
            style={{ background: "transparent", border: `1px solid ${t.bor}`, borderRadius: 6, color: t.txt, cursor: "pointer", fontSize: 11, fontWeight: 800, padding: "7px 13px" }}
          >
            Limpar prévia
          </button>
          <button
            type="button"
            disabled
            title="A gravação não faz parte desta fase."
            style={{ background: t.surf2, border: `1px solid ${t.bor}`, borderRadius: 6, color: t.muted, cursor: "not-allowed", fontSize: 11, fontWeight: 800, padding: "7px 13px" }}
          >
            Gravar importação — indisponível nesta fase
          </button>
        </div>

        {error && (
          <div style={{ background: "#dc262618", border: "1px solid #dc262666", borderRadius: 8, color: "#ef4444", fontSize: 11, fontWeight: 700, marginTop: 12, padding: "9px 11px" }}>
            {error}
          </div>
        )}

        {preview && (
          <>
            {preview.seguranca.alertas.map((alerta) => (
              <div key={alerta} style={{ background: "#f59e0b18", border: "1px solid #f59e0b88", borderRadius: 8, color: "#f59e0b", fontSize: 11, fontWeight: 900, marginTop: 12, padding: "9px 11px" }}>
                {alerta}
              </div>
            ))}
            {preview.resumo.totalNeedsReview > 0 && (
              <div style={{ background: "#dc262618", border: "1px solid #dc262666", borderRadius: 8, color: "#ef4444", fontSize: 11, fontWeight: 900, marginTop: 12, padding: "9px 11px" }}>
                Existem {preview.resumo.totalNeedsReview} registro(s) que precisam de revisão antes de qualquer gravação futura.
              </div>
            )}

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginTop: 12 }}>
              {SUMMARY_FIELDS.map(([field, label]) => (
                <SummaryCard key={field} label={label} value={preview.resumo[field]} t={t} color={field === "comConflito" || field === "totalNeedsReview" ? "#ef4444" : t.p} />
              ))}
              <SummaryCard label="Importação parcial" value={preview.seguranca.importacaoParcial ? "Sim" : "Não"} t={t} color={preview.seguranca.importacaoParcial ? "#ef4444" : "#16a34a"} />
              <SummaryCard label="Pode aplicar baixa automática" value={preview.seguranca.podeAplicarBaixaAutomatica ? "Sim" : "Não"} t={t} color={preview.seguranca.podeAplicarBaixaAutomatica ? "#16a34a" : "#ef4444"} />
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ color: t.txt, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Diagnósticos</div>
              <div style={{ border: `1px solid ${t.bor}`, borderRadius: 8, maxHeight: 220, overflow: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: 720, width: "100%" }}>
                  <thead style={{ background: t.th, position: "sticky", top: 0 }}>
                    <tr>
                      {["Código", "Nível", "Chave do título", "Detalhes"].map((heading) => (
                        <th key={heading} style={{ borderBottom: `1px solid ${t.bor}`, color: t.muted, padding: "7px 8px", textAlign: "left" }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.diagnosticos.length === 0 && (
                      <tr><td colSpan={4} style={{ color: t.muted, padding: 10, textAlign: "center" }}>Nenhum diagnóstico gerado.</td></tr>
                    )}
                    {preview.diagnosticos.map((diagnostic, index) => (
                      <tr key={`${diagnostic.code}-${diagnostic.title_key}-${index}`} style={{ background: index % 2 ? t.alt : t.surf }}>
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: diagnostic.level === "warning" ? "#ef4444" : "#3b82f6", fontWeight: 900, padding: "7px 8px" }}>{diagnostic.code}</td>
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: t.txt, padding: "7px 8px" }}>{diagnostic.level}</td>
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: t.txt, padding: "7px 8px" }}>{diagnostic.title_key}</td>
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: t.muted, maxWidth: 420, padding: "7px 8px", whiteSpace: "normal" }}>{diagnosticDetails(diagnostic)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ color: t.txt, fontSize: 12, fontWeight: 900, marginBottom: 3 }}>Registros consolidados</div>
              <div style={{ color: t.muted, fontSize: 10, marginBottom: 8 }}>
                Conferência local de até 200 registros. Nenhum registro abaixo foi gravado ou usado na Carteira Geral.
              </div>
              <div style={{ border: `1px solid ${t.bor}`, borderRadius: 8, maxHeight: 420, overflow: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: 1800, width: "100%" }}>
                  <thead style={{ background: t.th, position: "sticky", top: 0 }}>
                    <tr>
                      {[...TABLE_COLUMNS, "_meta.source_status", "_meta.needs_review"].map((heading) => (
                        <th key={heading} style={{ borderBottom: `1px solid ${t.bor}`, color: t.muted, padding: "7px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((record, index) => (
                      <tr key={`${record["Código Cliente"]}-${record["Número Documento"]}-${record["Sequência"]}-${record["Data Vencimento"]}-${index}`} style={{ background: index % 2 ? t.alt : t.surf }}>
                        {TABLE_COLUMNS.map((column) => (
                          <td key={column} style={{ borderBottom: `1px solid ${t.bor}`, color: t.txt, padding: "7px 8px", whiteSpace: "nowrap" }}>
                            {formatCell(column, record[column])}
                          </td>
                        ))}
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: "#3b82f6", fontWeight: 800, padding: "7px 8px", whiteSpace: "nowrap" }}>{record._meta.source_status}</td>
                        <td style={{ borderBottom: `1px solid ${t.bor}`, color: record._meta.needs_review ? "#ef4444" : "#16a34a", fontWeight: 900, padding: "7px 8px" }}>{record._meta.needs_review ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
