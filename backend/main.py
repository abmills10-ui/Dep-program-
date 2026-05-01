import json
import os
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from database import engine, get_db
from transcript_parser import extract_text_from_pdf

models.Base.metadata.create_all(bind=engine)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Deposition Transcript Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def migrate_db():
    with engine.connect() as conn:
        # Check if tags table has the new schema (selected_text column)
        tag_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(tags)"))}
        if "selected_text" not in tag_cols:
            # Old schema has NOT NULL segment index columns that block inserts.
            # Drop and let create_all rebuild with the new schema.
            conn.execute(text("DROP TABLE IF EXISTS tags"))
            conn.execute(text("DROP TABLE IF EXISTS transcript_segments"))
            conn.commit()

        # Add file_path to depositions if it doesn't exist yet
        dep_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(depositions)"))}
        if "file_path" not in dep_cols:
            conn.execute(text("ALTER TABLE depositions ADD COLUMN file_path TEXT DEFAULT ''"))
            conn.commit()

    # Recreate any missing tables (no-op for tables that already exist)
    models.Base.metadata.create_all(bind=engine)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CaseCreate(BaseModel):
    name: str
    description: str = ""


class CaseOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    model_config = {"from_attributes": True}


class DepositionOut(BaseModel):
    id: int
    case_id: int
    witness_name: str
    deposition_date: str
    filename: str
    created_at: datetime
    model_config = {"from_attributes": True}


class IssueCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#FFD700"


class IssueOut(BaseModel):
    id: int
    case_id: int
    name: str
    description: str
    color: str
    created_at: datetime
    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    issue_id: int
    selected_text: str
    rects_json: str = "[]"   # JSON string of normalized highlight rects
    note: str = ""


class TagOut(BaseModel):
    id: int
    deposition_id: int
    issue_id: int
    selected_text: str
    rects_json: str
    note: str
    created_at: datetime
    issue: IssueOut
    model_config = {"from_attributes": True}


class ReportPassage(BaseModel):
    witness_name: str
    deposition_date: str
    deposition_id: int
    tag_id: int
    note: str
    selected_text: str


class ReportOut(BaseModel):
    issue: IssueOut
    passages: List[ReportPassage]


# ── Cases ─────────────────────────────────────────────────────────────────────

