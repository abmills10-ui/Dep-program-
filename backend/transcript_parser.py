import re
from typing import List, Dict, Optional


def parse_transcript(text: str) -> List[Dict]:
    """
    Parse a deposition transcript into structured segments.
    Handles:
      - Q. / A. prefixed lines
      - Line-numbered transcripts (leading digits stripped)
      - BY [NAME]: / EXAMINATION BY [NAME]: headings
      - THE WITNESS:, THE COURT:, MR./MS./DR. speaker labels
    """
    segments: List[Dict] = []
    current_speaker: Optional[str] = None
    current_lines: List[str] = []
    current_page: Optional[int] = None
    current_line_no: Optional[int] = None

    def flush():
        nonlocal current_speaker, current_lines, current_page, current_line_no
        if current_lines:
            combined = " ".join(current_lines).strip()
            if combined:
                segments.append(
                    {
                        "segment_index": len(segments),
                        "speaker": current_speaker or "OTHER",
                        "text": combined,
                        "page_number": current_page,
                        "line_number": current_line_no,
                    }
                )
        current_lines = []
        current_speaker = None
        current_page = None
        current_line_no = None

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        # Detect page markers like "Page 12" or just a bare number on its own line
        page_match = re.match(r"^[Pp]age\s+(\d+)\s*$", stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue

        # Remove leading line numbers (e.g., "  1   Q. ...")
        line_no_match = re.match(r"^(\d{1,4})\s+(.*)", stripped)
        detected_line_no: Optional[int] = None
        if line_no_match:
            detected_line_no = int(line_no_match.group(1))
            stripped = line_no_match.group(2).strip()

        # EXAMINATION BY MR. SMITH: / BY MS. JONES: headings
        if re.match(r"^(EXAMINATION\s+BY|CROSS.EXAMINATION\s+BY|REDIRECT\s+BY|RECROSS\s+BY|BY)\s+", stripped, re.IGNORECASE):
            flush()
            segments.append(
                {
                    "segment_index": len(segments),
                    "speaker": "HEADING",
                    "text": stripped.rstrip(":").strip(),
                    "page_number": current_page,
                    "line_number": detected_line_no,
                }
            )
            continue

        # Q. or Q:
        q_match = re.match(r"^Q[\.:]?\s+(.*)", stripped)
        if q_match:
            flush()
            current_speaker = "Q"
            current_lines = [q_match.group(1).strip()]
            current_line_no = detected_line_no
            continue

        # A. or A:
        a_match = re.match(r"^A[\.:]?\s+(.*)", stripped)
        if a_match:
            flush()
            current_speaker = "A"
            current_lines = [a_match.group(1).strip()]
            current_line_no = detected_line_no
            continue

        # THE WITNESS:, THE COURT:, MR. SMITH:, MS. JONES:
        speaker_match = re.match(
            r"^(THE\s+\w+|MR\.|MS\.|MRS\.|DR\.)\s*[\w\s]*:\s*(.*)", stripped, re.IGNORECASE
        )
        if speaker_match:
            flush()
            remainder = speaker_match.group(2).strip()
            label = stripped.split(":")[0].strip().upper()
            current_speaker = label if label else "OTHER"
            if remainder:
                current_lines = [remainder]
            current_line_no = detected_line_no
            continue

        # Continuation of current segment
        if current_lines is not None and current_speaker is not None:
            current_lines.append(stripped)
        else:
            flush()
            current_speaker = "OTHER"
            current_lines = [stripped]
            current_line_no = detected_line_no

    flush()
    return segments


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes. Tries pdfplumber, then PyMuPDF, then pypdf."""
    import io

    # Try pdfplumber
    try:
        import pdfplumber
        pages = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text()
                if text:
                    pages.append(f"Page {i}\n{text}")
        return "\n".join(pages)
    except Exception:
        pass

    # Try PyMuPDF
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text()
            if text:
                pages.append(f"Page {i}\n{text}")
        return "\n".join(pages)
    except Exception:
        pass

    # Try pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            text = page.extract_text()
            if text:
                pages.append(f"Page {i}\n{text}")
        return "\n".join(pages)
    except Exception:
        pass

    raise RuntimeError(
        "No PDF library available. Please upload a .txt file instead, "
        "or install pdfplumber/PyMuPDF/pypdf on the server."
    )
