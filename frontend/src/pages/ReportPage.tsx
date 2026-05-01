import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getIssues, getReport, getCase } from "../api";
import type { Issue, Report, Case } from "../types";

export default function ReportPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const cId = Number(caseId);

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | "">(
    searchParams.get("issue") ? Number(searchParams.get("issue")) : ""
  );
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([getCase(cId), getIssues(cId)]).then(([c, iss]) => {
      setCaseData(c);
      setIssues(iss);
      if (selectedIssueId === "" && iss.length > 0) setSelectedIssueId(iss[0].id);
    });
  }, [cId]);

  useEffect(() => {
    if (selectedIssueId === "") return;
    setLoading(true);
    setSearchParams({ issue: String(selectedIssueId) });
    getReport(cId, Number(selectedIssueId))
      .then(setReport)
      .finally(() => setLoading(false));
  }, [selectedIssueId]);

  // Group passages by deposition
  const grouped: Record<string, Report["passages"]> = {};
  if (report) {
    for (const p of report.passages) {
      const key = `${p.deposition_id}:::${p.witness_name}:::${p.deposition_date}`;
      grouped[key] = grouped[key] ?? [];
      grouped[key].push(p);
    }
  }
  const groupKeys = Object.keys(grouped);

  const selectedIssue = issues.find(i => i.id === selectedIssueId);

  return (
    <main className="page">
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>
        {" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>
        {" · "}
        <span>Issue Report</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem" }}>Issue Report</h1>
        <select
          value={selectedIssueId}
          onChange={e => setSelectedIssueId(Number(e.target.value))}
          style={{ padding: ".45rem .75rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: ".9rem", fontFamily: "inherit" }}
        >
          {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>
          Print / Export PDF
        </button>
      </div>

      {/* Issue header */}
      {report && selectedIssue && (
        <div style={{
          borderLeft: `5px solid ${selectedIssue.color}`,
          paddingLeft: "1rem",
          marginBottom: "2rem",
        }}>
          <h2 style={{ color: selectedIssue.color, fontSize: "1.3rem" }}>{report.issue.name}</h2>
          {report.issue.description && <p style={{ color: "#555", marginTop: ".25rem" }}>{report.issue.description}</p>}
          <p style={{ color: "#888", fontSize: ".85rem", marginTop: ".4rem" }}>
            {report.passages.length} tagged passage{report.passages.length !== 1 ? "s" : ""}
            {" across "}
            {groupKeys.length} deposition{groupKeys.length !== 1 ? "s" : ""}
            {" · Generated "}{new Date().toLocaleDateString()}
          </p>
        </div>
      )}

      {loading && <p style={{ color: "#888", fontStyle: "italic" }}>Loading…</p>}

      {report && report.passages.length === 0 && (
        <p className="report-empty">
          No tagged testimony for this issue yet. Open a transcript to tag relevant exchanges.
        </p>
      )}

      {/* Depositions */}
      {report && groupKeys.map(key => {
        const [, witnessName, depoDate] = key.split(":::");
        const passages = grouped[key];
        const depId = passages[0].deposition_id;

        return (
          <div key={key} className="report-deposition">
            <div className="report-deposition-header">
              Deposition of {witnessName.toUpperCase()}
              {depoDate && ` · ${depoDate}`}
              <Link
                to={`/cases/${cId}/depositions/${depId}`}
                style={{ marginLeft: "1rem", color: "#aad", fontSize: ".82rem", fontWeight: "normal" }}
              >
                Open transcript ↗
              </Link>
            </div>

            {passages.map((passage, pi) => (
              <div
                key={passage.tag_id}
                className="report-passage"
                style={{ borderLeftColor: selectedIssue?.color ?? '#ccc', borderLeftWidth: 4 }}
              >
                {passage.note && (
                  <div className="report-passage-note">
                    <strong>Note:</strong> {passage.note}
                  </div>
                )}

                {/* Verbatim transcript lines — monospace, with line numbers */}
                <div className="report-verbatim">
                  {passage.segments.map(seg => {
                    if (seg.speaker === 'PAGE') {
                      return (
                        <div key={seg.id} className="report-page-label">{seg.text}</div>
                      );
                    }
                    return (
                      <div
                        key={seg.id}
                        className={`report-verbatim-line${seg.speaker === 'BLANK' ? ' blank' : ''}`}
                      >
                        <span className="report-line-no">
                          {seg.line_number != null ? seg.line_number : ''}
                        </span>
                        <span className="report-line-text">{seg.text || ''}</span>
                      </div>
                    );
                  })}
                </div>

                {pi < passages.length - 1 && (
                  <div style={{ borderTop: "1px dashed #ddd", margin: ".5rem 0" }} />
                )}
              </div>
            ))}
          </div>
        );
      })}

      {issues.length === 0 && (
        <p className="empty-state">
          No issues defined. <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> first.
        </p>
      )}
    </main>
  );
}
