import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { detectSrc, fmtM, parseRows1253, parseRows7007 } from "@/lib/cobranca";

const SOURCE_LABEL = {
  FINR1253: "Topcon / FINR1253",
  RPT_7007_CONS_CAR_EB: "EB / RPT_7007",
};

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
  return {
    "Id da Empresa": item.idEmpresa || item.empresa || "",
    "Tipo Documento": item.tp || "",
    "Série": item.ser || "",
    "Número Documento": item.titulo || "",
    "Sequência": item.seq || "",
    "Código Cliente": item.nrCli || "",
    "Nome Cliente": item.nomeCli || "",
    "Vendedor": item.vendedor || "",
    "Data Emissão": item.emissao || "",
    "Data Vencimento": item.vencimento || "",
    "Valor Total (R$)": Number(item.valorOriginal || 0),
    "Desconto (R$)": Number(item.desconto || 0),
    "Multa (R$)": Number(item.valorMulta || 0),
    "Juros (R$)": Number(item.valorJuros || item.valorCalculado || 0),
    "Receb. Parcial (R$)": Number(item.valorRecebido || item.recebPrc || 0),
    "Saldo Restante (R$)": Number(item.valorEmAberto || item.valorTotalDebito || 0),
    "Total a Receber (R$)": Number(item.valorTotalDebito || item.valorEmAberto || 0),
    "Dias de Atraso": Number(item.diasAtraso || item.atrasoRelatorio || 0),
    "Portador": item.portador || "",
    "Telefone": item.telefone || "",
    "Contato": item.contato || "",
    "CPF/CNPJ": item.cpfCnpj || "",
    "NF Serviço": item.nfServico || "",
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
  if (mixedSignals) {
    detectionNote += " Atenção: o conteúdo teve sinais das duas origens; foi mantida a origem mais provável.";
  }

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

function resumoPlano(plan) {
  const summary = plan?.summary || {};
  return [
    { label: "Novos", value: summary.totalCreate || 0 },
    { label: "Atualizar", value: summary.totalUpdate || 0 },
    { label: "Sem alteração", value: summary.totalUnchanged || 0 },
    { label: "Revisar", value: summary.totalNeedsReview || 0 },
    { label: "Baixar ausência", value: summary.totalAbsence || 0 },
    { label: "Baixas bloqueadas", value: summary.totalAbsenceBlocked || 0 },
  ];
}

export default function ImportPreviewPanel({ onPreparePlan, onApplyPlan, t }) {
  const fileRef = useRef(null);
  const [state, setState] = useState({ status: "idle" });
  const [applying, setApplying] = useState(false);

  const surface = t?.surf || "#ffffff";
  const border = t?.bor || "#e5e7eb";
  const text = t?.txt || "#111827";
  const muted = t?.muted || "#6b7280";
  const primary = t?.p || "#E87722";

  async function prepararArquivo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setApplying(false);
    setState({ status: "loading", message: "Lendo e validando a planilha antes de gravar..." });

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const parsed = parseWorkbook(file.name, workbook);

      if (parsed.items.length === 0) {
        setState({
          status: "error",
          message: `Nenhum título válido encontrado em ${file.name}. Verifique se o arquivo é FINR1253 ou RPT_7007 e se a primeira aba contém a carteira.`,
          parsed,
        });
        return;
      }

      const consolidados = parsed.items.map((item) => canonicalFromItem(item, parsed.source));
      const totalAberto = consolidados.reduce((sum, item) => sum + Number(item["Saldo Restante (R$)"] || 0), 0);
      const bloqueios = [];
      if (parsed.mixedSignals) bloqueios.push("Sinais das duas origens na mesma planilha.");

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
            ? "Pré-validação completa: a baixa por ausência será aplicada somente se o plano confirmar que a importação é segura e não parcial."
            : "Pré-validação com alerta: a baixa por ausência ficou bloqueada por segurança.",
        },
        resumo: {
          totalConsolidados: consolidados.length,
        },
        estatisticas: {
          arquivo: file.name,
          origem: parsed.source,
          totalLinhas: parsed.totalRows,
          totalValidos: consolidados.length,
          totalAberto,
        },
      };

      const plan = await onPreparePlan?.(preview, file.name);
      const totalBaixas = plan?.summary?.totalAbsence || 0;
      const totalBloqueadas = plan?.summary?.totalAbsenceBlocked || 0;
      setState({
        status: "ready",
        fileName: file.name,
        preview,
        plan,
        parsed,
        message: `${file.name} validado: ${consolidados.length} título(s) válido(s), ${fmtM(totalAberto)} em aberto.${totalBaixas > 0 ? ` ${totalBaixas} baixa(s) por ausência serão aplicadas.` : ""}${totalBloqueadas > 0 ? ` ${totalBloqueadas} baixa(s) bloqueadas por segurança.` : ""}`,
      });
    } catch (error) {
      setState({ status: "error", message: `Erro ao validar a planilha: ${error.message}` });
    }
  }

  async function aplicarPlano() {
    if (!state.plan || !state.preview || applying) return;
    setApplying(true);
    setState((prev) => ({ ...prev, status: "applying", message: "Aplicando inclusões, atualizações e baixas por ausência somente quando o plano estiver seguro..." }));
    try {
      const result = await onApplyPlan?.(state.plan, state.preview, state.fileName);
      setState((prev) => ({
        ...prev,
        status: "done",
        message: `Importação segura aplicada: ${result?.created || 0} novo(s), ${result?.updated || 0} atualizado(s), ${result?.lowered || 0} baixa(s) por ausência.`,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, status: "error", message: error.message }));
    } finally {
      setApplying(false);
    }
  }

  const planItems = resumoPlano(state.plan);
  const canApply = state.status === "ready" && state.plan?.canApply && !applying;

  return (
    <section style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: 12, marginBottom: 12, color: text }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={prepararArquivo} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Pré-validação da importação</div>
          <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
            Use esta opção para conferir a leitura da planilha antes de gravar. Se o relatório for completo e seguro, o sistema baixa por ausência o que saiu da carteira.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={state.status === "loading" || state.status === "applying"}
            style={{ background: primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
          >
            Validar planilha
          </button>
          <button
            type="button"
            onClick={aplicarPlano}
            disabled={!canApply}
            style={{ background: canApply ? "#16a34a" : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: canApply ? "pointer" : "not-allowed" }}
          >
            Aplicar importação segura
          </button>
        </div>
      </div>

      {state.message && (
        <div style={{ marginTop: 10, fontSize: 12, color: state.status === "error" ? "#dc2626" : state.status === "done" ? "#16a34a" : text }}>
          {state.message}
        </div>
      )}

      {state.parsed && (
        <div style={{ marginTop: 8, fontSize: 11, color: muted }}>
          {state.parsed.detectionNote} Leitura: {state.parsed.parsedBySource.FINR1253} Topcon / {state.parsed.parsedBySource.RPT_7007_CONS_CAR_EB} EB.
        </div>
      )}

      {state.preview?.seguranca?.motivo && (
        <div style={{ marginTop: 8, fontSize: 11, color: state.preview.seguranca.podeAplicarBaixaAutomatica ? "#16a34a" : "#dc2626" }}>
          {state.preview.seguranca.motivo}
        </div>
      )}

      {state.plan && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10 }}>
          {planItems.map((item) => (
            <div key={item.label} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 10, color: muted, textTransform: "uppercase", fontWeight: 800 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {state.plan?.reviewRequired?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>
          Existem títulos ambíguos para revisar. A aplicação foi bloqueada para evitar duplicidade ou baixa incorreta.
        </div>
      )}
    </section>
  );
}
