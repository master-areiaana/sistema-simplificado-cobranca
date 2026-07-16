import { useEffect } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtD } from "@/lib/cobranca";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const money = (value) => Number(value || 0);

function baixarWorkbook(nome, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.json_to_sheet(rows || []);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  }
  XLSX.writeFile(workbook, nome);
}

async function exportarRelatorioCompletoExcel() {
  const [titulos, eventos] = await Promise.all([
    base44.entities.Titulo.filter({ active: true }, "client_name", 50000),
    base44.entities.ChargeEvent.list("-created_date", 5000),
  ]);

  const carteira = (titulos || []).map(dbToItem).map((item) => ({
    Origem: item.origem,
    Numero_Cliente: item.nrCli,
    Cliente: item.nomeCli,
    Tipo_Documento: item.tp,
    Titulo: item.titulo,
    Sequencia: item.seq,
    Vencimento: fmtD(item.vencimento),
    Dias_Atraso: item.diasAtraso,
    Valor_Original: money(item.valorOriginal),
    Multa: money(item.valorMulta),
    Juros: money(item.valorJuros),
    Total_Atualizado: money(item.valorTotalDebito),
    Status: item.status,
    Encaminhamento: item.encaminhar,
    Ultimo_Contato: fmtD(item.dataContato),
    Promessa: fmtD(item.dataPromessa),
    Categoria: item.clientCategory,
    Observacao: item.obs,
    Portador: item.portador,
  }));

  const historico = (eventos || []).map((evento) => ({
    Data: fmtD(evento.event_date || evento.created_date),
    Cliente_Codigo: evento.client_code,
    Cliente: evento.client_name,
    Titulo_ID: evento.titulo_id,
    Tipo_Evento: evento.event_type,
    Subtipo: evento.event_subtype,
    Status: evento.status,
    Motivo: evento.motive,
    Tipo_Contato: evento.contact_type,
    Promessa: fmtD(evento.promise_date),
    Observacao: evento.note,
    Usuario: evento.event_user,
    Criado_Em: evento.created_date,
  }));

  baixarWorkbook(`relatorio_completo_cobranca_${new Date().toISOString().slice(0, 10)}.xlsx`, {
    Resumo: [{
      Data_Exportacao: new Date().toLocaleString("pt-BR"),
      Total_Titulos: carteira.length,
      Total_Clientes: new Set(carteira.map((row) => `${row.Numero_Cliente}|${row.Cliente}`)).size,
      Valor_Original: carteira.reduce((sum, row) => sum + money(row.Valor_Original), 0),
      Total_Atualizado: carteira.reduce((sum, row) => sum + money(row.Total_Atualizado), 0),
      Total_Eventos_Historico: historico.length,
    }],
    Carteira_Geral: carteira,
    Historico_Eventos: historico,
  });
}

export default function CorrecoesGlobais() {
  useEffect(() => {
    const syncTheme = () => {
      const isDark = (localStorage.getItem(THEME_STORAGE_KEY) || "light") === "dark";
      document.body.classList.toggle("sc-theme-dark", isDark);
    };

    const limparFiltrosVisuais = () => {
      document.querySelectorAll("label").forEach((label) => {
        const text = label.textContent || "";
        if (!text.includes("Sentinela") && !text.includes("Mostrar pagos")) return;
        const input = label.querySelector('input[type="checkbox"]');
        if (input) input.style.display = "none";
      });
    };

    const corrigirBaixarRelatorio = () => {
      document.querySelectorAll("button").forEach((button) => {
        if (!(button.textContent || "").includes("Baixar Relatório") || button.dataset.excelCompleto) return;
        button.dataset.excelCompleto = "1";
        button.title = "Baixar relatório completo em Excel";
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const original = button.textContent;
          try {
            button.textContent = "⏳ Gerando Excel...";
            button.disabled = true;
            await exportarRelatorioCompletoExcel();
          } catch (error) {
            alert(`Erro ao gerar Excel completo: ${error.message}`);
          } finally {
            button.textContent = original;
            button.disabled = false;
          }
        }, true);
      });
    };

    const sync = () => {
      syncTheme();
      limparFiltrosVisuais();
      corrigirBaixarRelatorio();
    };

    sync();
    const timer = setInterval(sync, 700);
    window.addEventListener("storage", syncTheme);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  return null;
}
