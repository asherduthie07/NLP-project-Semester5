# Phase IV completion and acceptance report

**Decision: PARTIAL.** Real transformer inference, actual NER training and extensive integration checks completed. Mandatory independent evaluation remains unavailable, and the NER pilot did not recognize any held-out entities. No human review, model quality guarantee or Phase V completion is claimed.

Resume check (2026-11-02): saved experiment and verification artifacts remain available. The last repeat smoke attempt was interrupted by an approval-service usage limit; its temporary log did not survive the session. A fresh repeat attempt could not start because the Docker daemon was unavailable. Earlier completed offline smoke results remain valid historical evidence; the final repeat is explicitly NOT RUN, not an additional pass. The final nullable-timing contract was covered by the 97-test regression and successful image build.

## A. Implementation and source inventory

- `nlp/contracts.py`, `dataset.py`, `review.py`: typed datasets, source/hash/signature metadata, syntax/reference filtering, exact/near duplicates, repository-separated splits and source-first independent review gating.
- `nlp/summarization.py`: deterministic templates, pinned CodeT5 loading/cache/device handling, generation, explicit overflow/failure, grounding and compositional helper.
- `nlp/entity_baseline.py`: separate Python AST/tokenize and Java Tree-sitter declaration baseline, including Unicode source offsets.
- `nlp/ner.py`: real transformer token-classification training, BIO/subtoken alignment, loss masking, checkpoint/provenance saving, local trained-checkpoint inference and exact entity metrics.
- `nlp/hierarchy.py`: CAIR containment → functions/nested declarations/classes/modules/repository, with recorded member/import/inheritance facts and retained source evidence. Semantic purpose and entry points are not invented.
- `nlp/metrics.py`, `registry.py`: BLEU, ROUGE-L, safe read-only experiment projections.
- `experiments/phase4.py`, `model_smoke.py`, `verify_metrics.py`, `review_phase4.py`: explicit reproducible execution and verification commands.
- Additive backend `nlp_api.py`, `nlp_service.py`, job kind/config/service handling; existing PostgreSQL/Celery infrastructure reused. No new database table/migration is needed for the existing jobs JSON schema.
- `tests/test_nlp_phase4.py`, `scripts/phase4_runtime_smoke.py`: unit, persistence, security boundary, actual HTTP/Celery and source-linked integration checks.

Branch remained `phase-4`. No checkout/reset/merge/commit was performed. No dashboard, marketing page, visual component or frontend configuration was changed. `frontend/src/data/generated.ts` was regenerated solely to keep shared API contracts and existing CI consistency checks correct.

## B. Model architecture

E1: fixed templates from source name/parameter/return metadata. Behavioral intent is not inferred.

E2: `Salesforce/codet5-base-multi-sum`, model and tokenizer revision `37cf4c014106a34663da1008855a6d07affae042`, BSD-3-Clause. Genuine CPU inference used seed 42, four beams, no sampling, 512 input-token limit and 64 new-token limit. Input overflow is rejected, not silently truncated. Token counts include tokenizer/decoder special tokens. Outputs remain unverified candidates.

NER: `distilbert/distilbert-base-uncased`, base/tokenizer revision `12040accade4e8a0f71eabdb258fecc2e7e948be`, Apache-2.0. Seven labels: O plus B/I for FUNCTION, METHOD and PARAMETER declarations. The encoder and newly initialized classifier head were actually updated with AdamW, learning rate 5e-5, batch size one, one epoch, seed 42. Four optimizer updates occurred. The checkpoint SHA-256 is `2681c57f268948b0294b436204fd3baaacfde8c9b4dd068bea483996794c2bee`.

Hierarchical outputs are deterministic record synthesis and child-summary composition. CodeT5 is not presented as a validated repository summarizer. Source linkage and narrow metadata checks do not prove arbitrary generated behavior claims.

## C. Dataset and reference status

Eight MIT project-authored synthetic snippets: four Python, four Java. Train/validation/test = **4/2/2**, with no repository group crossing splits. Exact and >=0.95 whitespace-normalized near-duplicate checks found no duplicates in this assembled pilot; source syntax/name checks and reference-presence filters accepted all eight examples. Original source strings are retained. Fragment-local names do not imply an invented enclosing class or package.

