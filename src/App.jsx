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

    const styleTab = (el, count) => {
      const dark = readTheme() === "dark";
      const txt = dark ? "#f0f0f0" : "#1a1a1a";
      const border = dark ? "#333" : "#ddd";

      el.innerHTML = `<span>⚖️ Assessoria</span>${count > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:999px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;padding:0 5px;margin-left:6px;">${count}</span>` : ""}`;
      el.style.position = "relative";
      el.style.border = "none";
      el.style.borderBottom = "3px solid transparent";
      el.style.borderRadius = "0";
      el.style.padding = "10px 16px";
      el.style.fontSize = "10.5px";
      el.style.fontWeight = "700";
      el.style.cursor = "pointer";
      el.style.background = "transparent";
      el.style.color = txt;
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
      el.style.borderColor = border;
    };

    const inject = () => {
      if (!mounted || location.pathname !== "/") return;
      const buttons = Array.from(document.querySelectorAll("button"));
      const impacto = buttons.find(btn => (btn.textContent || "").includes("Impacto no Caixa"));
      const tabs = impacto?.parentElement;
      if (!tabs) return;

      let btn = document.getElementById("tab-assessoria-interno");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "tab-assessoria-interno";
        btn.type = "button";
        btn.onclick = () => { window.location.hash = "/assessoria"; };
        tabs.appendChild(btn);
      }
      tabEl = btn;
      styleTab(btn, readCount());
    };

    const interval = setInterval(inject, 600);
    const updateCount = () => { if (tabEl) styleTab(tabEl, readCount()); };
    window.addEventListener("storage", updateCount);
    inject();

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("storage", updateCount);
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