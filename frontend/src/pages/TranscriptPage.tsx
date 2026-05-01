import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { getTags, createTag, deleteTag, getIssues, getDepositions, getCase, depositionFileUrl } from "../api";
import type { Tag, Issue, Case, Deposition, HighlightRect } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ── helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface PendingSelection {
  text: string;
  rects: HighlightRect[];
  buttonTop: number;   // viewport px
  buttonLeft: number;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TranscriptPage() {
  const { caseId, depId } = useParams<{ caseId: string; depId: string }>();
  const cId = Number(caseId);
  const dId = Number(depId);

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [deposition, setDeposition] = useState<Deposition | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  // PDF viewer state
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Selection / tagging state
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<number | "">("");
  const [tagNote, setTagNote] = useState("");
  const [tagError, setTagError] = useState("");

  // Sidebar filter
  const [filterIssueId, setFilterIssueId] = useState<number | "">("");

  const loadAll = useCallback(async () => {
    const [c, deps, tgs, iss] = await Promise.all([
      getCase(cId),
      getDepositions(cId),
      getTags(dId),
      getIssues(cId),
    ]);
    setCaseData(c);
    setDeposition(deps.find(d => d.id === dId) ?? null);
    setTags(tgs);
    setIssues(iss);
    if (iss.length > 0 && selectedIssueId === "") setSelectedIssueId(iss[0].id);
  }, [cId, dId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── text-selection capture ─────────────────────────────────────────────────

  const handleMouseUp = (pageIndex: number) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;

    const container = pageContainerRefs.current[pageIndex];
    if (!container) return;
    const cr = container.getBoundingClientRect();

    const range = sel.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
    if (clientRects.length === 0) return;

    // Normalize rects to 0–1 fractions of the page container
    const rects: HighlightRect[] = clientRects.map(r => ({
      x: (r.left - cr.left) / cr.width,
      y: (r.top - cr.top) / cr.height,
      w: r.width / cr.width,
      h: r.height / cr.height,
      pageIndex,
    }));

    // Position the floating Tag button just below the last rect
    const last = clientRects[clientRects.length - 1];
    setPending({ text, rects, buttonTop: last.bottom + 6, buttonLeft: last.left });
  };

  const clearPending = () => {
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  // ── tag save ───────────────────────────────────────────────────────────────

  const handleSaveTag = async () => {
    if (selectedIssueId === "" || !pending) { setTagError("Select an issue."); return; }
    try {
      await createTag(dId, Number(selectedIssueId), pending.text, JSON.stringify(pending.rects), tagNote.trim());
      setShowTagModal(false);
      setTagNote(""); setTagError("");
      clearPending();
      setTags(await getTags(dId));
    } catch (e: any) { setTagError(e.message); }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("Remove this highlight?")) return;
    await deleteTag(tagId);
    setTags(await getTags(dId));
  };

  // ── derived ────────────────────────────────────────────────────────────────

  const visibleTags = filterIssueId === "" ? tags : tags.filter(t => t.issue_id === filterIssueId);

  function highlightsForPage(pageIndex: number) {
    const result: Array<{ rect: HighlightRect; color: string; tagId: number }> = [];
    for (const tag of visibleTags) {
      let rects: HighlightRect[] = [];
      try { rects = JSON.parse(tag.rects_json); } catch { continue; }
      for (const r of rects) {
        if (r.pageIndex === pageIndex) result.push({ rect: r, color: tag.issue.color, tagId: tag.id });
      }
    }
    return result;
  }

  const isPdf = deposition?.filename?.toLowerCase().endsWith(".pdf") ?? false;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page" style={{ maxWidth: "1300px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>
        {" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>
        {" · "}
        <span>{deposition?.witness_name ?? "…"}</span>
      </div>

      <div className="page-header" style={{ marginBottom: "1rem" }}>
        <h1>{deposition ? `Deposition of ${deposition.witness_name}` : "Transcript"}</h1>
        {deposition?.deposition_date && <p>{deposition.deposition_date}</p>}
      </div>

      <div className="transcript-layout">
        {/* ── Left: issues + filter ── */}
        <div className="transcript-sidebar">
          <h3>Issues</h3>
          {issues.length === 0 ? (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
              <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> to tag testimony.
            </p>
          ) : issues.map(iss => (
            <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".45rem" }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: iss.color, flexShrink: 0, border: "1px solid rgba(0,0,0,.15)" }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600 }}>{iss.name}</span>
            </div>
          ))}

          {issues.length > 1 && (
            <>
              <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />
              <h3>Filter</h3>
              <select
                value={filterIssueId}
                onChange={e => setFilterIssueId(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: "100%", padding: ".35rem .5rem", fontSize: ".82rem", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value="">All highlights</option>
                {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
              </select>
            </>
          )}

          <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />
          <p style={{ fontSize: ".78rem", color: "#888", lineHeight: 1.5 }}>
            Select text in the document, then click <strong>Highlight</strong> to tag it to an issue.
          </p>
        </div>

        {/* ── Center: PDF / text viewer ── */}
        <div style={{ minWidth: 0 }}>
          {/* Zoom bar (PDF only) */}
          {isPdf && (
            <div className="pdf-zoombar">
              <button className="btn btn-ghost btn-sm" onClick={() => setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2)))}>−</button>
              <span style={{ fontSize: ".85rem", minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setScale(s => Math.min(3.0, +(s + 0.15).toFixed(2)))}>+</button>
              <span style={{ fontSize: ".8rem", color: "#999", marginLeft: ".5rem" }}>Select text to highlight</span>
            </div>
          )}

          <div className="pdf-scroll-area">
            {isPdf ? (
              <Document
                file={depositionFileUrl(dId)}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                onLoadError={err => console.error("PDF load error:", err)}
                loading={<p style={{ padding: "2rem", color: "#888" }}>Loading PDF…</p>}
                error={<p style={{ padding: "2rem", color: "#c00" }}>Could not load PDF. Try re-uploading the transcript.</p>}
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="pdf-page-wrapper">
                    {/* The ref container matches the rendered page size exactly */}
                    <div
                      ref={el => { pageContainerRefs.current[i] = el; }}
                      style={{ position: "relative", display: "inline-block", lineHeight: 0 }}
                      onMouseUp={() => handleMouseUp(i)}
                    >
                      <Page
                        pageNumber={i + 1}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                      />

                      {/* Highlight overlays — pointer-events:none so text selection still works */}
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        {highlightsForPage(i).map(({ rect, color, tagId }, ri) => (
                          <div
                            key={`${tagId}-${ri}`}
                            style={{
                              position: "absolute",
                              left: `${rect.x * 100}%`,
                              top: `${rect.y * 100}%`,
                              width: `${rect.w * 100}%`,
                              height: `${rect.h * 100}%`,
                              background: hexToRgba(color, 0.38),
                              mixBlendMode: "multiply",
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {numPages > 1 && (
                      <div className="pdf-page-num">Page {i + 1} of {numPages}</div>
                    )}
                  </div>
                ))}
              </Document>
            ) : (
              // Plain-text viewer
              <TxtViewer dId={dId} onMouseUp={handleMouseUp} />
            )}
          </div>
        </div>

        {/* ── Right: tags list ── */}
        <div className="transcript-sidebar">
          <h3>Highlights ({visibleTags.length})</h3>
          {visibleTags.length === 0 && (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
              No highlights yet.
            </p>
          )}
          {visibleTags.map(tag => (
            <div
              key={tag.id}
              className="tag-item"
              style={{ borderLeftColor: tag.issue.color, borderLeftWidth: 3 }}
            >
              <div className="tag-item-body">
                <div className="tag-item-label" style={{ color: tag.issue.color }}>{tag.issue.name}</div>
                <div className="tag-item-note" style={{ color: "#444", marginTop: ".2rem", fontSize: ".8rem" }}>
                  "{tag.selected_text.length > 120
                    ? tag.selected_text.slice(0, 120) + "…"
                    : tag.selected_text}"
                </div>
                {tag.note && <div className="tag-item-note" style={{ marginTop: ".3rem", color: "#888" }}>{tag.note}</div>}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: ".15rem .4rem", fontSize: ".75rem", alignSelf: "flex-start", flexShrink: 0 }}
                onClick={() => handleDeleteTag(tag.id)}
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Floating "Highlight" button ── */}
      {pending && !showTagModal && (
        <div
          style={{
            position: "fixed",
            top: pending.buttonTop,
            left: pending.buttonLeft,
            zIndex: 300,
            display: "flex",
            gap: ".4rem",
            background: "#1c2b3a",
            borderRadius: "6px",
            padding: ".35rem .5rem",
            boxShadow: "0 4px 16px rgba(0,0,0,.35)",
          }}
        >
          {issues.map(iss => (
            <button
              key={iss.id}
              title={`Tag as: ${iss.name}`}
              onClick={() => {
                setSelectedIssueId(iss.id);
                setTagNote("");
                setTagError("");
                setShowTagModal(true);
              }}
              style={{
                background: iss.color,
                border: "none",
                borderRadius: "4px",
                padding: ".3rem .65rem",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: ".78rem",
                color: "#000",
                opacity: .9,
              }}
            >
              {iss.name}
            </button>
          ))}
          <button
            onClick={clearPending}
            style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: ".85rem", padding: ".3rem" }}
          >✕</button>
        </div>
      )}

      {/* ── Tag modal ── */}
      {showTagModal && pending && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowTagModal(false); clearPending(); } }}>
          <div className="modal">
            <div className="modal-title">Highlight Testimony</div>

            <div style={{
              background: "#f9f9f7",
              border: "1px solid #ddd",
              borderRadius: "4px",
              padding: ".6rem .75rem",
              marginBottom: "1rem",
              fontSize: ".85rem",
              fontStyle: "italic",
              color: "#444",
              maxHeight: 120,
              overflow: "auto",
              lineHeight: 1.6,
            }}>
              "{pending.text}"
            </div>

            {tagError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{tagError}</p>}

            <div className="form-group">
              <label>Issue</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".3rem" }}>
                {issues.map(iss => (
                  <button
                    key={iss.id}
                    onClick={() => setSelectedIssueId(iss.id)}
                    style={{
                      padding: ".35rem .75rem",
                      borderRadius: "20px",
                      border: `2px solid ${iss.color}`,
                      background: selectedIssueId === iss.id ? iss.color : "transparent",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: ".82rem",
                      color: selectedIssueId === iss.id ? "#000" : "#333",
                    }}
                  >
                    {iss.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Note (optional)</label>
              <textarea
                value={tagNote}
                onChange={e => setTagNote(e.target.value)}
                placeholder="Why is this testimony relevant?"
                style={{ minHeight: 70 }}
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowTagModal(false); clearPending(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveTag}>Save Highlight</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Plain-text viewer (for .txt uploads) ─────────────────────────────────────

function TxtViewer({ dId, onMouseUp }: { dId: number; onMouseUp: (pageIndex: number) => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(depositionFileUrl(dId))
      .then(r => r.text())
      .then(setContent)
      .catch(() => setError("Could not load file."));
  }, [dId]);

  if (error) return <p style={{ color: "#c00", padding: "1rem" }}>{error}</p>;
  if (content === null) return <p style={{ padding: "1rem", color: "#888" }}>Loading…</p>;

  return (
    <div
      className="txt-viewer"
      onMouseUp={() => onMouseUp(0)}
    >
      <pre style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: ".875rem",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: "2rem",
        margin: 0,
        background: "#fff",
        color: "#1a1a1a",
      }}>
        {content}
      </pre>
    </div>
  );
}
