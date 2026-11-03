import gc
import re
import time
from pathlib import Path

from nlp.contracts import GeneratedSummary, GenerationSettings, GroundingResult, ModelInput, ModelMetadata
from nlp.dataset import digest

CODET5 = "Salesforce/codet5-base-multi-sum"
REVISION = "37cf4c014106a34663da1008855a6d07affae042"


def validate_source(item: ModelInput):
    if not item.source.strip() or digest(item.source) != item.evidence.source_hash:
        raise ValueError("Empty source or source evidence hash mismatch")


def grounding(item: ModelInput, text: str):
    findings = [
        GroundingResult(
            status="VERIFIED",
            check="source_reference",
            detail="Exact source hash retained",
            evidence=item.evidence,
        ),
        GroundingResult(
            status="REVIEW_REQUIRED",
            check="semantic_claims",
            detail="Source linkage does not verify generated behavior claims",
            evidence=item.evidence,
        ),
        GroundingResult(
            status="UNSUPPORTED"
            if not text.strip() or text.lower().strip() in {"todo", "placeholder"}
            else "UNRESOLVED",
            check="summary_content",
            detail="Empty/placeholder or semantic content requires review",
            evidence=item.evidence,
        ),
    ]
    for name in [item.name, *item.parameters]:
        present = bool(re.search(r"\b" + re.escape(name) + r"\b", item.source))
        findings.append(
            GroundingResult(
                status="VERIFIED" if present else "UNSUPPORTED",
                check="identifier_presence",
                detail=f"Identifier {name!r} {'appears' if present else 'does not appear'} in source; no behavior claim is verified",
                evidence=item.evidence,
            )
        )
    if item.return_type:
        findings.append(
            GroundingResult(
                status="REVIEW_REQUIRED",
                check="return_annotation",
                detail=f"Structural metadata declares {item.return_type}; prose return claims need review",
                evidence=item.evidence,
            )
        )
    # These deliberately narrow patterns assess explicit, machine-readable claims only.
    for category, claimed in re.findall(r"\b(function|method|parameter|file|module|calls)\s+`([^`]+)`", text):
        supported = (
            claimed == item.name
            if category in {"function", "method"}
            else claimed in item.parameters
            if category == "parameter"
            else claimed == item.evidence.path
            if category == "file"
            else False
        )
        findings.append(
            GroundingResult(
                status="VERIFIED"
                if supported
                else "UNRESOLVED"
                if category in {"calls", "module"}
                else "UNSUPPORTED",
                check=f"explicit_{category}_claim",
                evidence=item.evidence,
                detail=f"{claimed!r}: compared with supplied structural metadata; arbitrary prose is not exhaustively checked",
            )
        )
    return findings


def baseline(item: ModelInput) -> GeneratedSummary:
    validate_source(item)
    text = f"Defines {item.name}"
    text += (
        f" with parameters {', '.join(item.parameters)}"
        if item.parameters
        else " with no supplied parameter metadata"
    )
    text += f" and declared return type {item.return_type}" if item.return_type else ""
    text += "."
    return GeneratedSummary(
        status="complete",
        text=text,
        method="baseline",
        evidence=[item.evidence],
        warnings=["Facts are supplied by structural metadata; behavior is not inferred."],
        grounding=grounding(item, text),
    )


def hierarchy(level: str, name: str, children: list[GeneratedSummary]):
    if level not in {"class", "module", "repository"} or not children:
        raise ValueError("Hierarchy requires a supported level and children")
    if any(c.status != "complete" or not c.text.strip() or not c.evidence for c in children):
        raise ValueError("Incomplete child results")
    evidence = {e.model_dump_json(): e for c in children for e in c.evidence}
    if len({e.snapshot_id for e in evidence.values()}) != 1:
        raise ValueError("Cross-snapshot hierarchy is forbidden")
    return GeneratedSummary(
        status="complete",
        text=f"{level.title()} {name} contains {len(children)} summarized units. "
        + " ".join(c.text for c in children),
        method="hierarchical",
        evidence=list(evidence.values()),
        warnings=["Deterministic composition; child semantic claims remain unverified."],
        grounding=[finding for child in children for finding in child.grounding],
    )


