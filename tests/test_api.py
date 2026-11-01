from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.codeatlas.api import create_app
from backend.codeatlas.models import JobRow, SourceFileRow
from tests.conftest import zip_bytes


def imported(client):
    response = client.post(
        "/api/v1/imports/files",
        files=[
            (
                "files",
                ("main.py", b'# hello\ndef add(a,b):\n    """Add values."""\n    return a+b\n', "text/plain"),
            ),
            ("files", ("Main.java", b"/** Entry */ class Main {}", "text/plain")),
        ],
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_api_end_to_end_and_persistence(client, app):
    snapshot = imported(client)
    project_id, snapshot_id = snapshot["project_id"], snapshot["id"]
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert len(client.get("/api/v1/projects").json()) == 1
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 200
    assert client.get(f"/api/v1/projects/{project_id}/snapshots").json()[0] == snapshot
    manifest = client.get(f"/api/v1/snapshots/{snapshot_id}/manifest").json()
    for file in manifest["files"]:
        response = client.get(f"/api/v1/snapshots/{snapshot_id}/files/{file['id']}/original")
        assert response.content == app.state.service.store.get(file["content_hash"])
        assert response.headers["x-content-type-options"] == "nosniff"
    response = client.post(f"/api/v1/snapshots/{snapshot_id}/preprocessing", json={})
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] == "complete"
    assert client.post(f"/api/v1/snapshots/{snapshot_id}/preprocessing", json={}).json() == job
    result = client.get(f"/api/v1/jobs/{job['id']}/results").json()
    stats = client.get(f"/api/v1/jobs/{job['id']}/statistics").json()
    assert stats == result["statistics"]
    assert stats["files_imported"] == 2 and stats["docstrings"] == 1 and stats["comments"] == 2
    assert client.get(f"/api/v1/jobs/{job['id']}/issues").json() == []
    with app.state.service.sessions() as session:
        assert len(session.scalars(select(SourceFileRow)).all()) == 2
        assert len(session.scalars(select(JobRow)).all()) == 1
    # New app/engine uses the persisted DB and artifact store.
    with TestClient(create_app(app.state.service.settings)) as second:
        assert second.get(f"/api/v1/jobs/{job['id']}/results").json() == result


def test_zip_and_errors(client):
    assert (
        client.post(
            "/api/v1/imports/zip",
            files={
                "file": (
                    "test.zip",
                    zip_bytes({"a.py": b"x=1", "A.java": b"class A {}", "readme.txt": b"note"}),
                )
            },
        ).status_code
        == 201
    )
    cases = [
        (client.post("/api/v1/imports/files"), 422),
        (client.post("/api/v1/imports/files", files={"files": ("a.exe", b"x")}), 415),
        (client.post("/api/v1/imports/zip", files={"file": ("a.zip", b"bad")}), 400),
        (client.post("/api/v1/imports/github", json={"url": "https://evil.com/repo"}), 400),
        (client.post("/api/v1/imports/github", json={"url": ""}), 422),
        (client.get("/api/v1/snapshots/missing"), 404),
        (client.post("/api/v1/imports/files?name=", files={"files": ("a.py", b"x=1")}), 422),
    ]
    for response, status in cases:
        assert response.status_code == status, response.text
        assert response.json()["error"]["code"]


def test_body_limit_and_key(app, settings):
    small = create_app(settings.model_copy(update={"max_request_bytes": 20, "api_key": "test-key"}))
    with TestClient(small) as client:
        assert client.get("/api/v1/projects").status_code == 401
        assert (
            client.post(
                "/api/v1/imports/files", headers={"x-api-key": "test-key"}, content=b"x" * 21
            ).status_code
            == 413
        )
        # Chunked request without trusted Content-Length.
        response = client.post(
            "/api/v1/imports/files", headers={"x-api-key": "test-key"}, content=iter([b"x" * 10, b"x" * 11])
        )
        assert response.status_code == 413


def test_openapi_models_and_version(client):
    spec = client.get("/openapi.json").json()
    assert spec["info"]["version"] == "1.0.0"
    for model in [
        "Project",
        "SourceSnapshot",
        "SourceFile",
        "ImportManifest",
        "TokenRecord",
        "ExtractedComment",
        "PreprocessingResult",
        "PipelineIssue",
        "CAIR",
    ]:
        assert model in spec["components"]["schemas"]
    assert all(p.startswith("/api/v1/") for p in spec["paths"])


def test_github_job_commit_manifest_and_issues(client, settings):
    from unittest.mock import patch

    from backend.codeatlas.ingestion import collect_files

    collection = collect_files([("a.py", b"# GitHub mock\nx=1")], settings)
    with patch(
        "backend.codeatlas.github.GitHubClient.acquire",
        return_value=(collection, "a" * 40, "https://github.com/example/synthetic"),
    ):
        response = client.post(
            "/api/v1/imports/github",
            json={"url": "https://github.com/example/synthetic", "name": "Mock GitHub"},
        )
    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "complete"
    snapshot = client.get(f"/api/v1/snapshots/{job['snapshot_id']}").json()
    assert snapshot["commit_sha"] == "a" * 40 and snapshot["source_kind"] == "github"


def test_pending_result_and_failed_github_are_visible(client):
    from unittest.mock import patch

    from backend.codeatlas.errors import PipelineError

    with patch(
        "backend.codeatlas.github.GitHubClient.acquire",
        side_effect=PipelineError("github_network", "Fixture network error", 502),
    ):
        response = client.post("/api/v1/imports/github", json={"url": "https://github.com/example/fixture"})
    job = response.json()
    assert job["status"] == "failed"
    issues = client.get(f"/api/v1/jobs/{job['id']}/issues").json()
    assert issues[0]["code"] == "github_network"
    assert client.get(f"/api/v1/jobs/{job['id']}/results").status_code == 409
