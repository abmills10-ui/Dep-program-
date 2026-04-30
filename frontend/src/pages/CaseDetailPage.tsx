import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCase, getDepositions, createDeposition, deleteDeposition,
  getIssues, createIssue, updateIssue, deleteIssue,
} from "../api";
import type { Case, Deposition, Issue } from "../types";
import { PRESET_COLORS } from "../types";

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = Number(caseId);

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [depositions, setDepositions] = useState<Deposition[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  // Deposition upload modal
  const [showDepModal, setShowDepModal] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [depDate, setDepDate] = useState("");
  const [depFile, setDepFile] = useState<File | null>(null);
  const [depError, setDepError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Issue modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [issueName, setIssueName] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueColor, setIssueColor] = useState(PRESET_COLORS[0]);
  const [issueError, setIssueError] = useState("");

  const load = async () => {
    const [c, deps, iss] = await Promise.all([
      getCase(id),
      getDepositions(id),
      getIssues(id),
    ]);
    setCaseData(c);
    setDepositions(deps);
    setIssues(iss);
  };

  useEffect(() => { load(); }, [id]);

  // Deposition upload
  const handleUpload = async () => {
    if (!witnessName.trim()) { setDepError("Witness name is required."); return; }
    if (!depFile) { setDepError("Please select a transcript file."); return; }
    setUploading(true);
    try {
      await createDeposition(id, witnessName.trim(), depDate, depFile);
      setShowDepModal(false);
      setWitnessName(""); setDepDate(""); setDepFile(null); setDepError("");
      load();
    } catch (e: any) {
      setDepError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDep = async (dep: Deposition) => {
    if (!confirm(`Delete deposition of ${dep.witness_name}?`)) return;
    await deleteDeposition(dep.id);
    load();
  };

  // Issue CRUD
  const openNewIssue = () => {
    setEditingIssue(null);
    setIssueName(""); setIssueDesc(""); setIssueColor(PRESET_COLORS[issues.length % PRESET_COLORS.length]);
    setIssueError("");
    setShowIssueModal(true);
  };
  const openEditIssue = (iss: Issue) => {
    setEditingIssue(iss);
    setIssueName(iss.name); setIssueDesc(iss.description); setIssueColor(iss.color);
    setIssueError("");
    setShowIssueModal(true);
  };
  const handleSaveIssue = async () => {
    if (!issueName.trim()) { setIssueError("Issue name is required."); return; }
    try {
      if (editingIssue) {
        await updateIssue(editingIssue.id, issueName.trim(), issueDesc.trim(), issueColor);
      } else {
        await createIssue(id, issueName.trim(), issueDesc.trim(), issueColor);
      }
      setShowIssueModal(false);
      load();
    } catch (e: any) {
      setIssueError(e.message);
    }
  };
  const handleDeleteIssue = async (iss: Issue) => {
    if (!confirm(`Delete issue "${iss.name}" and all its tags?`)) return;
    await deleteIssue(iss.id);
    load();
  };

  if (!caseData) return <main className="page"><p>Loading…</p></main>;

  return (
    <main className="page">
      <div style={{ marginBottom: ".75rem" }}>
        <Link to="/" style={{ color: "#1c6ea4", fontSize: ".85rem" }}>← All Cases</Link>
      </div>

      <div className="page-header page-header-row">
        <div>
          <h1>{caseData.name}</h1>
          {caseData.description && <p>{caseData.description}</p>}
        </div>
        {issues.length > 0 && (
          <Link to={`/cases/${id}/report`} className="btn btn-primary">View Issue Reports</Link>
        )}
      </div>

      {/* Depositions */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">Depositions ({depositions.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowDepModal(true)}>+ Upload Transcript</button>
        </div>

        {depositions.length === 0 && <p className="empty-state">No depositions yet. Upload a transcript to begin.</p>}

        {depositions.map(dep => (
          <div className="card" key={dep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <div className="card-title">{dep.witness_name}</div>
              <div className="card-sub">
                {dep.deposition_date && <span>{dep.deposition_date} · </span>}
                <span>{dep.filename}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <Link to={`/cases/${id}/depositions/${dep.id}`} className="btn btn-ghost btn-sm">Review Transcript</Link>
              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDep(dep)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Issues */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">Issues ({issues.length})</span>
          <button className="btn btn-primary btn-sm" onClick={openNewIssue}>+ New Issue</button>
        </div>

        {issues.length === 0 && <p className="empty-state">No issues defined. Create issues to tag and organize testimony.</p>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}>
          {issues.map(iss => (
            <div
              key={iss.id}
              style={{
                display: "flex", alignItems: "center", gap: ".6rem",
                padding: ".6rem 1rem",
                background: "#fff",
                border: `2px solid ${iss.color}`,
                borderRadius: "6px",
                minWidth: "180px",
              }}
            >
              <span className="issue-dot" style={{ background: iss.color }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: ".9rem" }}>{iss.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => openEditIssue(iss)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteIssue(iss)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Upload deposition modal */}
      {showDepModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowDepModal(false); }}>
          <div className="modal">
            <div className="modal-title">Upload Deposition Transcript</div>
            {depError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{depError}</p>}
            <div className="form-group">
              <label>Witness Name *</label>
              <input
                autoFocus
                value={witnessName}
                onChange={e => setWitnessName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>
            <div className="form-group">
              <label>Deposition Date</label>
              <input type="date" value={depDate} onChange={e => setDepDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Transcript File * (.txt or .pdf)</label>
              <input
                type="file"
                accept=".txt,.pdf"
                onChange={e => setDepFile(e.target.files?.[0] ?? null)}
                style={{ background: "none", border: "none", padding: "0" }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowDepModal(false); setDepError(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue modal */}
      {showIssueModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowIssueModal(false); }}>
          <div className="modal">
            <div className="modal-title">{editingIssue ? "Edit Issue" : "New Issue"}</div>
            {issueError && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{issueError}</p>}
            <div className="form-group">
              <label>Issue Name *</label>
              <input
                autoFocus
                value={issueName}
                onChange={e => setIssueName(e.target.value)}
                placeholder="e.g. Duty of Care, Damages, Causation"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Optional description of this issue" />
            </div>
            <div className="form-group">
              <label>Highlight Color</label>
              <div className="color-grid">
                {PRESET_COLORS.map(c => (
                  <div
                    key={c}
                    className={`color-swatch${issueColor === c ? " selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setIssueColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowIssueModal(false); setIssueError(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveIssue}>{editingIssue ? "Save" : "Create Issue"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
