"""Independent accepted examples for the supported static extraction subset."""

from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files


def analyze(app, files):
    service = app.state.service
    snapshot = service.import_collection(
        service.create_project("phase-two-reference").id, collect_files(files, service.settings), "files"
    )
    pre = service.create_job("preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id)
    assert service.run_job(pre.id).status == "complete"
    job = service.create_job("analyze", {"preprocessing_job_id": pre.id}, snapshot.id)
    assert service.run_job(job.id).status == "complete"
    return service, snapshot, job, service.analysis(job.id)


def test_python_structure_dependencies_and_idempotence(app):
    service, snapshot, job, result = analyze(
        app,
        [
            (
                "a.py",
                b'''"""Module."""\nimport b as bee\nfrom missing import thing\nclass Parent:\n    """Parent docs."""\n    value = 1\n    @staticmethod\n    async def run(x: int) -> str:\n        """Run docs."""\n        def inner():\n            return x\n        return str(inner())\n''',
            ),
            ("b.py", b"import a\nclass Child(Parent):\n    pass\n"),
        ],
    )
    names = {s.qualified_name for s in result.symbols}
    assert {"a.Parent", "a.Parent.run", "a.Parent.run.inner", "b.Child"} <= names
    run = next(s for s in result.symbols if s.qualified_name == "a.Parent.run")
    assert run.modifiers == ["async", "staticmethod"]
    assert run.return_type == "str" and run.parameters == ["x"]
    assert run.documented and run.evidence.span.start.line == 8
    assert any(s.kind == "field" and s.name == "value" for s in result.symbols)
    assert result.statistics.circular_dependencies == [["a", "b"]]
    assert result.statistics.documentable_symbols == 4
    assert result.statistics.documented_symbols == 2
    assert result.statistics.documentation_coverage == 0.5
    assert any(
        e.kind == "imports" and e.target_name == "b" and e.resolution == "confirmed"
        for e in result.relationships
    )
    assert any(
        e.kind == "imports" and e.target_name == "missing" and e.resolution == "external"
        for e in result.relationships
    )
    repeated = service.create_job(
        "analyze", {"preprocessing_job_id": result.preprocessing_job_id}, snapshot.id
    )
    assert repeated.id == job.id and service.run_job(job.id).status == "complete"
    assert service.analysis(job.id).model_dump() == result.model_dump()


def test_java_overloads_and_partial_structure(app):
    _, _, _, result = analyze(
        app,
        [
            (
                "Thing.java",
                b"""package demo;\nimport java.util.List;\ninterface Named {}\nclass Thing implements Named {\n  /** Finds item. */\n  public String find(int id) { return ""; }\n  public String find(String id) { return id; }\n  private int count = 1;\n}\n""",
            ),
            ("Broken.java", b"class Broken { void f( { }"),
        ],
    )
    methods = [s for s in result.symbols if s.kind == "method" and s.name == "find"]
    assert len(methods) == 2 and len({s.id for s in methods}) == 2
    assert any(s.kind == "interface" and s.name == "Named" for s in result.symbols)
    assert any(s.kind == "field" and s.name == "count" for s in result.symbols)
    assert any(e.kind == "implements" for e in result.relationships)
    assert any(i.code == "partial_java_structure" for i in result.issues)


def test_phase_two_api_and_empty(app, client):
    imported = client.post("/api/v1/imports/files", files=[("files", ("empty.py", b"", "text/plain"))])
    assert imported.status_code == 201
    snapshot = imported.json()
    started = client.post(f"/api/v1/snapshots/{snapshot['id']}/analysis")
    assert started.status_code == 202
    job = started.json()
    assert job["status"] == "complete"
    output = client.get(f"/api/v1/jobs/{job['id']}/analysis")
    assert output.status_code == 200
    assert output.json()["statistics"]["tokens"] == 0
    assert len(output.json()["symbols"]) == 1
    assert client.get(f"/api/v1/jobs/{job['id']}/graph").json()["nodes"]
    assert client.get(f"/api/v1/jobs/{job['id']}/overview").json()["files"] == 1
    assert client.post(f"/api/v1/snapshots/{snapshot['id']}/analysis").json()["id"] == job["id"]


def test_route_detection_requires_supported_framework_and_source_reference(app):
    _, snapshot, _, result = analyze(
        app,
        [
            (
                "routes.py",
                b'''from fastapi import APIRouter\nrouter = APIRouter()\nother = object()\n@router.get("/items")\ndef items():\n    """Documented."""\n    return 1\n@other.get("/fake")\ndef fake():\n    return 2\n''',
            ),
            (
                "Controller.java",
                b"""package demo;\nimport org.springframework.web.bind.annotation.GetMapping;\nclass Controller {\n  @GetMapping("/j")\n  public String list() { return "ok"; }\n}\n""",
            ),
        ],
    )
    assert {(e.method, e.route) for e in result.endpoints} == {("GET", "/items"), ("GET", "/j")}
    assert all(e.snapshot_id == snapshot.id and e.evidence.file_id for e in result.endpoints)
    assert (
        next(
            s for s in result.symbols if s.qualified_name == "routes.items"
        ).documentation_evidence.span.start.line
        == 6
    )
