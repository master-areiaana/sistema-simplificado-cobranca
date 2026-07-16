import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { HashRouter as Router, Route, Routes } from "react-router-dom";
import { queryClientInstance } from "@/lib/query-client";
import PageNotFound from "./lib/PageNotFound";
import Dashboard from "./pages/Dashboard";
import AssessoriaHub from "./pages/AssessoriaHub";
import CorrecoesGlobais from "./components/cobranca/CorrecoesGlobais";
import { DataModeIndicator, DataModeProvider } from "./contexts/DataModeContext";

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <DataModeProvider>
        <DataModeIndicator />
        <Router>
          <CorrecoesGlobais />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assessoria" element={<AssessoriaHub />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
      </DataModeProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
