import { useEffect } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtD } from "@/lib/cobranca";

function money(v) {
  return Number(v || 0);
}

function texto(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return texto(v)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function nomeClienteValido(v) {
  const s = texto(v);
  if (!s) return false;
  if (/^\d+$/.test(s)) return false;
  if (["EB", "NF", "NFE", "FAT", "REC", "TC", "DUP", "DUPLICATA"].includes(norm(s))) return false;
  return /[A-Za-zÀ-ÿ]/.test(s) && s.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 3;
}

function isStatusForaCarteira(...values) {
  const s = values.map(norm).filter(Boolean).join(" ");
  if (!s) return false;
  return ["BAIX", "PAGO", "PAGAMENTO", "RECEB", "LIQUID", "QUIT", "ENCERR", "CANCEL", "DUPLIC", "CONFIRMADO"].some(x => s.includes(x));
}

function baixarWorkbook(nome, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows || []);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }
  XLSX.writeFile(wb, nome);
}

function montarLinhaCarteira(i) {
  if (!i) return null;
  if (i.active === false) return null;
  if (isStatusForaCarteira(i.status, i.encaminhar, i.obs)) return null;

  const codigoCliente = texto(i.nrCli);
  const nomeCliente = texto(i.nomeCli);
  const numeroDocumento = texto(i.titulo);
  const sequencia = texto(i.seq || "1");
  const valorOriginal = money(i.valorOriginal);
  const multa = money(i.valorMulta);
  const juros = money(i.valorJuros);
  const totalAtualizado = money(i.valorTotalDebito || valorOriginal + multa + juros);

  if (!nomeClienteValido(nomeCliente)) return null;
  if (!numeroDocumento || nomeClienteValido(numeroDocumento)) return null;
  if (sequencia && nomeClienteValido(sequencia)) return null;
  if (totalAtualizado <= 0) return null;

  return {
    Origem: i.origem,
    Codigo_Cliente: codigoCliente,
    Nome_Cliente: nomeCliente,
    Tipo_Documento: i.tp || (i.origem === "RPT_7007_CONS_CAR_EB" ? "EB" : ""),
    Numero_Documento: numeroDocumento,
    Sequencia: sequencia || "1",
    Vencimento: fmtD(i.vencimento),
    Dias_Atraso: i.diasAtraso,
    Valor_Original: valorOriginal,
    Multa: multa,
    Juros: juros,
    Total_Atualizado: totalAtualizado,
    Status: i.status || "Não Contatado",
    Encaminhamento: i.encaminhar || "",
    Ultimo_Contato: fmtD(i.dataContato),
    Promessa: fmtD(i.dataPromessa),
    Categoria: i.clientCategory || "",
    Observacao: i.obs || "",
    Portador: i.portador || ""
  };
}

function validarSchemaCarteira(rows) {
  const erros = [];
  rows.forEach((r, idx) => {
    const linha = idx + 2;
    if (!nomeClienteValido(r.Nome_Cliente)) erros.push(`Linha ${linha}: Nome_Cliente inválido: "${r.Nome_Cliente}"`);
    if (!r.Numero_Documento || nomeClienteValido(r.Numero_Documento)) erros.push(`Linha ${linha}: Numero_Documento inválido: "${r.Numero_Documento}"`);
    if (r.Sequencia && nomeClienteValido(r.Sequencia)) erros.push(`Linha ${linha}: Sequencia recebeu nome de cliente: "${r.Sequencia}"`);
    if (money(r.Total_Atualizado) <= 0) erros.push(`Linha ${linha}: Total_Atualizado zerado ou inválido.`);
  });
  if (erros.length) {
    throw new Error(`Exportação bloqueada por erro de schema:\n${erros.slice(0, 20).join("\n")}${erros.length > 20 ? `\n... e mais ${erros.length - 20} erro(s).` : ""}`);
  }
}

