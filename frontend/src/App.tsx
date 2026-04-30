import { Routes, Route, Link } from "react-router-dom";
import CasesPage from "./pages/CasesPage";
import CaseDetailPage from "./pages/CaseDetailPage";
import TranscriptPage from "./pages/TranscriptPage";
import ReportPage from "./pages/ReportPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar-brand">⚖ Deposition Analyzer</Link>
      </header>
      <Routes>
        <Route path="/" element={<CasesPage />} />
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="/cases/:caseId/depositions/:depId" element={<TranscriptPage />} />
        <Route path="/cases/:caseId/report" element={<ReportPage />} />
      </Routes>
    </div>
  );
}
