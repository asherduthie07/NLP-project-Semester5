# Phase IV NLP architecture and coordination contract

The original Phase III frontend and M1–M7 specification are unchanged. This additive interface is intended for the frontend teammate; it does not imply dashboard integration is complete. Source structures remain CAIR facts with Phase II's pending accuracy validation. Inference results have independent provenance and evaluation status.

## Modules and flow

`nlp/dataset.py` → `nlp/summarization.py` or `nlp/ner.py` → `nlp/metrics.py`/`nlp/review.py` → JSON experiment artifacts. `backend/codeatlas/nlp_service.py` obtains a callable symbol and its exact source slice from the same snapshot's preprocessing/analysis records. The service never executes imported code.

NLP jobs reuse the existing JobRow JSON persistence, transaction locking, Celery dispatch, error envelope and explicit retries. No new table or migration is necessary: the existing jobs schema accommodates the additive `nlp` kind. The idempotency key includes snapshot, analysis job, symbol, method, algorithm version and checkpoint revision. Completed jobs are reused; failed jobs may be resubmitted. Results are committed atomically with completion. Retrieval requires the matching snapshot. Source text is not sent through Redis.

Baseline is lightweight and supported in the normal backend image. CodeT5/NER require an explicitly provisioned optional runtime and local weights. API requests never download models. Expensive calls run through the existing asynchronous jobs endpoint. A process lock serializes model execution within a worker, and CodeT5 retains loaded weights. Separate worker processes can each consume memory; use concurrency one for model experiments. Default backend memory limits are not adequate for general transformer deployment. Dedicated deployment/scaling remains Phase V.

## Versioned routes

| Route | Behavior |
|---|---|
| GET `/api/v1/nlp/models` | Pinned model catalog; catalog presence does not assert availability or evaluation |
| GET `/api/v1/nlp/experiments` | Local experiment IDs under configured controlled storage |
| GET `/api/v1/nlp/experiments/{id}` | Typed measured-metric projection, model revision and explicit review/execution warnings |
| POST `/api/v1/nlp/snapshots/{snapshot}/summaries` | Synchronous deterministic baseline, persisted and idempotent; CodeT5 requests receive `async_required` |
| POST `/api/v1/nlp/snapshots/{snapshot}/jobs` | Existing Job contract, HTTP 202; method baseline, codet5 or ner |
| GET `/api/v1/jobs/{job}` | Existing job state and issues |
| GET `/api/v1/nlp/snapshots/{snapshot}/jobs/{job}/result` | GeneratedSummary or NERPredictionResult, or result_not_ready / snapshot_mismatch |

Example request (identifiers must be replaced with actual import/analysis response values):

```json
{"analysis_job_id":"<completed-analysis-job>","symbol_id":"<function-or-method-id>","method":"baseline"}
```

`nlp/contracts.py` is authoritative: GeneratedSummary, NEREntity, NERPredictionResult, ModelMetadata, ModelEvaluationRun, ModelMetric, GroundingResult and ModelJobStatus. All use schema_version 1.0, and forbid extra fields. The actual async API reuses the existing `Job` contract rather than creating a second queue protocol. `ModelJobStatus` is an integration projection only.

Evidence includes snapshot and symbol IDs, path, exact source-slice hash and original half-open line/column span. Lines are one-based; columns are zero-based Unicode characters. NER start/end are zero-based Unicode offsets **within this slice**, not the whole file. First-line columns require adding the evidence start column; subsequent lines start at column zero.

Summary states complete/unsupported/failed describe execution, not truth. A completed transformer summary remains semantically unverified. Job state complete can contain an `unsupported` result for input overflow; no prose was generated. Failure never becomes a fake baseline fallback. `validated: false` means independent model quality remains unestablished. No confidence probability is exposed.

Unmeasured durations are null. The initial experimental baseline artifacts used zero as a default sentinel; it must not be displayed as measured latency. The current contract fixes that ambiguity. Checkpoint revisions are checked again when a queued job executes; a changed checkpoint fails explicitly instead of silently returning a result under the old version's idempotency key.

## Hierarchy and grounding boundaries

`hierarchy(level, name, children)` composes explicit groups, preserves child evidence and findings, and rejects cross-snapshot/failed children. `nlp.hierarchy.compose` additionally traverses CAIR containment to group functions, nested declarations, classes, modules and a repository. It records direct-member counts and imports/inheritance/interface references with their existing resolution status. Supplied function summaries must have matching evidence; missing ones use deterministic templates. This is factual record synthesis, not validated whole-repository transformer summarization. Entry-point inference and arbitrary class/module purpose remain unsupported.

Grounding verifies source hash retention, literal identifier presence and narrowly formatted explicit name/parameter/file claims against supplied metadata. Call/module semantics remain unresolved. It does not exhaustively parse arbitrary prose, resolve all APIs, prove behavior, or replace Phase V documentation verification. Human review is required for behavioral descriptions.

## Experiment retrieval and deployment boundary

Experiments are immutable directories under ignored `storage/nlp-runs/<run-id>/result.json` with dataset hash, settings, versions, actual outputs and metrics. The read-only registry projects these into ModelEvaluationRun; configure `CODEATLAS_NLP_RUNS_ROOT` to expose the intended directory. IDs are allowlisted, paths cannot escape the root, and records are limited to 2 MB. Missing runs return 404; invalid records return 422. Small measured reports may be copied into docs for academic evidence; weights stay ignored. There is no automatic model promotion or production resource isolation for transformer workers.

Merge guidance: keep the teammate's frontend changes; merge additive backend job-kind/routes and Phase IV documentation. The sole frontend change is regenerated `frontend/src/data/generated.ts`, required by the repository's contract-consistency CI check. It includes the widened Job kind and additive NLP schemas. Regenerate from the merged OpenAPI instead of overwriting a teammate's generated interfaces. No layouts, interactions, visual components or frontend configuration were changed.
