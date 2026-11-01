# Changelog

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
