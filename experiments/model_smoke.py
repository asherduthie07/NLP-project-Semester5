"""Explicit real-weight smoke; never part of ordinary offline unit tests."""

import argparse
import json
from pathlib import Path

from nlp.contracts import Evidence, ModelInput
from nlp.dataset import digest
from nlp.ner import NERPredictor
from nlp.summarization import CodeT5Summarizer, device


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ner-checkpoint", required=True)
    args = parser.parse_args()
    values = [
        v for v in json.loads(Path("datasets/phase4/examples.json").read_text()) if v["split"] == "test"
    ]
    model = CodeT5Summarizer(requested_device="cpu", offline=True)
    rows = []
    inputs = []
    for value in values:
        item = ModelInput(
            source=value["source"],
            language=value["language"],
            name=value["name"],
            evidence=Evidence(
                snapshot_id="explicit-offline-smoke",
                symbol_id=value["id"],
                path=value["path"],
                source_hash=digest(value["source"]),
            ),
        )
        inputs.append(item)
        result = model.summarize(item)
        assert result.status == "complete" and result.text and result.model.device == "cpu", result
        rows.append({"id": value["id"], "summary": result.model_dump(mode="json")})
    large = "def oversized():\n" + "    value = 1\n" * 600
    overflow = inputs[0].model_copy(
        update={
            "source": large,
            "evidence": inputs[0].evidence.model_copy(update={"source_hash": digest(large)}),
        }
    )
    result = model.summarize(overflow)
    assert result.status == "unsupported" and result.error == "context_overflow"
    model.unload()
    for row, item in zip(rows, inputs, strict=True):
        ner = NERPredictor(args.ner_checkpoint).infer(item)
        assert ner.status == "complete", ner
        row["ner"] = ner.model_dump(mode="json")
    assert device("cuda") == "cpu" and device("mps") == "cpu"
    report = {
        "status": "complete",
        "network": "disabled",
        "checks": [
            "real CodeT5 Python/Java cached inference",
            "real tokenizer overflow rejection",
            "trained NER checkpoint reload and Python/Java inference",
            "actual CPU fallback",
        ],
        "results": rows,
        "independent_validation": "REVIEW_PENDING",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
