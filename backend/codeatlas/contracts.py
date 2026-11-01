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
    kind: Literal["preprocess", "github", "analyze"]
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


class SourceEvidence(Contract):
    snapshot_id: str
    file_id: str
    relative_path: str
    span: Span


class Symbol(Contract):
    id: str
    snapshot_id: str
    file_id: str
    name: str
    qualified_name: str
    kind: Literal[
        "module",
        "class",
        "interface",
        "enum",
        "record",
        "function",
        "method",
        "constructor",
        "variable",
        "field",
        "parameter",
    ]
    parent_id: str | None = None
    signature: str | None = None
    parameters: list[str] = Field(default_factory=list)
    return_type: str | None = None
    modifiers: list[str] = Field(default_factory=list)
    decorators: list[str] = Field(default_factory=list)
    documented: bool = False
    documentation_evidence: SourceEvidence | None = None
    evidence: SourceEvidence
    analyzer_version: str = "phase2-v1"


class Relationship(Contract):
    id: str
    snapshot_id: str
    source_id: str
    target_id: str | None = None
    target_name: str
    alias: str | None = None
    kind: Literal["contains", "imports", "inherits", "implements", "calls"]
    resolution: Literal["confirmed", "ambiguous", "unresolved", "external"]
    evidence: SourceEvidence
    analyzer_version: str = "phase2-v1"


class EndpointDeclaration(Contract):
    id: str
    snapshot_id: str
    symbol_id: str
    method: str
    route: str
    framework: str
    evidence: SourceEvidence


class Frequency(Contract):
    value: str
    count: int


class ExploratoryStatistics(Contract):
    files: int
    languages: dict[str, int]
    source_lines: int
    comment_lines: int
    documented_symbols: int
    documentable_symbols: int
    documentation_coverage: float
    tokens: int
    vocabulary_size: int
    lexical_diversity: float
    duplicate_files: int
    token_types: dict[str, int]
    token_frequencies: list[Frequency]
    identifiers: list[Frequency]
    keywords: list[Frequency]
    documentation_terms: list[Frequency]
    identifier_lengths: dict[int, int]
    naming_patterns: dict[str, int]
    comment_lengths: list[int]
    docstring_lengths: list[int]
    symbols_by_kind: dict[str, int]
    documentation_by_kind: dict[str, dict[str, int]]
    undocumented_symbols: list[str]
    functions_per_module: dict[str, int]
    methods_per_class: dict[str, int]
    function_lengths: list[int]
    class_sizes: list[int]
    relationships_by_status: dict[str, int]
    module_fan_in: dict[str, int]
    module_fan_out: dict[str, int]
    circular_dependencies: list[list[str]]


class StructuralAnalysis(Contract):
    snapshot_id: str
    preprocessing_job_id: str
    symbols: list[Symbol]
    relationships: list[Relationship]
    endpoints: list[EndpointDeclaration]
    statistics: ExploratoryStatistics
    issues: list[PipelineIssue]
    analyzer_version: str = "phase2-v1"


class DependencyGraph(Contract):
    snapshot_id: str
    nodes: list[Symbol]
    edges: list[Relationship]
