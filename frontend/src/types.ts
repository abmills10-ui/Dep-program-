export interface Case {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Deposition {
  id: number;
  case_id: number;
  witness_name: string;
  deposition_date: string;
  filename: string;
  created_at: string;
}

export interface Issue {
  id: number;
  case_id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

// A single highlight rect stored as fractions of the page dimensions (0–1)
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
  pageIndex: number;
}

export interface Tag {
  id: number;
  deposition_id: number;
  issue_id: number;
  selected_text: string;   // verbatim text the user highlighted
  rects_json: string;      // JSON-encoded HighlightRect[]
  note: string;
  created_at: string;
  issue: Issue;
}

export interface ReportPassage {
  witness_name: string;
  deposition_date: string;
  deposition_id: number;
  tag_id: number;
  note: string;
  selected_text: string;
}

export interface Report {
  issue: Issue;
  passages: ReportPassage[];
}

export const PRESET_COLORS = [
  "#FFD700",  // yellow (default — classic highlighter)
  "#FF6B6B",  // red
  "#90EE90",  // green
  "#87CEEB",  // sky blue
  "#DDA0DD",  // plum
  "#FFB347",  // orange
  "#98FF98",  // mint
  "#FF69B4",  // pink
  "#B0C4DE",  // steel blue
  "#F0E68C",  // khaki
];
