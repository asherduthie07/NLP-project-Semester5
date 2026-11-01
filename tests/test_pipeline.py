from concurrent.futures import ThreadPoolExecutor

from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.service import Service


def test_snapshot_duplicates_idempotence_and_config(app, settings):
    service = app.state.service
    project = service.create_project("Deterministic")
    files = collect_files([("a.py", b"x=1\r\n"), ("b.py", b"x=1\r\n"), ("Empty.java", b"")], settings)
    snapshot = service.import_collection(project.id, files, "files")
    assert service.import_collection(project.id, files, "files") == snapshot
    assert sum(f.duplicate_of is not None for f in snapshot.manifest.files) == 1
    job = service.create_job("preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id)
    service.run_job(job.id)
    result = service.result(job.id)
    assert result.statistics.duplicate_files == 1
    assert result.statistics.files_imported == 3 and result.statistics.unique_identifiers == 1
    assert result.statistics.warnings == 3
    assert service.run_job(job.id).status == "complete"
    assert service.result(job.id) == result
    other = service.create_job(
        "preprocess",
        {"configuration": PreprocessingConfig(split_identifiers=False).model_dump()},
        snapshot.id,
    )
    assert job.id != other.id
    service.run_job(other.id)
    assert service.snapshot(snapshot.id) == snapshot


def test_concurrent_identical_imports(app, settings):
    service = app.state.service
    project = service.create_project("Concurrent")
    collection = collect_files([("a.py", b"x=1")], settings)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda _: service.import_collection(project.id, collection, "files"), range(2))
        )
    assert results[0] == results[1]
    assert len(service.snapshots(project.id)) == 1


def test_artifact_integrity_failure_is_visible(app, settings):
    service = app.state.service
    project = service.create_project("Integrity")
    snapshot = service.import_collection(project.id, collect_files([("a.py", b"x=1")], settings), "files")
    file = snapshot.manifest.files[0]
    path = service.store.root / file.content_hash
    path.chmod(0o600)
    path.write_bytes(b"changed")
    job = service.create_job("preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id)
    failed = service.run_job(job.id)
    assert failed.status == "failed" and failed.issues[0].code == "artifact_integrity"


def test_effective_token_budget_changes_job_identity(app, settings):
    service = app.state.service
    snapshot = service.import_collection(
        service.create_project("Budget").id, collect_files([("a.py", b"a=1")], settings), "files"
    )
    configuration = PreprocessingConfig().model_dump()
    default_job = service.create_job("preprocess", {"configuration": configuration}, snapshot.id)
    capped_service = Service(settings.model_copy(update={"max_tokens_per_file": 1}))
    capped_job = capped_service.create_job("preprocess", {"configuration": configuration}, snapshot.id)
    assert default_job.id != capped_job.id
    capped_service.run_job(capped_job.id)
    result = capped_service.result(capped_job.id)
    assert result.configuration.max_tokens_per_file == 1
    assert result.results[0].configuration.max_tokens_per_file == 1
    assert result.statistics.errors == 1
    capped_service.engine.dispose()
