"""Additive Phase IV APIs. Models never download during an API request."""

from typing import Literal

from fastapi import APIRouter

from nlp.contracts import (
    GeneratedSummary,
    ModelCatalog,
    ModelContract,
    ModelEvaluationRun,
    ModelMetadata,
    NERPredictionResult,
)
from nlp.ner import ENCODER, ENCODER_REVISION
from nlp.registry import list_runs, read_run
from nlp.summarization import CODET5, REVISION

from .contracts import Job
from .errors import PipelineError
from .nlp_service import model_input, model_revision


class SummaryRequest(ModelContract):
    analysis_job_id: str
    symbol_id: str
    method: Literal["baseline", "codet5"] = "baseline"


class NLPRequest(ModelContract):
    analysis_job_id: str
    symbol_id: str
    method: Literal["baseline", "codet5", "ner"] = "baseline"


def router(service, dispatch):
    api = APIRouter(prefix="/api/v1/nlp", tags=["Phase IV NLP"])

    @api.get("/models", response_model=ModelCatalog)
    def models():
        return ModelCatalog(
            models=[
                ModelMetadata(
                    model_id=CODET5,
                    revision=REVISION,
                    tokenizer_revision=REVISION,
                    license="BSD-3-Clause",
                    device="not_loaded",
                ),
                ModelMetadata(
                    model_id=ENCODER,
                    revision=ENCODER_REVISION,
                    tokenizer_revision=ENCODER_REVISION,
                    license="Apache-2.0",
                    device="not_loaded",
                ),
            ],
            note="Catalog entries do not assert local availability or independent evaluation; DistilBERT is the base encoder.",
        )

    @api.get("/experiments", response_model=list[str])
    def experiments():
        return list_runs(service.settings.nlp_runs_root)

    @api.get("/experiments/{experiment_id}", response_model=ModelEvaluationRun)
    def experiment(experiment_id: str):
        try:
            return read_run(service.settings.nlp_runs_root, experiment_id)
        except FileNotFoundError as exc:
            raise PipelineError("not_found", "Experiment not found", 404) from exc
        except (ValueError, KeyError) as exc:
            raise PipelineError(
                "invalid_experiment", "Experiment record or identifier is invalid", 422
            ) from exc

    @api.post("/snapshots/{snapshot_id}/jobs", response_model=Job, status_code=202)
    def start(snapshot_id: str, request: NLPRequest):
        model_input(service, snapshot_id, request.analysis_job_id, request.symbol_id)
        parameters = {**request.model_dump(exclude={"schema_version"}), "algorithm_version": "phase4-v1"}
        parameters["model_revision"] = model_revision(request.method)
        return dispatch(service.create_job("nlp", parameters, snapshot_id))

    @api.get(
        "/snapshots/{snapshot_id}/jobs/{job_id}/result", response_model=GeneratedSummary | NERPredictionResult
    )
    def result(snapshot_id: str, job_id: str):
        job = service.job(job_id)
        if job.snapshot_id != snapshot_id:
            raise PipelineError("snapshot_mismatch", "Job belongs to another snapshot", 409)
        return service.nlp_result(job_id)

    @api.post("/snapshots/{snapshot_id}/summaries", response_model=GeneratedSummary)
    def summarize(snapshot_id: str, request: SummaryRequest):
        if request.method != "baseline":
            raise PipelineError("async_required", "Submit CodeT5 through the NLP jobs endpoint", 422)
        model_input(service, snapshot_id, request.analysis_job_id, request.symbol_id)
        parameters = {**request.model_dump(exclude={"schema_version"}), "algorithm_version": "phase4-v1"}
        parameters["model_revision"] = model_revision(request.method)
        job = service.create_job("nlp", parameters, snapshot_id)
        service.run_job(job.id)
        return service.nlp_result(job.id)

    return api
