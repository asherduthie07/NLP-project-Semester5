import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from analyzers.exploration import explore
from analyzers.preprocessing import preprocess, stable_id

from .config import Settings
from .contracts import (
    CAIR,
    ImportManifest,
    Job,
    PipelineIssue,
    PreprocessingConfig,
    PreprocessingStatistics,
    Project,
    SourceFile,
    SourceSnapshot,
    StructuralAnalysis,
)
from .errors import PipelineError
from .ingestion import Collection, digest
from .models import JobRow, ProjectRow, RelationshipRow, SnapshotRow, SourceFileRow, SymbolRow, database
from .storage import ArtifactStore


class Service:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.engine, self.sessions = database(settings.database_url)
        self.store = ArtifactStore(settings.storage_root)

    def create_project(self, name: str) -> Project:
        project = Project(name=name)
        with self.sessions.begin() as session:
            session.add(ProjectRow(id=project.id, payload=project.model_dump(mode="json")))
        return project

    def projects(self) -> list[Project]:
        with self.sessions() as session:
            return [
                Project.model_validate(r.payload)
                for r in session.scalars(select(ProjectRow).order_by(ProjectRow.id)).all()
            ]

    def project(self, project_id: str) -> Project:
        with self.sessions() as session:
            row = session.get(ProjectRow, project_id)
            if row is None:
                raise PipelineError("not_found", "Project not found", 404)
            return Project.model_validate(row.payload)

    def import_collection(
        self,
        project_id: str,
        collection: Collection,
        kind: str,
        origin: str | None = None,
        commit_sha: str | None = None,
    ) -> SourceSnapshot:
        self.project(project_id)
        signature = {
            "files": [(f.path, digest(f.data)) for f in collection.files],
            "ignored": [i.model_dump() for i in collection.ignored],
            "kind": kind,
            "origin": origin,
            "commit": commit_sha,
        }
        content_hash = digest(json.dumps(signature, sort_keys=True, separators=(",", ":")).encode())
        snapshot_id = stable_id(project_id, content_hash)
        with self.sessions() as session:
            existing = session.get(SnapshotRow, snapshot_id)
            if existing:
                return SourceSnapshot.model_validate(existing.payload)
        files = []
        first_hash: dict[str, str] = {}
        for entry in collection.files:
            key = self.store.put(entry.data)
            file_id = stable_id(snapshot_id, entry.path)
            files.append(
                SourceFile(
                    id=file_id,
                    snapshot_id=snapshot_id,
                    relative_path=entry.path,
                    language=entry.language,
                    content_hash=key,
                    size_bytes=len(entry.data),
                    encoding=entry.encoding,
                    duplicate_of=first_hash.get(key),
                )
            )
            first_hash.setdefault(key, file_id)
        snapshot = SourceSnapshot(
            id=snapshot_id,
            project_id=project_id,
            content_hash=content_hash,
            source_kind=kind,
            origin=origin,
            commit_sha=commit_sha,
            manifest=ImportManifest(snapshot_id=snapshot_id, files=files, ignored=collection.ignored),
        )
        try:
            with self.sessions.begin() as session:
                session.add(
                    SnapshotRow(
                        id=snapshot_id, project_id=project_id, payload=snapshot.model_dump(mode="json")
                    )
                )
                session.flush()
                for file in files:
                    session.add(
                        SourceFileRow(
                            id=file.id,
                            snapshot_id=snapshot_id,
                            relative_path=file.relative_path,
                            content_hash=file.content_hash,
                            payload=file.model_dump(mode="json"),
                        )
                    )
        except IntegrityError:
            return self.snapshot(snapshot_id)  # Concurrent identical import; immutable row already committed.
        return snapshot

    def snapshots(self, project_id: str) -> list[SourceSnapshot]:
        self.project(project_id)
        with self.sessions() as session:
            return [
                SourceSnapshot.model_validate(r.payload)
                for r in session.scalars(
                    select(SnapshotRow).where(SnapshotRow.project_id == project_id).order_by(SnapshotRow.id)
                ).all()
            ]

    def snapshot(self, snapshot_id: str) -> SourceSnapshot:
        with self.sessions() as session:
            row = session.get(SnapshotRow, snapshot_id)
            if row is None:
                raise PipelineError("not_found", "Snapshot not found", 404)
            return SourceSnapshot.model_validate(row.payload)

    def create_job(
        self, kind: str, parameters: dict, snapshot_id: str | None = None, project_id: str | None = None
    ) -> Job:
        if kind == "preprocess":
            configuration = PreprocessingConfig.model_validate(parameters["configuration"])
            configuration = configuration.model_copy(
                update={
                    "max_tokens_per_file": min(
                        configuration.max_tokens_per_file, self.settings.max_tokens_per_file
                    )
                }
            )
            parameters = {"configuration": configuration.model_dump(mode="json")}
        if snapshot_id:
            self.snapshot(snapshot_id)
        job_id = (
            stable_id(snapshot_id, kind, json.dumps(parameters, sort_keys=True))
            if kind == "analyze"
            else stable_id(snapshot_id, json.dumps(parameters, sort_keys=True))
            if kind == "preprocess"
            else str(uuid4())
        )
        job = Job(id=job_id, kind=kind, snapshot_id=snapshot_id, project_id=project_id)
        try:
            with self.sessions.begin() as session:
                existing = session.get(JobRow, job_id)
                if existing:
                    return Job.model_validate(existing.payload)
                session.add(
                    JobRow(id=job_id, payload=job.model_dump(mode="json"), parameters=parameters, result=None)
                )
        except IntegrityError:
            return self.job(job_id)
        return job

    def job(self, job_id: str) -> Job:
        with self.sessions() as session:
            row = session.get(JobRow, job_id)
            if row is None:
                raise PipelineError("not_found", "Job not found", 404)
            return Job.model_validate(row.payload)

    def fail_job(self, job_id: str, issue: PipelineIssue) -> Job:
        with self.sessions.begin() as session:
            row = session.scalar(select(JobRow).where(JobRow.id == job_id).with_for_update())
            if row is None:
                raise PipelineError("not_found", "Job not found", 404)
            job = Job.model_validate(row.payload)
            if job.status == "complete":
                return job
            job = job.model_copy(update={"status": "failed", "issues": [issue]})
            row.payload = job.model_dump(mode="json")
            return job

    def run_job(self, job_id: str) -> Job:
        # PostgreSQL row lock serializes duplicate Celery deliveries for this job.
        # The result and complete status commit atomically. Worker loss rolls back.
        try:
            with self.sessions.begin() as status_session:
                status_row = status_session.scalar(
                    select(JobRow).where(JobRow.id == job_id).with_for_update()
                )
                if status_row is None:
                    raise PipelineError("not_found", "Job not found", 404)
                status_job = Job.model_validate(status_row.payload)
                if status_job.status == "complete":
                    return status_job
                status_row.payload = status_job.model_copy(
                    update={"status": "running", "issues": []}
                ).model_dump(mode="json")
            with self.sessions.begin() as session:
                row = session.scalar(select(JobRow).where(JobRow.id == job_id).with_for_update())
                if row is None:
                    raise PipelineError("not_found", "Job not found", 404)
                job = Job.model_validate(row.payload)
                if job.status == "complete":
                    return job
                row.payload = job.model_copy(update={"status": "running", "issues": []}).model_dump(
                    mode="json"
                )
                if job.kind == "github":
                    from .github import GitHubClient

                    collection, sha, origin = GitHubClient(self.settings).acquire(row.parameters["url"])
                    snapshot = self.import_collection(job.project_id, collection, "github", origin, sha)
                    job = job.model_copy(update={"snapshot_id": snapshot.id})
                elif job.kind == "analyze":
                    preprocessing_job_id = row.parameters["preprocessing_job_id"]
                    pre = self.result(preprocessing_job_id)
                    if pre.snapshot_id != job.snapshot_id:
                        raise PipelineError(
                            "snapshot_mismatch", "Preprocessing belongs to a different snapshot", 409
                        )
                    analysis = explore(pre, preprocessing_job_id, pre.statistics.duplicate_files)
                    row.result = analysis.model_dump(mode="json")
                    for symbol in analysis.symbols:
                        session.add(
                            SymbolRow(
                                id=symbol.id,
                                snapshot_id=job.snapshot_id,
                                job_id=job_id,
                                file_id=symbol.file_id,
                                kind=symbol.kind,
                                payload=symbol.model_dump(mode="json"),
                            )
                        )
                    for edge in analysis.relationships:
                        session.add(
                            RelationshipRow(
                                id=edge.id,
                                snapshot_id=job.snapshot_id,
                                job_id=job_id,
                                kind=edge.kind,
                                resolution=edge.resolution,
                                payload=edge.model_dump(mode="json"),
                            )
                        )
                else:
                    snapshot = self.snapshot(job.snapshot_id)
                    config = PreprocessingConfig.model_validate(row.parameters["configuration"])
                    results = [
                        preprocess(
                            file, self.store.get(file.content_hash), config, self.settings.max_tokens_per_file
                        )
                        for file in snapshot.manifest.files
                    ]
                    all_issues = [i for r in results for i in r.issues]
                    stats = PreprocessingStatistics(
                        files_imported=len(results),
                        python_files=sum(r.language == "python" for r in results),
                        java_files=sum(r.language == "java" for r in results),
                        source_lines=sum(r.statistics.source_lines for r in results),
                        comments=sum(r.statistics.comments for r in results),
                        docstrings=sum(r.statistics.docstrings for r in results),
                        tokens=sum(len(r.tokens) for r in results),
                        unique_identifiers=len(
                            {t.text for r in results for t in r.tokens if t.kind == "identifier"}
                        ),
                        duplicate_files=sum(f.duplicate_of is not None for f in snapshot.manifest.files),
                        ignored_files=len(snapshot.manifest.ignored),
                        unsupported_files=sum(
                            i.reason == "unsupported_extension" for i in snapshot.manifest.ignored
                        ),
                        errors=sum(i.severity == "error" for i in all_issues),
                        warnings=sum(i.severity == "warning" for i in all_issues),
                    )
                    row.result = CAIR(
                        snapshot_id=snapshot.id, configuration=config, results=results, statistics=stats
                    ).model_dump(mode="json")
                job = job.model_copy(update={"status": "complete", "issues": []})
                row.payload = job.model_dump(mode="json")
                return job
        except PipelineError as exc:
            return self.fail_job(job_id, PipelineIssue(code=exc.code, message=exc.message, severity="error"))

    def result(self, job_id: str) -> CAIR:
        job = self.job(job_id)
        if job.status != "complete" or job.kind != "preprocess":
            raise PipelineError("result_not_ready", "Preprocessing result is not available", 409)
        with self.sessions() as session:
            return CAIR.model_validate(session.get(JobRow, job_id).result)

    def analysis(self, job_id: str) -> StructuralAnalysis:
        job = self.job(job_id)
        if job.kind != "analyze" or job.status != "complete":
            raise PipelineError("result_not_ready", "Structural analysis is not available", 409)
        with self.sessions() as session:
            return StructuralAnalysis.model_validate(session.get(JobRow, job_id).result)
