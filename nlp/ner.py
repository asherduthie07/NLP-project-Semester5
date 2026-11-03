"""Trainable declaration-identifier NER. Weak labels never become independent gold."""

import re

from nlp.contracts import NEREntity

ENCODER = "distilbert/distilbert-base-uncased"
ENCODER_REVISION = "12040accade4e8a0f71eabdb258fecc2e7e948be"
LABELS = ["O", "B-FUNCTION", "I-FUNCTION", "B-METHOD", "I-METHOD", "B-PARAMETER", "I-PARAMETER"]


def weak_entities(example):
    source = example.source
    match = re.search(r"\b" + re.escape(example.name) + r"\s*\(", source)
    if not match:
        return []
    end = match.start() + len(example.name)
    entities = [
        NEREntity(
            label="FUNCTION" if example.language == "python" else "METHOD",
            text=example.name,
            start=match.start(),
            end=end,
        )
    ]
    close = source.find(")", end)
    start = source.find("(", end) + 1
    for parameter in re.finditer(r"[A-Za-z_]\w*", source[start:close]):
        text = parameter.group()
        # Deliberately narrow weak labeler for the project-authored synthetic grammar.
        if text in {"int", "String", "boolean"}:
            continue
        offset = start + parameter.start()
        entities.append(NEREntity(label="PARAMETER", text=text, start=offset, end=offset + len(text)))
    return entities


def align(offsets, entities):
    labels, seen = [], set()
    for start, end in offsets:
        if start == end:
            labels.append(-100)
            continue
        overlaps = [i for i, e in enumerate(entities) if e.start <= start < end <= e.end]
        if not overlaps:
            labels.append(0)
            continue
        index = overlaps[0]
        tag = ("I-" if index in seen else "B-") + entities[index].label
        labels.append(LABELS.index(tag))
        seen.add(index)
    return labels


def decode(source, offsets, labels):
    entities = []
    current = None
    for (start, end), label in zip(offsets, labels, strict=True):
        if not 0 <= label < len(LABELS):
            raise ValueError("Unknown label")
        if start == end:
            continue
        tag = LABELS[label]
        if tag == "O":
            if current:
                entities.append(current)
                current = None
        elif tag.startswith("I-") and current and current.label == tag[2:]:
            current.end = end
            current.text = source[current.start : end]
        else:
            if current:
                entities.append(current)
            current = NEREntity(label=tag[2:], start=start, end=end, text=source[start:end])
    if current:
        entities.append(current)
    return entities


def entity_metrics(predicted, reference):
    if len(predicted) != len(reference):
        raise ValueError("Prediction/reference example counts differ")
    p = {(i, e.label, e.start, e.end) for i, entities in enumerate(predicted) for e in entities}
    r = {(i, e.label, e.start, e.end) for i, entities in enumerate(reference) for e in entities}

    def measure(p, r):
        tp, fp, fn = len(p & r), len(p - r), len(r - p)
        return {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": tp / len(p) if p else None,
            "recall": tp / len(r) if r else None,
            "f1": 2 * tp / (len(p) + len(r)) if p or r else None,
        }

    categories = {
        label: measure({e for e in p if e[1] == label}, {e for e in r if e[1] == label})
        for label in sorted({e[1] for e in p | r})
    }
    return {
        "micro": measure(p, r),
        "categories": categories,
        "macro": {
            metric: sum(values) / len(values) if values else None
            for metric in ["precision", "recall", "f1"]
            for values in [[row[metric] for row in categories.values() if row[metric] is not None]]
        },
        "false_positives": sorted(p - r),
        "false_negatives": sorted(r - p),
    }


