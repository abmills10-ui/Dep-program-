from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Case(Base):
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    depositions = relationship("Deposition", back_populates="case", cascade="all, delete-orphan")
    issues = relationship("Issue", back_populates="case", cascade="all, delete-orphan")


class Deposition(Base):
    __tablename__ = "depositions"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    witness_name = Column(String, nullable=False)
    deposition_date = Column(String, default="")
    filename = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("Case", back_populates="depositions")
    segments = relationship(
        "TranscriptSegment",
        back_populates="deposition",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.segment_index",
    )
    tags = relationship("Tag", back_populates="deposition", cascade="all, delete-orphan")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    id = Column(Integer, primary_key=True, index=True)
    deposition_id = Column(Integer, ForeignKey("depositions.id"), nullable=False)
    segment_index = Column(Integer, nullable=False)
    speaker = Column(String, default="OTHER")  # Q, A, HEADING, OTHER
    text = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    line_number = Column(Integer, nullable=True)
    deposition = relationship("Deposition", back_populates="segments")


class Issue(Base):
    __tablename__ = "issues"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    color = Column(String, default="#4CAF50")
    created_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("Case", back_populates="issues")
    tags = relationship("Tag", back_populates="issue", cascade="all, delete-orphan")


class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    deposition_id = Column(Integer, ForeignKey("depositions.id"), nullable=False)
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=False)
    start_segment_index = Column(Integer, nullable=False)
    end_segment_index = Column(Integer, nullable=False)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    deposition = relationship("Deposition", back_populates="tags")
    issue = relationship("Issue", back_populates="tags")
