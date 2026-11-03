import json
from pathlib import Path

import pytest

from nlp.contracts import Evidence, ModelInput, NEREntity
from nlp.dataset import Example, digest, prepare, validate_entities
from nlp.metrics import rouge_l
from nlp.ner import align, decode, entity_metrics
from nlp.summarization import CodeT5Summarizer, baseline, hierarchy


def item():
    source = "def add(a,b): return a+b"
    return ModelInput(
        source=source,
        language="python",
        name="add",
        parameters=["a", "b"],
        evidence=Evidence(snapshot_id="s", symbol_id="f", path="a.py", source_hash=digest(source)),
    )


def test_baseline_and_hierarchy_evidence():
    summary = baseline(item())
    assert summary.text == "Defines add with parameters a, b."
    assert summary == baseline(item())
    assert hierarchy("module", "a", [summary]).evidence == [item().evidence]
    with pytest.raises(ValueError):
        baseline(item().model_copy(update={"source": "changed"}))
    other = baseline(
        item().model_copy(update={"evidence": item().evidence.model_copy(update={"snapshot_id": "other"})})
    )
    with pytest.raises(ValueError, match="Cross-snapshot"):
        hierarchy("repository", "r", [summary, other])


def test_dataset_splits_and_quality():
    values = [
        Example.model_validate(v) for v in json.loads(Path("datasets/phase4/examples.json").read_text())
    ]
    accepted, issues = prepare(values)
    assert len(accepted) == 8 and not issues
    with pytest.raises(ValueError, match="leakage"):
        prepare([values[0], values[0].model_copy(update={"split": "test"})])
    assert prepare([values[0], values[0]])[1][0]["reason"] == "duplicate"
    assert prepare([values[0].model_copy(update={"reference": "TODO"})])[1]
    with pytest.raises(ValueError):
        validate_entities(
            values[0].model_copy(
                update={"entities": [NEREntity(label="FUNCTION", text="bad", start=0, end=3)]}
            )
        )


def test_alignment_decode_and_metrics():
    entity = NEREntity(label="FUNCTION", text="sum", start=0, end=3)
    assert align([(0, 0), (0, 1), (1, 3), (3, 4)], [entity]) == [-100, 1, 2, 0]
    assert decode("sum!", [(0, 1), (1, 3), (3, 4)], [1, 2, 0]) == [entity]
    assert entity_metrics([[entity]], [[]])["micro"]["fp"] == 1
    assert entity_metrics([[]], [[entity]])["micro"]["recall"] == 0
    assert entity_metrics([], [])["micro"]["f1"] is None
    with pytest.raises(ValueError):
        decode("x", [(0, 1)], [999])
    assert rouge_l("a b", "a c") == 0.5
    assert rouge_l("", "") is None


def test_model_failure_is_not_fake_summary(monkeypatch):
    model = CodeT5Summarizer()

    def fail():
        raise OSError("weights unavailable")

    monkeypatch.setattr(model, "load", fail)
    result = model.summarize(item())
    assert result.status == "failed" and result.text == "" and "unavailable" in result.error


def test_backend_snapshot_boundary(client):
    snapshot = client.post(
        "/api/v1/imports/files", files={"files": ("f.py", b"def add(a,b): return a+b")}
    ).json()
    job = client.post(f"/api/v1/snapshots/{snapshot['id']}/analysis").json()
    analysis = client.get(f"/api/v1/jobs/{job['id']}/analysis").json()
    symbol = next(s for s in analysis["symbols"] if s["kind"] == "function")
    body = {"analysis_job_id": job["id"], "symbol_id": symbol["id"]}
    assert client.post(f"/api/v1/nlp/snapshots/{snapshot['id']}/summaries", json=body).status_code == 200
    assert client.post("/api/v1/nlp/snapshots/other/summaries", json=body).status_code == 409
    assert (
        client.post(
            f"/api/v1/nlp/snapshots/{snapshot['id']}/summaries", json={**body, "method": "unknown"}
        ).status_code
        == 422
    )
    endpoint = f"/api/v1/nlp/snapshots/{snapshot['id']}/jobs"
    nlp_job = client.post(endpoint, json=body).json()
    assert nlp_job["status"] == "complete" and nlp_job["kind"] == "nlp"
    assert client.post(endpoint, json=body).json()["id"] == nlp_job["id"]
    result_url = f"/api/v1/nlp/snapshots/{snapshot['id']}/jobs/{nlp_job['id']}/result"
    saved = client.get(result_url).json()
    assert saved["text"] == "Defines add with parameters a, b."
    assert saved["evidence"][0]["start_line"] == 1
    assert client.get(f"/api/v1/nlp/snapshots/wrong/jobs/{nlp_job['id']}/result").status_code == 409
    failed = client.post(endpoint, json={**body, "method": "ner"}).json()
    assert failed["status"] == "failed" and failed["issues"][0]["code"] == "model_unavailable"
    assert client.get(f"/api/v1/nlp/snapshots/{snapshot['id']}/jobs/{failed['id']}/result").status_code == 409
    service = client.app.state.service
    stale = service.create_job(
        "nlp", {**body, "method": "baseline", "model_revision": "obsolete"}, snapshot["id"]
    )
    rejected = service.run_job(stale.id)
    assert rejected.status == "failed" and rejected.issues[0].code == "model_revision_changed"


