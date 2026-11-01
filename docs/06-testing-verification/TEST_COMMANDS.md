# Test commands

Phase II acceptance evaluation: `.venv/bin/python -m scripts.extraction_evaluation prepare` creates a new review package once and refuses overwrite; `.venv/bin/python -m scripts.extraction_evaluation evaluate` regenerates current predictions and reports null metrics until independent review approval. The final full regression command now also mounts `datasets/evaluation` read-only for fixture-provenance validation. Exact current command and observed results are in `../04-phase-records/phase-2/ACCEPTANCE_REMEDIATION.md`.

Phase II reproducible findings and typed contracts:

```sh
.venv/bin/python -m scripts.phase2_report
.venv/bin/python -m scripts.export_openapi
npm --prefix frontend run contracts
npm --prefix frontend run build
.venv/bin/python -m scripts.runtime_smoke
```

The full Linux container command below runs Phase I and II tests together with `CODEATLAS_RUN_WORKER_TEST=1`. Final observed result: 73 passed, no skips, 94% coverage. The independent gold extraction evaluation remains NOT RUN.

From project root:

```sh
.venv/bin/pip check
.venv/bin/ruff check backend analyzers workers tests scripts
.venv/bin/ruff format --check backend analyzers workers tests scripts
.venv/bin/pytest -q
.venv/bin/python -m scripts.sample_report
.venv/bin/python -m scripts.export_openapi
npm --prefix frontend ci
npm --prefix frontend run contracts
npm --prefix frontend run build
PLAYWRIGHT_CHROME=1 npm --prefix frontend run test:e2e
docker compose config --quiet
```

Native test-service commands used in this environment (isolated temporary paths and ports):

```sh
/usr/local/bin/initdb -D /private/tmp/codeatlas-phase1-pg -A trust -U codeatlas --no-locale -E UTF8
/usr/local/bin/pg_ctl -D /private/tmp/codeatlas-phase1-pg -l /private/tmp/codeatlas-phase1-pg.log -o '-p 55432 -h 127.0.0.1 -k /private/tmp' start
/usr/local/bin/createdb -h 127.0.0.1 -p 55432 -U codeatlas codeatlas_test
CODEATLAS_DATABASE_URL=postgresql+psycopg://codeatlas@127.0.0.1:55432/codeatlas_test .venv/bin/alembic upgrade head
```

Redis 7.4.12 was downloaded from the official archive, SHA-256 verified against the Redis project's hashes, built in `/private/tmp` with `make -j2 BUILD_TLS=no MALLOC=libc`, and started with:

```sh
/private/tmp/redis-7.4.12/src/redis-server --bind 127.0.0.1 --port 56379 --save '' --appendonly no --daemonize yes --pidfile /private/tmp/codeatlas-redis.pid --logfile /private/tmp/codeatlas-redis.log
```

Run the worker/API and full verification with matching environment:

```sh
export CODEATLAS_DATABASE_URL=postgresql+psycopg://codeatlas@127.0.0.1:55432/codeatlas_test
export CODEATLAS_REDIS_URL=redis://127.0.0.1:56379/0
export CODEATLAS_STORAGE_ROOT=/private/tmp/codeatlas-live-artifacts
.venv/bin/celery -A workers.tasks:celery worker --loglevel=INFO --pool=solo --concurrency=1 --hostname=codeatlas-phase1@local
# Another terminal with those same variables:
.venv/bin/uvicorn backend.codeatlas.main:app --host 127.0.0.1 --port 8000
CODEATLAS_TEST_DATABASE_URL="$CODEATLAS_DATABASE_URL" CODEATLAS_RUN_WORKER_TEST=1 .venv/bin/pytest -q --cov=backend/codeatlas --cov=analyzers --cov=workers --cov-report=term-missing
```

`solo` is used for the macOS local verification process. Compose uses bounded standard workers. Local tests required sandbox escalation because shared memory and loopback network connections were denied by the sandbox. Those failures were environmental, not test passes. Do not expose this temporary trust-authenticated PostgreSQL server beyond loopback. The normal Compose database uses a password.

Final exact-container verification (after `docker compose up --build -d api worker`):

```sh
docker compose -f compose.yaml run --rm --no-deps \
  --volume "$PWD/tests:/app/tests:ro" \
  --volume "$PWD/datasets/evaluation:/app/datasets/evaluation:ro" \
  -e CODEATLAS_TEST_DATABASE_URL=postgresql+psycopg://codeatlas:codeatlas@postgres:5432/codeatlas \
  -e CODEATLAS_RUN_WORKER_TEST=1 \
  -e COVERAGE_FILE=/tmp/.coverage -e HYPOTHESIS_STORAGE_DIRECTORY=/tmp/hypothesis \
  api pytest -q -o cache_dir=/tmp/pytest-cache \
  --cov=backend/codeatlas --cov=analyzers --cov=workers --cov-report=term-missing
.venv/bin/python -m scripts.runtime_smoke
```

This mounts only the tests into the project's own built image. Update the development test database URL if credentials differ. The source/artifact volume is shared by the Compose API, worker and one-off test service. Normal host defaults use PostgreSQL 55433/Redis 56380; container-internal connections use 5432/6379. The final container suite passed all 69 checks. Remote CI was statically validated with actionlint but not remotely run.
