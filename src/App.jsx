import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
import Dashboard from './pages/Dashboard';
import AssessoriaHub from './pages/AssessoriaHub';
import CorrecoesGlobais from './components/cobranca/CorrecoesGlobais';

function AssessoriaTabInjector() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;

    let mounted = true;
    let tabsEl = null;
    const hiddenNodes = new Map();

    const readTheme = () => {
      try { return localStorage.getItem("sc_theme") || "dark"; } catch { return "dark"; }
    };

    const theme = () => {
      const dark = readTheme() === "dark";
      return {
        bg: dark ? "#050505" : "#f5f5f5",
        bor: dark ? "#333" : "#ddd",
        txt: dark ? "#f0f0f0" : "#1a1a1a",
        p: "#E87722",
      };
    };

    const readCount = () => {
      try {
        const count = Number(localStorage.getItem("sc_assessoria_unread_count") || "0");
        return Number.isFinite(count) ? count : 0;
      } catch {
        return 0;
      }
    };

    const styleTab = (btn, active = false) => {
      if (!btn) return;
      const th = theme();
      const count = readCount();
      btn.innerHTML = `<span class="sc-menu-icon">⚖️</span><span class="sc-menu-label">Assessoria</span>${count > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:999px;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;padding:0 5px;margin-left:auto;">${count}</span>` : ""}`;
      btn.dataset.active = active ? "true" : "false";
      btn.className = active ? "sc-assessoria-tab sc-side-menu-item is-active" : "sc-assessoria-tab sc-side-menu-item";
      btn.style.setProperty("background", active ? th.p : "transparent", "important");
      btn.style.setProperty("background-color", active ? th.p : "transparent", "important");
      btn.style.setProperty("color", active ? "#fff" : th.txt, "important");
      btn.style.setProperty("border", "0", "important");
      btn.style.setProperty("border-radius", "8px", "important");
      btn.style.setProperty("height", "40px", "important");
      btn.style.setProperty("min-height", "40px", "important");
      btn.style.setProperty("display", "flex", "important");
      btn.style.setProperty("align-items", "center", "important");
      btn.style.setProperty("justify-content", "flex-start", "important");
      btn.style.setProperty("gap", "8px", "important");
      btn.style.setProperty("padding", "0 12px", "important");
      btn.style.setProperty("font-size", "11px", "important");
      btn.style.setProperty("font-weight", "800", "important");
      btn.style.setProperty("width", "100%", "important");
      btn.style.setProperty("white-space", "nowrap", "important");
      btn.style.setProperty("box-shadow", active ? "0 2px 8px rgba(232,119,34,.24)" : "none", "important");
      btn.style.setProperty("cursor", "pointer", "important");
    };

    const restoreDashboard = () => {
      const panel = document.getElementById("assessoria-inline-panel");
      if (panel) panel.remove();
      hiddenNodes.forEach((display, node) => { node.style.display = display; });
      hiddenNodes.clear();
      styleTab(document.getElementById("tab-assessoria-interno"), false);
    };

    const hideDashboardAfterTabs = () => {
      if (!tabsEl) return;
      let node = tabsEl.nextElementSibling;
      while (node) {
        const next = node.nextElementSibling;
        if (node.id !== "assessoria-inline-panel") {
          hiddenNodes.set(node, node.style.display || "");
          node.style.display = "none";
        }
        node = next;
      }
    };

    const openAssessoriaInline = () => {
      if (!tabsEl) return;
      hideDashboardAfterTabs();
      const btn = document.getElementById("tab-assessoria-interno");
      styleTab(btn, true);
      let panel = document.getElementById("assessoria-inline-panel");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "assessoria-inline-panel";
        tabsEl.insertAdjacentElement("afterend", panel);
      }
      const th = theme();
      const src = `${window.location.origin}${window.location.pathname}#/assessoria`;
      panel.style.display = "block";
      panel.style.background = th.bg;
      panel.style.border = `1px solid ${th.bor}`;
      panel.style.borderRadius = "10px";
      panel.style.overflow = "hidden";
      panel.style.minHeight = "calc(100vh - 140px)";
      panel.innerHTML = `<iframe title="Assessoria" src="${src}" style="width:100%;height:calc(100vh - 140px);border:0;background:${th.bg};display:block;"></iframe>`;
    };

    const findTabs = () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const impacto = buttons.find(btn => (btn.textContent || "").includes("Impacto no Caixa"));
      return impacto?.parentElement || null;
    };

    const inject = () => {
      if (!mounted || location.pathname !== "/") return;
      const tabs = findTabs();
      if (!tabs) return;
      tabsEl = tabs;

      let btn = document.getElementById("tab-assessoria-interno");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "tab-assessoria-interno";
        btn.type = "button";
        btn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openAssessoriaInline();
        };
        tabs.appendChild(btn);
      }
      styleTab(btn, !!document.getElementById("assessoria-inline-panel"));
    };

    const handleTabClick = (event) => {
      const btn = event.target?.closest?.("button");
      if (!btn || btn.id === "tab-assessoria-interno" || btn.id === "sc-visao-geral-collapse") return;
      if (tabsEl && tabsEl.contains(btn)) restoreDashboard();
    };

    const interval = setInterval(inject, 600);
    document.addEventListener("click", handleTabClick, true);
    inject();

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("click", handleTabClick, true);
      restoreDashboard();
      const btn = document.getElementById("tab-assessoria-interno");
      if (btn) btn.remove();
    };
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <CorrecoesGlobais />
        <AssessoriaTabInjector />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assessoria" element={<AssessoriaHub />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App