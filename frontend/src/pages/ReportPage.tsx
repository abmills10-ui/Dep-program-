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
    <main className="page" style={{ maxWidth: 860 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>
        {" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>
        {" · "}
        <span>Issue Report</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", whiteSpace: "nowrap" }}>Issue Report</h1>
        <select
          value={selectedIssueId}
          onChange={e => setSelectedIssueId(Number(e.target.value))}
          style={{ padding: ".45rem .75rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: ".9rem", fontFamily: "inherit" }}
        >
          {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      {/* Issue summary bar */}
      {report && selectedIssue && (
        <div style={{
          borderLeft: `5px solid ${selectedIssue.color}`,
          paddingLeft: "1rem",
          marginBottom: "2rem",
          background: "#fff",
          border: `1px solid ${selectedIssue.color}`,
          borderLeftWidth: 5,
          borderRadius: "0 6px 6px 0",
          padding: ".75rem 1rem",
        }}>
          <div style={{ fontWeight: "bold", fontSize: "1.1rem", color: selectedIssue.color }}>
            {report.issue.name}
          </div>
          {report.issue.description && (
            <div style={{ color: "#555", fontSize: ".88rem", marginTop: ".2rem" }}>{report.issue.description}</div>
          )}
          <div style={{ color: "#999", fontSize: ".82rem", marginTop: ".4rem" }}>
            {report.passages.length} passage{report.passages.length !== 1 ? "s" : ""}
            {" across "}
            {groupKeys.length} deposition{groupKeys.length !== 1 ? "s" : ""}
            {" · Generated "}{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      )}

      {loading && <p style={{ color: "#888", fontStyle: "italic" }}>Loading…</p>}

      {report && report.passages.length === 0 && (
        <p style={{ color: "#999", fontStyle: "italic", textAlign: "center", padding: "3rem 0" }}>
          No highlighted testimony for this issue yet. Open a transcript and select text to tag it.
        </p>
      )}

      {/* Passages grouped by deposition */}
      {report && groupKeys.map(key => {
        const [, witnessName, depoDate] = key.split(":::");
        const passages = grouped[key];
        const depId = passages[0].deposition_id;

        return (
          <div key={key} style={{ marginBottom: "2.5rem" }}>
            {/* Deposition header */}
            <div style={{
              background: "#1c2b3a",
              color: "#fff",
              padding: ".55rem 1rem",
              borderRadius: "4px 4px 0 0",
              fontWeight: "bold",
              fontSize: ".9rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>
                Deposition of {witnessName.toUpperCase()}
                {depoDate && <span style={{ fontWeight: "normal", marginLeft: ".75rem", color: "#aad" }}>{depoDate}</span>}
              </span>
              <Link
                to={`/cases/${cId}/depositions/${depId}`}
                style={{ color: "#7ab3e0", fontSize: ".8rem", fontWeight: "normal" }}
              >
                Open transcript ↗
              </Link>
            </div>

            {/* Passages */}
            <div style={{ border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 4px 4px", overflow: "hidden" }}>
              {passages.map((passage, pi) => (
                <div key={passage.tag_id}>
                  {pi > 0 && <div style={{ height: 1, background: "#eee" }} />}

                  {/* Issue color tab + testimony */}
                  <div style={{ display: "flex" }}>
                    <div style={{ width: 4, flexShrink: 0, background: selectedIssue?.color ?? "#ccc" }} />
                    <div style={{ flex: 1, padding: "1rem 1.25rem" }}>

                      {/* Optional note */}
                      {passage.note && (
                        <div style={{
                          background: "#fffbeb",
                          border: "1px solid #fde68a",
                          borderRadius: "4px",
                          padding: ".4rem .75rem",
                          fontSize: ".82rem",
                          color: "#92400e",
                          marginBottom: ".75rem",
                        }}>
                          <strong>Note:</strong> {passage.note}
                        </div>
                      )}

                      {/* Verbatim highlighted text */}
                      <div style={{
                        fontFamily: "'Georgia', serif",
                        fontSize: ".95rem",
                        lineHeight: 1.75,
                        color: "#1a1a1a",
                        whiteSpace: "pre-wrap",
                        background: selectedIssue ? `${selectedIssue.color}22` : "#fffde7",
                        borderRadius: "3px",
                        padding: ".6rem .85rem",
                      }}>
                        {passage.selected_text}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {issues.length === 0 && (
        <p style={{ color: "#999", fontStyle: "italic", textAlign: "center", padding: "3rem 0" }}>
          No issues defined. <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> first.
        </p>
      )}
    </main>
  );
}
