import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getIssues, getReport, getCase } from "../api";
import type { Issue, Report, Case, HighlightRect } from "../types";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      title={copied ? "Copied!" : "Copy"}
      style={{
        position: "absolute", top: ".45rem", right: ".45rem",
        background: copied ? "#e8f5e9" : "rgba(255,255,255,0.92)",
        border: "1px solid #ddd", borderRadius: "5px",
        padding: ".2rem .45rem", cursor: "pointer",
        display: "flex", alignItems: "center", gap: ".3rem",
        fontSize: ".73rem", color: copied ? "#2e7d32" : "#666",
        transition: "color .15s, background .15s",
        boxShadow: "0 1px 3px rgba(0,0,0,.08)",
      }}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function buildCitation(witnessName: string, depoDate: string, selectedText: string, rectsJson: string): string {
  const lastName = witnessName.trim().split(/\s+/).pop() ?? witnessName;

  let dateStr = "";
  if (depoDate) {
    const d = new Date(depoDate.includes("T") ? depoDate : depoDate + "T12:00:00");
    if (!isNaN(d.getTime())) {
      const raw = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      dateStr = raw.replace(/^(\w{3}) /, "$1. ");
    } else {
      dateStr = depoDate;
    }
  }

  let rects: HighlightRect[] = [];
  try { rects = JSON.parse(rectsJson); } catch { /* ignore */ }
  const startPage = rects.length > 0 ? rects[0].pageIndex + 1 : null;
  const endPage   = rects.length > 0 ? rects[rects.length - 1].pageIndex + 1 : null;

  const lines = selectedText.split("\n").map(l => l.trim()).filter(Boolean);
  const startLine = parseInt(lines[0]?.match(/^(\d+)/)?.[1] ?? "0") || null;
  const endLine   = parseInt(lines[lines.length - 1]?.match(/^(\d+)/)?.[1] ?? "0") || null;

  let pageRange = "";
  if (startPage !== null && endPage !== null) {
    if (startPage === endPage) {
      pageRange = startLine && endLine ? `${startPage}:${startLine}-${endLine}` : `${startPage}`;
    } else {
      pageRange = startLine && endLine ? `${startPage}:${startLine}-${endPage}:${endLine}` : `${startPage}-${endPage}`;
    }
  }

  return [lastName, dateStr, "Dep. Tr.", pageRange].filter(Boolean).join(" ");
}

