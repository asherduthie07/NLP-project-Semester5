# Phase IV audit and execution plan

Initial Git check: clean worktree, active/only local branch `phase-4`, commit b025edc. This is the actual Phase IV branch (the proposed feature/phase-4-nlp-models name is not present). No branch switching or frontend edits are needed. Parallel ownership: frontend/ and Phase III visualization records belong to the teammate. Shared backend/status changes will be additive.

Phase I is verified. Phase II acceptance remains PARTIAL, REVIEW_PENDING, zero reviewed reference labels. Its structural facts can support a deterministic baseline, but empirical parser accuracy remains unvalidated. Phase IV will retain this dependency and use separately authored, clearly synthetic reference fixtures and pending review forms.

Host: Intel x86_64 macOS 15.5, 16 logical CPUs, Python 3.13 backend environment, Python 3.11 also installed. Torch/Transformers/tokenizers are absent. `datasets` resolves to the repository folder and is not evidence that Hugging Face Datasets is installed. Hardware memory query was denied by sandbox. No CUDA/MPS execution is claimed. Prefer isolated Linux CPU model execution to avoid disturbing pinned backend dependencies.

Milestones: A typed dataset/provenance/split/quality/review tools; B deterministic fact templates; C pinned CodeT5 CPU adapter with explicit overflow/errors; D trainable token classification, BIO alignment and offset decoding; E deterministic hierarchy with evidence; F real-output metrics/experiment manifests; G grounding, typed backend contracts and regression evidence. Final independent quality evaluation requires human annotations and remains pending unless actual review occurs. Full public benchmark ingestion is conditional on per-source license review.