def test_review_gate_and_frozen_package(tmp_path):
    from nlp.review import package, reviewed_labels, score_ner_run

    dataset = Path("datasets/phase4/examples.json")
    destination = tmp_path / "review"
    package(dataset, destination)
    assert reviewed_labels(dataset, destination) is None
    assert score_ner_run(dataset, destination, {})["metrics"] is None
    assert all(
        not row["entities"] for row in json.loads((destination / "blank-labels.json").read_text())["examples"]
    )
    with pytest.raises(FileExistsError):
        package(dataset, destination)
    signoff = json.loads((destination / "signoff.json").read_text())
    signoff["status"] = "APPROVED"
    (destination / "signoff.json").write_text(json.dumps(signoff))
    (destination / "reviewed-labels.json").write_text((destination / "candidate-labels.json").read_text())
    with pytest.raises(ValueError, match="provenance"):
        reviewed_labels(dataset, destination)


def test_invalid_syntax_and_reference_alignment():
    values = [
        Example.model_validate(v) for v in json.loads(Path("datasets/phase4/examples.json").read_text())
    ]
    assert (
        prepare([values[0].model_copy(update={"source": "def broken(:"})])[1][0]["reason"]
        == "invalid_source_or_alignment"
    )
    assert prepare([values[0].model_copy(update={"name": "missing"})])[1]
    assert prepare([values[1].model_copy(update={"source": "int broken( {"})])[1]


def test_entity_exact_match_formulas_and_empty():
    a = NEREntity(label="METHOD", text="sum", start=0, end=3)
    b = NEREntity(label="PARAMETER", text="x", start=4, end=5)
    c = NEREntity(label="PARAMETER", text="y", start=6, end=7)
    result = entity_metrics([[a, b]], [[a, c]])
    assert result["micro"] == {"tp": 1, "fp": 1, "fn": 1, "precision": 0.5, "recall": 0.5, "f1": 0.5}
    assert result["macro"]["f1"] == 0.5
    assert len(result["false_positives"]) == 1
    with pytest.raises(ValueError, match="counts differ"):
        entity_metrics([[]], [])


def test_device_fallback_and_invalid_device(monkeypatch):
    import sys
    from types import SimpleNamespace

    from nlp.summarization import device

    unavailable = SimpleNamespace(is_available=lambda: False)
    monkeypatch.setitem(
        sys.modules, "torch", SimpleNamespace(cuda=unavailable, backends=SimpleNamespace(mps=unavailable))
    )
    assert device("auto") == device("cuda") == device("mps") == "cpu"
    with pytest.raises(ValueError, match="Unknown device"):
        device("invalid")


def test_context_overflow_never_generates(monkeypatch):
    import sys
    from types import SimpleNamespace

    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(manual_seed=lambda _: None))
    model = CodeT5Summarizer()
    monkeypatch.setattr(model, "load", lambda: None)
    model.actual_device = "cpu"
    model.tokenizer = lambda *args, **kwargs: SimpleNamespace(input_ids=SimpleNamespace(shape=(1, 513)))
    result = model.summarize(item())
    assert result.status == "unsupported" and result.error == "context_overflow" and not result.text


def test_no_checkpoint_is_not_a_trained_ner_model():
    from nlp.ner import NERPredictor

    result = NERPredictor(None).infer(item())
    assert result.status == "failed" and not result.entities and "checkpoint" in result.error


def test_grounding_does_not_verify_arbitrary_prose():
    from nlp.summarization import grounding

    findings = grounding(item(), "The function `missing` calls `charge_card` in file `billing.py`.")
    by_check = {f.check: f.status for f in findings}
    assert by_check["explicit_function_claim"] == "UNSUPPORTED"
    assert by_check["explicit_file_claim"] == "UNSUPPORTED"
    assert by_check["explicit_calls_claim"] == "UNRESOLVED"
    assert by_check["semantic_claims"] == "REVIEW_REQUIRED"


