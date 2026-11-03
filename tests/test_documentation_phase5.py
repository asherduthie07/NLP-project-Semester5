import io
import zipfile


def test_python_java_upload_analysis_documentation_export(client):
    imported = client.post(
        "/api/v1/imports/files",
        files=[
            ("files", ("math.py", b"def add(a: int, b: int) -> int:\n    return a + b\n")),
            ("files", ("Math.java", b"class Math { int add(int a, int b) { return a + b; } }")),
        ],
    )
    assert imported.status_code == 201, imported.text
    snapshot = imported.json()["id"]
    pre = client.post(f"/api/v1/snapshots/{snapshot}/preprocessing", json={})
    assert pre.status_code == 202 and pre.json()["status"] == "complete", pre.text
    analysis = client.post(f"/api/v1/snapshots/{snapshot}/analysis")
    assert analysis.status_code == 202 and analysis.json()["status"] == "complete", analysis.text
    job = analysis.json()["id"]
    docs = client.get(f"/api/v1/jobs/{job}/documentation")
    assert docs.status_code == 200, docs.text
    payload = docs.json()
    assert any(item["symbol"].endswith("add") for item in payload["documents"])
    assert payload["coverageAfter"] == payload["coverageBefore"]
    assert all(value["evidence"] for value in payload["summaries"].values())
    claims = client.get(f"/api/v1/jobs/{job}/claims").json()
    assert claims["summary"]["uncertain"] == len(payload["documents"])
    exported = client.get(f"/api/v1/jobs/{job}/documentation/export")
    assert exported.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        assert "README.md" in archive.namelist()
        assert "documentation.json" in archive.namelist()
        assert "verification.json" in archive.namelist()
        assert len([name for name in archive.namelist() if name.startswith("reference/")]) == len(
            payload["documents"]
        )
