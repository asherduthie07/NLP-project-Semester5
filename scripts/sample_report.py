"""Read synthetic samples, process through the real pipeline, write reproducible evidence."""

import json
import tempfile
from pathlib import Path

from backend.codeatlas.config import Settings
from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.models import Base
from backend.codeatlas.service import Service


def main():
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="codeatlas-corpus-") as directory:
        settings = Settings(
            database_url=f"sqlite:///{directory}/corpus.db",
            storage_root=Path(directory) / "artifacts",
            job_mode="inline",
        )
        service = Service(settings)
        Base.metadata.create_all(service.engine)
        inputs = [(p.name, p.read_bytes()) for p in sorted((root / "datasets/samples").iterdir())]
        snapshot = service.import_collection(
            service.create_project("Synthetic Phase I corpus").id,
            collect_files(inputs, settings, archive=True),
            "files",
        )
        job = service.create_job(
            "preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id
        )
        service.run_job(job.id)
        result = service.result(job.id)
        # Remove run-specific UUIDs/timestamps; findings are stable across runs.
        report = {
            "provenance": "Synthetic examples authored for CodeAtlas AI, MIT; no live GitHub data",
            "configuration": result.configuration.model_dump(),
            "statistics": result.statistics.model_dump(),
            "files": [
                {
                    "path": r.relative_path,
                    "sha256": r.content_hash,
                    "language": r.language,
                    "parser": r.parser_version,
                    "statistics": r.statistics.model_dump(),
                    "issues": [i.code for i in r.issues],
                }
                for r in result.results
            ],
            "ignored": [i.model_dump() for i in snapshot.manifest.ignored],
        }
        destination = root / "docs/07-findings/sample-preprocessing.json"
        destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(report["statistics"], indent=2))
        service.engine.dispose()


if __name__ == "__main__":
    main()
