# Phase IV actual verification record

Final acceptance: PARTIAL. Software test passes are distinct from empirical NLP quality. Independent reviewed examples: zero. See the completion report and structured measured outputs.

2026-11-02 resume: a final repeat of the offline model command could not start (`Cannot connect to the Docker daemon`). This repeat is NOT RUN. Earlier completed model-smoke artifacts are preserved. The interrupted prior session's temporary repeat log was unavailable, so no additional pass is inferred. Saved backend evidence still records 97 passed, no skips, 91% coverage.

## Executed checks

| Check | Observed result |
|---|---|
| `.venv/bin/pytest -q tests/test_nlp_phase4.py` | 17 passed |
| Full current-source Linux suite with PostgreSQL/Redis/Celery | 97 passed, no skips, 91% coverage, 16.22 s |
| `python -m experiments.verify_metrics` in NLP image | 5 metric arithmetic checks passed |
| `npm --prefix frontend run build` | strict tsc and Vite build passed |
| `env -u NO_COLOR PLAYWRIGHT_CHROME=1 npm --prefix frontend run test:e2e` | 3 passed in 25.7 s |
| `.venv/bin/python -m scripts.phase4_runtime_smoke` | actual HTTP/Celery Python/Java baseline flow passed after import-path fix |
| CodeT5 experiment | genuine Python/Java generation completed |
| NER experiment | genuine four-update training and validation/test inference completed; all predictions empty |
| Network-disabled model smoke | cached CodeT5, overflow rejection, trained checkpoint reload and CPU fallback passed |
| Final dependency-locked NLP Docker build / pip check | passed |
| Clean standard backend Docker build | failed fetching pre-existing tzlocal==5.4.5; cached dependency image used for regressions |
| Ruff check/format and `git diff --check` | passed; 62 files formatted at final code check |
| Remote CI, GPU/MPS execution, human review, E3 summarizer fine-tuning | NOT RUN; no pass claimed |

Earlier fast-suite runs had two explicitly skipped database/worker tests. Those tests ran in the final integration suite. No tests were disabled. Earlier transport/build failures and the Celery import defect are documented in the implementation log, not erased by later passing checks.

## Reproduce the tested cached-dependency integration environment

The ordinary clean build was attempted with:

```sh
docker compose -f compose.yaml --progress plain up --build -d api worker
```

It failed as recorded in `clean-backend-build-failure.txt`. The following temporary Dockerfile was then used with the already installed `codeatlas-api:latest` dependency image. This is a local regression fallback, not a clean-install claim:

```dockerfile
FROM codeatlas-api:latest
ENV PYTHONPATH=/app
USER root
COPY backend backend
COPY analyzers analyzers
COPY nlp nlp
COPY workers workers
USER codeatlas
```

```sh
docker build -f /tmp/codeatlas-phase4-test.Dockerfile -t codeatlas-phase4-test .
docker run -d --name codeatlas-phase4-audit-worker --network codeatlas_default \
  --volume codeatlas_artifacts:/app/storage/artifacts --volume "$PWD/nlp:/app/nlp:ro" \
  -e CODEATLAS_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_REDIS_URL=redis://redis:6379/8 -e CODEATLAS_STORAGE_ROOT=/app/storage/artifacts \
  codeatlas-phase4-test celery -A workers.tasks:celery worker --loglevel=INFO --concurrency=1
docker run -d --name codeatlas-phase4-audit-api --network codeatlas_default -p 127.0.0.1:8001:8000 \
  --volume codeatlas_artifacts:/app/storage/artifacts --volume "$PWD/nlp:/app/nlp:ro" \
  -e CODEATLAS_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_REDIS_URL=redis://redis:6379/8 -e CODEATLAS_STORAGE_ROOT=/app/storage/artifacts \
  codeatlas-phase4-test
.venv/bin/python -m scripts.phase4_runtime_smoke
docker run --rm --network codeatlas_default \
  --volume codeatlas_artifacts:/app/storage/artifacts \
  --volume "$PWD/tests:/app/tests:ro" --volume "$PWD/datasets:/app/datasets:ro" \
  --volume "$PWD/nlp:/app/nlp:ro" \
  -e CODEATLAS_TEST_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_RUN_WORKER_TEST=1 -e CODEATLAS_REDIS_URL=redis://redis:6379/8 \
  -e CODEATLAS_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_STORAGE_ROOT=/app/storage/artifacts -e COVERAGE_FILE=/tmp/.coverage \
  -e HYPOTHESIS_STORAGE_DIRECTORY=/tmp/hypothesis \
  codeatlas-phase4-test pytest -q -o cache_dir=/tmp/pytest-cache \
  --cov=backend/codeatlas --cov=analyzers --cov=workers --cov=nlp --cov-report=term-missing
docker rm -f codeatlas-phase4-audit-worker codeatlas-phase4-audit-api
```

