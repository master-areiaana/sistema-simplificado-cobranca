import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
// Add page imports here
import Dashboard from './pages/Dashboard';
import AssessoriaHub from './pages/AssessoriaHub';
import CorrecoesGlobais from './components/cobranca/CorrecoesGlobais';

function AssessoriaTabInjector() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;

    let mounted = true;
    let tabEl = null;
    let tabsEl = null;
    let mainEl = null;
    const hiddenNodes = new Map();

    const readCount = () => {
      try {
        const count = Number(localStorage.getItem("sc_assessoria_unread_count") || "0");
        return Number.isFinite(count) ? count : 0;
      } catch {
        return 0;
      }
    };

    const readTheme = () => {
      try { return localStorage.getItem("sc_theme") || "dark"; } catch { return "dark"; }
    };

    const theme = () => {
      const dark = readTheme() === "dark";
      return {
        dark,
        bg: dark ? "#050505" : "#f5f5f5",
        surf: dark ? "#111" : "#fff",
        bor: dark ? "#333" : "#ddd",
        txt: dark ? "#f0f0f0" : "#1a1a1a",
        p: "#E87722",
      };
    };

    const styleTab = (el, count, active = false) => {
      const th = theme();
      el.innerHTML = `<span>⚖️ Assessoria</span>${count > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:999px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;padding:0 5px;margin-left:6px;">${count}</span>` : ""}`;
      el.style.position = "relative";
      el.style.border = "none";
      el.style.borderBottom = "0";
      el.style.borderRadius = "0";
      el.style.padding = "10px 16px";
      el.style.fontSize = "10.5px";
      el.style.fontWeight = "700";
      el.style.cursor = "pointer";
      el.style.background = active ? th.p : "transparent";
      el.style.color = active ? "#fff" : th.txt;
      el.style.minHeight = "40px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.whiteSpace = "nowrap";
      el.style.boxShadow = "none";
      el.style.flexShrink = "0";
      el.style.lineHeight = "1.3";
      el.style.transition = "all 0.2s ease";
      el.style.outline = "none";
    };

    const restoreDashboard = () => {
      const panel = document.getElementById("assessoria-inline-panel");
      if (panel) panel.remove();
      hiddenNodes.forEach((display, node) => { node.style.display = display; });
      hiddenNodes.clear();
      if (tabEl) styleTab(tabEl, readCount(), false);
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
      if (!tabsEl || !mainEl) return;
      hideDashboardAfterTabs();
      styleTab(tabEl, readCount(), true);
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

    const inject = () => {
      if (!mounted || location.pathname !== "/") return;
      const buttons = Array.from(document.querySelectorAll("button"));
      const impacto = buttons.find(btn => (btn.textContent || "").includes("Impacto no Caixa"));
      const tabs = impacto?.parentElement;
      if (!tabs) return;
      tabsEl = tabs;
      mainEl = tabs.closest("main");

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
      tabEl = btn;
      styleTab(btn, readCount(), !!document.getElementById("assessoria-inline-panel"));
    };

    const handleTabClick = (event) => {
      const btn = event.target?.closest?.("button");
      if (!btn || btn.id === "tab-assessoria-interno") return;
      if (tabsEl && tabsEl.contains(btn)) restoreDashboard();
    };

    const interval = setInterval(inject, 600);
    const updateCount = () => { if (tabEl) styleTab(tabEl, readCount(), !!document.getElementById("assessoria-inline-panel")); };
    window.addEventListener("storage", updateCount);
    document.addEventListener("click", handleTabClick, true);
    inject();

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("storage", updateCount);
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
          {/* Add your page Route elements here */}
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