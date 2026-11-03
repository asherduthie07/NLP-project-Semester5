# Phase IV → main integration — 2026-11-03

Status: verification in progress; main promotion pending.

Sources: origin/main `72e126ac9eeeffb05614f487dc6f01163a08acbc`, origin/phase-4 `1e0ee7b25050960bcfebf45140d9625897ee60ee`. Local phase-4 matched the remote. Initial workspace was clean. Started at 10:39:10 UTC; maximum deadline 12:39:10 UTC.

Plan: merge remote phase-4 into integration/phase4-main from latest remote main, retain both implementations, verify contracts and regressions, open PR and promote only after checks pass. No Phase V work.

Only conflict: docs/CHANGELOG.md; preserved both independent phase histories. Shared status and traceability additions merged automatically. No source-code conflict, database schema change or dependency-pin conflict. Phase III frontend and visualization code preserved; Phase IV NLP, evaluation, training, inference and generated contracts retained.

Compatibility fixes: CI Node 22.16.0 raised to 22.22.2 to satisfy existing jsdom/undici lockfile requirements. Existing main's shell unit/browser assertions still treated implemented Explorer and Verification routes as placeholders; updated exact route expectations and verified Explorer target instead of obsolete pending text. Assertions retained, no tests removed.

Verification so far:
- `.venv/bin/pip check`: PASS.
- Ruff check and format for backend/analyzers/workers/tests/scripts/nlp/experiments: PASS.
- Python compileall: PASS.
- pytest: 95 passed, 2 service skips on SQLite; isolated PostgreSQL regression: 96 passed, 1 live-worker skip. PostgreSQL migration upgrade and Alembic schema consistency are covered by test_postgres.py. One head: 0002_phase_two; offline upgrade SQL generated successfully.
- OpenAPI export and frontend contract regeneration: no differences from merged contracts.
- npm ci: PASS, audit 0 vulnerabilities. Native Node 22.16.0 emits engine warnings; CI version corrected.
- frontend lint: PASS; unit tests: 113 passed after stale expectation repair; strict TypeScript + production build: PASS (bundle-size advisory).
- FastAPI startup and real HTTP health/model catalog: PASS. Catalog honestly reports models not loaded.
- Initial shell browser run: 38 passed, 1 skipped, 4 failures (three obsolete expectations and one local visualization timeout). After precise expectation repairs, all five targeted reruns passed, including the timeout rerun and real HTTP Live adapter. Current full frontend CI remains pending. Backend CI on 9196906 passed; previous detailed run confirms 97 tests passed, no skips, with PostgreSQL/Redis/Celery.

Fresh real model smoke: PASS. Docker was initially stopped, then started successfully. Existing image `sha256:fe3960d9cb426ca8f53ad2cc94ee2a89f0730d4cfe4410b6c28a4bcd9fd48a6e` ran with merged nlp/experiments code mounted, networking disabled, 2 CPUs and 5 GiB cap. Cached CodeT5 Python/Java generation, trained NER checkpoint reload/inference, tokenizer overflow rejection and CPU fallback passed. See model-smoke.json. No retraining or model download occurred. Independent model quality remains unverified.

Additional CI repair: pinned Ubuntu 24.04 because ubuntu-latest selected 26.04 without Python 3.13.2 support. Serial Playwright execution now enforces the documented single-worker GPU policy. The HTTP NLP smoke's hardcoded Redis/Celery label was corrected: local smoke used PostgreSQL + inline jobs and passed; CI independently verified real Redis/Celery delivery.

API compatibility: generated contracts unchanged after regeneration, no duplicate method/path registrations found, no backend/frontend production behavior rewritten. Live adapter verified via real HTTP ingestion, analysis, search, overview and graph. Source implementations match phase-4; Phase III production frontend unchanged.

Review: only whitespace warnings in preserved historical Phase IV raw logs; no conflict markers. Phase III acceptance records remain intact. PR: https://github.com/asherduthie07/NLP-project-Semester5/pull/2. Main promotion waits for full frontend CI.

Acceptance: Phase II PARTIAL / independent gold review pending; Phase III PARTIAL (remaining M5–M7 work not completed here); Phase IV PARTIAL (independent review missing; pilot NER held-out F1 zero). Phase V not started. Integration success does not change academic acceptance.

## Reproduction commands

- `.venv/bin/pytest -q` (SQLite); repeat with `CODEATLAS_TEST_DATABASE_URL=postgresql+psycopg://codeatlas@127.0.0.1:55433/codeatlas_integration` for isolated PostgreSQL.
- `.venv/bin/ruff check backend analyzers workers tests scripts nlp experiments`; same paths with `ruff format --check`.
- `.venv/bin/python -m scripts.export_openapi`; `npm --prefix frontend run contracts`.
- `npm --prefix frontend ci`, `run lint`, `test`, `run build`.
- `PLAYWRIGHT_CHROME=1 PLAYWRIGHT_SWIFTSHADER=1 npm --prefix frontend run test:e2e -- --workers=1 e2e/shell.spec.ts`.
- `CODEATLAS_LIVE_BACKEND=1 PLAYWRIGHT_CHROME=1 PLAYWRIGHT_SWIFTSHADER=1 npm --prefix frontend run test:e2e -- e2e/shell.spec.ts -g 'every destination|searches files|top bar drives|uses the API shape|reads a repository'`.
- `.venv/bin/python -m scripts.phase4_runtime_smoke --url http://127.0.0.1:8000` (server configured with inline jobs).
- `docker run --rm --network none --cpus 2 --memory 5g -e OMP_NUM_THREADS=2 -e MKL_NUM_THREADS=2 --mount "type=bind,source=$PWD/nlp,target=/app/nlp,readonly" --mount "type=bind,source=$PWD/experiments,target=/app/experiments,readonly" --mount "type=bind,source=$PWD/datasets/phase4,target=/app/datasets/phase4,readonly" --mount "type=bind,source=$PWD/storage,target=/app/storage" codeatlas-nlp:phase4 python -m experiments.model_smoke --ner-checkpoint /app/storage/nlp-runs/ner-1793552818410372899/checkpoint`.