Only the two temporary audit containers were removed. The original project and unrelated services were preserved. PostgreSQL test schemas are isolated; the explicit live HTTP smoke uses named synthetic sources in the development database.

After cleanup, the final checkpoint-revision/timing-contract regression used the same full-suite command with an additional `--volume "$PWD/backend:/app/backend:ro"` and `CODEATLAS_REDIS_URL=redis://redis:6379/0`, using the preserved original worker for the existing live preprocessing test. NLP persistence, revision consistency and snapshot boundaries also ran against PostgreSQL through the API tests. `backend.txt` records this final run.

## Real model execution commands

```sh
docker build --progress plain -f nlp/Dockerfile -t codeatlas-nlp:phase4 .
docker run --rm --mount "type=bind,source=$PWD/nlp,target=/app/nlp,readonly" \
  --mount "type=bind,source=$PWD/experiments,target=/app/experiments,readonly" \
  codeatlas-nlp:phase4 python -m experiments.verify_metrics
```

Each of the following modes was invoked in a separate resource-limited container; the two successful experiments overlapped in time. Replace MODE with `summarize` or `ner`:

```sh
docker run --rm --cpus 2 --memory 4g -e OMP_NUM_THREADS=2 -e MKL_NUM_THREADS=2 \
  -e HF_HUB_DISABLE_XET=0 -e HF_XET_HIGH_PERFORMANCE=1 \
  -e HF_XET_CACHE=/app/storage/xet-cache \
  -e HF_HUB_ETAG_TIMEOUT=60 -e HF_HUB_DOWNLOAD_TIMEOUT=120 \
  --mount "type=bind,source=$PWD/datasets/phase4,target=/app/datasets/phase4,readonly" \
  --mount "type=bind,source=$PWD/nlp,target=/app/nlp,readonly" \
  --mount "type=bind,source=$PWD/experiments,target=/app/experiments,readonly" \
  --mount "type=bind,source=$PWD/storage,target=/app/storage" \
  codeatlas-nlp:phase4 python -m experiments.phase4 MODE
```

Successful run IDs and exact outputs are in `docs/07-findings/phase-4/summarization.json` and `ner.json`. The original model cache and trained checkpoint remain ignored under storage. Download time is included in experiment duration. The NER initialization warning about a new classifier head was followed by actual optimization; no untrained head was advertised as trained.

The final locked image was also tested without source bind mounts and with networking disabled:

```sh
docker run --rm --network none --cpus 2 --memory 4g \
  -e OMP_NUM_THREADS=2 -e MKL_NUM_THREADS=2 -e HF_HUB_OFFLINE=1 \
  --mount "type=bind,source=$PWD/datasets/phase4,target=/app/datasets/phase4,readonly" \
  --mount "type=bind,source=$PWD/storage,target=/app/storage" \
  codeatlas-nlp:phase4 python -m experiments.model_smoke \
  --ner-checkpoint storage/nlp-runs/ner-1793552818410372899/checkpoint
```

The tokenizer warns that the explicit overflow fixture is 3007 tokens; the adapter rejects it before generation. That warning is expected and preserved. Both ordinary summaries and both trained-checkpoint NER requests complete; empty NER predictions are recorded as a quality failure, not concealed.

## Dataset, review and contracts

```sh
.venv/bin/python -m experiments.phase4 prepare
.venv/bin/python -m experiments.review_phase4 prepare
.venv/bin/python -m experiments.review_phase4 score-ner \
  --run storage/nlp-runs/ner-1793552818410372899/result.json
.venv/bin/python -m scripts.export_openapi
npm --prefix frontend run contracts
npm --prefix frontend run build
env -u NO_COLOR PLAYWRIGHT_CHROME=1 npm --prefix frontend run test:e2e
.venv/bin/ruff check backend analyzers workers tests scripts nlp experiments
.venv/bin/ruff format --check backend analyzers workers tests scripts nlp experiments
git diff --check
```

Review `prepare` was executed once; it intentionally refuses to overwrite an existing package. `score-ner` returns REVIEW_PENDING, reviewed_examples 0 and metrics null. Temporary synthetic attestations used by unit tests are explicitly test fixtures, not dataset approvals.

Raw evidence: `backend.txt`, `frontend-build.txt`, `nlp-runtime-build.txt`, `locked-nlp-build.txt`, `clean-backend-build-failure.txt`. Structured source-linked runtime/model outputs are under `docs/07-findings/phase-4/`. These records do not claim remote CI execution or independent model validation.
