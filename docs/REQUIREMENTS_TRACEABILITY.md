# Requirements traceability

Status vocabulary: PLANNED, IMPLEMENTED (verification pending), VERIFIED, BLOCKED, DEFERRED (requires authorization). Evidence must name a passing check or an actual artifact. This matrix is initialized before implementation and updated at the Phase I gate.

| ID | Academic category | Planned implementation | Source location | Test location | Verification evidence | Status |
|---|---|---|---|---|---|---|
| FND-01 | Foundation | Modular Python/FastAPI and Vite/React 18 repository; pinned dependencies, infrastructure, CI | root, backend/, frontend/ | tests/, frontend/e2e/ | Pending | PLANNED |
| ING-01 | I: Collection | Python/Java individual and multi-file upload | backend/codeatlas/ingestion.py | tests/test_ingestion.py | Pending | PLANNED |
| ING-02 | I: Collection | Bounded ZIP validation, no extraction of untrusted paths or symlinks | backend/codeatlas/ingestion.py | tests/test_ingestion.py | Pending | PLANNED |
| ING-03 | I: Collection | Public GitHub allowlist, immutable commit, download limits, reject redirects | backend/codeatlas/github.py | tests/test_github.py | Pending | PLANNED |
| SRC-01 | I: Collection | Original byte artifacts, SHA-256, immutable snapshots, manifest | backend/codeatlas/storage.py | tests/test_ingestion.py | Pending | PLANNED |
| PRE-01 | I: Preprocessing | Language, encoding, safe normalization, issues | analyzers/preprocessing.py | tests/test_preprocessing.py | Pending | PLANNED |
| PRE-02 | I: Preprocessing | Tree-sitter lexical records, comments, Python AST docstrings, JavaDoc | analyzers/preprocessing.py | tests/test_preprocessing.py | Pending | PLANNED |
| PRE-03 | I: Preprocessing | Identifiers, keywords, literals, separate NLP representation and source spans | analyzers/preprocessing.py | tests/test_preprocessing.py | Pending | PLANNED |
| PRE-04 | I: Quality | Duplicates, deterministic statistics and idempotence | backend/codeatlas/service.py | tests/test_pipeline.py | Pending | PLANNED |
| DATA-01 | I: Contracts | Versioned Pydantic Project/Snapshot/File/Manifest/Token/Comment/Result/Issue/CAIR | backend/codeatlas/contracts.py | tests/test_contracts.py | Pending | PLANNED |
| DB-01 | I: Persistence | PostgreSQL metadata, SQLAlchemy, Alembic migration | backend/codeatlas/models.py, backend/migrations/ | tests/test_api.py | Pending | PLANNED |
| API-01 | I: Interfaces | Versioned typed API, consistent errors, OpenAPI | backend/codeatlas/api.py | tests/test_api.py | Pending | PLANNED |
| JOB-01 | I: Interfaces | Redis/Celery background preprocessing and imports | workers/tasks.py | tests/test_jobs.py | Pending | PLANNED |
| COR-01 | I: Reproducibility | Licensed synthetic mixed corpus and actual processing report | datasets/, scripts/ | tests/test_pipeline.py | Pending | PLANNED |
| SEC-01 | I: Security | Input limits, no imported execution, controlled artifacts, URL and archive defenses | backend/codeatlas/ | tests/test_ingestion.py, tests/test_github.py | Pending | PLANNED |
| QA-01 | I: Verification | Unit/integration/property/API/database/frontend checks | tests/, frontend/e2e/ | docs/06-testing-verification/ | Pending | PLANNED |
| DOC-01 | I: Methodology | Planning, architecture, phase record, findings and academic methodology | docs/ | documentation audit | Pending | PLANNED |
| UI-M1 | Frontend M1 | Tokens/fonts, base UI and fx showcase, mock/real adapter seam | frontend/src/ | frontend/e2e/ | Pending | PLANNED |
| UI-REF | Frontend reference requirements | Preserve authoritative original; review missing references when supplied | design-refs/ui-master-spec.md | Manual inventory | Only specification supplied; four images absent | BLOCKED |
| UI-M2-M7 | Frontend milestones | Exact original build order, full feature inventory retained in authoritative specification | design-refs/ui-master-spec.md | Future milestone checks | Requires explicit continue after M1 | DEFERRED |
| ETA-01 | II: Exploratory Text Analysis | Distributions, vocabulary, symbol/dependency/coverage analysis | analyzers/ (future) | Future | Not authorized | DEFERRED |
| VIS-01 | III: Visualization | Frequencies, languages, documentation dashboards and graph | frontend/ (future milestones) | Future | Not authorized | DEFERRED |
| NLP-01 | IV: Model Development | Baseline, code NER, transformer/CodeT5, reproducible evaluation | nlp/, experiments/ (future) | Future | Not authorized | DEFERRED |
| ADV-01 | V: Advanced Implementation | Inference, documentation, evidence verification, export, deployment | documentation_engine/ (future) | Future | Not authorized | DEFERRED |