@app.get("/api/cases", response_model=List[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    return db.query(models.Case).order_by(models.Case.created_at.desc()).all()


@app.post("/api/cases", response_model=CaseOut)
def create_case(body: CaseCreate, db: Session = Depends(get_db)):
    case = models.Case(name=body.name, description=body.description)
    db.add(case); db.commit(); db.refresh(case)
    return case


@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.put("/api/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, body: CaseCreate, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.name = body.name; case.description = body.description
    db.commit(); db.refresh(case)
    return case


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    db.delete(case); db.commit()
    return {"ok": True}


# ── Depositions ───────────────────────────────────────────────────────────────

@app.get("/api/cases/{case_id}/depositions", response_model=List[DepositionOut])
def list_depositions(case_id: int, db: Session = Depends(get_db)):
    return (db.query(models.Deposition)
            .filter(models.Deposition.case_id == case_id)
            .order_by(models.Deposition.deposition_date).all())


@app.post("/api/cases/{case_id}/depositions", response_model=DepositionOut)
async def create_deposition(
    case_id: int,
    witness_name: str = Form(...),
    deposition_date: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    case = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    file_bytes = await file.read()
    filename = file.filename or "transcript"

    dep = models.Deposition(
        case_id=case_id,
        witness_name=witness_name,
        deposition_date=deposition_date,
        filename=filename,
        file_path="",
    )
    db.add(dep); db.commit(); db.refresh(dep)

    # Save the original file so the viewer can render it
    ext = os.path.splitext(filename)[1].lower() or ".bin"
    saved_name = f"{dep.id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_name)
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    dep.file_path = file_path
    db.commit()

    return dep


@app.get("/api/depositions/{dep_id}", response_model=DepositionOut)
def get_deposition(dep_id: int, db: Session = Depends(get_db)):
    dep = db.query(models.Deposition).filter(models.Deposition.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Deposition not found")
    return dep


@app.get("/api/depositions/{dep_id}/file")
def get_deposition_file(dep_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded transcript file."""
    dep = db.query(models.Deposition).filter(models.Deposition.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Deposition not found")
    if not dep.file_path or not os.path.exists(dep.file_path):
        raise HTTPException(status_code=404, detail="File not found — please re-upload this transcript")
    media = "application/pdf" if dep.filename.lower().endswith(".pdf") else "text/plain"
    return FileResponse(dep.file_path, media_type=media, filename=dep.filename)


@app.delete("/api/depositions/{dep_id}")
def delete_deposition(dep_id: int, db: Session = Depends(get_db)):
    dep = db.query(models.Deposition).filter(models.Deposition.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Deposition not found")
    if dep.file_path and os.path.exists(dep.file_path):
        os.remove(dep.file_path)
    db.delete(dep); db.commit()
    return {"ok": True}


# ── Issues ────────────────────────────────────────────────────────────────────

@app.get("/api/cases/{case_id}/issues", response_model=List[IssueOut])
def list_issues(case_id: int, db: Session = Depends(get_db)):
    return db.query(models.Issue).filter(models.Issue.case_id == case_id).order_by(models.Issue.created_at).all()


@app.post("/api/cases/{case_id}/issues", response_model=IssueOut)
def create_issue(case_id: int, body: IssueCreate, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    issue = models.Issue(case_id=case_id, name=body.name, description=body.description, color=body.color)
    db.add(issue); db.commit(); db.refresh(issue)
    return issue


@app.put("/api/issues/{issue_id}", response_model=IssueOut)
def update_issue(issue_id: int, body: IssueCreate, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue.name = body.name; issue.description = body.description; issue.color = body.color
    db.commit(); db.refresh(issue)
    return issue


@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    db.delete(issue); db.commit()
    return {"ok": True}


# ── Tags ──────────────────────────────────────────────────────────────────────

@app.get("/api/depositions/{dep_id}/tags", response_model=List[TagOut])
def list_tags(dep_id: int, db: Session = Depends(get_db)):
    return (db.query(models.Tag)
            .filter(models.Tag.deposition_id == dep_id)
            .order_by(models.Tag.created_at).all())


@app.post("/api/depositions/{dep_id}/tags", response_model=TagOut)
def create_tag(dep_id: int, body: TagCreate, db: Session = Depends(get_db)):
    dep = db.query(models.Deposition).filter(models.Deposition.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Deposition not found")
    issue = db.query(models.Issue).filter(models.Issue.id == body.issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    tag = models.Tag(
        deposition_id=dep_id,
        issue_id=body.issue_id,
        selected_text=body.selected_text,
        rects_json=body.rects_json,
        note=body.note,
    )
    db.add(tag); db.commit(); db.refresh(tag)
    return tag


@app.delete("/api/tags/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag); db.commit()
    return {"ok": True}


# ── Report ────────────────────────────────────────────────────────────────────

@app.get("/api/cases/{case_id}/issues/{issue_id}/report", response_model=ReportOut)
def get_report(case_id: int, issue_id: int, db: Session = Depends(get_db)):
    issue = db.query(models.Issue).filter(
        models.Issue.id == issue_id, models.Issue.case_id == case_id
    ).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    tags = (db.query(models.Tag)
            .filter(models.Tag.issue_id == issue_id)
            .order_by(models.Tag.deposition_id, models.Tag.created_at).all())

    passages = []
    for tag in tags:
        dep = db.query(models.Deposition).filter(models.Deposition.id == tag.deposition_id).first()
        passages.append(ReportPassage(
            witness_name=dep.witness_name,
            deposition_date=dep.deposition_date,
            deposition_id=dep.id,
            tag_id=tag.id,
            note=tag.note,
            selected_text=tag.selected_text,
        ))

    return ReportOut(issue=IssueOut.model_validate(issue), passages=passages)
