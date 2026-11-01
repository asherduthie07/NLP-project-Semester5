# CodeAtlas AI

**Intelligent Source Code Analysis and Automated Documentation Generation Using NLP and Transformer Models**

Phase I implements secure Python/Java source collection and deterministic lexical preprocessing. Original bytes, source hashes, immutable manifests and source locations ground every result. Submitted source is **never executed**. AI descriptions, semantic dependency analysis, documentation generation and verification are future phases; none are represented as implemented here.

The frontend currently stops at **M1**, the original specification's design-system showcase. Every displayed metric/badge is illustrative. The original specification remains in [`design-refs/ui-master-spec.md`](design-refs/ui-master-spec.md); its four reference images were not supplied.

## Development

Prerequisites: Python 3.13.x (verified with 3.13.2), Node 22.16+, npm 10.9+, Docker with a running Compose-capable daemon. Use an isolated environment. Credentials in `.env.example` are loopback development defaults.

```sh
cp .env.example .env
make install
make infra
make migrate
```

In separate terminals:

```sh
make api
make worker
make frontend
```

- Frontend: http://127.0.0.1:5173/design-system
- API/OpenAPI: http://127.0.0.1:8000/docs and `/openapi.json`
- Health (checks database): http://127.0.0.1:8000/api/v1/health
- Whole backend stack: `docker compose up --build api worker` (PostgreSQL/Redis/migration dependencies start automatically).

Compose publishes PostgreSQL on 55433 and Redis on 56380 by default, configurable via CODEATLAS_POSTGRES_PORT/CODEATLAS_REDIS_PORT. Keep the corresponding local database/Redis URLs in sync. Container-internal ports remain 5432/6379.

The default background mode is Celery. For a single-process local demonstration, set `CODEATLAS_JOB_MODE=inline`; it executes the same real pipeline synchronously and is not the deployment mode. PostgreSQL is the supported runtime database; SQLite is used only for fast, isolated tests and the reproducible corpus report.

## Demonstrate Phase I

```sh
curl -F 'files=@datasets/samples/catalog.py' -F 'files=@datasets/samples/Catalog.java' \
  'http://127.0.0.1:8000/api/v1/imports/files?name=Sample'
# Take the returned snapshot id:
curl -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:8000/api/v1/snapshots/SNAPSHOT_ID/preprocessing
# Take the returned job id, poll it, then inspect results:
curl http://127.0.0.1:8000/api/v1/jobs/JOB_ID
curl http://127.0.0.1:8000/api/v1/jobs/JOB_ID/results
curl http://127.0.0.1:8000/api/v1/jobs/JOB_ID/statistics
```

Upload ZIPs to `/api/v1/imports/zip` using form field `file`. POST `{"url":"https://github.com/OWNER/REPO","name":"Public project"}` to `/api/v1/imports/github`; poll the returned job to obtain the immutable snapshot id. Only canonical public GitHub repository URLs are accepted. Imports resolve a full commit SHA and use a bounded archive, with no `git clone`, checkout hooks or repository execution.

When `CODEATLAS_API_KEY` is set, include `X-API-Key` on API requests. Keep services on loopback until behind authentication, TLS, tenant authorization and request rate/concurrency controls. Phase I is a single-tenant engineering foundation, not a publicly exposed multi-user service.

## Verification

```sh
make lint
make test
make corpus
make contracts
cd frontend
npm run build
npx playwright install chromium
npm run test:e2e
```

Full database/queue tests require running services and migrations:

```sh
CODEATLAS_TEST_DATABASE_URL="$CODEATLAS_DATABASE_URL" CODEATLAS_RUN_WORKER_TEST=1 make test
```

Set the database/Redis/storage environment variables identically for API, worker and tests; the test role must be permitted to create temporary schemas in a dedicated test database. Do not point tests at production. Without those environment flags, the PostgreSQL and live-worker tests explicitly skip. `PLAYWRIGHT_CHROME=1 npm run test:e2e` uses installed Chrome. CI provides PostgreSQL/Redis and runs real-worker tests with deterministic fixtures; it never downloads a live GitHub repository.

## Repository

| Folder | Responsibility |
|---|---|
| `backend/codeatlas/` | Contracts, security limits, ingestion, GitHub, storage, persistence, API |
| `backend/migrations/` | Alembic schema history |
| `analyzers/` | Tree-sitter lexical preprocessing and Python AST docstrings |
| `workers/` | Celery tasks using persisted job ids |
| `frontend/` | Vite/React 18, tokens, base/fx primitives, M1 showcase, typed adapters |
| `datasets/` | MIT-licensed synthetic fixtures and provenance |
| `tests/` | Unit, property, API, persistence, concurrency and worker tests |
| `scripts/` | Reproducible corpus report and OpenAPI generation |
| `storage/` | Ignored runtime artifacts, never imported private source in Git |
| `nlp/`, `experiments/`, `documentation_engine/` | Explicitly gated future modules |
| `docs/` | Requirements, architecture, evidence, findings and phase gate |

Read [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md), [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md), and [`docs/04-phase-records/phase-1/COMPLETION_REPORT.md`](docs/04-phase-records/phase-1/COMPLETION_REPORT.md) for actual verification and remaining gates. Secrets, generated source imports, model weights, build outputs and large artifacts are ignored. No later academic phase or frontend M2 is authorized by this implementation.
