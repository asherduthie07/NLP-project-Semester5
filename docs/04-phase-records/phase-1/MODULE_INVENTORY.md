# Module inventory

| Source | Implemented objective | Verification |
|---|---|---|
| backend/codeatlas/contracts.py | Frozen versioned Pydantic lexical CAIR/contracts | contracts and OpenAPI/API tests |
| backend/codeatlas/config.py | Environment-backed validated resource limits and modes | input-limit/API tests |
| backend/codeatlas/ingestion.py | Safe bounded files and ZIP collection, decoding, noise filter | ingestion/property tests |
| backend/codeatlas/github.py | Restricted public GitHub acquisition, commit pin, IP-pinned TLS | mocked HTTP/DNS/transport tests |
| backend/codeatlas/storage.py | Atomic content-addressed artifacts and read-time integrity | preservation, symlink, concurrent import, tamper tests |
| analyzers/preprocessing.py | Source-linked lexical tokens/comments/docstrings/NLP segments | preprocessing tests |
| backend/codeatlas/models.py, migrations/ | SQLAlchemy metadata and Alembic schema | PG migration and API persistence tests |
| backend/codeatlas/service.py | Immutable snapshots, stable jobs/results, computed stats | pipeline, API and PG concurrency tests |
| backend/codeatlas/api.py, main.py | Versioned typed HTTP, bounded uploads, errors | TestClient and native runtime checks |
| workers/tasks.py | Redis/Celery delivery; persisted failures; ids only on broker | task tests and live-worker test |
| scripts/sample_report.py | Actual reproducible synthetic corpus findings | committed findings artifact/regeneration |
| scripts/export_openapi.py | Reproducible versioned API schema | OpenAPI schema test/generated types |
| frontend/src/components/ui/ | 13 base UI primitives | strict build, interaction/axe checks |
| frontend/src/components/fx/ | 10 fx primitives and reduced motion | browser verification and screenshots |
| frontend/src/data/ | Generated types, Fetch adapter, explicit mock adapter | contract generation/build/browser adapter check |
| frontend/src/lib/ | Zustand seam and reactive motion preference | build and reduced-motion checks |
| frontend/src/design/, DesignSystem.tsx | Original tokens, fonts, motion presets and M1 showcase | build and three viewport screenshots |
| nlp/, experiments/, documentation_engine/ | Documented future module boundaries only | No implementation claimed |
