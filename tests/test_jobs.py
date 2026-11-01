from unittest.mock import patch

from backend.codeatlas.api import create_app
from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.models import Base


def test_celery_task_uses_persisted_job(app, settings):
    service = app.state.service
    snapshot = service.import_collection(
        service.create_project("Worker test").id, collect_files([("a.py", b"x=1")], settings), "files"
    )
    job = service.create_job("preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id)
    from workers.tasks import process_job

    with patch("workers.tasks.Settings", return_value=settings):
        result = process_job.apply(args=[job.id], throw=True).get()
    assert result["status"] == "complete"
    assert service.result(job.id).statistics.files_imported == 1


def test_queue_failure_consistent_error(settings):
    from fastapi.testclient import TestClient

    app = create_app(settings.model_copy(update={"job_mode": "celery"}))
    Base.metadata.create_all(app.state.service.engine)
    with (
        TestClient(app) as client,
        patch("workers.tasks.process_job.apply_async", side_effect=ConnectionError("offline")),
    ):
        snapshot = client.post("/api/v1/imports/files", files={"files": ("a.py", b"x=1")}).json()
        response = client.post(f"/api/v1/snapshots/{snapshot['id']}/preprocessing", json={})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "queue_unavailable"
