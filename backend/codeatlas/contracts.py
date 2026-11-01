"""API/CAIR v1. Locations are decoded-original Unicode columns, half-open, line 1-based."""

from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal["1.0"] = "1.0"


class Language(StrEnum):
    PYTHON = "python"
    JAVA = "java"


class Position(Contract):
    line: int = Field(ge=1)
    column: int = Field(ge=0)


class Span(Contract):
    start: Position
    end: Position


class PipelineIssue(Contract):
    code: str
    message: str
    severity: Literal["warning", "error"] = "warning"
    file_id: str | None = None
    relative_path: str | None = None
    span: Span | None = None


class PreprocessingConfig(Contract):
    version: Literal["phase1-v1"] = "phase1-v1"
    normalize_newlines: bool = True
    split_identifiers: bool = True
    filter_comment_markers: bool = True
    max_tokens_per_file: int = Field(default=100000, ge=1, le=500000)


class Project(Contract):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(min_length=1, max_length=120)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SourceFile(Contract):
    id: str
    snapshot_id: str
    relative_path: str
    language: Language
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    size_bytes: int = Field(ge=0)
    encoding: str
    duplicate_of: str | None = None
    analysis_status: Literal["pending"] = (
        "pending"  # Immutable import metadata; status lives on results/jobs.
    )


class IgnoredFile(Contract):
    relative_path: str
    reason: str


class ImportManifest(Contract):
    snapshot_id: str
    files: list[SourceFile]
    ignored: list[IgnoredFile] = Field(default_factory=list)
    issues: list[PipelineIssue] = Field(default_factory=list)


class SourceSnapshot(Contract):
    id: str
    project_id: str
    content_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_kind: Literal["files", "zip", "github"]
    origin: str | None = None
    commit_sha: str | None = None
    manifest: ImportManifest


class TokenRecord(Contract):
    id: str
    file_id: str
    relative_path: str
    text: str
    kind: Literal["identifier", "keyword", "string", "number", "operator", "punctuation", "comment", "other"]
    span: Span
    utf8_start: int = Field(ge=0)
    utf8_end: int = Field(ge=0)


class ExtractedComment(Contract):
    id: str
    file_id: str
    relative_path: str
    kind: Literal["comment", "docstring", "javadoc"]
    text: str
    span: Span


class NlpSegment(Contract):
    file_id: str
    relative_path: str
    kind: Literal["identifier", "comment", "docstring", "javadoc"]
    text: str
    span: Span


class FileStatistics(Contract):
    source_lines: int
    comments: int
    docstrings: int
    tokens: int
    unique_identifiers: int


class PreprocessingResult(Contract):
    id: str
    file_id: str
    snapshot_id: str
    relative_path: str
    language: Language
    content_hash: str
    analysis_status: Literal["complete", "warning", "error"]
    encoding: str
    original_artifact: str  # Content-addressed reference, never a client-controlled filesystem path.
    parsed_source: str  # Exact decoded original; tokenizer locations refer to this.
    normalized_source: str
    nlp_segments: list[NlpSegment]
    tokens: list[TokenRecord]
    comments: list[ExtractedComment]
    issues: list[PipelineIssue]
    statistics: FileStatistics
    parser_version: str
    tokenizer_version: str
    configuration: PreprocessingConfig


class PreprocessingStatistics(Contract):
    files_imported: int
    python_files: int
    java_files: int
    source_lines: int
    comments: int
    docstrings: int
    tokens: int
    unique_identifiers: int
    duplicate_files: int
    ignored_files: int
    unsupported_files: int
    errors: int
    warnings: int


class CAIR(Contract):
    """Phase I lexical IR. No semantic symbols, graph edges or AI claims yet."""

    snapshot_id: str
    configuration: PreprocessingConfig
    results: list[PreprocessingResult]
    statistics: PreprocessingStatistics


class Job(Contract):
    id: str
    kind: Literal["preprocess", "github"]
    snapshot_id: str | None = None
    project_id: str | None = None
    status: Literal["queued", "running", "complete", "failed"] = "queued"
    issues: list[PipelineIssue] = Field(default_factory=list)


class ErrorDetail(Contract):
    code: str
    message: str
    details: list[dict[str, str]] = Field(default_factory=list)


class ErrorResponse(Contract):
    error: ErrorDetail


class GitHubImportRequest(Contract):
    url: str = Field(min_length=1, max_length=300)
    name: str = Field(default="GitHub project", min_length=1, max_length=120)


class PreprocessRequest(Contract):
    configuration: PreprocessingConfig = Field(default_factory=PreprocessingConfig)
