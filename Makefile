.PHONY: install infra migrate api worker test lint frontend corpus contracts check
install:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.lock
	.venv/bin/pip install --no-deps -e .
	cd frontend && npm ci
infra:
	docker compose up -d postgres redis
migrate:
	.venv/bin/alembic upgrade head
api:
	.venv/bin/uvicorn backend.codeatlas.main:app --host 127.0.0.1 --port 8000 --reload
worker:
	.venv/bin/celery -A workers.tasks:celery worker --loglevel=INFO --concurrency=2
frontend:
	cd frontend && npm run dev -- --host 127.0.0.1
lint:
	.venv/bin/ruff check backend analyzers workers tests scripts
	.venv/bin/ruff format --check backend analyzers workers tests scripts
test:
	.venv/bin/pytest --cov=backend/codeatlas --cov=analyzers --cov=workers --cov-report=term-missing
corpus:
	.venv/bin/python -m scripts.sample_report
contracts:
	.venv/bin/python -m scripts.export_openapi
	cd frontend && npm run contracts
check: lint test
	cd frontend && npm run build && npm run test:e2e
