# Actual execution results — 2026-11-01

Acceptance remediation: rebuilt project image; full PostgreSQL/Redis/Celery test suite **80 passed**, no skips, 94% coverage. Strict Vite/TypeScript build passed; Playwright **3 passed**. Evaluation CLI reports REVIEW_PENDING, reviewed_examples 0, metrics null. Real HTTP import/preprocess/analysis/graph/source-readback passed. Raw output files: `evidence/remediation-backend.txt`, `evidence/remediation-frontend.txt`; commands and review limits: `../04-phase-records/phase-2/ACCEPTANCE_REMEDIATION.md`.

Phase II re-execution: rebuilt Compose application and migration 0002; full container PostgreSQL/Redis/live-worker suite → 73 passed, no skips, 94% coverage. Strict frontend contract generation/build passed; Playwright → 3 passed; Ruff check/format passed (38 files). Real HTTP import 201, preprocessing and analysis jobs complete, graph retrieved, original bytes equal. Synthetic report regenerated 7 files, 20 symbols, 20 edges and 10/11 documented symbols. See `../04-phase-records/phase-2/TESTING_AND_EVALUATION.md`.

Evidence is captured under `evidence/`. Commands and environment setup are in TEST_COMMANDS.md. These results describe executed checks, not inferred capabilities.

| Check | Exact command / mode | Actual result |
|---|---|---|
| Python installation | `.venv/bin/pip install --no-deps -e .` after lock install | PASS; editable wheel built/installed |
| Python dependency consistency | `.venv/bin/pip check` | PASS; no broken requirements |
| Backend lint | `.venv/bin/ruff check backend analyzers workers tests scripts` | PASS |
| Backend format | `.venv/bin/ruff format --check backend analyzers workers tests scripts` | PASS; 33 Python files |
| Fast local suite | `.venv/bin/pytest -q` without external-service flags | 67 passed, 2 explicitly skipped (PG and live-worker tests) |
| Full native PostgreSQL/Redis suite | Full environment + `.venv/bin/pytest -q --cov=backend/codeatlas --cov=analyzers --cov=workers --cov-report=term-missing` | 69 passed, no skips, 95% statement coverage; backend-postgres.txt |
| Migration | `alembic upgrade head`; test upgrade/check/downgrade in temporary schema | PASS; all five expected tables; schema check no drift |
| Real HTTP pipeline | `.venv/bin/python -m scripts.runtime_smoke` against native services (then repeated against Compose) | PASS; import 201, Celery job complete, original bytes equal; runtime-smoke.json |
| Clean frontend install | `npm --prefix frontend ci` | PASS |
| API types | `python -m scripts.export_openapi`; `npm --prefix frontend run contracts` | PASS; OpenAPI 1.0.0 and generated types |
| Strict production frontend | `npm --prefix frontend run build` | PASS; TypeScript strict and dependency declaration checks enabled (skipLibCheck=false), Vite production build |
| Browser/accessibility | `env -u NO_COLOR PLAYWRIGHT_CHROME=1 npm run test:e2e` in frontend | 3 passed; controls/keyboard/copy/toast, typed adapters, reduced motion, axe scan and viewports |
| Dependency advisory query | `npm audit --json` in frontend | 0 reported vulnerabilities; npm-audit.json |
| Reproducible corpus | `.venv/bin/python -m scripts.sample_report` | PASS; 7 supported files / 205 tokens; findings JSON |
| Compose validation | `docker compose config --quiet` | PASS |
| Workflow static validation | `docker run --rm --network none --read-only --cap-drop ALL -i rhysd/actionlint:1.7.12 - < .github/workflows/verify.yml` | PASS; exit 0, no findings, no repository mount |
| Exact container runtime | `docker compose -f compose.yaml --progress plain up --build -d api worker` | PASS; non-root API/worker started, migration exited 0, PostgreSQL 17.11 and Redis healthy; compose-status.txt |
| Full Linux container regression | Compose one-off api test container, tests-only read-only mount, PostgreSQL/Redis/live worker enabled | 69 passed, no skips, 95% statement coverage; backend-container.txt |
| Container HTTP pipeline | `.venv/bin/python -m scripts.runtime_smoke` against Compose API | PASS; 201 import, completed real worker job and byte-identical readback; runtime-smoke.json |
| Remote GitHub Actions runner | Workflow supplied, local equivalents executed | NOT RUN; no remote push/runner was invoked |
| Live GitHub acquisition | Tests use deterministic mocked HTTP/local fixtures | NOT RUN intentionally; CI does not require live GitHub |
| Reference-image review | Repository asset inventory | NOT RUN; four images absent |

Screenshots were actually captured in `frontend/test-results/design-system-{1440,1024,390}.png`; desktop/mobile screenshots were inspected. Axe found no violations for the tested WCAG tags, and document horizontal overflow checks passed at all three widths. This is not a claim of exhaustive accessibility certification or deferred graph performance.

Failures resolved during implementation: sanitized NUL ZIP fixture corrected; favicon 404 and animated-text ARIA errors fixed; conflicting dependency versions reconciled; vulnerable frontend dependencies updated with a documented scoped override; Alembic path-separator warning fixed; newline warning now respects disabled normalization. Python pip's host cache-permission notice did not prevent installation and no global environment was modified. Initial Docker build encountered a transient package-index response for MarkupSafe; the same pinned package resolved in the exact Python image on a subsequent check. Container retries and final result are recorded separately.

Automatic approval review rejected a full-repository mount into a third-party linter due to possible private-source exposure. The safer stdin-only, network-disabled workflow validation succeeded. No required verification remains blocked by that rejection.

Container startup initially found host port 5432 already allocated by an existing service. No unrelated service was stopped. Configurable project defaults now publish PostgreSQL 55433 and Redis 56380; internal ports remain standard. Retrying the unchanged dependency pins resolved the transient index failure. Final image build, migration, startup, full Linux regression and HTTP smoke all passed.
