import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import {
  getTags, createTag, deleteTag, getIssues,
  getDepositions, getCase, depositionFileUrl,
} from "../api";
import type { Tag, Issue, Case, Deposition, HighlightRect } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface LinePoint {
  pageIndex: number;
  topFrac: number;
  bottomFrac: number;
}

interface PendingSelection {
  text: string;
  rects: HighlightRect[];
  buttonX: number;
  buttonY: number;
}

// ── line detection helpers ────────────────────────────────────────────────────

function findLineAtClientY(container: HTMLElement, clientY: number): { topFrac: number; bottomFrac: number } | null {
  const cr = container.getBoundingClientRect();
  const clickY = clientY - cr.top;
  const textLayer = container.querySelector(".textLayer");
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll("span"))
    .filter(s => s.textContent?.trim());
  if (spans.length === 0) return null;

  // Find the span whose vertical center is closest to the click
  let best: Element | null = null;
  let bestDist = Infinity;
  for (const s of spans) {
    const r = s.getBoundingClientRect();
    const cy = (r.top + r.bottom) / 2 - cr.top;
    const d = Math.abs(clickY - cy);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  if (!best) return null;

  const bestR = best.getBoundingClientRect();
  const lineCY = (bestR.top + bestR.bottom) / 2 - cr.top;
  const lineH = bestR.height;

  // Collect all spans on the same visual line
  const lineSpans = spans.filter(s => {
    const r = s.getBoundingClientRect();
    const cy = (r.top + r.bottom) / 2 - cr.top;
    return Math.abs(cy - lineCY) < lineH * 0.7;
  });

  const tops    = lineSpans.map(s => s.getBoundingClientRect().top    - cr.top);
  const bottoms = lineSpans.map(s => s.getBoundingClientRect().bottom - cr.top);
  return {
    topFrac:    Math.min(...tops)    / cr.height,
    bottomFrac: Math.max(...bottoms) / cr.height,
  };
}

function extractRange(
  container: HTMLElement,
  pageIndex: number,
  minTopFrac: number,
  maxBottomFrac: number,
): { text: string; rects: HighlightRect[] } | null {
  const cr = container.getBoundingClientRect();
  const minPx = minTopFrac    * cr.height;
  const maxPx = maxBottomFrac * cr.height;

  const textLayer = container.querySelector(".textLayer");
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll("span"))
    .filter(s => s.textContent?.trim());

  const inRange = spans.filter(s => {
    const r = s.getBoundingClientRect();
    const cy = (r.top + r.bottom) / 2 - cr.top;
    return cy >= minPx - 2 && cy <= maxPx + 2;
  });
  if (inRange.length === 0) return null;

  // Sort top-to-bottom, left-to-right
  inRange.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dy = ra.top - rb.top;
    return Math.abs(dy) > 3 ? dy : ra.left - rb.left;
  });

  // Group spans by visual line, preserving line structure
  const lineMap = new Map<number, { top: number; bottom: number; spans: Element[] }>();
  for (const s of inRange) {
    const r = s.getBoundingClientRect();
    const topFrac    = (r.top    - cr.top) / cr.height;
    const bottomFrac = (r.bottom - cr.top) / cr.height;
    const key = Math.round(topFrac * 300) / 300;
    const ex = lineMap.get(key);
    lineMap.set(key, ex
      ? { top: Math.min(ex.top, topFrac), bottom: Math.max(ex.bottom, bottomFrac), spans: [...ex.spans, s] }
      : { top: topFrac, bottom: bottomFrac, spans: [s] });
  }

  const sortedLines = Array.from(lineMap.entries()).sort(([a], [b]) => a - b);

  // Join spans within a line with spaces, join lines with newlines
  const text = sortedLines
    .map(([, { spans }]) => spans.map(s => s.textContent ?? "").join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  const rects: HighlightRect[] = sortedLines.map(([, { top, bottom }]) => ({
    x: 0, y: top, w: 1, h: bottom - top, pageIndex,
  }));

  return { text, rects };
}

