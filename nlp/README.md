# Phase IV NLP subsystem

Deterministic summarization, pinned CodeT5 inference, trainable declaration NER, dataset quality checks, exact-span evaluation, review gating, deterministic hierarchy and source-grounding records. See `docs/04-phase-records/phase-4/` for actual execution status and limitations. Independent gold review is pending; no quality claim follows from implementation alone.

Offline checks from the project root:

```sh
.venv/bin/pytest -q tests/test_nlp_phase4.py
.venv/bin/python -m experiments.phase4 prepare
.venv/bin/python -m experiments.review_phase4 score-ner
```

Separate Linux x86_64 CPU research runtime (large dependency/model downloads, no paid service):

```sh
docker build -f nlp/Dockerfile -t codeatlas-nlp:phase4 .
docker run --rm --cpus 2 --memory 5g -e OMP_NUM_THREADS=2 -e MKL_NUM_THREADS=2 \
  --mount "type=bind,source=$PWD/datasets/phase4,target=/app/datasets/phase4,readonly" \
  --mount "type=bind,source=$PWD/storage,target=/app/storage" \
  codeatlas-nlp:phase4 python -m experiments.phase4 summarize
docker run --rm --cpus 2 --memory 5g -e OMP_NUM_THREADS=2 -e MKL_NUM_THREADS=2 \
  --mount "type=bind,source=$PWD/datasets/phase4,target=/app/datasets/phase4,readonly" \
  --mount "type=bind,source=$PWD/storage,target=/app/storage" \
  codeatlas-nlp:phase4 python -m experiments.phase4 ner
```

These commands run genuine weights when downloads succeed. Ordinary tests use no model downloads and are not proof of transformer execution. Results and checkpoints are saved under ignored `storage/nlp-runs`; cache under `storage/model-cache`. Do not commit either. NER API workers require `CODEATLAS_NER_CHECKPOINT` pointing to an actual saved checkpoint with `provenance.json` and safetensors. Missing dependencies/weights produce failed jobs.

The research image is separate from the ordinary FastAPI image to preserve existing dependency/resource constraints. It is an experiment environment, not a deployed model worker. Consult `docs/03-architecture/PHASE4_NLP_CONTRACTS.md` before provisioning transformer inference in a worker.
