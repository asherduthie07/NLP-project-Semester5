"""Verify actual local HTTP import -> Celery preprocessing -> original readback."""

import json
import time
from pathlib import Path

import httpx


def main():
    source = b'# Synthetic HTTP fixture\ndef add(a,b):\n    """Add two values."""\n    return a+b\n'
    with httpx.Client(base_url="http://127.0.0.1:8000", timeout=10, trust_env=False) as client:
        response = client.get("/api/v1/health")
        response.raise_for_status()
        assert response.json()["status"] == "ok"
        response = client.post("/api/v1/imports/files", files={"files": ("runtime.py", source)})
        response.raise_for_status()
        import_status = response.status_code
        assert import_status == 201
        snapshot = response.json()
        response = client.post(f"/api/v1/snapshots/{snapshot['id']}/preprocessing", json={})
        response.raise_for_status()
        job = response.json()
        deadline = time.monotonic() + 20
        while job["status"] in {"queued", "running"} and time.monotonic() < deadline:
            time.sleep(0.05)
            response = client.get(f"/api/v1/jobs/{job['id']}")
            response.raise_for_status()
            job = response.json()
        assert job["status"] == "complete", job
        result = client.get(f"/api/v1/jobs/{job['id']}/results")
        result.raise_for_status()
        stats = result.json()["statistics"]
        assert stats["files_imported"] == 1 and stats["docstrings"] == 1 and stats["comments"] == 1
        file = snapshot["manifest"]["files"][0]
        readback = client.get(f"/api/v1/snapshots/{snapshot['id']}/files/{file['id']}/original")
        assert readback.content == source
        schema = client.get("/openapi.json")
        schema.raise_for_status()
        report = {
            "transport": "real HTTP on loopback",
            "health": "ok",
            "import_http_status": import_status,
            "job_status": job["status"],
            "original_bytes_equal": True,
            "openapi_version": schema.json()["info"]["version"],
            "statistics": stats,
        }
        path = Path("docs/06-testing-verification/evidence/runtime-smoke.json")
        path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