function extractRangeMultiPage(
  pageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>,
  startPageIndex: number,
  startTopFrac: number,
  endPageIndex: number,
  endBottomFrac: number,
): { text: string; rects: HighlightRect[] } | null {
  const allText: string[] = [];
  const allRects: HighlightRect[] = [];

  for (let pi = startPageIndex; pi <= endPageIndex; pi++) {
    const container = pageRefs.current[pi];
    if (!container) continue;
    const minFrac = pi === startPageIndex ? startTopFrac : 0;
    const maxFrac = pi === endPageIndex   ? endBottomFrac : 1;
    const result = extractRange(container, pi, minFrac, maxFrac);
    if (result) {
      if (result.text) allText.push(result.text);
      allRects.push(...result.rects);
    }
  }

  if (allText.length === 0) return null;
  return { text: allText.join("\n"), rects: allRects };
}


export default function TranscriptPage() {
  const { caseId, depId } = useParams<{ caseId: string; depId: string }>();
  const cId = Number(caseId);
  const dId = Number(depId);

  const [caseData, setCaseData]     = useState<Case | null>(null);
  const [deposition, setDeposition] = useState<Deposition | null>(null);
  const [tags, setTags]             = useState<Tag[]>([]);
  const [issues, setIssues]         = useState<Issue[]>([]);
  const [numPages, setNumPages]     = useState(0);
  const [scale, setScale]           = useState(1.2);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Line-click selection state
  const [clickStart, setClickStart] = useState<LinePoint | null>(null);
  const [hoverLine, setHoverLine]   = useState<LinePoint | null>(null);
  const [pending, setPending]       = useState<PendingSelection | null>(null);

  // Tag modal
  const [showTagModal, setShowTagModal]         = useState(false);
  const [selectedIssueId, setSelectedIssueId]   = useState<number | "">("");
  const [tagNote, setTagNote]                   = useState("");
  const [tagError, setTagError]                 = useState("");

  // Sidebar filter
  const [filterIssueId, setFilterIssueId] = useState<number | "">("");

  const loadAll = useCallback(async () => {
    const [c, deps, tgs, iss] = await Promise.all([
      getCase(cId), getDepositions(cId), getTags(dId), getIssues(cId),
    ]);
    setCaseData(c);
    setDeposition(deps.find(d => d.id === dId) ?? null);
    setTags(tgs);
    setIssues(iss);
    if (iss.length > 0 && selectedIssueId === "") setSelectedIssueId(iss[0].id);
  }, [cId, dId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── click handlers ────────────────────────────────────────────────────────

  const handlePageClick = (e: React.MouseEvent, pageIndex: number) => {
    if (pending) {
      setPending(null); setClickStart(null); setHoverLine(null);
    }

    const container = pageRefs.current[pageIndex];
    if (!container) return;
    const line = findLineAtClientY(container, e.clientY);
    if (!line) return;

    if (!clickStart) {
      // First click — mark start
      setClickStart({ pageIndex, ...line });
      setHoverLine(null);
    } else {
      // Second click — finalize selection (same page or cross-page)
      let result: { text: string; rects: HighlightRect[] } | null = null;

      if (clickStart.pageIndex === pageIndex) {
        const minTop    = Math.min(clickStart.topFrac,    line.topFrac);
        const maxBottom = Math.max(clickStart.bottomFrac, line.bottomFrac);
        result = extractRange(container, pageIndex, minTop, maxBottom);
      } else {
        // Determine reading order (allow clicking end before start)
        const [sp, sFrac, ep, eFrac] = clickStart.pageIndex < pageIndex
          ? [clickStart.pageIndex, clickStart.topFrac, pageIndex, line.bottomFrac]
          : [pageIndex, line.topFrac, clickStart.pageIndex, clickStart.bottomFrac];
        result = extractRangeMultiPage(pageRefs, sp, sFrac, ep, eFrac);
      }

      if (result && result.text) {
        setPending({ ...result, buttonX: e.clientX, buttonY: e.clientY + 10 });
      }
      setClickStart(null); setHoverLine(null);
    }
  };

  const handlePageMouseMove = (e: React.MouseEvent, pageIndex: number) => {
    if (!clickStart) return;
    const container = pageRefs.current[pageIndex];
    if (!container) return;
    const line = findLineAtClientY(container, e.clientY);
    setHoverLine(line ? { pageIndex, ...line } : null);
  };

  const clearAll = () => {
    setPending(null); setClickStart(null); setHoverLine(null);
  };

  // ── tag save ──────────────────────────────────────────────────────────────

  const handleSaveTag = async () => {
    if (selectedIssueId === "" || !pending) { setTagError("Select an issue."); return; }
    try {
      await createTag(dId, Number(selectedIssueId), pending.text, JSON.stringify(pending.rects), tagNote.trim());
      setShowTagModal(false);
      setTagNote(""); setTagError("");
      clearAll();
      setTags(await getTags(dId));
    } catch (e: any) { setTagError(e.message); }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("Remove this highlight?")) return;
    await deleteTag(tagId);
    setTags(await getTags(dId));
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const visibleTags = filterIssueId === ""
    ? tags
    : tags.filter(t => t.issue_id === filterIssueId);

  function highlightsForPage(pageIndex: number) {
    const out: { rect: HighlightRect; color: string; tagId: number }[] = [];
    for (const tag of visibleTags) {
      let rects: HighlightRect[] = [];
      try { rects = JSON.parse(tag.rects_json); } catch { continue; }
      for (const r of rects) {
        if (r.pageIndex === pageIndex) out.push({ rect: r, color: tag.issue.color, tagId: tag.id });
      }
    }
    return out;
  }

  const isPdf = deposition?.filename?.toLowerCase().endsWith(".pdf") ?? false;

  // ── selection overlay helpers ─────────────────────────────────────────────

  function selectionOverlay(pageIndex: number) {
    if (!clickStart) return null;

    const startPage = clickStart.pageIndex;
    const hoverPage = hoverLine?.pageIndex ?? startPage;

    // Determine reading order for multi-page
    const [firstPage, lastPage] = startPage <= hoverPage
      ? [startPage, hoverPage]
      : [hoverPage, startPage];

    const isStart  = pageIndex === startPage;
    const isEnd    = pageIndex === hoverPage;
    const isMiddle = pageIndex > firstPage && pageIndex < lastPage;

    if (!isStart && !isEnd && !isMiddle) return null;

    const LIGHT = "rgba(59,130,246,0.15)";
    const SOLID = "rgba(59,130,246,0.30)";
    const BORDER = "3px solid #3b82f6";

    if (firstPage === lastPage && isStart && isEnd) {
      // Single-page selection (original behaviour)
      const previewTop    = hoverLine ? Math.min(clickStart.topFrac, hoverLine.topFrac) : clickStart.topFrac;
      const previewBottom = hoverLine ? Math.max(clickStart.bottomFrac, hoverLine.bottomFrac) : clickStart.bottomFrac;
      return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: 0, width: "100%", top: `${previewTop * 100}%`, height: `${(previewBottom - previewTop) * 100}%`, background: LIGHT }} />
          <div style={{ position: "absolute", left: 0, width: "100%", top: `${clickStart.topFrac * 100}%`, height: `${(clickStart.bottomFrac - clickStart.topFrac) * 100}%`, background: SOLID, borderLeft: BORDER }} />
          {hoverLine && <div style={{ position: "absolute", left: 0, width: "100%", top: `${hoverLine.topFrac * 100}%`, height: `${(hoverLine.bottomFrac - hoverLine.topFrac) * 100}%`, background: SOLID, borderLeft: BORDER }} />}
        </div>
      );
    }

    // Multi-page overlays
    if (isMiddle) {
      return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><div style={{ position: "absolute", inset: 0, background: LIGHT }} /></div>;
    }

    if (isStart) {
      const top = pageIndex === firstPage ? clickStart.topFrac : (hoverLine?.topFrac ?? 0);
      return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: 0, width: "100%", top: `${top * 100}%`, height: `${(1 - top) * 100}%`, background: LIGHT }} />
          <div style={{ position: "absolute", left: 0, width: "100%", top: `${top * 100}%`, height: `${(clickStart.bottomFrac - clickStart.topFrac) * 100}%`, background: SOLID, borderLeft: BORDER }} />
        </div>
      );
    }

    if (isEnd) {
      const bottom = pageIndex === lastPage ? (hoverLine?.bottomFrac ?? 1) : clickStart.bottomFrac;
      const lineTop = pageIndex === lastPage ? (hoverLine?.topFrac ?? 0) : clickStart.topFrac;
      const lineBot = pageIndex === lastPage ? (hoverLine?.bottomFrac ?? 0) : clickStart.bottomFrac;
      return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: 0, width: "100%", top: 0, height: `${bottom * 100}%`, background: LIGHT }} />
          <div style={{ position: "absolute", left: 0, width: "100%", top: `${lineTop * 100}%`, height: `${(lineBot - lineTop) * 100}%`, background: SOLID, borderLeft: BORDER }} />
        </div>
      );
    }

    return null;
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <main className="page" style={{ maxWidth: 1300 }}>
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>{" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>{" · "}
        <span>{deposition?.witness_name ?? "…"}</span>
      </div>

      <div className="page-header" style={{ marginBottom: "1rem" }}>
        <h1>{deposition ? `Deposition of ${deposition.witness_name}` : "Transcript"}</h1>
        {deposition?.deposition_date && <p>{deposition.deposition_date}</p>}
      </div>

      <div className="transcript-layout">
        {/* ── Left sidebar ── */}
        <div className="transcript-sidebar">
          <h3>Issues</h3>
          {issues.length === 0
            ? <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
                <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> to tag testimony.
              </p>
            : issues.map(iss => (
                <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".45rem" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: iss.color, flexShrink: 0, border: "1px solid rgba(0,0,0,.15)" }} />
                  <span style={{ fontSize: ".84rem", fontWeight: 600 }}>{iss.name}</span>
                </div>
              ))
          }

          {issues.length > 1 && (
            <>
              <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />
              <h3>Filter</h3>
              <select
                value={filterIssueId}
                onChange={e => setFilterIssueId(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: "100%", padding: ".35rem .5rem", fontSize: ".82rem", borderRadius: 4, border: "1px solid #ccc" }}
              >
                <option value="">All highlights</option>
                {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
              </select>
            </>
          )}

          <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />
          <p style={{ fontSize: ".78rem", color: "#888", lineHeight: 1.55 }}>
            {clickStart
              ? <><strong style={{ color: "#3b82f6" }}>Scroll to any page</strong> and click the end line to finish.</>
              : <>Click a line to <strong>start</strong>, then click any line on any page to <strong>end</strong> the selection.</>
            }
          </p>
        </div>

        {/* ── Center: viewer ── */}
        <div style={{ minWidth: 0 }}>
          {isPdf && (
            <div className="pdf-zoombar">
              <button className="btn btn-ghost btn-sm" onClick={() => setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2)))}>−</button>
              <span style={{ fontSize: ".85rem", minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setScale(s => Math.min(3.0, +(s + 0.15).toFixed(2)))}>+</button>
              {clickStart
                ? <span style={{ fontSize: ".8rem", color: "#3b82f6", marginLeft: ".75rem", fontWeight: 600 }}>Scroll to any page and click the end line</span>
                : <span style={{ fontSize: ".8rem", color: "#999", marginLeft: ".75rem" }}>Click any line to start a selection</span>
              }
              {clickStart && (
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={clearAll}>Cancel</button>
              )}
            </div>
          )}

          <div className="pdf-scroll-area">
            {isPdf ? (
              <Document
                file={depositionFileUrl(dId)}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={<p style={{ padding: "2rem", color: "#ccc" }}>Loading PDF…</p>}
                error={<p style={{ padding: "2rem", color: "#f88" }}>Could not load PDF. Try re-uploading the transcript.</p>}
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="pdf-page-wrapper">
                    <div
                      ref={el => { pageRefs.current[i] = el; }}
                      style={{ position: "relative", display: "inline-block", lineHeight: 0, cursor: clickStart ? "crosshair" : "default" }}
                      onClick={e => handlePageClick(e, i)}
                      onMouseMove={e => handlePageMouseMove(e, i)}
                    >
                      <Page
                        pageNumber={i + 1}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                      />

                      {/* Saved highlight overlays */}
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        {highlightsForPage(i).map(({ rect, color, tagId }, ri) => (
                          <div key={`${tagId}-${ri}`} style={{
                            position: "absolute",
                            left:   `${rect.x * 100}%`,
                            top:    `${rect.y * 100}%`,
                            width:  `${rect.w * 100}%`,
                            height: `${rect.h * 100}%`,
                            background: hexToRgba(color, 0.38),
                            mixBlendMode: "multiply",
                          }} />
                        ))}
                      </div>

                      {/* Active selection overlay */}
                      {selectionOverlay(i)}
                    </div>

                    {numPages > 1 && (
                      <div className="pdf-page-num">Page {i + 1} of {numPages}</div>
                    )}
                  </div>
                ))}
              </Document>
            ) : (
              <TxtViewer dId={dId} onLineClick={handlePageClick} />
            )}
          </div>
        </div>

        {/* ── Right sidebar: tags ── */}
        <div className="transcript-sidebar">
          <h3>Highlights ({visibleTags.length})</h3>
          {visibleTags.length === 0 && (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>No highlights yet.</p>
          )}
          {visibleTags.map(tag => (
            <div key={tag.id} className="tag-item" style={{ borderLeftColor: tag.issue.color, borderLeftWidth: 3 }}>
              <div className="tag-item-body">
                <div className="tag-item-label" style={{ color: tag.issue.color }}>{tag.issue.name}</div>
                <div className="tag-item-note" style={{ color: "#444", marginTop: ".2rem", fontSize: ".8rem" }}>
                  "{tag.selected_text.length > 100 ? tag.selected_text.slice(0, 100) + "…" : tag.selected_text}"
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

      {/* ── Floating issue buttons after selection ── */}
      {pending && !showTagModal && (
        <div style={{
          position: "fixed",
          top: Math.min(pending.buttonY, window.innerHeight - 80),
          left: Math.min(pending.buttonX, window.innerWidth - 300),
          zIndex: 300,
          display: "flex",
          gap: ".4rem",
          flexWrap: "wrap",
          background: "#1c2b3a",
          borderRadius: 6,
          padding: ".4rem .6rem",
          boxShadow: "0 4px 20px rgba(0,0,0,.4)",
          maxWidth: 320,
        }}>
          {issues.map(iss => (
            <button
              key={iss.id}
              title={`Tag as: ${iss.name}`}
              onClick={() => { setSelectedIssueId(iss.id); setTagNote(""); setTagError(""); setShowTagModal(true); }}
              style={{
                background: iss.color, border: "none", borderRadius: 4,
                padding: ".3rem .7rem", cursor: "pointer",
                fontWeight: 700, fontSize: ".8rem", color: "#000",
              }}
            >
              {iss.name}
            </button>
          ))}
          <button onClick={clearAll}
            style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: ".9rem", padding: ".2rem .4rem" }}
          >✕</button>
        </div>
      )}

      {/* ── Tag modal ── */}
      {showTagModal && pending && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowTagModal(false); clearAll(); } }}>
          <div className="modal">
            <div className="modal-title">Highlight Testimony</div>
            <div style={{
              background: "#f5f5f3", border: "1px solid #ddd", borderRadius: 4,
              padding: ".6rem .75rem", marginBottom: "1rem",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: ".82rem", color: "#333",
              maxHeight: 140, overflow: "auto", lineHeight: 1.65,
              whiteSpace: "pre-wrap",
            }}>
              {pending.text.length > 400 ? pending.text.slice(0, 400) + "…" : pending.text}
            </div>
            {tagError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{tagError}</p>}
            <div className="form-group">
              <label>Issue</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".3rem" }}>
                {issues.map(iss => (
                  <button key={iss.id} onClick={() => setSelectedIssueId(iss.id)} style={{
                    padding: ".35rem .75rem", borderRadius: 20,
                    border: `2px solid ${iss.color}`,
                    background: selectedIssueId === iss.id ? iss.color : "transparent",
                    cursor: "pointer", fontWeight: 600, fontSize: ".82rem",
                    color: selectedIssueId === iss.id ? "#000" : "#333",
                  }}>{iss.name}</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <textarea value={tagNote} onChange={e => setTagNote(e.target.value)} placeholder="Why is this testimony relevant?" style={{ minHeight: 70 }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowTagModal(false); clearAll(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveTag}>Save Highlight</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Plain-text viewer ─────────────────────────────────────────────────────────

function TxtViewer({ dId, onLineClick }: {
  dId: number;
  onLineClick: (e: React.MouseEvent, pageIndex: number) => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(depositionFileUrl(dId))
      .then(r => r.text())
      .then(t => setLines(t.split("\n")))
      .catch(() => setError("Could not load file."));
  }, [dId]);

  if (error) return <p style={{ color: "#c00", padding: "1rem" }}>{error}</p>;

  return (
    <div style={{
      background: "#fff",
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: ".875rem",
      lineHeight: 1.65,
      padding: "1.5rem 2rem",
      cursor: "default",
    }}>
      {lines.map((line, i) => (
        <div
          key={i}
          onClick={e => onLineClick(e, 0)}
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: "1.65em" }}
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}
