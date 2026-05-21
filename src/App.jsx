import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PageNotFound from './lib/PageNotFound';
// Add page imports here
import Dashboard from './pages/Dashboard';
import Assessoria from './pages/Assessoria';

function AcessoAssessoria() {
  const location = useLocation();
  const isAssessoria = location.pathname === "/assessoria";
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const readCount = () => {
      try {
        const count = Number(localStorage.getItem("sc_assessoria_unread_count") || "0");
        setPendentes(Number.isFinite(count) ? count : 0);
      } catch {
        setPendentes(0);
      }
    };
    readCount();
    const id = setInterval(readCount, 2500);
    window.addEventListener("storage", readCount);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", readCount);
    };
  }, []);

  const label = isAssessoria ? "← Sistema Interno" : `⚖️ Assessoria${pendentes > 0 ? ` 🔴 ${pendentes}` : ""}`;

  return (
    <div style={{ position: "fixed", top: 74, right: 24, zIndex: 9999, display: "flex", gap: 8 }}>
      <Link
        to={isAssessoria ? "/" : "/assessoria"}
        style={{
          background: isAssessoria ? "#111827" : pendentes > 0 ? "#ef4444" : "#f97316",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 800,
          boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          border: "1px solid rgba(255,255,255,.35)"
        }}
        title={isAssessoria ? "Voltar para o sistema interno" : "Acessar aba/portal da assessoria"}
      >
        {label}
      </Link>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AcessoAssessoria />
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