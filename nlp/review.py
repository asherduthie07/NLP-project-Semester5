"""Independent review gate and exact-span scoring, separate from weak-label experiments."""

import hashlib
import json
from pathlib import Path

from nlp.contracts import NEREntity
from nlp.dataset import Example, digest, validate_entities
from nlp.ner import entity_metrics, weak_entities


def package(dataset: Path, destination: Path):
    # Never overwrite a human's labels or previously frozen candidates.
    destination.mkdir(parents=True, exist_ok=False)
    examples = [Example.model_validate(e) for e in json.loads(dataset.read_text())]
    manifest = {"dataset_hash": hashlib.sha256(dataset.read_bytes()).hexdigest(), "examples": []}
    blank, candidates = [], []
    for item in examples:
        manifest["examples"].append(
            {
                "id": item.id,
                "source_hash": digest(item.source),
                "language": item.language,
                "split": item.split,
                "repository": item.repository,
            }
        )
        row = {"id": item.id, "source_hash": digest(item.source), "entities": [], "summary": None}
        blank.append(row)
        candidates.append(
            {
                **row,
                "entities": [e.model_dump() for e in weak_entities(item)],
                "summary": item.reference,
                "provenance": "machine_weak_and_synthetic_unreviewed",
            }
        )
    documents = {
        "manifest.json": manifest,
        "sources.json": [{"id": e.id, "source": e.source, "language": e.language} for e in examples],
        "blank-labels.json": {"provenance": "blank", "examples": blank},
        "candidate-labels.json": {"provenance": "machine_unreviewed", "examples": candidates},
        "signoff.json": {
            "status": "REVIEW_PENDING",
            "reviewer": None,
            "reviewed_at": None,
            "independent_source_first": False,
            "dataset_hash": manifest["dataset_hash"],
            "labels_sha256": None,
            "disagreements_resolved": False,
        },
        "disagreements.json": {"status": "REVIEW_PENDING", "records": []},
    }
    for name, value in documents.items():
        (destination / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def reviewed_labels(dataset: Path, review: Path):
    signoff = json.loads((review / "signoff.json").read_text())
    if signoff["status"] != "APPROVED":
        return None
    labels_path = review / "reviewed-labels.json"
    labels = json.loads(labels_path.read_text())
    if not (
        signoff.get("reviewer")
        and signoff.get("reviewed_at")
        and signoff.get("independent_source_first") is True
        and signoff.get("disagreements_resolved") is True
        and signoff.get("dataset_hash") == hashlib.sha256(dataset.read_bytes()).hexdigest()
        and signoff.get("labels_sha256") == hashlib.sha256(labels_path.read_bytes()).hexdigest()
        and labels.get("provenance") == "human_source_review"
    ):
        raise ValueError("Review provenance/hash/signoff incomplete")
    examples = [Example.model_validate(e) for e in json.loads(dataset.read_text())]
    rows = labels["examples"]
    by_id = {row["id"]: row for row in rows}
    if len(by_id) != len(rows) or set(by_id) != {e.id for e in examples}:
        raise ValueError("Reviewed dataset must cover every source exactly once")
    for item in examples:
        row = by_id[item.id]
        if row["source_hash"] != digest(item.source) or not (row.get("summary") or "").strip():
            raise ValueError("Source changed or reference missing")
        item.entities = [NEREntity.model_validate(e) for e in row["entities"]]
        if any(e.label not in {"FUNCTION", "METHOD", "PARAMETER"} for e in item.entities):
            raise ValueError("Unknown reviewed entity label")
        validate_entities(item)
    return by_id


def score_ner_run(dataset: Path, review: Path, run: dict):
    labels = reviewed_labels(dataset, review)
    if labels is None:
        return {"status": "REVIEW_PENDING", "reviewed_examples": 0, "metrics": None}
    if run["dataset_hash"] != hashlib.sha256(dataset.read_bytes()).hexdigest():
        raise ValueError("Run/dataset mismatch")
    examples = [Example.model_validate(e) for e in json.loads(dataset.read_text())]
    tests = [e for e in examples if e.split == "test"]
    if run.get("status") != "complete" or set(run.get("training_ids", [])) != {
        e.id for e in examples if e.split == "train"
    }:
        raise ValueError("Completed run and exact training split provenance required")
    if len({r["id"] for r in run["results"]}) != len(run["results"]):
        raise ValueError("Duplicate prediction examples")
    predictions = {r["id"]: r for r in run["results"]}
    results = {}
    for language in ["python", "java", "all"]:
        selected = [e for e in tests if language == "all" or e.language == language]
        results[language] = entity_metrics(
            [[NEREntity.model_validate(v) for v in predictions[e.id]["predicted"]] for e in selected],
            [[NEREntity.model_validate(v) for v in labels[e.id]["entities"]] for e in selected],
        )
    return {
        "status": "REVIEWED_REFERENCE",
        "reviewed_examples": len(labels),
        "test_examples": len(tests),
        "metrics": results,
        "warning": "Attestations are recorded, not proof of reviewer identity.",
    }
