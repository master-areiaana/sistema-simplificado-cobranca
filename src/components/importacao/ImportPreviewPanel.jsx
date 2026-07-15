import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { detectSrc, fmtM, parseRows1253, parseRows7007 } from "@/lib/cobranca";

const SOURCE_LABEL = {
  FINR1253: "Topcon / FINR1253",
  RPT_7007_CONS_CAR_EB: "EB / RPT_7007",
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function limparRows(rawRows) {
  return (rawRows || []).map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row || {})) {
      out[String(key).replace(/^\uFEFF/, "").trim()] = value;
    }
    return out;
  });
}

function canonicalFromItem(item, source) {
  const valorEmAberto = Number(item.valorEmAberto ?? item.valorTotalDebito ?? 0);
  const valorTotalDebito = Number(item.valorTotalDebito ?? item.valorEmAberto ?? 0);
  return {
    "Id da Empresa": item.idEmpresa ?? item.empresa ?? "",
    "Tipo Documento": item.tp ?? "",
    "Série": item.ser ?? "",
    "Número Documento": item.titulo ?? "",
    "Sequência": item.seq ?? "",
    "Código Cliente": item.nrCli ?? "",
    "Nome Cliente": item.nomeCli ?? "",
    "Vendedor": item.vendedor ?? "",
    "Data Emissão": item.emissao ?? "",
    "Data Vencimento": item.vencimento ?? "",
    "Valor Total (R$)": Number(item.valorOriginal ?? 0),
    "Desconto (R$)": Number(item.desconto ?? 0),
    "Multa (R$)": Number(item.valorMulta ?? 0),
    "Juros (R$)": Number(item.valorJuros ?? item.valorCalculado ?? 0),
    "Receb. Parcial (R$)": Number(item.valorRecebido ?? item.recebPrc ?? 0),
    "Saldo Restante (R$)": valorEmAberto,
    "Total a Receber (R$)": valorTotalDebito,
    "Dias de Atraso": Number(item.diasAtraso ?? item.atrasoRelatorio ?? 0),
    "Portador": item.portador ?? "",
    "Telefone": item.telefone ?? "",
    "Contato": item.contato ?? "",
    "CPF/CNPJ": item.cpfCnpj ?? "",
    "NF Serviço": item.nfServico ?? "",
    _meta: {
      source_status: source === "FINR1253" ? "SOMENTE_FINR" : "SOMENTE_RPT",
      origem_detectada: source,
    },
  };
}

function parseWorkbook(fileName, workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const objectRows = limparRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
  const arrayRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const sourceByName = detectSrc(fileName);
  const topconItems = parseRows1253(arrayRows);
  const ebItems = parseRows7007(objectRows);

  let source = sourceByName;
  let items = sourceByName === "FINR1253" ? topconItems : ebItems;
  let detectionNote = `Origem definida pelo nome do arquivo: ${SOURCE_LABEL[source]}.`;

  if (items.length === 0) {
    const alternativeSource = sourceByName === "FINR1253" ? "RPT_7007_CONS_CAR_EB" : "FINR1253";
    const alternativeItems = alternativeSource === "FINR1253" ? topconItems : ebItems;
    if (alternativeItems.length > 0) {
      source = alternativeSource;
      items = alternativeItems;
      detectionNote = `Origem corrigida pelo conteúdo da planilha: ${SOURCE_LABEL[source]}.`;
    }
  }

  const mixedSignals = topconItems.length > 0 && ebItems.length > 0;
  if (mixedSignals) detectionNote += " O arquivo apresentou sinais das duas origens e exige conferência.";

  return {
    source,
    items,
    detectionNote,
    mixedSignals,
    totalRows: Math.max(objectRows.length, arrayRows.length),
    parsedBySource: {
      FINR1253: topconItems.length,
      RPT_7007_CONS_CAR_EB: ebItems.length,
    },
  };
}