def train(examples, output, cache="storage/model-cache", epochs=1, seed=42):
    import json
    from pathlib import Path

    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    torch.manual_seed(seed)
    if epochs < 1 or not any(e.split == "train" for e in examples):
        raise ValueError("Training requires epochs and training examples")
    tokenizer = AutoTokenizer.from_pretrained(
        ENCODER, revision=ENCODER_REVISION, cache_dir=cache, use_fast=True, trust_remote_code=False
    )
    model = AutoModelForTokenClassification.from_pretrained(
        ENCODER,
        revision=ENCODER_REVISION,
        cache_dir=cache,
        num_labels=len(LABELS),
        id2label=dict(enumerate(LABELS)),
        label2id={v: k for k, v in enumerate(LABELS)},
        trust_remote_code=False,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5)
    losses = []
    for _ in range(epochs):
        model.train()
        for example in examples:
            if example.split != "train":
                continue
            encoded = tokenizer(
                example.source, return_offsets_mapping=True, return_tensors="pt", truncation=False
            )
            offsets = encoded.pop("offset_mapping")[0].tolist()
            if len(offsets) > 512:
                raise ValueError("NER input overflow")
            labels = torch.tensor([align(offsets, example.entities)])
            optimizer.zero_grad()
            loss = model(**encoded, labels=labels).loss
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
    model.save_pretrained(output, safe_serialization=True)
    tokenizer.save_pretrained(output)
    (Path(output) / "provenance.json").write_text(
        json.dumps(
            {
                "base_model": ENCODER,
                "base_revision": ENCODER_REVISION,
                "seed": seed,
                "epochs": epochs,
                "learning_rate": 5e-5,
                "training_ids": [e.id for e in examples if e.split == "train"],
                "reference_quality": "weak_unreviewed",
                "validated": False,
            },
            indent=2,
        )
    )
    model.eval()
    return model, tokenizer, losses


def predict(source, model, tokenizer):
    import torch

    if not source.strip():
        raise ValueError("Empty source")
    encoded = tokenizer(source, return_offsets_mapping=True, return_tensors="pt", truncation=False)
    offsets = encoded.pop("offset_mapping")[0].tolist()
    if len(offsets) > 512:
        raise ValueError("NER input overflow")
    with torch.inference_mode():
        labels = model(**encoded).logits.argmax(-1)[0].tolist()
    return decode(source, offsets, labels)


class NERPredictor:
    """Loads only an explicitly provisioned local fine-tuned checkpoint, never a random head."""

    def __init__(self, checkpoint):
        self.checkpoint = checkpoint

    def infer(self, item):
        import hashlib
        import json
        from pathlib import Path

        from nlp.contracts import ModelMetadata, NERPredictionResult
        from nlp.summarization import validate_source

        try:
            validate_source(item)
            if not self.checkpoint:
                raise ValueError("No trained NER checkpoint provisioned")
            path = Path(self.checkpoint)
            provenance = json.loads((path / "provenance.json").read_text())
            from transformers import AutoModelForTokenClassification, AutoTokenizer

            tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True, use_fast=True)
            model = AutoModelForTokenClassification.from_pretrained(
                path, local_files_only=True, use_safetensors=True
            ).eval()
            if [model.config.id2label[i] for i in range(len(LABELS))] != LABELS:
                raise ValueError("Incompatible checkpoint label mapping")
            with (path / "model.safetensors").open("rb") as stream:
                revision = hashlib.file_digest(stream, "sha256").hexdigest()
            return NERPredictionResult(
                status="complete",
                entities=predict(item.source, model, tokenizer),
                evidence=item.evidence,
                model=ModelMetadata(
                    model_id="codeatlas/declaration-ner",
                    revision=revision,
                    tokenizer_revision=provenance["base_revision"],
                    license="Apache-2.0",
                    device="cpu",
                ),
                warnings=["Weak-label training; independent entity accuracy is not established."],
            )
        except (ImportError, OSError, ValueError, RuntimeError, KeyError) as exc:
            return NERPredictionResult(
                status="failed", evidence=item.evidence, error=f"{type(exc).__name__}: {exc}"
            )
