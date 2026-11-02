# Phase IV research methodology

## Research questions and integrity

Compare a deterministic source-metadata template against a code-summary transformer; separately test whether a fine-tuned token classifier can recognize declaration identifiers. Parsing alone is not the learned NER system. CodeT5 output is an unverified candidate; no arbitrary confidence probability is invented. Phase II independent extraction accuracy remains pending and constrains empirical claims about CAIR-derived facts.

## Sources inspected

- [CodeT5 multi-sum model card](https://huggingface.co/Salesforce/codet5-base-multi-sum): BSD-3-Clause; code summarization across CodeSearchNet languages including Python and Java. Tested target revision: `37cf4c014106a34663da1008855a6d07affae042` (execution status recorded separately). AutoTokenizer and AutoModelForSeq2SeqLM; no remote code permitted. This checkpoint is already adapted for summarization; its published performance is not our measured result.
- [DistilBERT model card](https://huggingface.co/distilbert/distilbert-base-uncased): Apache-2.0, compact general-language encoder. Target revision `12040accade4e8a0f71eabdb258fecc2e7e948be`. Chosen for a feasible CPU token-classification pilot. It is not code-specific pretraining; lowercasing and identifier fragmentation limit the task. A fresh seven-label head is fine-tuned along with the encoder.
- [Transformers token-classification guide](https://huggingface.co/docs/transformers/v4.51.3/tasks/token_classification): fast-tokenizer alignment and token-classification model APIs. The implementation uses an explicit PyTorch AdamW loop at batch size one; padding/collation is unnecessary at that batch size. Special tokens are ignored; no truncated examples are trained.
- [CodeSearchNet repository](https://github.com/github/CodeSearchNet): archived project with language-specific code/docstring data. Repository metadata does not grant a blanket license to every original code example. No benchmark code was imported without per-repository provenance/license verification. Pretrained CodeT5 may overlap CodeSearchNet test material, so any future benchmark use requires a contamination warning.

Model metadata was inspected before selecting these checkpoints. Model weights are cached under ignored storage and never committed. License verification does not establish suitability or correctness for every task.

## Dataset and experiments

The current corpus contains eight original synthetic examples with unreviewed synthetic reference summaries, grouped into synthetic repositories. Repository-separated split sizes are 4/2/2. Near-duplicate comparison uses whitespace-normalized SequenceMatcher >=0.95 and exact UTF-8 hashes. The small corpus provides execution evidence, not a credible population benchmark. Natural-language references are not automatically trusted. Independent first-pass labels, candidate comparison, disagreement records, and signoff are required; see `datasets/phase4/ANNOTATION_GUIDELINES.md`.

E1 uses structural name/parameter/return metadata with fixed templates. It makes no inferred business-behavior claim. E2 uses actual pinned CodeT5 inference when the model runtime is available: CPU, seed 42, no sampling, four beams, 512 input-token limit, 64 new-token limit. Oversized inputs are rejected explicitly; no hidden truncation. Function checkpoint validity is not extended to arbitrary repository prose.

NER pilot: DistilBERT, AdamW learning rate 5e-5, one epoch, batch size one, seed 42, four training examples. Weak regex declaration labels are separated from independent gold. Validation and test predictions are separate from optimizer updates. No checkpoint selection or hyperparameter search uses the test set. Any provisional scores measure agreement with weak labels, not human-ground-truth accuracy. No meaningful generalization claim follows from one example per language in each held-out split.

E3 summarizer fine-tuning is not adopted: eight unreviewed examples cannot responsibly establish an adaptation benefit. A larger licensed corpus, reviewed references and compute plan are prerequisites. This optional experiment is explicitly NOT RUN.

## Metrics

Summarization: SacreBLEU 2.5.1 corpus BLEU with 13a tokenizer, case-sensitive, effective order enabled; ROUGE-L is case-sensitive whitespace-token LCS F1, averaged over defined example scores. BLEU uses a 0–100 scale; ROUGE-L uses 0–1. No semantic-embedding metric is claimed. Exact metric settings and actual references are stored with outputs. Latency includes model load on the first request; it is not a throughput benchmark. Process peak RSS is a high-water mark, includes runtime/model memory, and is not GPU memory.

NER: exact category/character-span set matching per example. TP is intersection, FP is predicted-only, FN is reference-only. P=TP/(TP+FP), R=TP/(TP+FN), F1=2TP/(2TP+FP+FN). Empty denominators are null, not perfect scores. Micro pools entity counts; macro averages defined per-category metrics. Per-language results and FP/FN identities are retained. Duplicate records collapse as entity sets; predictions are non-overlapping sequences. Reviewed scoring refuses stale datasets and incomplete signoff.

Mechanical grounding checks source hash and identifier presence only. A name's appearance does not verify its role or inferred behavior. Semantic and return-behavior claims remain REVIEW_REQUIRED; unknown text is UNRESOLVED. There is no calibrated probability or claim that BLEU measures factuality. Human rubric fields remain null until actual independent review.
