import type { Case, Deposition, Issue, Tag, Report } from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// Cases
export const getCases = () => request<Case[]>("/cases");
export const createCase = (name: string, description: string) =>
  request<Case>("/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
export const getCase = (id: number) => request<Case>(`/cases/${id}`);
export const deleteCase = (id: number) =>
  request<{ ok: boolean }>(`/cases/${id}`, { method: "DELETE" });

// Depositions
export const getDepositions = (caseId: number) =>
  request<Deposition[]>(`/cases/${caseId}/depositions`);
export const createDeposition = (
  caseId: number,
  witnessName: string,
  depositionDate: string,
  file: File
) => {
  const fd = new FormData();
  fd.append("witness_name", witnessName);
  fd.append("deposition_date", depositionDate);
  fd.append("file", file);
  return request<Deposition>(`/cases/${caseId}/depositions`, { method: "POST", body: fd });
};
export const deleteDeposition = (id: number) =>
  request<{ ok: boolean }>(`/depositions/${id}`, { method: "DELETE" });

// File URL (for PDF viewer)
export const depositionFileUrl = (depId: number) => `/api/depositions/${depId}/file`;

// Issues
export const getIssues = (caseId: number) => request<Issue[]>(`/cases/${caseId}/issues`);
export const createIssue = (caseId: number, name: string, description: string, color: string) =>
  request<Issue>(`/cases/${caseId}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, color }),
  });
export const updateIssue = (issueId: number, name: string, description: string, color: string) =>
  request<Issue>(`/issues/${issueId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, color }),
  });
export const deleteIssue = (id: number) =>
  request<{ ok: boolean }>(`/issues/${id}`, { method: "DELETE" });

// Tags
export const getTags = (depId: number) => request<Tag[]>(`/depositions/${depId}/tags`);
export const createTag = (
  depId: number,
  issueId: number,
  selectedText: string,
  rectsJson: string,
  note: string
) =>
  request<Tag>(`/depositions/${depId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issue_id: issueId,
      selected_text: selectedText,
      rects_json: rectsJson,
      note,
    }),
  });
export const updateTag = (tagId: number, issueId: number, note: string) =>
  request<Tag>(`/tags/${tagId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issue_id: issueId, selected_text: "", rects_json: "[]", note }),
  });
export const deleteTag = (tagId: number) =>
  request<{ ok: boolean }>(`/tags/${tagId}`, { method: "DELETE" });

// Report
export const getReport = (caseId: number, issueId: number) =>
  request<Report>(`/cases/${caseId}/issues/${issueId}/report`);
