"""Hand-calculated scoring examples are evaluator tests, not corpus accuracy evidence."""

import pytest

from analyzers.evaluation import (
    EdgeLabel,
    FileIdentity,
    Labels,
    Signoff,
    SymbolLabel,
    counts,
    score,
    sha,
    validate_review,
)
from analyzers.structure import analyze_file
from tests.test_preprocessing import process, source_slice


def label(name="a.f", category="function"):
    return SymbolLabel(
        file=FileIdentity(path="a.py", sha256="a" * 64, language="python"),
        category=category,
        qualified_name=name,
        span={"start": {"line": 1, "column": 0}, "end": {"line": 2, "column": 4}},
    )


def test_hand_calculated_tp_fp_fn_and_empty():
    result = counts([label(), label("a.extra")], [label(), label("a.missing"), label("a.other")])
    assert (result["tp"], result["fp"], result["fn"]) == (1, 1, 2)
    assert result["precision"] == 0.5
    assert result["recall"] == pytest.approx(1 / 3)
    assert result["f1"] == 0.4
    assert counts([], [label()])["recall"] == 0
    assert counts([label()], [])["precision"] == 0
    assert counts([], [])["f1"] is None
    assert counts([label(), label()], [label()])["fp"] == 1


def test_strict_spans_signatures_and_macro():
    original = label()
    changed = original.model_copy(update={"signature": "int id"})
    assert counts([original], [changed])["tp"] == 0
    bundle = Labels(
        snapshot_hash="b" * 64, provenance="provisional_manual", files=[original.file], symbols=[original]
    )
    output = score(bundle, bundle)
    assert output["symbols"]["languages"]["java"]["f1"] is None
    assert output["symbols"]["categories"]["parameter"]["f1"] is None
    assert output["symbols"]["macro"]["f1"] == 1
    with pytest.raises(ValueError, match="manifest"):
        score(bundle, bundle.model_copy(update={"snapshot_hash": "c" * 64}))


def test_candidates_cannot_be_approved_reference():
    labels = Labels(snapshot_hash="b" * 64, provenance="analyzer_candidate", files=[label().file])
    raw = labels.model_dump_json().encode()
    # A synthetic unit-test identity, not a recorded reviewer of the corpus.
    signoff = Signoff(
        status="APPROVED",
        reviewer="TEST ONLY",
        reviewed_at="2026-11-01T00:00:00Z",
        independent_source_labeling=True,
        manifest_hash="b" * 64,
        labels_sha256=sha(raw),
        complete_files=["a.py"],
    )
    with pytest.raises(ValueError, match="pending"):
        validate_review(labels, signoff, raw, "b" * 64)
    labels = labels.model_copy(update={"provenance": "independent_human"})
    with pytest.raises(ValueError, match="hash"):
        validate_review(labels, signoff, raw + b" ", "b" * 64)


def test_python_unicode_structure_spans():
    source = "def café():\n    α = 1; β = α\n    return β\n"
    symbols, _, _, _ = analyze_file(process(source))
    beta = next(s for s in symbols if s.name == "β")
    assert source_slice(source, beta.evidence.span) == "β"
    assert beta.evidence.span.start.column == 11


def test_relationship_resolution_is_part_of_matching():
    edge = EdgeLabel(
        file=label().file,
        category="calls",
        source=label(),
        target=None,
        target_name="unknown",
        resolution="unresolved",
        span=label().span,
    )
    changed = edge.model_copy(update={"resolution": "ambiguous"})
    result = counts([edge], [changed])
    assert (result["tp"], result["fp"], result["fn"]) == (0, 1, 1)


def test_review_hash_and_completeness_validation():
    # This tests the validation protocol; it is not a real dataset approval.
    labels = Labels(
        snapshot_hash="b" * 64, provenance="independent_human", files=[label().file], symbols=[label()]
    )
    raw = labels.model_dump_json().encode()
    signoff = Signoff(
        status="APPROVED",
        reviewer="SYNTHETIC TEST IDENTITY",
        reviewed_at="2026-11-01T00:00:00Z",
        independent_source_labeling=True,
        manifest_hash="b" * 64,
        labels_sha256=sha(raw),
        complete_files=["a.py"],
    )
    validate_review(labels, signoff, raw, "b" * 64)
    with pytest.raises(ValueError, match="Incomplete"):
        validate_review(labels, signoff.model_copy(update={"complete_files": []}), raw, "b" * 64)


def test_review_package_provenance_and_source_hashes_match():
    import json
    from pathlib import Path

    root = Path("datasets/evaluation")
    manifest = json.loads((root / "manifest.json").read_text())
    for file in manifest["files"]:
        assert sha((root / "sources" / file["path"]).read_bytes()) == file["sha256"]
    Signoff.model_validate_json((root / "review/signoff.json").read_bytes())
    Labels.model_validate_json((root / "review/labels.json").read_bytes())
    assert json.loads((root / "candidates/initial.json").read_text())["provenance"] == "analyzer_candidate"