Raw dataset SHA-256: `936bf71439ba01c68d38fa1827dc66f295e9437a942495c7bcac5ccb396a198b`. Provenance and actual preparation output: [dataset.json](../../07-findings/phase-4/dataset.json). Sources, blank forms, frozen candidates and signoff are under `datasets/phase4/`. Candidate declaration labels: **18**. Independently reviewed examples: **0**. Status: **REVIEW_PENDING**. References are synthetic/unreviewed; NER labels are weak/unreviewed. These are not real GitHub data or human annotations.

CodeSearchNet and public model cards were investigated; no third-party repository corpus was imported without a per-source licensing audit. Overlap with model pretraining cannot be ruled out. A suitable representative reviewed evaluation set is still required.

## D. Actual experiments and resources

| Run | What actually ran | Observed duration / peak process RSS |
|---|---|---|
| `summarize-1793552813376087257` | E1 and real E2 on both test examples | 600.934 s including first checkpoint download/load; 2,316,308 KiB |
| `ner-1793552818410372899` | Four training updates, then separate validation/test inference | 608.482 s including checkpoint download/setup; 1,765,468 KiB |

Docker host: Linux x86_64 runtime, 8 available CPUs, 8,217,890,816 bytes memory. Each successful model run was restricted to 2 CPUs and 4 GiB. Other services were running; these are observations, not controlled throughput benchmarks. No CUDA or Apple MPS execution occurred.

Installed versions: PyTorch **2.6.0+cpu**, Transformers **4.51.3**, tokenizers **0.21.1**, SacreBLEU **2.5.1**. Complete pinned environment: `nlp/requirements.lock`. The final exact-lock NLP image built and `pip check` passed. Slow initial HTTP transfers were interrupted, preserving cache, then completed using the official Xet transport. Interrupted attempts produced no inference metrics.

NER training losses, in order: **2.060406, 1.668171, 1.312663, 0.843613**. Decreasing training loss did not establish useful held-out entity recognition. No hyperparameters/checkpoint were selected using the final test results, and no post-test tuning was performed.

E3 summarizer fine-tuning: **NOT RUN / not adopted**. Eight unreviewed examples cannot responsibly support a fine-tuning quality comparison. No paid compute was used.

## E. Measured provisional evaluation

One test example per language; all reference summaries are synthetic and unreviewed. BLEU uses SacreBLEU 13a, case-sensitive, effective order; ROUGE-L uses case-sensitive whitespace LCS F1. Neither measures factual correctness.

| Language | Method | BLEU (0–100) | ROUGE-L (0–1) |
|---|---|---:|---:|
| Python | Deterministic baseline | 16.2334 | 0.2000 |
| Python | CodeT5 | 31.5598 | 0.4286 |
| Java | Deterministic baseline | 8.1167 | 0.0000 |
| Java | CodeT5 | 7.2679 | 0.3077 |

Actual CodeT5 outputs:

- Python `count`: “Count the number of items in a sequence .” (15 input tokens; 12 raw output IDs).
- Java `twice`: “Returns the given value multiplied by 2 .” (15 input tokens; 11 raw output IDs).

The first Python request took 599.254 s including download/loading; the subsequent Java request took 1.325 s. Do not compare these as language-specific speed estimates. Offline reload/inference also passed; [summarization.json](../../07-findings/phase-4/summarization.json) preserves complete outputs/settings, and [model-smoke.json](../../07-findings/phase-4/model-smoke.json) preserves the offline checks.

The original experiment artifact used a default `duration_seconds: 0` for baseline results; that was **not a measurement** and is excluded from all timing analysis. The current contract corrects unmeasured baseline/hierarchy durations to null. Original experiment artifacts are retained without rewriting their historical output.

NER predicted **zero entities** on each validation and test example. For each language's test example: TP=0, FP=0, FN=2, precision=null (no predictions), recall=0, F1=0. Across the two test examples this is TP=0, FP=0, FN=4. Category/micro/macro details and false-negative spans are in [ner.json](../../07-findings/phase-4/ner.json). These are **weak-reference agreement metrics**, not independent accuracy. The pipeline executes, but this pilot checkpoint is unsuitable for reliable entity extraction.

The parser baseline emitted four declaration candidates across the two test examples; [entity-baseline.json](../../07-findings/phase-4/entity-baseline.json) records their source offsets. It is not scored against its own labels. Final parser-versus-learned NER comparison requires independently reviewed references.

Independent NER precision/recall/F1 and human quality ratings: **not measured; null**. No human review findings are claimed. The gate correctly returns REVIEW_PENDING even though genuine model execution completed.

