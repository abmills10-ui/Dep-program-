import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCases, createCase, deleteCase } from "../api";
import type { Case } from "../types";

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const load = () => getCases().then(setCases).catch(console.error);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Case name is required."); return; }
    try {
      await createCase(name.trim(), description.trim());
      setShowModal(false);
      setName(""); setDescription(""); setError("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (c: Case) => {
    if (!confirm(`Delete case "${c.name}"? This cannot be undone.`)) return;
    await deleteCase(c.id);
    load();
  };

  return (
    <main className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Cases</h1>
          <p>Organize depositions and issues by case.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Case</button>
      </div>

      {cases.length === 0 && <p className="empty-state">No cases yet. Create your first case to get started.</p>}

      {cases.map(c => (
        <div className="card" key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div className="card-title">
              <Link to={`/cases/${c.id}`} style={{ color: "#1c6ea4" }}>{c.name}</Link>
            </div>
            {c.description && <div className="card-sub">{c.description}</div>}
            <div className="card-sub">{new Date(c.created_at).toLocaleDateString()}</div>
          </div>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <Link to={`/cases/${c.id}`} className="btn btn-ghost btn-sm">Open</Link>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>Delete</button>
          </div>
        </div>
      ))}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-title">New Case</div>
            {error && <p style={{ color: "#c00", marginBottom: ".75rem", fontSize: ".85rem" }}>{error}</p>}
            <div className="form-group">
              <label>Case Name *</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                placeholder="e.g. Smith v. Acme Corp."
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes about this case" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setError(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create Case</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
