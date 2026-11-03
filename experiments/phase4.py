import argparse
import hashlib
import json
import platform
import resource
import time
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from nlp.contracts import Evidence, ModelInput
from nlp.dataset import Example, digest, prepare
from nlp.metrics import summarization_metrics
from nlp.ner import ENCODER, ENCODER_REVISION, entity_metrics, predict, train, weak_entities
from nlp.summarization import CodeT5Summarizer, baseline


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "summarize", "ner"])
    parser.add_argument("--output", default="storage/nlp-runs")
    args = parser.parse_args()
    path = Path("datasets/phase4/examples.json")
    examples, issues = prepare([Example.model_validate(e) for e in json.loads(path.read_text())])
    output = Path(args.output) / f"{args.mode}-{time.time_ns()}"
    output.mkdir(parents=True, exist_ok=False)
    report = {
        "experiment_id": output.name,
        "dataset_hash": digest(path.read_text()),
        "seed": 42,
        "hardware": platform.platform(),
        "packages": {},
        "issues": issues,
        "results": [],
        "gold_status": "REVIEW_PENDING",
        "independent_metrics": None,
    }
    for package in ["torch", "transformers", "tokenizers", "sacrebleu"]:
        try:
            report["packages"][package] = version(package)
        except PackageNotFoundError:
            report["packages"][package] = "not installed"
    start = time.perf_counter()
    if args.mode == "summarize":
        model = CodeT5Summarizer(requested_device="cpu", offline=False)
        for item in examples:
            if item.split != "test":
                continue
            inp = ModelInput(
                source=item.source,
                language=item.language,
                name=item.name,
                parameters=[e.text for e in weak_entities(item) if e.label == "PARAMETER"],
                evidence=Evidence(
                    snapshot_id=report["dataset_hash"],
                    symbol_id=item.id,
                    path=item.path,
                    source_hash=digest(item.source),
                ),
            )
            result = model.summarize(inp)
            report["results"].append(
                {
                    "id": item.id,
                    "language": item.language,
                    "reference": item.reference,
                    "baseline": baseline(inp).model_dump(mode="json"),
                    "transformer": result.model_dump(mode="json"),
                }
            )
        model.unload()
        report["metrics"] = {}
        for language in ["python", "java"]:
            rows = [r for r in report["results"] if r["language"] == language]
            report["metrics"][language] = {
                method: summarization_metrics(
                    [r[method]["text"] for r in rows], [r["reference"] for r in rows]
                )
                for method in ["baseline", "transformer"]
                if rows and all(r[method]["status"] == "complete" for r in rows)
            }
    elif args.mode == "ner":
        for item in examples:
            item.entities = weak_entities(item)
        try:
            model, tokenizer, losses = train(examples, output / "checkpoint")
        except (OSError, ImportError, RuntimeError, ValueError) as exc:
            report.update(
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
                duration_seconds=time.perf_counter() - start,
            )
            (output / "result.json").write_text(json.dumps(report, indent=2) + "\n")
            raise
        with (output / "checkpoint" / "model.safetensors").open("rb") as checkpoint_file:
            checkpoint_hash = hashlib.file_digest(checkpoint_file, "sha256").hexdigest()
        report.update(
            model_id="codeatlas/declaration-ner",
            revision=checkpoint_hash,
            base_model=ENCODER,
            base_revision=ENCODER_REVISION,
            tokenizer_revision=ENCODER_REVISION,
            epochs=1,
            learning_rate=5e-5,
            batch_size=1,
            losses=losses,
            reference_quality="weak_unreviewed",
            training_ids=[e.id for e in examples if e.split == "train"],
        )
        report["metrics"] = {}
        for split in ["validation", "test"]:
            for language in ["python", "java"]:
                rows = [e for e in examples if e.split == split and e.language == language]
                predictions = [predict(e.source, model, tokenizer) for e in rows]
                report["metrics"][f"{split}/{language}"] = entity_metrics(
                    predictions, [e.entities for e in rows]
                )
                report["results"].extend(
                    {
                        "id": e.id,
                        "predicted": [p.model_dump() for p in predicted],
                        "weak_reference": [p.model_dump() for p in e.entities],
                    }
                    for e, predicted in zip(rows, predictions, strict=True)
                )
    else:
        report["split_sizes"] = {
            split: sum(e.split == split for e in examples) for split in ["train", "validation", "test"]
        }
        report["results"] = [e.model_dump(mode="json") for e in examples]
    report["duration_seconds"] = time.perf_counter() - start
    report["process_peak_rss_raw"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    report["process_peak_rss_unit"] = "bytes" if platform.system() == "Darwin" else "KiB"
    report["status"] = (
        "failed"
        if args.mode == "summarize"
        and any(row["transformer"]["status"] != "complete" for row in report["results"])
        else "complete"
    )
    (output / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if report["status"] == "failed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
