# Changelog

Integration 2026-11-03: Phase III + Phase IV combined on `integration/phase4-main`; verification/promotion pending. Phase II, III and IV remain **PARTIAL**. See [integration report](04-phase-records/integration-phase4-main/REPORT.md). No Phase V work.

## 2026-11-03 — Phase III M4 Knowledge Graph

- `/app/graph`: WebGL view (one instanced mesh for nodes, one line set per edge kind, orbit controls, HTML labels) and Canvas2D view (d3-force ticked in the page's own loop), sharing one layout and one `GraphView` contract.
- Demo: 703 nodes, 1,266 edges, 8 clusters with readable names. Live: `/jobs/{id}/graph`, clusters by directory, coverage from the analysis, containment derived from the analysis' parent and file records.
- Control panel: search with fly-to and highlighted matches, node-kind, edge-type and cluster filters, color by module, language or coverage, hulls, labels, fade, repulsion slider, performance mode. Toolbar, minimap, FPS and counters, tooltip, inspector with relationships and source, double-click focus, node drag, dark and light canvas, S/R/F shortcuts (also in the `?` overlay and Help).
- Measured on Intel HD 520: 3D 60 fps at 703, 1,000 and 2,000 nodes; 2D 30 fps in detail mode and 60 fps in performance mode up to 1,000 nodes. Label placement without DOM reads and no backdrop blur over the canvas came out of the measurements. No 60 fps claim for 2D detail mode.
- Tests: 14 graph unit tests, 11 graph browser tests. The shell route test now expects the graph page built; one auto-scroll test lets an in-flight step settle before asserting the position holds.

## 2026-11-03 — Phase III M3 Overview (commit 6b0028c)

- `/app/overview`: HUD, six KPI cards, coverage over time with range and series toggles, completeness meter with blockers and estimate, sortable attention table, gaps heatmap, language donut, module treemap, dependency cards, architecture map with animated 2D flow, status strip, activity feed and terminal replay. Drilldowns filter across widgets.
- Data layer: `getAnalysis` and `getCoverageHistory`. Demo analysis is measured from the fixture's generated source; Live maps the Phase II analysis without changing any number. Live history is integration pending.
- Demo fixture: layered imports with exactly three deliberate cycles.
- Shell: heading focus waits for a lazily loaded page.

## 2026-11-02 — Phase III final M1 checks and M2 (awaiting review)

- Final M1 checks: PNG, JSON and CSV exports are tested by decoding real downloads. This found and fixed a 2D PNG that exported an 11 × 11 toolbar icon, and a 3D PNG that was transparent with no labels. Keyboard tests were added for `F`, zoom and mode switching.
- Network performance: a five-run matrix traced the 43 fps orbit to ambient motion on every visible chart. Ambient motion is now capped and pauses during a drag, giving 60 fps on Intel HD 520 at 132 nodes. 600+ nodes are not measured.
- M2 dashboard shell at `/app/*`: 64 px rail with hover, focus and pin expansion, top bar, cmdk palette, shortcuts overlay, route transitions, independent scroll panels with auto-scroll, background parallax, nine destinations with seven labeled pending pages, Settings and Help.
- Demo and Live data: one `DashboardApi` with a seeded `shopflow-api` Demo fixture and a Live adapter over `/api/v1`. Retries and honest failure states, with no silent fallback to demo data.
- Live checked against the real API code on SQLite with inline jobs. The Compose stack was not run. A POSIX-only backend storage path was recorded, not changed.
- Fixed during verification: a layout shift under the activity panel, an outgoing page left in the DOM on software GL, a landmark in the shortcuts overlay, `g` sequence timing, and accessible-name issues.
- Tests: 83 unit and 73 browser tests. No test removed, no assertion weakened.
- VIS-01 to VIS-05 approval wording restored to DEFERRED. Phase II status unchanged. Phase IV files and records untouched.

## 2026-11-01 — Phase III M1 (awaiting review, uncommitted)

- Added the shared visualization system in `frontend/src/viz/`: 12 chart kinds with real Three.js 3D and full 2D from one model, global and per-chart mode control, persistence, WebGL capability detection, fallback and context-loss recovery.
- Added one shared WebGL renderer for all charts, with demand rendering and off-screen pause. This deviates from the preferred React Three Fiber and awaits a decision.
- Added legends, tooltips, data tables, CSV, JSON and PNG export, analysis mode, keyboard paths, provenance chips and honest loading, empty, error and unavailable states.
- Added backend adapters and a measured data section using real Phase II statistics. No live API calls yet.
- Fixed M1 audit items: motion preference, MagneticButton range, CopyButton, line grid, toggle and slider glow trail.
- Added ESLint, Vitest (49 tests) and 16 browser tests. Existing 3 browser tests unchanged. CI gained lint and unit steps, not yet run remotely.
- Phase II status unchanged. No Phase IV work.
## 2026-11-01 — Phase IV NLP implementation and provisional experiments

- Added synthetic dataset preparation, provenance/split checks, 18 weak candidate entity annotations, blind review forms and a review-gated evaluator; 0 independent examples reviewed.
- Added deterministic source-fact summarization, parser declaration baseline, pinned CodeT5 inference, trainable DistilBERT NER, exact entity metrics, BLEU/ROUGE-L, CAIR hierarchy and conservative grounding.
- Executed real Python/Java CodeT5 inference and one-epoch/four-update NER training. The trained NER pilot predicted no held-out entities: provisional recall/F1 0, precision undefined. No final independent accuracy is claimed.
- Added PostgreSQL/Celery NLP jobs, snapshot-bound result retrieval, model catalog, controlled experiment retrieval and generated shared TypeScript API contracts. No dashboard/design-system work.
- Fixed Celery subprocess discovery of the new NLP package with explicit PYTHONPATH. Real Python/Java HTTP-to-worker flow passed. Final backend regression: 97 passed, no skips, 91% coverage; strict frontend build and 3 browser checks passed. Offline real-model smoke and exact-lock NLP image build passed.
- Phase IV remains PARTIAL: human labels/review, representative NER training and validation, transformer-worker provisioning, and a clean backend dependency rebuild remain outstanding. Phase II stays PARTIAL; no Phase V or frontend merge.

## Phase II acceptance remediation

- Added seven hashed synthetic evaluation fixtures, blank independent review forms, frozen analyzer candidates, sign-off and disagreement workflow; review status remains REVIEW_PENDING.
- Added strict symbol/edge scoring, TP/FP/FN, precision/recall/F1, per-language/category and micro/macro metrics; final corpus metrics remain null pending human review.
- Fixed Python AST byte-column conversion to Unicode source columns and added regression/evaluator tests.
- Verified 80 Linux backend tests, no skips, 94% coverage; strict frontend build, 3 browser tests and live HTTP pipeline passed. No Phase III work.

## 2026-11-01 — Phase II structural and exploratory analysis

- Added conservative Python AST and Java Tree-sitter symbol, relationship and supported route extraction with source evidence.
- Added versioned Phase II CAIR, PostgreSQL symbol/edge tables and migration, deterministic analysis jobs and graph/overview APIs.
- Added measured token, identifier, documentation, structure and dependency statistics plus reproducible JSON/SVG synthetic findings.
- Added Phase II fixtures, regression tests, generated OpenAPI frontend types and real/mock adapter methods; pending independently reviewed gold evaluation is documented.

## 2026-11-01 — Phase I final verification audit

- Re-executed full Compose/Linux backend integration/security suite: 69 passed, no skips, 95% statement coverage.
- Re-validated actual HTTP import → Celery preprocessing → PostgreSQL persistence → exact original-byte readback.
- Re-ran strict frontend build/API-contract generation, zero-vulnerability npm audit and three Playwright checks.
- Regenerated actual synthetic-corpus statistics and documented fresh audit evidence in `04-phase-records/phase-1/FINAL_VERIFICATION_AUDIT.md`.

## 0.1.0 — 2026-11-01 — Phase I / frontend M1

Added modular FastAPI/Pydantic/SQLAlchemy/Alembic backend; bounded Python/Java and ZIP imports; restricted commit-pinned public GitHub acquisition; atomic SHA-256 source storage; Tree-sitter/Python AST lexical preprocessing; source-linked contracts and CAIR 1.0; PostgreSQL metadata; consistent versioned APIs; Redis/Celery jobs; deterministic duplicates/statistics; MIT synthetic corpus; unit/property/API/database/concurrency/queue tests; Docker/Compose, CI and development commands.

Added Vite/React 18/strict TypeScript foundation with the original frontend stack, local fonts, CSS variables, 13 base UI primitives, 10 fx primitives, shared motion/reduced-motion handling, /design-system showcase, generated API types, real/mock adapter seam and Playwright/axe verification. Preserved the original UI specification unchanged; reported absent images. Dashboard shell/pages and marketing implementation remain gated.

Added planning/research/architecture/security/methodology, source/module inventory, requirements traceability and actual test/corpus evidence. Resolved test fixture, encoding/location, warning, accessibility, styling and dependency issues through checks rather than suppressed errors. Container and final acceptance status are recorded in the phase report. No model accuracy, benchmark, later academic phase or completed future integration is claimed.
