# Phase II acceptance remediation

Verdict: **PARTIAL — REVIEW_PENDING**. Reviewed files: **0**. Reviewed symbol/relationship annotations: **0**. Precision, recall and F1: **not measured; null**, because no independently reviewed reference exists. No reviewer identity or approval is fabricated.

## Previously verified capability

Import, source preservation, preprocessing, Python/Java extraction, versioned CAIR, conservative dependency graphs, EDA, database persistence, deterministic jobs and typed API/frontend adapters were already operational. Initial test baseline was 73 passing Linux tests. Architecture, UI specification and frontend milestone scope are preserved.

## Delivered remediation

`datasets/evaluation/` contains seven MIT synthetic sources (4 Python, 3 Java), immutable source hashes, annotation JSON schema, source-first labeling guidelines, empty forms, pending reviewer sign-off and disagreement record. `candidates/initial.json` preserves **42 analyzer symbol candidates and 50 relationship candidates**. They are explicitly machine predictions. `review/labels.json` has no predicted answers; its provenance is `blank`. Current regenerated predictions are stored separately in `docs/07-findings/phase-2/evaluation/`.

`analyzers/evaluation.py` implements multiset TP/FP/FN, precision/recall/F1, per-language/category counts, micro totals and macro means, dependency counts, and complete FP/FN examples. Exact matching rules and undefined denominator behavior are defined in `EVALUATION_METHODOLOGY.md`. Seven new tests exercise hand-calculated metrics, strict signatures/resolution, duplicates, empty populations, review provenance/hash/completeness validation, fixture hash consistency and Unicode spans. These are evaluator correctness tests, not empirical extraction accuracy.

Confirmed defect corrected: Python AST byte columns were used as Unicode CAIR columns. They now convert to Unicode code-point columns. A regression checks the source slice for `β` after `α` on the same line. The independent-review corpus has not been scored against its own candidates. Standalone parameter symbols remain an explicit extraction limitation; names/types currently appear in signatures.

## Actual executed verification

```sh
.venv/bin/pytest -q tests/test_evaluation.py tests/test_phase_two.py
.venv/bin/python -m scripts.extraction_evaluation prepare
.venv/bin/python -m scripts.extraction_evaluation evaluate
docker compose -f compose.yaml --progress plain up --build -d api worker
docker compose -f compose.yaml run --rm --no-deps \
  --volume "$PWD/tests:/app/tests:ro" \
  --volume "$PWD/datasets/evaluation:/app/datasets/evaluation:ro" \
  -e CODEATLAS_TEST_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_RUN_WORKER_TEST=1 -e COVERAGE_FILE=/tmp/.coverage \
  -e HYPOTHESIS_STORAGE_DIRECTORY=/tmp/hypothesis \
  api pytest -q -o cache_dir=/tmp/pytest-cache \
  --cov=backend/codeatlas --cov=analyzers --cov=workers --cov-report=term-missing
npm --prefix frontend run build
env -u NO_COLOR PLAYWRIGHT_CHROME=1 npm --prefix frontend run test:e2e
.venv/bin/python -m scripts.runtime_smoke
.venv/bin/ruff check backend analyzers workers tests scripts
.venv/bin/ruff format --check backend analyzers workers tests scripts
git diff --check
```

Observed: focused tests **11 passed**; full rebuilt Linux PostgreSQL/Redis/Celery suite **80 passed, no skips, 94% coverage**; strict frontend build passed; browser **3 passed**; lint/format passed (41 files); whitespace check passed. Live HTTP smoke: import 201, preprocessing/analysis complete, 2 symbols, 1 relationship, graph retrieved, original bytes equal. Evaluator reports REVIEW_PENDING, reviewed_examples 0, metrics null. Raw command outputs: `../../06-testing-verification/evidence/remediation-backend.txt`, `remediation-frontend.txt` and existing `runtime-smoke.json`. Reference status report: `../../07-findings/phase-2/evaluation/results.json`.

## Outstanding manual action

An independent human reviewer must inspect the source fixtures without candidate predictions, label symbols/relationships, save the blind first pass, then compare candidates and document disagreements/corrections. Submit final `review/labels.json`, resolved `review/disagreements.json` and signed `review/signoff.json` with reviewer identity, date, manifest hash and final label byte hash. Full review instructions are in `datasets/evaluation/GUIDELINES.md`. The CLI validates recorded attestation/hashes but cannot prove a person's identity or independence. After genuine approval, rerun `evaluate`; it will save per-language/category/aggregate metrics and all FP/FN examples. Investigate failures before reconsidering PASS. No Phase III work was started.