function Stat({ label, value, muted, color }) {
  return (
    <div style={{ minWidth: 105, flex: "1 1 105px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: .35 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 15, lineHeight: 1.15, fontWeight: 900, color, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function SummaryBlock({ title, children, border, surface, muted }) {
  return (
    <div style={{ border: `1px solid ${border}`, background: surface, borderRadius: 9, padding: 10, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: muted, fontWeight: 900, textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>
    </div>
  );
}

function AuditDetails({ plan, parsed, border, surface, text, muted }) {
  const [open, setOpen] = useState(false);
  if (!plan) return null;
  const blocked = plan.absenceBlocked || [];
  const review = plan.reviewRequired || [];
  const topconClients = plan.snapshot?.source === "FINR1253" ? plan.snapshot?.imported?.clients || 0 : 0;
  const ebClients = plan.snapshot?.source === "RPT_7007_CONS_CAR_EB" ? plan.snapshot?.imported?.clients || 0 : 0;

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ border: `1px solid ${border}`, background: surface, color: text, borderRadius: 7, padding: "6px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
        {open ? "Ocultar auditoria detalhada" : "Ver auditoria detalhada"}
      </button>
      {open && (
        <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 8, padding: 10, fontSize: 11, color: text }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><b>Clientes EB:</b> {ebClients}</span>
            <span><b>Clientes Topcon:</b> {topconClients}</span>
            <span><b>Leitura bruta:</b> {parsed?.parsedBySource?.FINR1253 || 0} Topcon / {parsed?.parsedBySource?.RPT_7007_CONS_CAR_EB || 0} EB</span>
            <span><b>Cobertura:</b> {plan.safety?.percentualCobertura ?? 100}%</span>
          </div>
          {plan.safety?.motivoBloqueio && <div style={{ marginTop: 8, color: "#dc2626", fontWeight: 700 }}>{plan.safety.motivoBloqueio}</div>}
          {review.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <b>Revisões ({review.length}):</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: muted }}>
                {review.slice(0, 20).map((item, index) => <li key={`${item.code}-${index}`}>{item.code} — {item.key}</li>)}
              </ul>
            </div>
          )}
          {blocked.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <b>Baixas bloqueadas ({blocked.length}):</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: muted }}>
                {blocked.slice(0, 20).map((item, index) => <li key={`${item.id || index}`}>{item.client_name || "Cliente"} — título {item.title_number || "sem número"}</li>)}
              </ul>
            </div>
          )}
          {review.length === 0 && blocked.length === 0 && <div style={{ marginTop: 8, color: "#16a34a", fontWeight: 700 }}>Nenhuma divergência bloqueante encontrada.</div>}
        </div>
      )}
    </div>
  );
}

