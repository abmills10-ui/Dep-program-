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

  // Selection
  const [selection, setSelection] = useState<SelectionState>(null);
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);

  // Tag modal
  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<number | "">("");
  const [tagNote, setTagNote] = useState("");
  const [tagError, setTagError] = useState("");

  // Filter
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

  const handleSegmentClick = (idx: number, shiftKey: boolean) => {
    if (shiftKey && anchorIdx !== null) {
      setSelection({ start: anchorIdx, end: idx });
    } else {
      setAnchorIdx(idx);
      setSelection({ start: idx, end: idx });
    }
  };

  const clearSelection = () => {
    setSelection(null);
    setAnchorIdx(null);
  };

  const openTagModal = () => {
    if (!selection) return;
    setTagNote("");
    setTagError("");
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
      const updated = await getTags(dId);
      setTags(updated);
    } catch (e: any) {
      setTagError(e.message);
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("Remove this tag?")) return;
    await deleteTag(tagId);
    const updated = await getTags(dId);
    setTags(updated);
  };

  const visibleTags = filterIssueId === ""
    ? tags
    : tags.filter(t => t.issue_id === filterIssueId);

  // Determine background for a segment based on its tags (first match wins for bg)
  function segmentStyle(idx: number): React.CSSProperties {
    const st = getTagsForSegment(idx, visibleTags);
    if (st.length === 0) return {};
    const primary = st[0].issue;
    return {
      background: hexToRgba(primary.color, 0.15),
      borderLeftColor: primary.color,
    };
  }

  const selectionCount = selection ? selMax - selMin + 1 : 0;

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

      <div className="page-header">
        <h1>{deposition ? `Deposition of ${deposition.witness_name}` : "Transcript"}</h1>
        {deposition?.deposition_date && <p>{deposition.deposition_date}</p>}
      </div>

      <div className="transcript-layout">
        {/* Left: Issues reference */}
        <div className="transcript-sidebar">
          <h3>Issues</h3>
          {issues.length === 0 && (
            <p style={{ fontSize: ".8rem", color: "#999", fontStyle: "italic" }}>
              No issues defined. <Link to={`/cases/${cId}`} style={{ color: "#1c6ea4" }}>Add issues</Link> to begin tagging.
            </p>
          )}
          {issues.map(iss => (
            <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".5rem" }}>
              <span className="issue-dot" style={{ background: iss.color }} />
              <span style={{ fontSize: ".84rem", fontWeight: 600 }}>{iss.name}</span>
            </div>
          ))}

          <hr style={{ margin: "1rem 0", borderColor: "#eee" }} />

          <h3>Filter by Issue</h3>
          <select
            value={filterIssueId}
            onChange={e => setFilterIssueId(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ width: "100%", padding: ".35rem .5rem", fontSize: ".82rem", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">Show all</option>
            {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
          </select>
        </div>

        {/* Center: Transcript */}
        <div className="transcript-main">
          <div className="transcript-toolbar">
            {selection ? (
              <>
                <span style={{ color: "#1c6ea4", fontWeight: 600 }}>
                  {selectionCount} segment{selectionCount !== 1 ? "s" : ""} selected
                  {" ("}rows {selMin}–{selMax}{")"}
                </span>
                <button className="btn btn-primary btn-sm" onClick={openTagModal} disabled={issues.length === 0}>
                  Tag Selection
                </button>
                <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
              </>
            ) : (
              <span>Click a segment to start selection · Shift-click to extend</span>
            )}
          </div>

          <div className="segment-list">
            {segments.length === 0 && (
              <p className="empty-state">No transcript content found. The file may be empty or unrecognized.</p>
            )}
            {segments.map(seg => {
              const idx = seg.segment_index;
              const isSelected = selection !== null && idx >= selMin && idx <= selMax;
              const segTags = getTagsForSegment(idx, visibleTags);
              const style = isSelected ? {} : segmentStyle(idx);

              return (
                <div
                  key={seg.id}
                  className={`segment-row${isSelected ? " selected" : ""}${segTags.length > 0 ? " tagged" : ""}`}
                  style={style}
                  onClick={e => handleSegmentClick(idx, e.shiftKey)}
                >
                  <span className={`segment-speaker ${seg.speaker}`}>{seg.speaker === "HEADING" ? "—" : seg.speaker}</span>
                  <div style={{ flex: 1 }}>
                    <div className={`segment-text ${seg.speaker}`}>{seg.text}</div>
                    {segTags.length > 0 && (
                      <div className="segment-tags">
                        {segTags.map(t => (
                          <span
                            key={t.id}
                            className="issue-badge"
                            style={{ background: hexToRgba(t.issue.color, 0.2), color: t.issue.color, border: `1px solid ${t.issue.color}` }}
                          >
                            <span className="issue-dot" style={{ background: t.issue.color, width: 7, height: 7 }} />
                            {t.issue.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
              No tags yet. Select segments and click "Tag Selection."
            </p>
          )}
          {visibleTags.map(tag => (
            <div key={tag.id} className="tag-item" style={{ borderLeftColor: tag.issue.color, borderLeftWidth: 3 }}>
              <div className="tag-item-body">
                <div className="tag-item-label" style={{ color: tag.issue.color }}>{tag.issue.name}</div>
                <div className="tag-item-range">Rows {tag.start_segment_index}–{tag.end_segment_index}</div>
                {tag.note && <div className="tag-item-note">{tag.note}</div>}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: ".15rem .4rem", fontSize: ".75rem", alignSelf: "flex-start" }}
                onClick={() => handleDeleteTag(tag.id)}
              >
                ✕
              </button>
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
              Tagging rows {selMin}–{selMax} ({selectionCount} segment{selectionCount !== 1 ? "s" : ""})
            </p>
            {tagError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{tagError}</p>}
            <div className="form-group">
              <label>Issue *</label>
              <select value={selectedIssueId} onChange={e => setSelectedIssueId(Number(e.target.value))}>
                {issues.map(iss => <option key={iss.id} value={iss.id}>{iss.name}</option>)}
              </select>
            </div>
            {selectedIssueId !== "" && (
              <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
                <span
                  className="issue-dot"
                  style={{ background: issues.find(i => i.id === selectedIssueId)?.color }}
                />
                <span style={{ fontSize: ".84rem", color: "#555" }}>
                  {issues.find(i => i.id === selectedIssueId)?.description}
                </span>
              </div>
            )}
            <div className="form-group">
              <label>Note (optional)</label>
              <textarea
                className="tag-note-field"
                value={tagNote}
                onChange={e => setTagNote(e.target.value)}
                placeholder="Optional annotation about why this testimony is relevant…"
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
