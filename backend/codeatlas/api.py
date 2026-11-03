import logging
from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated

from fastapi import FastAPI, File, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from .config import Settings
from .contracts import (
    CAIR,
    DependencyGraph,
    ErrorDetail,
    ErrorResponse,
    ExploratoryStatistics,
    GitHubImportRequest,
    ImportManifest,
    Job,
    PipelineIssue,
    PreprocessingConfig,
    PreprocessingStatistics,
    PreprocessRequest,
    Project,
    SourceSnapshot,
    StructuralAnalysis,
)
from .errors import PipelineError
from .github import parse_github_url
from .ingestion import collect_files, collect_zip
from .service import Service


def error_response(code: str, message: str, status: int, details: list | None = None):
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, details=details or []))
    return JSONResponse(body.model_dump(mode="json"), status_code=status)


class RequestBoundary:
    """Bound actual received bytes before multipart parsing; do not trust Content-Length."""

    def __init__(self, app, settings: Settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        if self.settings.api_key and not compare_digest(
            headers.get(b"x-api-key", b""), self.settings.api_key.encode()
        ):
            return await error_response("unauthorized", "API key required", 401)(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.settings.max_request_bytes:
                return await error_response("request_size_limit", "Request byte limit exceeded", 413)(
                    scope, receive, send
                )
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    service = Service(settings)

    @asynccontextmanager
    async def lifespan(_):
        yield
        service.engine.dispose()

    app = FastAPI(
        title="CodeAtlas AI — Phases I–II",
        version="1.0.0",
        lifespan=lifespan,
        description="Collection, lexical preprocessing and exploratory structural analysis. Imported source is never executed.",
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
            413: {"model": ErrorResponse},
            415: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    app.state.service = service
    app.add_middleware(RequestBoundary, settings=settings)

    @app.exception_handler(PipelineError)
    async def pipeline_error(_, exc):
        return error_response(exc.code, exc.message, exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_, exc):
        details = [{"location": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]
        return error_response("validation_error", "Request validation failed", 422, details)

    @app.exception_handler(HTTPException)
    async def http_error(_, exc):
        return error_response("http_error", str(exc.detail), exc.status_code)

    @app.exception_handler(Exception)
    async def server_error(_, exc):
        logging.exception("Unhandled API failure", exc_info=exc)
        return error_response("internal_error", "Internal service error; inspect server logs", 500)

    def dispatch(job: Job) -> Job:
        if job.status == "complete":
            return job
        if settings.job_mode == "inline":
            return service.run_job(job.id)
        from workers.tasks import process_job

        try:
            process_job.apply_async(args=[job.id], retry=False)
        except Exception as exc:
            logging.exception("Job dispatch failed")
            service.fail_job(
                job.id,
                PipelineIssue(
                    code="queue_unavailable",
                    message="Job queue unavailable; resubmit when recovered",
                    severity="error",
                ),
            )
            raise PipelineError("queue_unavailable", "Job queue unavailable", 503) from exc
        return service.job(job.id)

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        from sqlalchemy import text

        with service.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "scope": "phase-ii", "schema_version": "1.0"}

    @app.get("/api/v1/projects", response_model=list[Project])
    def projects():
        return service.projects()

    @app.get("/api/v1/projects/{project_id}", response_model=Project)
    def project(project_id: str):
        return service.project(project_id)

    # File parameters retain typed OpenAPI schemas. An outer byte limit bounds multipart parsing.
    @app.post("/api/v1/imports/files", response_model=SourceSnapshot, status_code=201)
    async def import_files(
        files: Annotated[list[UploadFile], File()],
        name: Annotated[str, Query(min_length=1, max_length=120)] = "Uploaded project",
    ):
        try:
            items = [(f.filename or "", await f.read(settings.max_file_bytes + 1)) for f in files]
            collection = await run_in_threadpool(collect_files, items, settings)
            project = await run_in_threadpool(service.create_project, name)
            return await run_in_threadpool(service.import_collection, project.id, collection, "files")
        finally:
            for file in files:
                await file.close()

    @app.post("/api/v1/imports/zip", response_model=SourceSnapshot, status_code=201)
    async def import_zip(
        file: Annotated[UploadFile, File()],
        name: Annotated[str, Query(min_length=1, max_length=120)] = "ZIP project",
    ):
        try:
            if not (file.filename or "").lower().endswith(".zip"):
                raise PipelineError("unsupported_extension", "ZIP upload requires a .zip filename", 415)
            payload = await file.read(settings.max_download_bytes + 1)
            collection = await run_in_threadpool(collect_zip, payload, settings)
            project = await run_in_threadpool(service.create_project, name)
            return await run_in_threadpool(service.import_collection, project.id, collection, "zip")
        finally:
            await file.close()

    @app.post("/api/v1/imports/github", response_model=Job, status_code=202)
    def import_github(request: GitHubImportRequest):
        parse_github_url(request.url)
        project = service.create_project(request.name)
        return dispatch(service.create_job("github", {"url": request.url}, project_id=project.id))

    @app.get("/api/v1/projects/{project_id}/snapshots", response_model=list[SourceSnapshot])
    def snapshots(project_id: str):
        return service.snapshots(project_id)

    @app.get("/api/v1/snapshots/{snapshot_id}", response_model=SourceSnapshot)
    def snapshot(snapshot_id: str):
        return service.snapshot(snapshot_id)

    @app.get("/api/v1/snapshots/{snapshot_id}/manifest", response_model=ImportManifest)
    def manifest(snapshot_id: str):
        return service.snapshot(snapshot_id).manifest

    @app.get(
        "/api/v1/snapshots/{snapshot_id}/files/{file_id}/original",
        response_class=Response,
        responses={
            200: {"content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}
        },
    )
    def original(snapshot_id: str, file_id: str):
        file = next((f for f in service.snapshot(snapshot_id).manifest.files if f.id == file_id), None)
        if file is None:
            raise PipelineError("not_found", "Source file not found", 404)
        return Response(
            service.store.get(file.content_hash),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": "attachment; filename=source.bin",
                "X-Content-Type-Options": "nosniff",
                "ETag": f'"{file.content_hash}"',
            },
        )

    @app.post("/api/v1/snapshots/{snapshot_id}/preprocessing", response_model=Job, status_code=202)
    def start(snapshot_id: str, request: PreprocessRequest):
        return dispatch(
            service.create_job(
                "preprocess", {"configuration": request.configuration.model_dump(mode="json")}, snapshot_id
            )
        )

    @app.get("/api/v1/jobs/{job_id}", response_model=Job)
    def job(job_id: str):
        return service.job(job_id)

    @app.get("/api/v1/jobs/{job_id}/results", response_model=CAIR)
    def results(job_id: str):
        return service.result(job_id)

    @app.get("/api/v1/jobs/{job_id}/issues", response_model=list[PipelineIssue])
    def issues(job_id: str):
        job = service.job(job_id)
        return job.issues + (
            [issue for result in service.result(job_id).results for issue in result.issues]
            if job.status == "complete" and job.kind == "preprocess"
            else []
        )

    @app.get("/api/v1/jobs/{job_id}/statistics", response_model=PreprocessingStatistics)
    def statistics(job_id: str):
        return service.result(job_id).statistics

    @app.post("/api/v1/snapshots/{snapshot_id}/analysis", response_model=Job, status_code=202)
    def start_analysis(snapshot_id: str):
        # Reuse the exact versioned Phase I preprocessing artifact for this snapshot.
        pre_job = service.create_job(
            "preprocess", {"configuration": PreprocessingConfig().model_dump(mode="json")}, snapshot_id
        )
        pre_job = dispatch(pre_job)
        if pre_job.status == "failed":
            raise PipelineError("preprocessing_failed", "Preprocessing failed", 409)
        if pre_job.status != "complete":
            raise PipelineError(
                "preprocessing_pending", "Preprocessing is still running; retry analysis request", 409
            )
        return dispatch(service.create_job("analyze", {"preprocessing_job_id": pre_job.id}, snapshot_id))

    @app.get("/api/v1/jobs/{job_id}/analysis", response_model=StructuralAnalysis)
    def analysis(job_id: str):
        return service.analysis(job_id)

    @app.get("/api/v1/jobs/{job_id}/graph", response_model=DependencyGraph)
    def graph(job_id: str):
        result = service.analysis(job_id)
        return {
            "schema_version": "1.0",
            "snapshot_id": result.snapshot_id,
            "nodes": result.symbols,
            "edges": result.relationships,
        }

    @app.get("/api/v1/jobs/{job_id}/overview", response_model=ExploratoryStatistics)
    def overview(job_id: str):
        return service.analysis(job_id).statistics

    from .nlp_api import router as nlp_router

    app.include_router(nlp_router(service, dispatch))
    return app
