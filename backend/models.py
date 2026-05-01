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
    file_path = Column(String, default="")   # path to stored original file on disk
    created_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("Case", back_populates="depositions")
    tags = relationship("Tag", back_populates="deposition", cascade="all, delete-orphan")


class Issue(Base):
    __tablename__ = "issues"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    color = Column(String, default="#FFD700")
    created_at = Column(DateTime, default=datetime.utcnow)
    case = relationship("Case", back_populates="issues")
    tags = relationship("Tag", back_populates="issue", cascade="all, delete-orphan")


class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    deposition_id = Column(Integer, ForeignKey("depositions.id"), nullable=False)
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=False)
    selected_text = Column(Text, default="")   # verbatim highlighted text
    rects_json = Column(Text, default="[]")    # JSON: [{x,y,w,h,pageIndex}] normalized 0-1
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    deposition = relationship("Deposition", back_populates="tags")
    issue = relationship("Issue", back_populates="tags")
