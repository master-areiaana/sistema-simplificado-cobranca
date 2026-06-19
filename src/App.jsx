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
    let navToggleEl = null;
    const hiddenNodes = new Map();
    const tabStyleBackup = new Map();
    const NAV_KEY = "sc_nav_mode";

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

    const readNavMode = () => {
      try { return localStorage.getItem(NAV_KEY) || "top"; } catch { return "top"; }
    };

    const setNavMode = (mode) => {
      try { localStorage.setItem(NAV_KEY, mode); } catch {}
      applyNavMode();
    };

    const theme = () => {
      const dark = readTheme() === "dark";
      return {
        dark,
        bg: dark ? "#050505" : "#f5f5f5",
        surf: dark ? "#111" : "#fff",
        surf2: dark ? "#1f1f1f" : "#f3f4f6",
        bor: dark ? "#333" : "#ddd",
        txt: dark ? "#f0f0f0" : "#1a1a1a",
        p: "#E87722",
      };
    };

    const setImportant = (el, prop, value) => {
      el.style.setProperty(prop, value, "important");
    };

    const styleTab = (el, count, active = false) => {
      const th = theme();
      el.className = active ? "sc-assessoria-tab sc-assessoria-tab-active" : "sc-assessoria-tab";
      el.dataset.active = active ? "true" : "false";
      el.innerHTML = `<span>⚖️ Assessoria</span>${count > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:999px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;padding:0 5px;margin-left:6px;">${count}</span>` : ""}`;
      setImportant(el, "position", "relative");
      setImportant(el, "border", "none");
      setImportant(el, "border-bottom", `3px solid ${active ? th.p : "transparent"}`);
      setImportant(el, "border-radius", readNavMode() === "left" ? "8px" : "0");
      setImportant(el, "padding", "10px 16px");
      setImportant(el, "font-size", "10.5px");
      setImportant(el, "font-weight", "700");
      setImportant(el, "cursor", "pointer");
      setImportant(el, "background", active ? th.p : "transparent");
      setImportant(el, "background-color", active ? th.p : "transparent");
      setImportant(el, "color", active ? "#fff" : th.txt);
      setImportant(el, "min-height", "40px");
      setImportant(el, "display", "inline-flex");
      setImportant(el, "align-items", "center");
      setImportant(el, "justify-content", "center");
      setImportant(el, "white-space", "nowrap");
      setImportant(el, "box-shadow", active ? "0 0 0 1px rgba(232,119,34,.25)" : "none");
      setImportant(el, "flex-shrink", "0");
      setImportant(el, "line-height", "1.3");
      setImportant(el, "transition", "all 0.2s ease");
      setImportant(el, "outline", "none");
    };

    const styleNavToggle = () => {
      if (!navToggleEl) return;
      const th = theme();
      const mode = readNavMode();
      navToggleEl.textContent = mode === "left" ? "↔ Topo" : "☰ Lateral";
      navToggleEl.title = mode === "left" ? "Voltar categorias para o topo" : "Mover categorias para a lateral esquerda";
      navToggleEl.style.setProperty("background", th.surf2, "important");
      navToggleEl.style.setProperty("color", th.txt, "important");
      navToggleEl.style.setProperty("border", `1px solid ${th.bor}`, "important");
      navToggleEl.style.setProperty("border-radius", "8px", "important");
      navToggleEl.style.setProperty("padding", "8px 10px", "important");
      navToggleEl.style.setProperty("font-size", "11px", "important");
      navToggleEl.style.setProperty("font-weight", "800", "important");
      navToggleEl.style.setProperty("cursor", "pointer", "important");
      navToggleEl.style.setProperty("min-height", "34px", "important");
      navToggleEl.style.setProperty("white-space", "nowrap", "important");
      navToggleEl.style.setProperty("width", mode === "left" ? "100%" : "auto", "important");
      navToggleEl.style.setProperty("margin", mode === "left" ? "0 0 6px 0" : "0 0 0 auto", "important");
    };

    const ensureNavToggle = () => {
      if (!tabsEl) return;
      let btn = document.getElementById("sc-nav-mode-toggle");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "sc-nav-mode-toggle";
        btn.type = "button";
        btn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          setNavMode(readNavMode() === "left" ? "top" : "left");
        };
        tabsEl.insertBefore(btn, tabsEl.firstChild);
      }
      navToggleEl = btn;
      styleNavToggle();
    };

    const applyNavMode = () => {
      if (!tabsEl || !mainEl) return;
      const th = theme();
      const requested = readNavMode();
      const leftMode = requested === "left" && window.innerWidth >= 980;

      if (leftMode) {
        document.body.dataset.scNavMode = "left";
        mainEl.style.paddingLeft = "252px";
        tabsEl.style.setProperty("position", "fixed", "important");
        tabsEl.style.setProperty("top", "62px", "important");
        tabsEl.style.setProperty("left", "12px", "important");
        tabsEl.style.setProperty("bottom", "12px", "important");
        tabsEl.style.setProperty("width", "220px", "important");
        tabsEl.style.setProperty("z-index", "90", "important");
        tabsEl.style.setProperty("display", "flex", "important");
        tabsEl.style.setProperty("flex-direction", "column", "important");
        tabsEl.style.setProperty("align-items", "stretch", "important");
        tabsEl.style.setProperty("gap", "7px", "important");
        tabsEl.style.setProperty("overflow-x", "hidden", "important");
        tabsEl.style.setProperty("overflow-y", "auto", "important");
        tabsEl.style.setProperty("padding", "10px", "important");
        tabsEl.style.setProperty("margin", "0", "important");
        tabsEl.style.setProperty("border", `1px solid ${th.bor}`, "important");
        tabsEl.style.setProperty("border-radius", "12px", "important");
        tabsEl.style.setProperty("background", th.surf, "important");
        tabsEl.style.setProperty("box-shadow", "0 10px 26px rgba(0,0,0,.18)", "important");
        Array.from(tabsEl.querySelectorAll("button")).forEach((btn) => {
          btn.style.setProperty("width", "100%", "important");
          btn.style.setProperty("justify-content", "flex-start", "important");
          btn.style.setProperty("border-radius", "8px", "important");
          btn.style.setProperty("text-align", "left", "important");
          btn.style.setProperty("min-height", "38px", "important");
        });
      } else {
        document.body.dataset.scNavMode = "top";
        mainEl.style.paddingLeft = "";
        tabsEl.style.setProperty("position", "", "important");
        tabsEl.style.setProperty("top", "", "important");
        tabsEl.style.setProperty("left", "", "important");
        tabsEl.style.setProperty("bottom", "", "important");
        tabsEl.style.setProperty("width", "", "important");
        tabsEl.style.setProperty("z-index", "", "important");
        tabsEl.style.setProperty("display", "flex", "important");
        tabsEl.style.setProperty("flex-direction", "row", "important");
        tabsEl.style.setProperty("align-items", "stretch", "important");
        tabsEl.style.setProperty("gap", "8px", "important");
        tabsEl.style.setProperty("overflow-x", "auto", "important");
        tabsEl.style.setProperty("overflow-y", "hidden", "important");
        tabsEl.style.setProperty("padding", "8px 0 8px 0", "important");
        tabsEl.style.setProperty("margin", "0 0 14px 0", "important");
        tabsEl.style.setProperty("border", "0", "important");
        tabsEl.style.setProperty("border-bottom", `1px solid ${th.bor}`, "important");
        tabsEl.style.setProperty("border-radius", "0", "important");
        tabsEl.style.setProperty("background", "transparent", "important");
        tabsEl.style.setProperty("box-shadow", "none", "important");
        Array.from(tabsEl.querySelectorAll("button")).forEach((btn) => {
          btn.style.removeProperty("width");
          btn.style.removeProperty("text-align");
          btn.style.setProperty("justify-content", "center", "important");
          if (btn.id !== "sc-nav-mode-toggle") btn.style.setProperty("border-radius", "0", "important");
        });
      }
      styleNavToggle();
      if (tabEl) styleTab(tabEl, readCount(), !!document.getElementById("assessoria-inline-panel"));
    };

    const backupAndDeactivateOtherTabs = () => {
      if (!tabsEl) return;
      const th = theme();
      Array.from(tabsEl.querySelectorAll("button")).forEach((btn) => {
        if (btn.id === "tab-assessoria-interno" || btn.id === "sc-nav-mode-toggle") return;
        if (!tabStyleBackup.has(btn)) tabStyleBackup.set(btn, btn.getAttribute("style") || "");
        btn.style.setProperty("background", "transparent", "important");
        btn.style.setProperty("background-color", "transparent", "important");
        btn.style.setProperty("color", th.txt, "important");
        btn.style.setProperty("box-shadow", "none", "important");
        btn.style.setProperty("border-bottom", "3px solid transparent", "important");
      });
    };

    const restoreOtherTabs = () => {
      tabStyleBackup.forEach((style, btn) => {
        if (style) btn.setAttribute("style", style);
        else btn.removeAttribute("style");
      });
      tabStyleBackup.clear();
    };

    const restoreDashboard = () => {
      const panel = document.getElementById("assessoria-inline-panel");
      if (panel) panel.remove();
      hiddenNodes.forEach((display, node) => { node.style.display = display; });
      hiddenNodes.clear();
      restoreOtherTabs();
      if (tabEl) styleTab(tabEl, readCount(), false);
      applyNavMode();
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
      backupAndDeactivateOtherTabs();
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
      applyNavMode();
    };

    const inject = () => {
      if (!mounted || location.pathname !== "/") return;
      const buttons = Array.from(document.querySelectorAll("button"));
      const impacto = buttons.find(btn => (btn.textContent || "").includes("Impacto no Caixa"));
      const tabs = impacto?.parentElement;
      if (!tabs) return;
      tabsEl = tabs;
      mainEl = tabs.closest("main");

      ensureNavToggle();

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
      const active = !!document.getElementById("assessoria-inline-panel");
      if (active) backupAndDeactivateOtherTabs();
      styleTab(btn, readCount(), active);
      applyNavMode();
    };

    const handleTabClick = (event) => {
      const btn = event.target?.closest?.("button");
      if (!btn || btn.id === "tab-assessoria-interno" || btn.id === "sc-nav-mode-toggle") return;
      if (tabsEl && tabsEl.contains(btn)) restoreDashboard();
    };

    const interval = setInterval(inject, 600);
    const updateCount = () => { if (tabEl) styleTab(tabEl, readCount(), !!document.getElementById("assessoria-inline-panel")); applyNavMode(); };
    const resize = () => applyNavMode();
    window.addEventListener("storage", updateCount);
    window.addEventListener("resize", resize);
    document.addEventListener("click", handleTabClick, true);
    inject();

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("resize", resize);
      document.removeEventListener("click", handleTabClick, true);
      restoreDashboard();
      const btn = document.getElementById("tab-assessoria-interno");
      if (btn) btn.remove();
      const toggle = document.getElementById("sc-nav-mode-toggle");
      if (toggle) toggle.remove();
      if (mainEl) mainEl.style.paddingLeft = "";
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