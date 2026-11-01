"""Strict reference matching; provenance validation does not establish human identity."""

import hashlib
import json
from collections import Counter
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.codeatlas.contracts import Span


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Form(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FileIdentity(Form):
    path: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    language: Literal["python", "java"]


class SymbolLabel(Form):
    file: FileIdentity
    category: Literal[
        "module",
        "class",
        "interface",
        "record",
        "enum",
        "function",
        "method",
        "constructor",
        "field",
        "variable",
        "parameter",
    ]
    qualified_name: str
    span: Span
    signature: str | None = None
    parameters: list[str] = Field(default_factory=list)


class EdgeLabel(Form):
    file: FileIdentity
    category: Literal["contains", "imports", "inherits", "implements", "calls"]
    source: SymbolLabel
    target: SymbolLabel | None = None
    target_name: str
    alias: str | None = None
    resolution: Literal["confirmed", "ambiguous", "unresolved", "external"]
    span: Span


class Labels(Form):
    schema_version: Literal["1.0"] = "1.0"
    snapshot_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    provenance: Literal["blank", "analyzer_candidate", "independent_human", "provisional_manual"]
    files: list[FileIdentity]
    symbols: list[SymbolLabel] = Field(default_factory=list)
    relationships: list[EdgeLabel] = Field(default_factory=list)


class Signoff(Form):
    status: Literal["REVIEW_PENDING", "APPROVED"] = "REVIEW_PENDING"
    reviewer: str = ""
    reviewed_at: str = ""
    independent_source_labeling: bool = False
    manifest_hash: str = ""
    labels_sha256: str = ""
    complete_files: list[str] = Field(default_factory=list)
    unresolved_disagreements: int = Field(default=0, ge=0)


def key(label) -> str:
    """Exact identity incl spans, signatures, alias and resolution; whitespace in signatures only normalized."""
    value = label.model_dump(mode="json")

    def normalize(item):
        if isinstance(item, dict):
            return {
                k: " ".join(v.split()) if k == "signature" and isinstance(v, str) else normalize(v)
                for k, v in item.items()
            }
        if isinstance(item, list):
            return [normalize(v) for v in item]
        return item

    return json.dumps(normalize(value), sort_keys=True, ensure_ascii=False)


def counts(predictions, reference):
    p, r = Counter(map(key, predictions)), Counter(map(key, reference))
    tp, fp, fn = sum((p & r).values()), sum((p - r).values()), sum((r - p).values())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_positives": [json.loads(k) for k, n in (p - r).items() for _ in range(n)],
        "false_negatives": [json.loads(k) for k, n in (r - p).items() for _ in range(n)],
    }


def score(predictions: Labels, reference: Labels):
    if predictions.snapshot_hash != reference.snapshot_hash or predictions.files != reference.files:
        raise ValueError("Reference source manifest does not match predictions")
    output = {}
    for population in ("symbols", "relationships"):
        p, r = getattr(predictions, population), getattr(reference, population)
        categories = (
            [
                "module",
                "class",
                "interface",
                "record",
                "enum",
                "function",
                "method",
                "constructor",
                "field",
                "variable",
                "parameter",
            ]
            if population == "symbols"
            else ["contains", "imports", "inherits", "implements", "calls"]
        )
        per_category = {
            c: counts([x for x in p if x.category == c], [x for x in r if x.category == c])
            for c in categories
        }
        macro = {}
        for metric in ("precision", "recall", "f1"):
            values = [v[metric] for v in per_category.values() if v[metric] is not None]
            macro[metric] = sum(values) / len(values) if values else None
        output[population] = {
            "micro": counts(p, r),
            "macro": macro,
            "categories": per_category,
            "languages": {
                lang: counts(
                    [x for x in p if x.file.language == lang], [x for x in r if x.file.language == lang]
                )
                for lang in ("python", "java")
            },
        }
    dependencies = {"imports", "inherits", "implements", "calls"}
    output["dependencies"] = counts(
        [x for x in predictions.relationships if x.category in dependencies],
        [x for x in reference.relationships if x.category in dependencies],
    )
    return output


def validate_review(labels: Labels, signoff: Signoff, label_bytes: bytes, manifest_hash: str):
    if (
        signoff.status != "APPROVED"
        or labels.provenance != "independent_human"
        or not signoff.reviewer.strip()
        or not signoff.reviewed_at.strip()
        or not signoff.independent_source_labeling
    ):
        raise ValueError("Independent human review is pending")
    datetime.fromisoformat(signoff.reviewed_at.replace("Z", "+00:00"))
    if (
        signoff.labels_sha256 != sha(label_bytes)
        or signoff.manifest_hash != manifest_hash
        or labels.snapshot_hash != manifest_hash
    ):
        raise ValueError("Review hash mismatch")
    if set(signoff.complete_files) != {f.path for f in labels.files} or signoff.unresolved_disagreements:
        raise ValueError("Incomplete review or unresolved disagreement")
    known = {f.path: f for f in labels.files}
    symbol_keys = {key(s) for s in labels.symbols}
    if len(symbol_keys) != len(labels.symbols) or len({key(e) for e in labels.relationships}) != len(
        labels.relationships
    ):
        raise ValueError("Duplicate reference annotations")
    for record in labels.symbols + labels.relationships:
        if known.get(record.file.path) != record.file:
            raise ValueError("Unknown file in annotation")
    for edge in labels.relationships:
        if key(edge.source) not in symbol_keys or (edge.target and key(edge.target) not in symbol_keys):
            raise ValueError("Relationship identity absent from reviewed symbols")
        if (edge.resolution == "confirmed") != (edge.target is not None):
            raise ValueError("Resolution and target are inconsistent")
