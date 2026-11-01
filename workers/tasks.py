"""Celery passes only DB job IDs. Source text and results never enter Redis."""

import logging

from celery import Celery

from backend.codeatlas.config import Settings
from backend.codeatlas.contracts import PipelineIssue
from backend.codeatlas.service import Service

settings = Settings()
celery = Celery("codeatlas", broker=settings.redis_url)
celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": 900},
    task_time_limit=300,
    task_soft_time_limit=270,
    broker_connection_timeout=3,
    task_publish_retry=False,
)


@celery.task(name="codeatlas.process_job")
def process_job(job_id: str):
    service = Service(Settings())
    try:
        return service.run_job(job_id).model_dump(mode="json")
    except Exception:
        logging.exception("Job %s failed", job_id)
        service.fail_job(
            job_id,
            PipelineIssue(
                code="worker_failure", message="Processing failed; inspect server logs", severity="error"
            ),
        )
        raise
    finally:
        service.engine.dispose()
