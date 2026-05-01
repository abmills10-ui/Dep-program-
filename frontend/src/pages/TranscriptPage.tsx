import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { getSegments, getTags, createTag, deleteTag, getIssues, getDepositions, getCase } from "../api";
import type { Segment, Tag, Issue, Case, Deposition } from "../types";

type SelectionState = { start: number; end: number } | null;

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getTagsForSegment(idx: number, tags: Tag[]): Tag[] {
  return tags.filter(t => idx >= t.start_segment_index && idx <= t.end_segment_index);
}

export default function TranscriptPage() {
  const { caseId, depId } = useParams<{ caseId: string; depId: string }>();
  const cId = Number(caseId);
  const dId = Number(depId);

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [deposition, setDeposition] = useState<Deposition | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  const [selection, setSelection] = useState<SelectionState>(null);
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);

  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<number | "">("");
  const [tagNote, setTagNote] = useState("");
  const [tagError, setTagError] = useState("");

  const [filterIssueId, setFilterIssueId] = useState<number | "">("");

  const loadAll = useCallback(async () => {
    const [c, deps, segs, tgs, iss] = await Promise.all([
      getCase(cId),
      getDepositions(cId),
      getSegments(dId),
      getTags(dId),
      getIssues(cId),
    ]);
    setCaseData(c);
    setDeposition(deps.find(d => d.id === dId) ?? null);
    setSegments(segs);
    setTags(tgs);
    setIssues(iss);
    if (iss.length > 0 && selectedIssueId === "") setSelectedIssueId(iss[0].id);
  }, [cId, dId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selMin = selection ? Math.min(selection.start, selection.end) : -1;
  const selMax = selection ? Math.max(selection.start, selection.end) : -1;

  const handleLineClick = (idx: number, shiftKey: boolean) => {
    if (shiftKey && anchorIdx !== null) {
      setSelection({ start: anchorIdx, end: idx });
    } else {
      setAnchorIdx(idx);
      setSelection({ start: idx, end: idx });
    }
  };

  const clearSelection = () => { setSelection(null); setAnchorIdx(null); };

  const openTagModal = () => {
    if (!selection) return;
    setTagNote(""); setTagError("");
    if (issues.length > 0 && selectedIssueId === "") setSelectedIssueId(issues[0].id);
    setShowTagModal(true);
  };

  const handleSaveTag = async () => {
    if (selectedIssueId === "") { setTagError("Select an issue."); return; }
    if (!selection) return;
    try {
      await createTag(dId, Number(selectedIssueId), selMin, selMax, tagNote.trim());
      setShowTagModal(false);
      clearSelection();
      setTags(await getTags(dId));
    } catch (e: any) { setTagError(e.message); }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("Remove this tag?")) return;
    await deleteTag(tagId);
    setTags(await getTags(dId));
  };

  const visibleTags = filterIssueId === ""
    ? tags
    : tags.filter(t => t.issue_id === filterIssueId);

  const selectionCount = selection ? selMax - selMin + 1 : 0;

  // Determine top issue color for a tagged line (for background)
  function lineHighlight(idx: number): { bg: string; border: string } | null {
    const matching = getTagsForSegment(idx, visibleTags);
    if (matching.length === 0) return null;
    const color = matching[0].issue.color;
    return { bg: hexToRgba(color, 0.18), border: color };
  }

  return (
    <main className="page" style={{ maxWidth: "1300px" }}>
      <div style={{ marginBottom: ".75rem", fontSize: ".85rem" }}>
        <Link to="/" style={{ color: "#1c6ea4" }}>Cases</Link>
        {" · "}
        <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>{caseData?.name ?? "…"}</Link>
        {" · "}
        <span>{deposition?.witness_name ?? "…"}</span>
      </div>

      <div className="page-header">
        <h1>{deposition ? `Deposition of ${deposition.witness_name}` : "Transcript"}</h1>
        {deposition?.deposition_date && <p>{deposition.deposition_date}</p>}
      </div>

      <div className="transcript-layout">
        {/* Left: Issues + filter */}
        <div className="transcript-sidebar">
          <h3>Issues</h3>
          {issues.length === 0 && (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
              <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> to begin tagging.
            </p>
          )}
          {issues.map(iss => (
            <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".5rem" }}>
              <span className="issue-dot" style={{ background: iss.color }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600 }}>{iss.name}</span>
            </div>
          ))}

          <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />
          <h3>Filter</h3>
          <select
            value={filterIssueId}
            onChange={e => setFilterIssueId(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ width: "100%", padding: ".35rem .5rem", fontSize: ".82rem", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">Show all</option>
            {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
          </select>
        </div>

        {/* Center: Transcript (PDF-like) */}
        <div className="transcript-main">
          <div className="transcript-toolbar">
            {selection ? (
              <>
                <span style={{ color: "#1c6ea4", fontWeight: 600 }}>
                  {selectionCount} line{selectionCount !== 1 ? "s" : ""} selected
                </span>
                <button className="btn btn-primary btn-sm" onClick={openTagModal} disabled={issues.length === 0}>
                  Tag Selection
                </button>
                <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
              </>
            ) : (
              <span>Click a line to start selection · Shift-click to extend</span>
            )}
          </div>

          {/* PDF-style transcript body */}
          <div className="pdf-transcript">
            {segments.length === 0 && (
              <p className="empty-state">No transcript content found.</p>
            )}
            {segments.map(seg => {
              const idx = seg.segment_index;

              // Page break header — not selectable
              if (seg.speaker === 'PAGE') {
                return (
                  <div key={seg.id} className="pdf-page-break">
                    <span>{seg.text}</span>
                  </div>
                );
              }

              const isSelected = selection !== null && idx >= selMin && idx <= selMax;
              const highlight = isSelected ? null : lineHighlight(idx);
              const segTags = getTagsForSegment(idx, visibleTags);

              const style: React.CSSProperties = {
                borderLeftColor: isSelected
                  ? '#3b82f6'
                  : (highlight?.border ?? 'transparent'),
                background: isSelected
                  ? 'rgba(59,130,246,0.12)'
                  : (highlight?.bg ?? 'transparent'),
              };

              return (
                <div
                  key={seg.id}
                  className={`pdf-line${isSelected ? ' selected' : ''}${segTags.length > 0 ? ' tagged' : ''}`}
                  style={style}
                  onClick={e => handleLineClick(idx, e.shiftKey)}
                >
                  <span className="pdf-line-no">
                    {seg.line_number != null ? seg.line_number : ''}
                  </span>
                  <span className={`pdf-line-text${seg.speaker === 'BLANK' ? ' blank' : ''}`}>
                    {seg.text || ' '}
                  </span>
                  {segTags.length > 0 && (
                    <span className="pdf-line-tags">
                      {segTags.map(t => (
                        <span
                          key={t.id}
                          title={t.issue.name}
                          style={{
                            display: 'inline-block',
                            width: 8, height: 8,
                            borderRadius: '50%',
                            background: t.issue.color,
                            marginLeft: 3,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Tags list */}
        <div className="transcript-sidebar">
          <h3>Tags ({visibleTags.length})</h3>
          {visibleTags.length === 0 && (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
              No tags yet. Select lines and click "Tag Selection."
            </p>
          )}
          {visibleTags.map(tag => (
            <div key={tag.id} className="tag-item" style={{ borderLeftColor: tag.issue.color, borderLeftWidth: 3 }}>
              <div className="tag-item-body">
                <div className="tag-item-label" style={{ color: tag.issue.color }}>{tag.issue.name}</div>
                <div className="tag-item-range">Lines {tag.start_segment_index}–{tag.end_segment_index}</div>
                {tag.note && <div className="tag-item-note">{tag.note}</div>}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: ".15rem .4rem", fontSize: ".75rem", alignSelf: "flex-start" }}
                onClick={() => handleDeleteTag(tag.id)}
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Tag modal */}
      {showTagModal && selection && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTagModal(false); }}>
          <div className="modal">
            <div className="modal-title">Tag Selection</div>
            <p style={{ fontSize: ".85rem", color: "#555", marginBottom: "1rem" }}>
              Tagging {selectionCount} line{selectionCount !== 1 ? "s" : ""}
            </p>
            {tagError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{tagError}</p>}
            <div className="form-group">
              <label>Issue *</label>
              <select value={selectedIssueId} onChange={e => setSelectedIssueId(Number(e.target.value))}>
                {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <textarea
                value={tagNote}
                onChange={e => setTagNote(e.target.value)}
                placeholder="Why is this testimony relevant to the issue?"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowTagModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveTag}>Save Tag</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
