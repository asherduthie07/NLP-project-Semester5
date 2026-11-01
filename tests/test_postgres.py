import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.service import Service

pytestmark = pytest.mark.postgres


def test_postgres_migration_and_duplicate_delivery(settings, monkeypatch):
    if not os.getenv("CODEATLAS_TEST_DATABASE_URL"):
        pytest.skip("Set CODEATLAS_TEST_DATABASE_URL to run real PostgreSQL integration")
    monkeypatch.setenv("CODEATLAS_DATABASE_URL", settings.database_url)
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    command.check(config)
    service = Service(settings)
    assert set(inspect(service.engine).get_table_names()) >= {
        "projects",
        "snapshots",
        "source_files",
        "jobs",
        "alembic_version",
    }
    snapshot = service.import_collection(
        service.create_project("PG migration").id,
        collect_files([("a.py", b"# hello\nx=1")], settings),
        "files",
    )
    job = service.create_job("preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: service.run_job(job.id), range(2)))
    assert all(j.status == "complete" for j in outcomes)
    assert service.result(job.id).statistics.files_imported == 1
    command.downgrade(config, "base")
    assert set(inspect(service.engine).get_table_names()) == {"alembic_version"}
    service.engine.dispose()
