from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ModelContract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal["1.0"] = "1.0"


class Evidence(ModelContract):
    snapshot_id: str
    symbol_id: str
    path: str
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    start_line: int = Field(default=1, ge=1)
    start_column: int = Field(default=0, ge=0)
    end_line: int | None = Field(default=None, ge=1)
    end_column: int | None = Field(default=None, ge=0)


class ModelInput(ModelContract):
    source: str = Field(min_length=1, max_length=200000)
    language: Literal["python", "java"]
    name: str
    parameters: list[str] = Field(default_factory=list)
    return_type: str | None = None
    evidence: Evidence


class GenerationSettings(ModelContract):
    max_input_tokens: int = Field(default=512, ge=8, le=512)
    max_new_tokens: int = Field(default=64, ge=1, le=256)
    num_beams: int = Field(default=4, ge=1, le=8)
    do_sample: Literal[False] = False
    seed: int = 42


class ModelMetadata(ModelContract):
    model_id: str
    revision: str
    tokenizer_revision: str
    license: str
    device: str
    validated: bool = False


class GroundingResult(ModelContract):
    status: Literal["VERIFIED", "UNSUPPORTED", "UNRESOLVED", "REVIEW_REQUIRED"]
    check: str
    detail: str
    evidence: Evidence


class GeneratedSummary(ModelContract):
    status: Literal["complete", "failed", "unsupported"]
    text: str = ""
    method: Literal["baseline", "codet5", "hierarchical"]
    evidence: list[Evidence]
    model: ModelMetadata | None = None
    settings: GenerationSettings | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    duration_seconds: float | None = None
    partial_context: bool = False
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    grounding: list[GroundingResult] = Field(default_factory=list)


class NEREntity(ModelContract):
    label: str
    text: str
    start: int = Field(ge=0)
    end: int = Field(ge=1)


class NERPredictionResult(ModelContract):
    status: Literal["complete", "failed", "unsupported"]
    entities: list[NEREntity] = Field(default_factory=list)
    evidence: Evidence
    model: ModelMetadata | None = None
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None


class ModelMetric(ModelContract):
    name: str
    value: float | None
    population: str
    reference_quality: str


class ModelEvaluationRun(ModelContract):
    experiment_id: str
    dataset_hash: str
    seed: int
    hardware: str
    packages: dict[str, str]
    metrics: list[ModelMetric]
    warnings: list[str]
    model_id: str | None = None
    model_revision: str | None = None
    tokenizer_revision: str | None = None


class ModelJobStatus(ModelContract):
    job_id: str
    snapshot_id: str
    state: Literal["pending", "running", "complete", "failed", "not_evaluated"]
    error: str | None = None


class ModelCatalog(ModelContract):
    models: list[ModelMetadata]
    note: str
