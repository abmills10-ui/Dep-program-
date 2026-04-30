import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getIssues, getReport, getCase } from "../api";
import type { Issue, Report, Case } from "../types";

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

  return (
    <main className="page">
      {/* Breadcrumb */}
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>
        {" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>
        {" · "}
        <span>Issue Report</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem" }}>Issue Report</h1>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <select
            value={selectedIssueId}
            onChange={e => setSelectedIssueId(Number(e.target.value))}
            style={{ padding: ".45rem .75rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: ".9rem", fontFamily: "inherit" }}
          >
            {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost print-btn" onClick={() => window.print()}>Print / Export PDF</button>
      </div>

      {report && (
        <div className="report-header" style={{ borderLeftColor: report.issue.color, borderLeftWidth: 4, borderLeftStyle: "solid", paddingLeft: "1rem" }}>
          <h1 style={{ color: report.issue.color }}>{report.issue.name}</h1>
          {report.issue.description && <p>{report.issue.description}</p>}
          <p style={{ marginTop: ".4rem" }}>
            {report.passages.length} tagged passage{report.passages.length !== 1 ? "s" : ""}
            {" across "}
            {groupKeys.length} deposition{groupKeys.length !== 1 ? "s" : ""}
            {" · "}
            Generated {new Date().toLocaleDateString()}
          </p>
        </div>
      )}

      {loading && <p style={{ color: "#888", fontStyle: "italic" }}>Loading…</p>}

      {report && report.passages.length === 0 && (
        <p className="report-empty">No tagged testimony for this issue yet. Open a transcript to tag relevant exchanges.</p>
      )}

      {report && groupKeys.map(key => {
        const [, witnessName, depoDate] = key.split(":::");
        const passages = grouped[key];
        const depId = passages[0].deposition_id;
        return (
          <div key={key} className="report-deposition">
            <div className="report-deposition-header">
              Deposition of {witnessName}
              {depoDate && ` · ${depoDate}`}
              <Link
                to={`/cases/${cId}/depositions/${depId}`}
                style={{ marginLeft: "1rem", color: "#aad", fontSize: ".82rem", fontWeight: "normal" }}
              >
                Open transcript ↗
              </Link>
            </div>

            {passages.map(passage => (
              <div
                key={passage.tag_id}
                className="report-passage"
                style={{ borderColor: report.issue.color, borderLeftWidth: 3 }}
              >
                {passage.note && (
                  <div className="report-passage-note">Note: {passage.note}</div>
                )}
                {passage.segments
                  .filter(s => s.speaker === "Q" || s.speaker === "A")
                  .map(seg => (
                    <div
                      key={seg.id}
                      className="report-segment"
                      style={{ background: seg.speaker === "A" ? hexToRgba(report.issue.color, 0.06) : undefined }}
                    >
                      <span className={`report-segment-speaker ${seg.speaker}`}>{seg.speaker}.</span>
                      <span className="report-segment-text">{seg.text}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        );
      })}

      {issues.length === 0 && (
        <p className="empty-state">
          No issues defined for this case. <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> first.
        </p>
      )}
    </main>
  );
}
