"""Prepare a source-first review package; score only a signed independent reference."""

import argparse
import json
import tempfile
from pathlib import Path

from analyzers.evaluation import (
    EdgeLabel,
    FileIdentity,
    Labels,
    Signoff,
    SymbolLabel,
    score,
    sha,
    validate_review,
)
from backend.codeatlas.config import Settings
from backend.codeatlas.contracts import PreprocessingConfig
from backend.codeatlas.ingestion import collect_files
from backend.codeatlas.models import Base
from backend.codeatlas.service import Service

ROOT = Path(__file__).resolve().parents[1] / "datasets/evaluation"


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x") as handle:
        handle.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def predict():
    sources = sorted((ROOT / "sources").glob("*"))
    files = [
        FileIdentity(
            path=p.name, sha256=sha(p.read_bytes()), language="python" if p.suffix == ".py" else "java"
        )
        for p in sources
    ]
    snapshot_hash = sha(json.dumps([f.model_dump() for f in files], sort_keys=True).encode())
    with tempfile.TemporaryDirectory(prefix="codeatlas-evaluation-") as directory:
        settings = Settings(
            database_url=f"sqlite:///{directory}/eval.db",
            storage_root=Path(directory) / "blobs",
            job_mode="inline",
        )
        service = Service(settings)
        Base.metadata.create_all(service.engine)
        snapshot = service.import_collection(
            service.create_project("Synthetic review corpus").id,
            collect_files([(p.name, p.read_bytes()) for p in sources], settings),
            "files",
        )
        pre = service.create_job(
            "preprocess", {"configuration": PreprocessingConfig().model_dump()}, snapshot.id
        )
        service.run_job(pre.id)
        job = service.create_job("analyze", {"preprocessing_job_id": pre.id}, snapshot.id)
        service.run_job(job.id)
        analysis = service.analysis(job.id)
        identities = {f.path: f for f in files}
        symbols = {
            s.id: SymbolLabel(
                file=identities[s.evidence.relative_path],
                category=s.kind,
                qualified_name=s.qualified_name,
                span=s.evidence.span,
                signature=s.signature,
                parameters=s.parameters,
            )
            for s in analysis.symbols
        }
        edges = [
            EdgeLabel(
                file=identities[e.evidence.relative_path],
                category=e.kind,
                source=symbols[e.source_id],
                target=symbols.get(e.target_id),
                target_name=e.target_name,
                alias=e.alias,
                resolution=e.resolution,
                span=e.evidence.span,
            )
            for e in analysis.relationships
        ]
        service.engine.dispose()
        return Labels(
            snapshot_hash=snapshot_hash,
            provenance="analyzer_candidate",
            files=files,
            symbols=list(symbols.values()),
            relationships=edges,
        )


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("command", choices=["prepare", "evaluate"])
    args = parser.parse_args()
    predictions = predict()
    if args.command == "prepare":
        write_new(ROOT / "candidates/initial.json", predictions.model_dump(mode="json"))
        blank = predictions.model_copy(update={"provenance": "blank", "symbols": [], "relationships": []})
        write_new(ROOT / "review/labels.json", blank.model_dump(mode="json"))
        write_new(ROOT / "review/signoff.json", Signoff(manifest_hash=predictions.snapshot_hash).model_dump())
        write_new(ROOT / "review/disagreements.json", {"status": "REVIEW_PENDING", "entries": []})
        write_new(ROOT / "annotation-schema.json", Labels.model_json_schema())
        write_new(
            ROOT / "manifest.json",
            {
                "snapshot_hash": predictions.snapshot_hash,
                "files": [f.model_dump() for f in predictions.files],
            },
        )
        print(
            json.dumps(
                {
                    "status": "REVIEW_PENDING",
                    "files": len(predictions.files),
                    "candidate_symbols": len(predictions.symbols),
                    "candidate_relationships": len(predictions.relationships),
                }
            )
        )
        return
    reference_bytes = (ROOT / "review/labels.json").read_bytes()
    reference = Labels.model_validate_json(reference_bytes)
    signoff = Signoff.model_validate_json((ROOT / "review/signoff.json").read_bytes())
    report = {
        "status": "REVIEW_PENDING",
        "reviewed_examples": 0,
        "metrics": None,
        "snapshot_hash": predictions.snapshot_hash,
    }
    if signoff.status == "APPROVED":
        validate_review(reference, signoff, reference_bytes, predictions.snapshot_hash)
        disagreements = json.loads((ROOT / "review/disagreements.json").read_text())
        if disagreements["status"] != "RESOLVED" or any(
            e.get("status") != "RESOLVED" for e in disagreements["entries"]
        ):
            raise ValueError("Disagreement record is not resolved")
        report.update(
            status="REVIEWED_EVALUATION",
            reviewed_examples=len(reference.symbols) + len(reference.relationships),
            metrics=score(predictions, reference),
        )
    destination = Path("docs/07-findings/phase-2/evaluation")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "current-predictions.json").write_text(predictions.model_dump_json(indent=2) + "\n")
    (destination / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