def device(requested="auto"):
    import torch

    if requested == "auto":
        return "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    if requested not in {"cpu", "cuda", "mps"}:
        raise ValueError("Unknown device")
    if (
        requested == "cuda"
        and not torch.cuda.is_available()
        or requested == "mps"
        and not torch.backends.mps.is_available()
    ):
        return "cpu"
    return requested


class CodeT5Summarizer:
    def __init__(self, cache: str = "storage/model-cache", requested_device="auto", offline=True):
        self.cache, self.requested_device, self.offline = cache, requested_device, offline
        self.model = self.tokenizer = None

    def load(self):
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        if self.model is None:
            self.actual_device = device(self.requested_device)
            Path(self.cache).mkdir(parents=True, exist_ok=True)
            self.tokenizer = AutoTokenizer.from_pretrained(
                CODET5,
                revision=REVISION,
                cache_dir=self.cache,
                local_files_only=self.offline,
                trust_remote_code=False,
            )
            self.model = (
                AutoModelForSeq2SeqLM.from_pretrained(
                    CODET5,
                    revision=REVISION,
                    cache_dir=self.cache,
                    local_files_only=self.offline,
                    trust_remote_code=False,
                )
                .to(self.actual_device)
                .eval()
            )

    def summarize(self, item: ModelInput, settings: GenerationSettings | None = None):
        settings = settings or GenerationSettings()
        start = time.perf_counter()
        try:
            validate_source(item)
            self.load()
            import torch

            torch.manual_seed(settings.seed)
            encoded = self.tokenizer(item.source, return_tensors="pt", truncation=False)
            count = encoded.input_ids.shape[1]
            if count > settings.max_input_tokens:
                return GeneratedSummary(
                    status="unsupported",
                    method="codet5",
                    evidence=[item.evidence],
                    settings=settings,
                    input_tokens=count,
                    model=ModelMetadata(
                        model_id=CODET5,
                        revision=REVISION,
                        tokenizer_revision=REVISION,
                        license="BSD-3-Clause",
                        device=self.actual_device,
                    ),
                    duration_seconds=time.perf_counter() - start,
                    error="context_overflow",
                    warnings=["No truncation or generation performed"],
                )
            with torch.inference_mode():
                output = self.model.generate(
                    **{k: v.to(self.actual_device) for k, v in encoded.items()},
                    max_new_tokens=settings.max_new_tokens,
                    num_beams=settings.num_beams,
                    do_sample=False,
                )
            text = self.tokenizer.decode(output[0], skip_special_tokens=True).strip()
            if not text:
                raise ValueError("empty_model_output")
            return GeneratedSummary(
                status="complete",
                method="codet5",
                text=text,
                evidence=[item.evidence],
                settings=settings,
                model=ModelMetadata(
                    model_id=CODET5,
                    revision=REVISION,
                    tokenizer_revision=REVISION,
                    license="BSD-3-Clause",
                    device=self.actual_device,
                ),
                input_tokens=count,
                output_tokens=len(output[0]),
                duration_seconds=time.perf_counter() - start,
                grounding=grounding(item, text),
            )
        except (OSError, RuntimeError, ValueError, ImportError) as exc:
            return GeneratedSummary(
                status="failed",
                method="codet5",
                evidence=[item.evidence],
                settings=settings,
                model=ModelMetadata(
                    model_id=CODET5,
                    revision=REVISION,
                    tokenizer_revision=REVISION,
                    license="BSD-3-Clause",
                    device=getattr(self, "actual_device", "not_loaded"),
                ),
                duration_seconds=time.perf_counter() - start,
                error=f"{type(exc).__name__}: {exc}",
            )

    def unload(self):
        self.model = self.tokenizer = None
        gc.collect()
