import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
// Add page imports here
import Dashboard from './pages/Dashboard';
import Assessoria from './pages/Assessoria';

function AcessoAssessoria() {
  const location = useLocation();
  const isAssessoria = location.pathname === "/assessoria";

  return (
    <div style={{ position: "fixed", top: 74, right: 24, zIndex: 9999, display: "flex", gap: 8 }}>
      <Link
        to={isAssessoria ? "/" : "/assessoria"}
        style={{
          background: isAssessoria ? "#111827" : "#f97316",
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
        {isAssessoria ? "← Sistema Interno" : "⚖️ Assessoria"}
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