import os
import time

import pytest
from fastapi.testclient import TestClient

from backend.codeatlas.api import create_app
from backend.codeatlas.config import Settings


@pytest.mark.worker
def test_real_redis_delivery_and_persisted_result():
    if os.getenv("CODEATLAS_RUN_WORKER_TEST") != "1":
        pytest.skip(
            "Requires migrated database, live Redis and Celery worker; set CODEATLAS_RUN_WORKER_TEST=1"
        )
    app = create_app(Settings(job_mode="celery"))
    with TestClient(app) as client:
        snapshot = client.post(
            "/api/v1/imports/files",
            files={
                "files": (
                    "queued.py",
                    b'# queue fixture\ndef square(x):\n    """Square a value."""\n    return x*x\n',
                )
            },
        ).json()
        response = client.post(f"/api/v1/snapshots/{snapshot['id']}/preprocessing", json={})
        assert response.status_code == 202, response.text
        job = response.json()
        deadline = time.monotonic() + 20
        while job["status"] in {"queued", "running"} and time.monotonic() < deadline:
            time.sleep(0.05)
            job = client.get(f"/api/v1/jobs/{job['id']}").json()
        assert job["status"] == "complete", job
        result = client.get(f"/api/v1/jobs/{job['id']}/results").json()
        assert result["statistics"]["files_imported"] == 1
        assert result["statistics"]["docstrings"] == 1
        assert (
            client.post(f"/api/v1/snapshots/{snapshot['id']}/preprocessing", json={}).json()["id"]
            == job["id"]
        )