export default function ImportPreviewPanel({ onPreparePlan, onApplyPlan, t }) {
  const fileRef = useRef(null);
  const [state, setState] = useState({ status: "idle", progress: 0, stage: "" });
  const [applying, setApplying] = useState(false);

  const surface = t?.surf || "#ffffff";
  const surface2 = t?.surf2 || "#f8fafc";
  const border = t?.bor || "#e5e7eb";
  const text = t?.txt || "#111827";
  const muted = t?.muted || "#6b7280";
  const primary = t?.p || "#E87722";

  async function stage(progress, message) {
    setState((previous) => ({ ...previous, status: "loading", progress, stage: message, message }));
    await nextFrame();
  }

  async function prepararArquivo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setApplying(false);
    const startedAt = performance.now();
    try {
      await stage(12, "Lendo arquivo");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      await stage(38, "Identificando origem e títulos válidos");
      const parsed = parseWorkbook(file.name, workbook);

      if (parsed.items.length === 0) {
        setState({
          status: "error",
          progress: 0,
          message: `Nenhum título válido encontrado em ${file.name}. Verifique se o arquivo é FINR1253 ou RPT_7007 e se a primeira aba contém a carteira.`,
          parsed,
        });
        return;
      }

      await stage(62, "Normalizando clientes e valores");
      const consolidados = parsed.items.map((item) => canonicalFromItem(item, parsed.source));
      const totalAberto = consolidados.reduce((sum, item) => sum + Number(item["Saldo Restante (R$)"] ?? 0), 0);
      const bloqueios = parsed.mixedSignals ? ["Sinais das duas origens na mesma planilha."] : [];
      const podeAplicarBaixaAutomatica = bloqueios.length === 0;
      const preview = {
        consolidados,
        finrItems: parsed.source === "FINR1253" ? consolidados : [],
        rptItems: parsed.source === "RPT_7007_CONS_CAR_EB" ? consolidados : [],
        seguranca: {
          importacaoParcial: false,
          podeProsseguir: true,
          podeAplicarBaixaAutomatica,
          bloqueios,
          motivo: podeAplicarBaixaAutomatica
            ? "A baixa por ausência será decidida somente contra a carteira ativa desta mesma origem."
            : "A baixa por ausência foi bloqueada por segurança.",
        },
        resumo: { totalConsolidados: consolidados.length },
        estatisticas: {
          arquivo: file.name,
          origem: parsed.source,
          totalLinhas: parsed.totalRows,
          totalValidos: consolidados.length,
          totalAberto,
        },
      };

      await stage(82, "Comparando com a carteira já carregada");
      const plan = await onPreparePlan?.(preview, file.name);
      const elapsedMs = Math.round(performance.now() - startedAt);
      setState({
        status: "ready",
        progress: 100,
        stage: "Resumo pronto",
        fileName: file.name,
        preview,
        plan,
        parsed,
        elapsedMs,
        message: `${file.name} validado em ${(elapsedMs / 1000).toFixed(1)}s. Confira o plano antes de aplicar.`,
      });
    } catch (error) {
      setState({ status: "error", progress: 0, message: `Erro ao validar a planilha: ${error.message}` });
    }
  }

  async function aplicarPlano() {
    if (!state.plan || !state.preview || applying) return;
    setApplying(true);
    setState((previous) => ({ ...previous, status: "applying", progress: 35, stage: "Revalidando e aplicando em transação", message: "Revalidando a carteira e aplicando o plano em uma única operação segura..." }));
    try {
      const result = await onApplyPlan?.(state.plan, state.preview, state.fileName);
      setState((previous) => ({
        ...previous,
        status: "done",
        progress: 100,
        stage: "Importação concluída",
        message: `Importação segura aplicada: ${result?.created || 0} novo(s), ${result?.updated || 0} atualizado(s), ${result?.lowered || 0} baixa(s) por ausência.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, status: "error", progress: 0, stage: "Falha", message: error.message }));
    } finally {
      setApplying(false);
    }
  }

  const plan = state.plan;
  const current = plan?.snapshot?.current || {};
  const imported = plan?.snapshot?.imported || {};
  const summary = plan?.summary || {};
  const canApply = state.status === "ready" && plan?.canApply && !applying;
  const isBusy = state.status === "loading" || state.status === "applying";

  return (
    <section className="sc-import-preview" style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: "9px 10px", marginBottom: 12, color: text, minWidth: 0, boxSizing: "border-box" }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={prepararArquivo} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: "1 1 360px" }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Pré-validação da importação</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={isBusy} style={{ background: isBusy ? "#9ca3af" : primary, color: "#fff", border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 11, fontWeight: 800, cursor: isBusy ? "not-allowed" : "pointer" }}>Validar planilha</button>
          <button type="button" onClick={aplicarPlano} disabled={!canApply} style={{ background: canApply ? "#16a34a" : "#9ca3af", color: "#fff", border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 11, fontWeight: 800, cursor: canApply ? "pointer" : "not-allowed" }}>Aplicar importação segura</button>
        </div>
      </div>

      {state.message && <div style={{ marginTop: 10, fontSize: 12, color: state.status === "error" ? "#dc2626" : state.status === "done" ? "#16a34a" : text }}>{state.message}</div>}
      {isBusy && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: muted, marginBottom: 4 }}><span>{state.stage}</span><span>{state.progress}%</span></div>
          <div style={{ height: 5, background: border, borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${state.progress}%`, background: primary, transition: "width .2s ease" }} /></div>
        </div>
      )}

      {state.parsed && <div style={{ marginTop: 7, fontSize: 10, color: muted }}>{state.parsed.detectionNote}</div>}

      {plan && (
        <div className="import-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
          <SummaryBlock title="Carteira atual da origem" border={border} surface={surface2} muted={muted}>
            <Stat label="Clientes" value={current.clients || 0} muted={muted} color={text} />
            <Stat label="Títulos" value={current.titles || 0} muted={muted} color={text} />
            <Stat label="Valor em aberto" value={fmtM(current.value || 0)} muted={muted} color="#f59e0b" />
          </SummaryBlock>
          <SummaryBlock title={`Relatório importado · ${SOURCE_LABEL[plan.snapshot?.source] || plan.snapshot?.source || ""}`} border={border} surface={surface2} muted={muted}>
            <Stat label="Clientes" value={imported.clients || 0} muted={muted} color="#3b82f6" />
            <Stat label="Títulos" value={imported.titles || 0} muted={muted} color={text} />
            <Stat label="Valor da planilha" value={fmtM(imported.value || 0)} muted={muted} color="#f59e0b" />
            <Stat label="Linhas lidas" value={state.parsed?.totalRows || 0} muted={muted} color={text} />
          </SummaryBlock>
          <SummaryBlock title="Plano da importação" border={border} surface={surface2} muted={muted}>
            <Stat label="Criar" value={summary.totalCreate || 0} muted={muted} color="#16a34a" />
            <Stat label="Atualizar" value={summary.totalUpdate || 0} muted={muted} color="#3b82f6" />
            <Stat label="Manter" value={summary.totalUnchanged || 0} muted={muted} color={text} />
            <Stat label="Baixar ausência" value={summary.totalAbsence || 0} muted={muted} color="#ef4444" />
            <Stat label="Bloqueadas" value={summary.totalAbsenceBlocked || 0} muted={muted} color="#f59e0b" />
            <Stat label="Revisar" value={summary.totalNeedsReview || 0} muted={muted} color="#f59e0b" />
          </SummaryBlock>
        </div>
      )}

      {plan?.safety?.motivoBloqueio && <div style={{ marginTop: 9, fontSize: 11, color: "#dc2626", fontWeight: 700 }}>{plan.safety.motivoBloqueio}</div>}
      {plan?.reviewRequired?.length > 0 && <div style={{ marginTop: 9, fontSize: 11, color: "#dc2626", fontWeight: 700 }}>Existem títulos ambíguos para revisar. A aplicação foi bloqueada para evitar duplicidade ou baixa incorreta.</div>}
      <AuditDetails plan={plan} parsed={state.parsed} border={border} surface={surface2} text={text} muted={muted} />
    </section>
  );
}
