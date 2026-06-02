import { useEffect } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
import { dbToItem, fmtD } from "@/lib/cobranca";

function money(v) {
  return Number(v || 0);
}

function baixarWorkbook(nome, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows || []);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }
  XLSX.writeFile(wb, nome);
}

async function exportarRelatorioCompletoExcel() {
  const [titulos, eventos] = await Promise.all([
    base44.entities.Titulo.filter({ active: true }, "client_name", 5000),
    base44.entities.ChargeEvent.list("-created_date", 5000)
  ]);

  const itens = (titulos || []).map(dbToItem);
  const carteira = itens.map(i => ({
    Origem: i.origem,
    Numero_Cliente: i.nrCli,
    Cliente: i.nomeCli,
    Tipo_Documento: i.tp,
    Titulo: i.titulo,
    Sequencia: i.seq,
    Vencimento: fmtD(i.vencimento),
    Dias_Atraso: i.diasAtraso,
    Valor_Original: money(i.valorOriginal),
    Multa: money(i.valorMulta),
    Juros: money(i.valorJuros),
    Total_Atualizado: money(i.valorTotalDebito),
    Status: i.status,
    Encaminhamento: i.encaminhar,
    Ultimo_Contato: fmtD(i.dataContato),
    Promessa: fmtD(i.dataPromessa),
    Categoria: i.clientCategory,
    Observacao: i.obs,
    Portador: i.portador
  }));

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
    Observacao: e.note,
    Usuario: e.event_user,
    Criado_Em: e.created_date
  }));

  const resumo = [{
    Data_Exportacao: new Date().toLocaleString("pt-BR"),
    Total_Titulos: carteira.length,
    Total_Clientes: new Set(carteira.map(r => `${r.Numero_Cliente}|${r.Cliente}`)).size,
    Valor_Original: carteira.reduce((s, r) => s + money(r.Valor_Original), 0),
    Total_Atualizado: carteira.reduce((s, r) => s + money(r.Total_Atualizado), 0),
    Total_Eventos_Historico: historico.length
  }];

  baixarWorkbook(`relatorio_completo_cobranca_${new Date().toISOString().slice(0, 10)}.xlsx`, {
    Resumo: resumo,
    Carteira_Geral: carteira,
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
        body.sc-theme-dark [style*="color: #111"],
        body.sc-theme-dark [style*="color:#111"],
        body.sc-theme-dark [style*="color: rgb(17, 17, 17)"] {
          color: #f0f0f0 !important;
        }
        body.sc-theme-dark [style*="color: #666"],
        body.sc-theme-dark [style*="color:#666"],
        body.sc-theme-dark [style*="color: rgb(102, 102, 102)"] {
          color: #aaa !important;
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

    const limparFiltrosVisuais = () => {
      document.querySelectorAll("label").forEach(label => {
        const txt = label.textContent || "";
        if (txt.includes("Sentinela") || txt.includes("Mostrar pagos")) {
          const input = label.querySelector('input[type="checkbox"]');
          if (input) input.style.display = "none";
        }
      });
    };

    const corrigirBaixarRelatorio = () => {
      document.querySelectorAll("button").forEach(btn => {
        const txt = btn.textContent || "";
        if (txt.includes("Baixar Relatório") && !btn.dataset.excelCompleto) {
          btn.dataset.excelCompleto = "1";
          btn.title = "Baixar relatório completo em Excel";
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
              alert(`Erro ao gerar Excel completo: ${err.message}`);
            } finally {
              btn.textContent = original;
              btn.disabled = false;
            }
          }, true);
        }
      });
    };

    syncTheme();
    limparFiltrosVisuais();
    corrigirBaixarRelatorio();

    const timer = setInterval(() => {
      syncTheme();
      limparFiltrosVisuais();
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
