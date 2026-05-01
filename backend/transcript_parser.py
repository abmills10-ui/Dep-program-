import re
from typing import List, Dict, Optional


def parse_transcript(text: str) -> List[Dict]:
    """
    Parse a deposition transcript into line-level segments.
    Each physical line becomes one segment so the viewer can display
    the text verbatim with original line numbers and formatting.
    Speaker (Q/A/HEADING/etc.) is detected for coloring only.
    """
    segments: List[Dict] = []
    current_page: Optional[int] = None
    prev_qa_speaker: Optional[str] = None  # tracks Q/A for continuation lines

    for raw_line in text.splitlines():
        stripped = raw_line.strip()

        # Standalone page label: "Page 5" or "PAGE 5"
        page_match = re.match(r'^[Pp][Aa][Gg][Ee]\s+(\d+)\s*$', stripped)
        if page_match:
            current_page = int(page_match.group(1))
            segments.append({
                'segment_index': len(segments),
                'speaker': 'PAGE',
                'text': f'Page {current_page}',
                'line_number': None,
                'page_number': current_page,
            })
            continue

        # Blank line — preserve as spacing
        if not stripped:
            segments.append({
                'segment_index': len(segments),
                'speaker': 'BLANK',
                'text': '',
                'line_number': None,
                'page_number': current_page,
            })
            continue

        # Extract leading line number (1–4 digits)
        line_no_match = re.match(r'^(\d{1,4})\s+(.*)', stripped)
        if line_no_match:
            line_number: Optional[int] = int(line_no_match.group(1))
            line_content = line_no_match.group(2)
        else:
            line_number = None
            line_content = stripped

        # Detect speaker
        if re.match(r'^Q\.?\s', line_content) or line_content in ('Q.', 'Q'):
            speaker = 'Q'
            prev_qa_speaker = 'Q'
        elif re.match(r'^A\.?\s', line_content) or line_content in ('A.', 'A'):
            speaker = 'A'
            prev_qa_speaker = 'A'
        elif re.match(
            r'^(BY|EXAMINATION|CROSS.EXAMINATION|REDIRECT|RECROSS)\s',
            line_content, re.IGNORECASE
        ):
            speaker = 'HEADING'
            prev_qa_speaker = None
        elif re.match(
            r'^(THE\s+\w+|MR\.|MS\.|MRS\.|DR\.)\s*[\w\s]*:',
            line_content, re.IGNORECASE
        ):
            speaker = 'HEADING'
            prev_qa_speaker = None
        else:
            # Continuation — inherit Q or A context
            speaker = prev_qa_speaker or 'OTHER'

        segments.append({
            'segment_index': len(segments),
            'speaker': speaker,
            'text': line_content,
            'line_number': line_number,
            'page_number': current_page,
        })

    return segments


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes. Tries pdfplumber, then PyMuPDF, then pypdf."""
    import io

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

    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text()
            if text:
                pages.append(f"Page {i}\n{text}")
        return "\n".join(pages)
    except Exception:
        pass

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
