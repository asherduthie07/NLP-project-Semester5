# Phase IV implementation record

Branch: `phase-4`. No branch switch, reset, merge or commit was performed. Initial worktree was clean. Phase I's historical PASS and Phase II's PARTIAL/REVIEW_PENDING are preserved. The original UI specification was read in full; missing reference images remain unreviewed. No Phase III dashboard or Phase V publishing/deployment work is included.

## IV-A — Dataset engineering

Added typed source/reference examples, provenance, language syntax validation, exact and near-duplicate filtering, repository-separated splits, source/name alignment, source offsets and a source-first review gate. The eight synthetic examples yield four train, two validation and two test examples, with no quality-filter issues. Candidate labels contain 18 declaration entities, zero independently reviewed. Original strings, candidate labels and blank review forms remain separate. License is MIT for these project-authored snippets; no third-party repository license is invented.

## IV-B — Deterministic baseline

Name, parameters and declared return type produce deterministic templates with source evidence. Real API inputs come from CAIR rather than client-supplied prose. Tests verify determinism, exact source hash, persistence and snapshot isolation. Templates deliberately do not infer business intent. Phase II's unvalidated empirical extraction accuracy is a dependency.

## IV-C — CodeT5 adapter

Pinned model/tokenizer revisions, lazy loading, cache reuse, supported-device selection, CPU fallback, deterministic decoding, explicit context overflow, output normalization, source provenance, duration and error records. An empty output is a failure. No model-generated confidence is invented. Real-model execution evidence is recorded in the final report rather than inferred from mocked tests.

## IV-D — NER

Added genuine DistilBERT token-classification training code, seven BIO labels for FUNCTION/METHOD/PARAMETER declarations, Unicode offset alignment, special-token masking, AdamW, checkpoint/provenance saving, inference and span reconstruction. Batch size one is an explicit simple collator strategy. Local NER loading requires a trained checkpoint and compatible label map; it never presents an untrained random head as an available model. Final independent entity accuracy remains blocked by human review. Training execution status is recorded separately.

## IV-E — Hierarchy

Explicit grouping and CAIR containment traversal compose function, nested-definition, class, module and repository text while retaining source evidence, member counts, import/inheritance resolution status, child findings and snapshot boundaries. Real Python/Java pipeline fixtures verify the grouping. This is limited deterministic synthesis, not a transformer validated for arbitrary repository text. Arbitrary semantic-purpose and entry-point inference remain unsupported.

## IV-F — Evaluation

Added exact-span entity TP/FP/FN, per-category and micro/macro metrics, per-language reporting, false-positive/negative identities, BLEU and ROUGE-L. Added experimental manifests, package versions, seeds, checkpoint hashes and memory/latency fields. Review scoring requires source hashes, complete labels, actual attestation and a run with the exact training/test provenance. Five metric arithmetic checks passed inside the installed NLP environment. Metrics from actual models, if available, are explicitly provisional for this unreviewed tiny corpus.

## IV-G — Integration and verification

NLP jobs reuse existing PostgreSQL/Celery behavior and persist results. Added baseline convenience, async methods, model catalog, snapshot-bound retrieval and controlled read-only experiment retrieval. The only frontend modification is generated API types, necessary to keep the checked-in contract consistent; no UI work was performed.

Final review added a queued-job checkpoint-revision guard and corrected unmeasured baseline/hierarchy timing defaults to null. The original experimental baseline's zero timing sentinel is explicitly excluded from latency analysis; historical artifacts remain preserved. Separate parser declaration baseline candidates are source-linked and not self-scored as gold.

The live smoke uncovered a genuine Celery child import failure for the new `nlp` package. Fixed the backend image's `PYTHONPATH=/app`, rebuilt a cached-dependency audit image, and reran the actual HTTP → preprocessing → analysis → graph → Python/Java baseline jobs flow successfully. The smoke script is retained as regression evidence.

## Environment problems and resolutions

- Fresh Python 3.11 base image download stalled; used the project's cached Python 3.13.2 Linux base instead.
- CPU-only PyTorch index could not resolve sympy; combined index also failed CPU-version resolution. Used the official CPU wheel URL, SHA-256 pinned after download, and PyPI for dependencies.
- A dependency download timed out and discarded the initial layer. Split the large wheel installation from dependency installation and added a pip download cache. The NLP runtime subsequently built and `pip check` reported no broken requirements. Captured a complete `nlp/requirements.lock` from the installed environment.
- A fresh normal backend build could not retrieve the pre-existing `tzlocal==5.4.5` pin. No dependency version was silently changed. Regression uses the previously installed backend dependency image with current source; this is not claimed to be a successful clean dependency rebuild.
- Independent Phase II/IV review has not occurred. No reviewer, approval, accuracy score or human quality rating was fabricated.

Final commands/results, remaining limitations and acceptance decision are maintained in COMPLETION_REPORT.md and the Phase IV verification record.
