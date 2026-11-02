"""Read-only projections of completed/failed local experiment records."""

import json
import re
from pathlib import Path

from nlp.contracts import ModelEvaluationRun, ModelMetric


def read_run(root: Path, experiment_id: str):
    if not re.fullmatch(r"(?:prepare|summarize|ner)-[0-9]{1,30}", experiment_id):
        raise ValueError("Invalid experiment identifier")
    root = root.resolve()
    path = root / experiment_id / "result.json"
    if not path.resolve().is_relative_to(root) or path.is_symlink():
        raise ValueError("Unsafe experiment path")
    if path.stat().st_size > 2_000_000:
        raise ValueError("Experiment record exceeds read limit")
    value = json.loads(path.read_text())
    if value["experiment_id"] != experiment_id:
        raise ValueError("Experiment identity mismatch")
    metrics = []

    def visit(node, parts):
        if isinstance(node, dict):
            for key, child in node.items():
                visit(child, [*parts, key])
        elif (isinstance(node, (float, int)) and not isinstance(node, bool)) or node is None:
            metrics.append(
                ModelMetric(
                    name="/".join(parts),
                    value=node,
                    population="recorded experimental split; see metric name",
                    reference_quality=value.get("reference_quality", "synthetic_unreviewed"),
                )
            )

    visit(value.get("metrics", {}), [])
    model = next(
        (
            row.get("transformer", {}).get("model")
            for row in value.get("results", [])
            if row.get("transformer", {}).get("model")
        ),
        {},
    )
    return ModelEvaluationRun(
        experiment_id=experiment_id,
        dataset_hash=value["dataset_hash"],
        seed=value["seed"],
        hardware=value["hardware"],
        packages=value["packages"],
        metrics=metrics,
        model_id=value.get("model_id", model.get("model_id")),
        model_revision=value.get("revision", model.get("revision")),
        tokenizer_revision=value.get("tokenizer_revision", model.get("tokenizer_revision")),
        warnings=[
            "Independent review status: " + value.get("gold_status", "unknown"),
            "Execution status: " + value.get("status", "not_recorded"),
        ],
    )


def list_runs(root: Path):
    if not root.exists():
        return []
    return sorted(
        path.parent.name
        for path in root.glob("*/result.json")
        if re.fullmatch(r"(?:prepare|summarize|ner)-[0-9]{1,30}", path.parent.name)
        and not path.is_symlink()
        and not path.parent.is_symlink()
    )
