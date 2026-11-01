import io
import os
import zipfile
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from backend.codeatlas.api import create_app
from backend.codeatlas.config import Settings
from backend.codeatlas.models import Base


@pytest.fixture
def settings(tmp_path):
    url = os.getenv("CODEATLAS_TEST_DATABASE_URL")
    admin = None
    schema = "test_" + uuid4().hex
    if url:
        admin = create_engine(url)
        with admin.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        url = (
            make_url(url)
            .update_query_dict({"options": f"-csearch_path={schema}"})
            .render_as_string(hide_password=False)
        )
    yield Settings(
        database_url=url or f"sqlite:///{tmp_path}/test.db",
        storage_root=tmp_path / "artifacts",
        job_mode="inline",
    )
    if admin:
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def app(settings):
    app = create_app(settings)
    Base.metadata.create_all(app.state.service.engine)
    yield app
    app.state.service.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


def zip_bytes(items: dict[str, bytes], compression=zipfile.ZIP_DEFLATED) -> bytes:
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression) as archive:
        for path, payload in items.items():
            archive.writestr(path, payload)
    return data.getvalue()
