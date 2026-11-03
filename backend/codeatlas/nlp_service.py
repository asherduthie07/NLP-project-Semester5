"""CAIR-to-NLP bridge. Imported source is sliced, never executed."""

import hashlib
import logging
import os
from pathlib import Path
from threading import Lock

from nlp.contracts import Evidence, ModelInput
from nlp.dataset import digest
from nlp.ner import NERPredictor
from nlp.summarization import CodeT5Summarizer, baseline

from .errors import PipelineError

_model_lock = Lock()
_summarizer = CodeT5Summarizer(offline=True)


def model_revision(method):
    from nlp.summarization import REVISION

    if method == "baseline":
        return "template-v1"
    if method == "codet5":
        return REVISION
    checkpoint = os.getenv("CODEATLAS_NER_CHECKPOINT")
    if checkpoint:
        try:
            with (Path(checkpoint) / "model.safetensors").open("rb") as stream:
                return hashlib.file_digest(stream, "sha256").hexdigest()
        except OSError:
            pass  # Unavailable is explicit provenance; execution reports a failed job.
    return "unavailable"


def model_input(service, snapshot_id, analysis_job_id, symbol_id):
    analysis = service.analysis(analysis_job_id)
    if analysis.snapshot_id != snapshot_id:
        raise PipelineError("snapshot_mismatch", "Analysis belongs to another snapshot", 409)
    symbol = next((s for s in analysis.symbols if s.id == symbol_id), None)
    if symbol is None or symbol.kind not in {"function", "method", "constructor"}:
        raise PipelineError("unsupported_symbol", "Function or method symbol required", 422)
    pre = service.result(analysis.preprocessing_job_id)
    file = next(f for f in pre.results if f.file_id == symbol.file_id)
    span = symbol.evidence.span
    lines = file.parsed_source.split("\n")
    selected = lines[span.start.line - 1 : span.end.line]
    if len(selected) == 1:
        source = selected[0][span.start.column : span.end.column]
    else:
        selected[0] = selected[0][span.start.column :]
        selected[-1] = selected[-1][: span.end.column]
        source = "\n".join(selected)
    return ModelInput(
        source=source,
        language=file.language,
        name=symbol.name,
        parameters=symbol.parameters,
        return_type=symbol.return_type,
        evidence=Evidence(
            snapshot_id=snapshot_id,
            symbol_id=symbol.id,
            path=file.relative_path,
            source_hash=digest(source),
            start_line=span.start.line,
            start_column=span.start.column,
            end_line=span.end.line,
            end_column=span.end.column,
        ),
    )


def execute(service, snapshot_id, parameters):
    item = model_input(service, snapshot_id, parameters["analysis_job_id"], parameters["symbol_id"])
    expected_revision = parameters.get("model_revision")
    if expected_revision and expected_revision != model_revision(parameters["method"]):
        raise PipelineError("model_revision_changed", "Selected checkpoint changed; submit a new job", 409)
    if parameters["method"] == "baseline":
        return baseline(item)
    # Serialize expensive inference within this worker process, keep cached weights in memory.
    with _model_lock:
        if parameters["method"] == "codet5":
            result = _summarizer.summarize(item)
        elif parameters["method"] == "ner":
            result = NERPredictor(os.getenv("CODEATLAS_NER_CHECKPOINT")).infer(item)
        else:
            raise PipelineError("unsupported_model", "Unknown NLP method", 422)
    if result.status == "failed":
        logging.warning("NLP model failure: %s", result.error)
        raise PipelineError(
            "model_unavailable", "Model execution failed; provision the NLP runtime and checkpoint", 503
        )
    if result.model and expected_revision and result.model.revision != expected_revision:
        raise PipelineError("model_revision_changed", "Model result revision differs from the job", 409)
    return result