## F. Backend and frontend coordination

Versioned model catalog, summary convenience endpoint, async NLP jobs, snapshot-bound result retrieval and experiment projections are documented in [PHASE4_NLP_CONTRACTS.md](../../03-architecture/PHASE4_NLP_CONTRACTS.md) and exported OpenAPI. Shared schemas include GeneratedSummary, NEREntity, NERPredictionResult, ModelMetadata, ModelEvaluationRun, ModelMetric, GroundingResult and ModelJobStatus. The actual queue reuses the original Job contract.

The real HTTP smoke imported two sources, completed preprocessing and structural analysis, retrieved a graph with five nodes, then retrieved persistent Python and Java baseline summaries through Celery; resubmission reused job IDs. Evidence: [runtime-smoke.json](../../07-findings/phase-4/runtime-smoke.json).

The standard backend image intentionally does not contain large model dependencies/weights. Actual transformer adapters and checkpoint reload work in the isolated research runtime. Provisioning a model-capable API worker with appropriate memory, cache mounts and concurrency remains pending; no fully deployed transformer endpoint is claimed. Phase III can integrate the typed contracts independently. Full publishing/deployment is not part of this work.

## G. Verification and build status

- Final PostgreSQL/Redis/Celery regression: **97 passed, 0 failed, 0 skipped, 91% coverage**, 16.22 s in the final run.
- Focused Phase IV suite: **17 passed**.
- Metric arithmetic checks in the actual NLP environment: **5 passed**.
- Strict TypeScript/Vite build: **passed**; original Playwright suite: **3 passed**.
- Live HTTP/Celery Python/Java flow: **passed** after fixing Celery subprocess package discovery with `PYTHONPATH=/app`.
- Real CodeT5 and NER execution: **completed**. Network-disabled smoke: **passed**, including tokenizer overflow at 3007 tokens, genuine cached generation, trained-checkpoint reload and actual CPU fallback.
- Ruff lint/format and whitespace checks: **passed**. Remote CI: **NOT RUN**.
- Final exact-lock NLP image: **built successfully**, dependency check clean. A clean normal backend rebuild **failed** retrieving pre-existing `tzlocal==5.4.5`; current-source regressions used the existing installed dependency image. No version was silently changed and this is not reported as a clean backend-build pass.

Exact commands and raw outputs are in [VERIFICATION.md](../../06-testing-verification/phase-4/VERIFICATION.md). Earlier local fast-suite runs skipped PostgreSQL/live-worker tests; the final integration suite ran them successfully. No failing tests were disabled. Temporary audit API/worker containers were removed; the user's original services were left intact.

## H. Documentation

- `docs/04-phase-records/phase-4/AUDIT_AND_PLAN.md`, `IMPLEMENTATION_LOG.md`, this report.
- `docs/02-research/PHASE4_NLP_METHODOLOGY.md`.
- `docs/03-architecture/PHASE4_NLP_CONTRACTS.md`, updated `openapi.json`.
- `docs/06-testing-verification/phase-4/VERIFICATION.md` and raw evidence files.
- `docs/07-findings/phase-4/` dataset, baseline/model/NER outputs and live/offline smoke artifacts.
- Updated project status, requirements traceability, changelog, root README and NLP run instructions. Dataset annotation guidelines, licenses and review forms are retained alongside fixtures.

## I. Outstanding dependencies and required work

1. Independent source-first human annotation and adjudication, including summary quality ratings. Preserve candidates, blind first pass, corrections and actual signoff; do not fabricate approval.
2. A larger licensed, representative, reviewed corpus and a validation-driven NER development plan. The current checkpoint misses all held-out entities. Do not repeatedly tune against the already-observed pilot test set; lock a fresh final evaluation split for future model selection.
3. Final independently grounded parser-versus-NER and summarization quality evaluation. Phase II's independent extraction evaluation is also still PARTIAL.
4. Verify model-capable backend worker provisioning and resource limits before exposing real transformer jobs through the ordinary application runtime. Shared interface integration with the teammate remains pending.
5. Restore a reproducible clean backend dependency installation; retain the existing pin until the retrieval problem is investigated.

## J. Acceptance decision

**PARTIAL — implementation and genuine model execution are evidenced, but mandatory independent evaluation and reliable NER quality are not established.** The 97 passing tests demonstrate tested software behavior; they do not establish model accuracy. No Phase V work or frontend branch merge was started. Stop at this gate.