def test_experiment_registry_preserves_nulls_and_rejects_paths(tmp_path, client):
    from nlp.registry import list_runs, read_run

    directory = tmp_path / "ner-123"
    directory.mkdir()
    (directory / "result.json").write_text(
        json.dumps(
            {
                "experiment_id": "ner-123",
                "dataset_hash": "a" * 64,
                "seed": 42,
                "hardware": "unit-test-fixture",
                "packages": {},
                "results": [],
                "metrics": {"test/python": {"f1": None}},
                "gold_status": "REVIEW_PENDING",
                "status": "failed",
            }
        )
    )
    assert list_runs(tmp_path) == ["ner-123"]
    result = read_run(tmp_path, "ner-123")
    assert result.metrics[0].value is None and "failed" in result.warnings[-1]
    client.app.state.service.settings.nlp_runs_root = tmp_path
    assert client.get("/api/v1/nlp/experiments").json() == ["ner-123"]
    assert client.get("/api/v1/nlp/experiments/ner-123").json()["metrics"][0]["value"] is None
    assert client.get("/api/v1/nlp/experiments/ner-999").status_code == 404
    assert client.get("/api/v1/nlp/experiments/invalid").status_code == 422
    catalog = client.get("/api/v1/nlp/models")
    assert catalog.status_code == 200 and len(catalog.json()["models"]) == 2
    assert not any(model["validated"] for model in catalog.json()["models"])
    with pytest.raises(ValueError):
        read_run(tmp_path, "../ner-123")
    (tmp_path / "ner-456").symlink_to(tmp_path.parent)
    with pytest.raises(ValueError):
        read_run(tmp_path, "ner-456")


def test_reviewed_scoring_protocol_with_synthetic_attestation(tmp_path):
    # All approval data lives in pytest's temporary directory: this is not a human review.
    import hashlib

    from nlp.review import package, score_ner_run

    dataset = Path("datasets/phase4/examples.json")
    destination = tmp_path / "synthetic-test-review"
    package(dataset, destination)
    labels = json.loads((destination / "blank-labels.json").read_text())
    labels["provenance"] = "human_source_review"
    entity = NEREntity(label="FUNCTION", text="count", start=4, end=9).model_dump()
    for row in labels["examples"]:
        row["summary"] = "Synthetic unit-test reference, not a reviewed dataset."
        if row["id"] == "py-count":
            row["entities"] = [entity]
    target = destination / "reviewed-labels.json"
    target.write_text(json.dumps(labels))
    signoff = json.loads((destination / "signoff.json").read_text())
    signoff.update(
        status="APPROVED",
        reviewer="synthetic unit-test identity",
        reviewed_at="2026-01-01",
        independent_source_first=True,
        disagreements_resolved=True,
        labels_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
    )
    (destination / "signoff.json").write_text(json.dumps(signoff))
    run = {
        "status": "complete",
        "dataset_hash": hashlib.sha256(dataset.read_bytes()).hexdigest(),
        "training_ids": ["py-add", "java-add", "py-greet", "java-empty"],
        "results": [{"id": "py-count", "predicted": [entity]}, {"id": "java-double", "predicted": []}],
    }
    assert score_ner_run(dataset, destination, run)["metrics"]["all"]["micro"]["tp"] == 1
    run["training_ids"].append("py-count")
    with pytest.raises(ValueError, match="training split"):
        score_ner_run(dataset, destination, run)


def test_cair_hierarchy_from_real_python_java_pipeline(client):
    from nlp.hierarchy import compose

    snapshot = client.post(
        "/api/v1/imports/files",
        files=[
            (
                "files",
                (
                    "cart.py",
                    b"class Cart:\n    def total(self, value):\n        def inner():\n            return value\n        return inner()\n",
                ),
            ),
            (
                "files",
                (
                    "Cart.java",
                    b"import java.util.List;\nclass Cart { int total(int value) { return value; } }",
                ),
            ),
        ],
    ).json()
    job = client.post(f"/api/v1/snapshots/{snapshot['id']}/analysis").json()
    service = client.app.state.service
    analysis = service.analysis(job["id"])
    pre = service.result(analysis.preprocessing_job_id)
    output = compose(analysis, pre, repository_name="Source fixture")
    assert "Cart" in output["repository"].text and "value" in output["repository"].text
    assert "java.util.List" in output["repository"].text
    assert {e.snapshot_id for e in output["repository"].evidence} == {snapshot["id"]}
    assert all(
        symbol.id in output["symbols"] for symbol in analysis.symbols if symbol.kind in {"method", "function"}
    )
    with pytest.raises(ValueError, match="Cross-snapshot"):
        compose(analysis.model_copy(update={"snapshot_id": "wrong"}), pre)


@pytest.mark.parametrize(
    "language,source,name,expected",
    [
        (
            "python",
            "def coût(α: int, β=2): return α + β",
            "coût",
            [("FUNCTION", "coût"), ("PARAMETER", "α"), ("PARAMETER", "β")],
        ),
        (
            "java",
            "int sum(int α, int β) { return α + β; }",
            "sum",
            [("METHOD", "sum"), ("PARAMETER", "α"), ("PARAMETER", "β")],
        ),
    ],
)
def test_parser_entity_baseline_has_exact_unicode_offsets(language, source, name, expected):
    from nlp.entity_baseline import declarations

    value = ModelInput(
        source=source,
        language=language,
        name=name,
        evidence=Evidence(
            snapshot_id="fixture", symbol_id="unit", path="fixture", source_hash=digest(source)
        ),
    )
    entities = declarations(value)
    assert [(entity.label, entity.text) for entity in entities] == expected
    assert all(source[entity.start : entity.end] == entity.text for entity in entities)