async function fetchProposition(witnessName: string, selectedText: string, citation: string): Promise<string> {
  const res = await fetch("/api/proposition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ witness_name: witnessName, selected_text: selectedText, citation }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to generate proposition");
  }
  const data = await res.json();
  return data.parenthetical as string;
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

  // AI proposition state
  const [showPropositions, setShowPropositions] = useState(false);
  const [propositions, setPropositions] = useState<Record<number, string | "loading" | "error">>({});
  const fetchingRef = useRef(false);

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
    setPropositions({});
    setShowPropositions(false);
    getReport(cId, Number(selectedIssueId))
      .then(setReport)
      .finally(() => setLoading(false));
  }, [selectedIssueId]);

  const loadPropositions = async (r: Report) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setShowPropositions(true);

    // Kick off all in parallel
    const fetches = r.passages.map(async p => {
      setPropositions(prev => ({ ...prev, [p.tag_id]: "loading" }));
      try {
        const citation = buildCitation(p.witness_name, p.deposition_date, p.selected_text, p.rects_json);
        const text = await fetchProposition(p.witness_name, p.selected_text, citation);
        setPropositions(prev => ({ ...prev, [p.tag_id]: text }));
      } catch {
        setPropositions(prev => ({ ...prev, [p.tag_id]: "error" }));
      }
    });
    await Promise.all(fetches);
    fetchingRef.current = false;
  };

  const togglePropositions = () => {
    if (!report) return;
    if (showPropositions) {
      setShowPropositions(false);
    } else {
      loadPropositions(report);
    }
  };

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
    <main className="page" style={{ maxWidth: showPropositions ? 1200 : 860 }}>
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

        {report && report.passages.length > 0 && (
          <button
            className={`btn ${showPropositions ? "btn-primary" : "btn-ghost"}`}
            onClick={togglePropositions}
            title="Generate AI propositions for each passage"
          >
            {showPropositions ? "Hide AI propositions" : "Show AI propositions"}
          </button>
        )}

        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      {/* Issue summary bar */}
      {report && selectedIssue && (
        <div style={{
          background: "#fff",
          border: `1px solid ${selectedIssue.color}`,
          borderLeftWidth: 5,
          borderRadius: "0 6px 6px 0",
          padding: ".75rem 1rem",
          marginBottom: "2rem",
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
              background: "#1c2b3a", color: "#fff",
              padding: ".55rem 1rem", borderRadius: "4px 4px 0 0",
              fontWeight: "bold", fontSize: ".9rem",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>
                Deposition of {witnessName.toUpperCase()}
                {depoDate && <span style={{ fontWeight: "normal", marginLeft: ".75rem", color: "#aad" }}>{depoDate}</span>}
              </span>
              <Link to={`/cases/${cId}/depositions/${depId}`} style={{ color: "#7ab3e0", fontSize: ".8rem", fontWeight: "normal" }}>
                Open transcript ↗
              </Link>
            </div>

            {/* Passages */}
            <div style={{ border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 4px 4px", overflow: "hidden" }}>
              {passages.map((passage, pi) => {
                const citation = buildCitation(passage.witness_name, passage.deposition_date, passage.selected_text, passage.rects_json);
                const prop = propositions[passage.tag_id];

                return (
                  <div key={passage.tag_id}>
                    {pi > 0 && <div style={{ height: 1, background: "#eee" }} />}

                    <div style={{ display: "flex" }}>
                      {/* Issue color tab */}
                      <div style={{ width: 4, flexShrink: 0, background: selectedIssue?.color ?? "#ccc" }} />

                      <div style={{ flex: 1, padding: "1rem 1.25rem" }}>
                        {/* Optional note */}
                        {passage.note && (
                          <div style={{
                            background: "#fffbeb", border: "1px solid #fde68a",
                            borderRadius: "4px", padding: ".4rem .75rem",
                            fontSize: ".82rem", color: "#92400e", marginBottom: ".75rem",
                          }}>
                            <strong>Note:</strong> {passage.note}
                          </div>
                        )}

                        {/* Two-column layout when propositions are shown */}
                        <div style={{
                          display: showPropositions ? "grid" : "block",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1.25rem",
                          alignItems: "start",
                        }}>
                          {/* Left: verbatim testimony */}
                          <div>
                            {citation && (
                              <div style={{ fontFamily: "'Georgia', serif", fontStyle: "italic", fontSize: ".82rem", color: "#666", marginBottom: ".4rem" }}>
                                {citation}
                              </div>
                            )}
                            <div style={{ position: "relative" }}>
                              <div style={{
                                fontFamily: "'Courier New', Courier, monospace",
                                fontSize: ".88rem", lineHeight: 1.65, color: "#1a1a1a",
                                whiteSpace: "pre-wrap",
                                background: selectedIssue ? `${selectedIssue.color}18` : "#fffde7",
                                borderLeft: `3px solid ${selectedIssue?.color ?? "#ccc"}`,
                                borderRadius: "0 3px 3px 0",
                                padding: ".65rem 2.5rem .65rem 1rem",
                              }}>
                                {passage.selected_text}
                              </div>
                              <CopyButton text={passage.selected_text} />
                            </div>
                          </div>

                          {/* Right: AI proposition (only when toggled) */}
                          {showPropositions && (
                            <div style={{ position: "relative" }}>
                              <div style={{
                                background: "#f8f9fc",
                                border: "1px solid #dde",
                                borderRadius: "4px",
                                padding: ".75rem 2.5rem .75rem 1rem",
                                fontSize: ".88rem",
                                lineHeight: 1.65,
                                color: "#1a1a1a",
                                minHeight: "3rem",
                              }}>
                                <div style={{ fontSize: ".73rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#888", marginBottom: ".5rem" }}>
                                  Proposition
                                </div>
                                {prop === "loading" && (
                                  <span style={{ color: "#aaa", fontStyle: "italic" }}>Generating…</span>
                                )}
                                {prop === "error" && (
                                  <span style={{ color: "#c00", fontStyle: "italic" }}>Could not generate — is ANTHROPIC_API_KEY set?</span>
                                )}
                                {prop && prop !== "loading" && prop !== "error" && (
                                  <span style={{ fontFamily: "'Georgia', serif" }}>
                                    <span style={{ color: "#555" }}>{citation} (</span>
                                    {prop}
                                    <span style={{ color: "#555" }}>)</span>
                                  </span>
                                )}
                              </div>
                              {prop && prop !== "loading" && prop !== "error" && (
                                <CopyButton text={`${citation} (${prop})`} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
