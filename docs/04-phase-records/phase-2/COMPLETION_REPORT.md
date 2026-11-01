# Phase II completion and acceptance report — 2026-11-01

Acceptance remediation has delivered the review package and scoring framework; see `ACCEPTANCE_REMEDIATION.md` and `EVALUATION_METHODOLOGY.md`. Fresh regression is 80 passing Linux tests, no skips, 94% coverage, strict frontend build, 3 passing browser checks and successful real HTTP pipeline. Human-reviewed annotations remain zero, so the PARTIAL gate is unchanged. Initial implementation counts below are historical evidence.

**Overall status: PARTIAL.** The implementation, integrated runtime, Phase I regression, measured Exploratory Text Analysis and typed retrieval pass. The mandatory independent reference annotation review and precision/recall/F1 evaluation remain incomplete. This report does not turn unit test success into an extraction accuracy estimate. Academic Phase III and frontend M2 remain gated.

## Implemented modules and structure

- `analyzers/structure.py`: Python AST scopes, functions/async methods/classes/constructors/variables/import aliases/decorators/calls/FastAPI literals; Java Tree-sitter packages/imports/classes/interfaces/enums/records/methods/overloads/fields/annotations/invocations and supported Spring route literals. Malformed files retain partial or module-level evidence with warnings.
- `analyzers/exploration.py`: conservative resolution states, typed containment/import/inheritance/implementation/call edges, exact module import cycles and separated code/documentation statistics.
- `backend/codeatlas/contracts.py`, `models.py`, `service.py`, `api.py`, migration `0002_phase_two`: versioned source evidence, symbols/signatures/relationships/endpoints/statistics, relational persistence and deterministic analysis jobs. Existing Phase I CAIR is unchanged.
- `frontend/src/data/api.ts`, `mock.ts`, `generated.ts`: typed real Phase II adapter methods and explicit mock-only errors. Original M1 design system and authoritative UI specification remain unchanged.
- `scripts/phase2_report.py`, `tests/test_phase_two.py`, `docs/07-findings/phase-2/`: reproducible measured JSON and five SVG charts, accepted fixture assertions and findings.

API endpoints added: `POST /api/v1/snapshots/{snapshot_id}/analysis`; `GET /api/v1/jobs/{job_id}/analysis`, `/overview`, `/graph`. The analysis request starts/reuses default preprocessing, returns 409 while asynchronous preprocessing is still running, and can be retried. All endpoints use versioned OpenAPI schemas and existing error envelopes.

## Actual measured results

The MIT synthetic fixture corpus yielded **7 files (4 Python, 3 Java), 65 source lines, 205 tokens, 59 distinct non-comment token spellings, 20 symbols, 20 relationships, 2 structural warnings, and 0 API endpoints**. Existing symbol documentation coverage is **10/11 = 90.9%**, counting documentable types as defined in `OBJECTIVES_AND_METHODOLOGY.md`. The result is specific to this small, duplicated synthetic corpus. Detailed frequencies, types, names, edges and status counts are in `../../07-findings/phase-2/analysis.json`; measured plots are the adjacent `identifiers.svg`, `tokens.svg`, `functions.svg`, `documentation.svg`, and `dependencies.svg`. No model performance or real repository benchmark is claimed.

## Verification

Final rebuilt Docker Linux integration suite against PostgreSQL 17.11, Redis 7.4.12 and current Celery worker: **73 passed, no skips, 94% statement coverage**. This includes Phase I regression, migration up/check/down, database persistence, API, security inputs, mocked GitHub, concurrency, live worker and Phase II fixtures. Exact command and observed output excerpt are in `TESTING_AND_EVALUATION.md` and `../../06-testing-verification/evidence/phase2-backend-container.txt`. Ruff lint and format passed (38 Python files); OpenAPI generation and strict frontend build passed; Playwright **3 passed** (`../../06-testing-verification/evidence/phase2-frontend-browser.txt`). Real HTTP import → preprocess → analysis → graph retrieval → original-byte readback passed: import 201, both jobs complete, 2 symbols, 1 relationship, exact bytes, measured one-function coverage 1.0 (`../../06-testing-verification/evidence/runtime-smoke.json`). `scripts/phase2_report.py` regenerated the corpus findings. `git diff --check` passed.

## Known issues and acceptance gate

The fixture tests specify expected behavior, but **an independently reviewed gold annotation set does not exist**. Precision, recall and F1 are NOT RUN and cannot be inferred from test pass rate. This is the mandatory outstanding item for a full PASS. Create and independently review symbol/edge gold labels for both languages, then run a separate evaluation with true/false positives and negatives. Do not present corpus coverage as extraction accuracy.

Other supported-subset limits: Python syntax errors yield module-only structural records; Java Tree-sitter recovers partial structures. Attribute calls, Java overload resolution, dynamic imports/reflection, wildcard binding, and full Java type resolution remain unresolved/ambiguous as appropriate. JavaDoc adjacency with intervening annotations may not associate with a symbol. Relative imports and missing absolute imports have different status rules. Empty data has defined zero metrics. Remote CI and live GitHub fetching were not run; deterministic mocks are used. The four original UI reference images remain absent.

Required Phase II fix: independent gold review and extraction evaluation. Phase III readiness: the typed graph and overview API, measured data and persistent jobs are available, but Phase II should receive a full evaluation gate before Phase III approval. No Phase III implementation was started.
