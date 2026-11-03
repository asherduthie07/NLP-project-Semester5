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
- Browser verification and remote CI pending.

Limitations: Docker daemon unavailable; native torch/transformers unavailable, so fresh real-weight inference NOT RUN. Historical Phase IV real-model evidence remains historical, not a new pass. Live Redis/Celery verification pending CI. No retraining attempted.

Acceptance: Phase II PARTIAL / independent gold review pending; Phase III PARTIAL (remaining M5–M7 work not completed here); Phase IV PARTIAL (independent review missing; pilot NER held-out F1 zero). Phase V not started. Integration success does not change academic acceptance.
