import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
// Add page imports here
import Dashboard from './pages/Dashboard';
import Assessoria from './pages/AssessoriaCentralLite';

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

    const styleTab = (el, count) => {
      el.textContent = `⚖️ Assessoria${count > 0 ? ` 🔴 ${count}` : ""}`;
      el.style.border = "none";
      el.style.borderRadius = "0";
      el.style.padding = "10px 16px";
      el.style.fontSize = "12px";
      el.style.fontWeight = "800";
      el.style.cursor = "pointer";
      el.style.background = count > 0 ? "#ef4444" : "#f97316";
      el.style.color = "#fff";
      el.style.minHeight = "40px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.whiteSpace = "nowrap";
      el.style.boxShadow = "none";
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
        btn.onclick = () => { window.location.href = "/assessoria"; };
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
        <AssessoriaTabInjector />
        <Routes>
          {/* Add your page Route elements here */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/assessoria" element={<Assessoria />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App