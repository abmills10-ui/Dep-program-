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

export interface Segment {
  id: number;
  segment_index: number;
  speaker: string; // "Q" | "A" | "HEADING" | "OTHER"
  text: string;
  page_number: number | null;
  line_number: number | null;
}

export interface Issue {
  id: number;
  case_id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

export interface Tag {
  id: number;
  deposition_id: number;
  issue_id: number;
  start_segment_index: number;
  end_segment_index: number;
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
  segments: Segment[];
}

export interface Report {
  issue: Issue;
  passages: ReportPassage[];
}

export const PRESET_COLORS = [
  "#FF6B6B",
  "#FFB347",
  "#FFD700",
  "#90EE90",
  "#4FC3F7",
  "#9575CD",
  "#F48FB1",
  "#80DEEA",
  "#A5D6A7",
  "#CE93D8",
];