async function exportarRelatorioCompletoExcel() {
  const [titulos, eventos] = await Promise.all([
    base44.entities.Titulo.filter({ active: true }, "client_name", 5000),
    base44.entities.ChargeEvent.list("-created_date", 5000)
  ]);

  const itens = (titulos || []).map(dbToItem);
  const carteira = itens.map(montarLinhaCarteira).filter(Boolean).sort((a, b) => {
    const cli = String(a.Nome_Cliente || "").localeCompare(String(b.Nome_Cliente || ""));
    if (cli !== 0) return cli;
    const venc = String(a.Vencimento || "").localeCompare(String(b.Vencimento || ""));
    if (venc !== 0) return venc;
    return String(a.Numero_Documento || "").localeCompare(String(b.Numero_Documento || ""));
  });

  validarSchemaCarteira(carteira);

  const historico = (eventos || []).map(e => ({
    Data: fmtD(e.event_date || e.created_date),
    Cliente_Codigo: e.client_code,
    Cliente: e.client_name,
    Titulo_ID: e.titulo_id,
    Tipo_Evento: e.event_type,
    Subtipo: e.event_subtype,
    Status: e.status,
    Motivo: e.motive,
    Tipo_Contato: e.contact_type,
    Promessa: fmtD(e.promise_date),
    Valor: money(e.total_value || e.valor || e.amount || 0),
    Observacao: e.note,
    Usuario: e.event_user,
    Criado_Em: e.created_date
  }));

  const baixas = historico.filter(e => String(e.Tipo_Evento || "").toUpperCase() === "BAIXA" || isStatusForaCarteira(e.Status, e.Motivo));

  const resumo = [{
    Data_Exportacao: new Date().toLocaleString("pt-BR"),
    Total_Titulos_Carteira_Geral: carteira.length,
    Total_Clientes_Carteira_Geral: new Set(carteira.map(r => `${r.Codigo_Cliente}|${r.Nome_Cliente}`)).size,
    Valor_Original_Carteira_Geral: carteira.reduce((s, r) => s + money(r.Valor_Original), 0),
    Multa_Carteira_Geral: carteira.reduce((s, r) => s + money(r.Multa), 0),
    Juros_Carteira_Geral: carteira.reduce((s, r) => s + money(r.Juros), 0),
    Total_Atualizado_Carteira_Geral: carteira.reduce((s, r) => s + money(r.Total_Atualizado), 0),
    Total_Eventos_Historico: historico.length,
    Total_Eventos_Baixa: baixas.length
  }];

  baixarWorkbook(`relatorio_completo_cobranca_${new Date().toISOString().slice(0, 10)}.xlsx`, {
    Resumo: resumo,
    Carteira_Geral: carteira,
    Baixas_Impacto_Caixa: baixas,
    Historico_Eventos: historico
  });
}

export default function CorrecoesGlobais() {
  useEffect(() => {
    const styleId = "correcoes-globais-sistema-cobranca";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        body.sc-theme-dark .kpi-card,
        body.sc-theme-dark [style*="background: #fff"],
        body.sc-theme-dark [style*="background:#fff"],
        body.sc-theme-dark [style*="background: rgb(255, 255, 255)"],
        body.sc-theme-dark [style*="background: white"] {
          background: #1a1a1a !important;
          color: #f0f0f0 !important;
          border-color: #333 !important;
        }
        body.sc-theme-dark input,
        body.sc-theme-dark select,
        body.sc-theme-dark textarea {
          background: #1a1a1a !important;
          color: #f0f0f0 !important;
          border-color: #333 !important;
        }
        body.sc-theme-dark table,
        body.sc-theme-dark th,
        body.sc-theme-dark td {
          border-color: #333 !important;
        }
        #tab-assessoria-interno {
          background: transparent !important;
          color: inherit !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    const syncTheme = () => {
      const isDark = (localStorage.getItem("sc_theme") || "dark") === "dark";
      document.body.classList.toggle("sc-theme-dark", isDark);
    };

    const corrigirBaixarRelatorio = () => {
      document.querySelectorAll("button").forEach(btn => {
        const txt = btn.textContent || "";
        if (txt.includes("Baixar Relatório") && !btn.dataset.excelCompleto) {
          btn.dataset.excelCompleto = "1";
          btn.title = "Baixar relatório completo em Excel com colunas validadas";
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const original = btn.textContent;
            try {
              btn.textContent = "⏳ Gerando Excel...";
              btn.disabled = true;
              await exportarRelatorioCompletoExcel();
            } catch (err) {
              alert(err.message || `Erro ao gerar Excel completo`);
            } finally {
              btn.textContent = original;
              btn.disabled = false;
            }
          }, true);
        }
      });
    };

    syncTheme();
    corrigirBaixarRelatorio();

    const timer = setInterval(() => {
      syncTheme();
      corrigirBaixarRelatorio();
    }, 800);

    window.addEventListener("storage", syncTheme);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  return null;
}
