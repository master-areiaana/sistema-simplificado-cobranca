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
        #sc-nav-mode-toggle {
          display: none !important;
        }
        .sc-side-nav {
          box-sizing: border-box !important;
        }
        .sc-side-nav button:not(#sc-visao-geral-collapse):not(#sc-nav-mode-toggle),
        .sc-side-menu-item {
          width: 100% !important;
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          padding: 0 12px !important;
          margin: 0 !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          line-height: 1.2 !important;
          text-align: left !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .sc-side-nav-collapsed button:not(#sc-visao-geral-collapse):not(#sc-nav-mode-toggle) {
          justify-content: center !important;
          padding: 0 !important;
          font-size: 0 !important;
        }
        .sc-side-nav-collapsed button:not(#sc-visao-geral-collapse):not(#sc-nav-mode-toggle)::first-letter {
          font-size: 13px !important;
        }
      `;
      document.head.appendChild(style);
    }

    const syncTheme = () => {
      const isDark = (localStorage.getItem("sc_theme") || "dark") === "dark";
      document.body.classList.toggle("sc-theme-dark", isDark);
    };

    const getTheme = () => {
      const isDark = (localStorage.getItem("sc_theme") || "dark") === "dark";
      return {
        bg: isDark ? "#050505" : "#f5f5f5",
        surf: isDark ? "#111" : "#fff",
        surf2: isDark ? "#1f1f1f" : "#f3f4f6",
        bor: isDark ? "#333" : "#ddd",
        txt: isDark ? "#f0f0f0" : "#1a1a1a",
        muted: isDark ? "#9ca3af" : "#6b7280",
        p: "#E87722",
      };
    };

    const findTabs = () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const impacto = buttons.find(btn => (btn.textContent || "").includes("Impacto no Caixa"));
      return impacto?.parentElement || null;
    };

    const aplicarVisaoGeralLateral = () => {
      try { localStorage.setItem("sc_nav_mode", "left"); } catch {}
      const tabs = findTabs();
      const main = tabs?.closest("main");
      if (!tabs || !main || window.innerWidth < 980) return;

      const th = getTheme();
      const collapsed = localStorage.getItem("sc_nav_collapsed") === "1";
      const sideWidth = collapsed ? 58 : 212;

      tabs.classList.add("sc-side-nav");
      tabs.classList.toggle("sc-side-nav-collapsed", collapsed);
      document.body.dataset.scNavMode = collapsed ? "left-collapsed" : "left";

      let header = document.getElementById("sc-visao-geral-header");
      if (!header) {
        header = document.createElement("div");
        header.id = "sc-visao-geral-header";
        tabs.insertBefore(header, tabs.firstChild);
      }

      header.style.cssText = [
        "display:grid",
        `grid-template-columns:${collapsed ? "1fr" : "1fr 34px"}`,
        "align-items:center",
        "gap:8px",
        "padding:2px 2px 10px",
        "margin:0 0 8px 0",
        `border-bottom:1px solid ${th.bor}`,
        `color:${th.muted}`,
        "min-height:42px",
        "box-sizing:border-box"
      ].join(";");
      header.innerHTML = collapsed
        ? `<button id="sc-visao-geral-collapse" title="Abrir Visão Geral" style="width:36px;height:32px;border-radius:8px;border:1px solid ${th.bor};background:${th.surf2};color:${th.txt};font-weight:900;cursor:pointer;margin:0 auto;">›</button>`
        : `<span style="display:block;font-size:9.5px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;line-height:1.25;padding-left:3px;">VISÃO<br/>GERAL</span><button id="sc-visao-geral-collapse" title="Fechar Visão Geral" style="width:34px;height:32px;border-radius:8px;border:1px solid ${th.bor};background:${th.surf2};color:${th.txt};font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;margin:0;">‹</button>`;
      const collapseBtn = header.querySelector("#sc-visao-geral-collapse");
      if (collapseBtn) {
        collapseBtn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          localStorage.setItem("sc_nav_collapsed", collapsed ? "0" : "1");
          aplicarVisaoGeralLateral();
        };
      }

      main.style.paddingLeft = `${sideWidth + 24}px`;
      tabs.style.setProperty("position", "fixed", "important");
      tabs.style.setProperty("top", "72px", "important");
      tabs.style.setProperty("left", "10px", "important");
      tabs.style.setProperty("bottom", "12px", "important");
      tabs.style.setProperty("width", `${sideWidth}px`, "important");
      tabs.style.setProperty("z-index", "90", "important");
      tabs.style.setProperty("display", "flex", "important");
      tabs.style.setProperty("flex-direction", "column", "important");
      tabs.style.setProperty("align-items", "stretch", "important");
      tabs.style.setProperty("gap", "6px", "important");
      tabs.style.setProperty("overflow-x", "hidden", "important");
      tabs.style.setProperty("overflow-y", "auto", "important");
      tabs.style.setProperty("padding", collapsed ? "8px 7px" : "10px", "important");
      tabs.style.setProperty("margin", "0", "important");
      tabs.style.setProperty("border", `1px solid ${th.bor}`, "important");
      tabs.style.setProperty("border-radius", "12px", "important");
      tabs.style.setProperty("background", th.surf, "important");
      tabs.style.setProperty("box-shadow", "0 10px 26px rgba(0,0,0,.10)", "important");

      Array.from(tabs.querySelectorAll("button")).forEach(btn => {
        if (btn.id === "sc-nav-mode-toggle") {
          btn.style.display = "none";
          return;
        }
        if (btn.id === "sc-visao-geral-collapse") return;
        const label = (btn.textContent || "").trim();
        if (label) btn.title = label;
        btn.classList.add("sc-side-menu-item");
        btn.style.setProperty("width", "100%", "important");
        btn.style.setProperty("height", "40px", "important");
        btn.style.setProperty("min-height", "40px", "important");
        btn.style.setProperty("display", "flex", "important");
        btn.style.setProperty("align-items", "center", "important");
        btn.style.setProperty("justify-content", collapsed ? "center" : "flex-start", "important");
        btn.style.setProperty("gap", collapsed ? "0" : "8px", "important");
        btn.style.setProperty("text-align", collapsed ? "center" : "left", "important");
        btn.style.setProperty("border-radius", "8px", "important");
        btn.style.setProperty("padding", collapsed ? "0" : "0 12px", "important");
        btn.style.setProperty("margin", "0", "important");
        btn.style.setProperty("overflow", "hidden", "important");
        btn.style.setProperty("white-space", "nowrap", "important");
        btn.style.setProperty("font-size", collapsed ? "0" : "11px", "important");
        btn.style.setProperty("line-height", "1.2", "important");
      });
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
    aplicarVisaoGeralLateral();

    const timer = setInterval(() => {
      syncTheme();
      limparFiltrosVisuais();
      corrigirBaixarRelatorio();
      aplicarVisaoGeralLateral();
    }, 600);

    window.addEventListener("storage", syncTheme);
    window.addEventListener("resize", aplicarVisaoGeralLateral);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("resize", aplicarVisaoGeralLateral);
    };
  }, []);

  return null;
}
