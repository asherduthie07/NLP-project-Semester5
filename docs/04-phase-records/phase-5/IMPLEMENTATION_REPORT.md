# Phase V implementation checkpoint

Phase IV integration is present on main as merge c40a31e. Work began from fetched origin/main on branch `phase5/end-to-end`.

## Implemented

- `/app/import` accepts Python/Java files, one ZIP, or a public GitHub URL. It runs import, preprocessing and structural analysis, polls job states, selects the new live snapshot and stores its analysis job ID for dashboard navigation. GitHub imports remain subject to the existing URL/security limits.
- Existing Live Overview, Explorer, Graph and Verification remain intact. Documentation Studio and Exports use backend generated documentation. NLP Intelligence submits baseline, CodeT5 and NER jobs against selected symbols and displays their actual result or failure.
- Backend documentation and claims endpoints compose the Phase IV deterministic hierarchy from analyzed source. The Markdown ZIP contains a README, per-symbol reference pages, machine-readable documentation and verification records. References include source paths, spans and evidence hashes.
- Every generated semantic claim is marked uncertain for review. `coverageAfter` equals original coverage because generating a separate package does not modify source docstrings. No synthetic evaluation metrics are added.

## Verification

- `tests/test_documentation_phase5.py` imports a real Python and Java source pair, completes preprocessing and analysis, reads documentation and verification, and validates the exported ZIP.
- Targeted backend suite: 22 passed (`test_pipeline.py`, `test_nlp_phase4.py`, `test_documentation_phase5.py`). Frontend unit suite: 113 passed. Frontend lint and production build: pass. Targeted Playwright destination navigation: 1 passed after correcting the new import route. Ruff check and format: pass.
- Existing Phase IV integration record documents real CodeT5/NER smoke using the local model image. This checkpoint did not rerun the model smoke or independent model evaluation. CodeT5 requires its cached weights; NER requires `CODEATLAS_NER_CHECKPOINT` and the NLP runtime.

## Startup

Use the root README prerequisites and `.env` file. Run `make infra`, `make migrate`, `make api`, `make worker`, and `make frontend` in the documented arrangement. Open `http://127.0.0.1:5173/app/import`, select Live, upload source and run analysis. For a local single-process demonstration set `CODEATLAS_JOB_MODE=inline` before starting the API; the API and frontend then suffice after database migration. The Vite server proxies `/api` to `127.0.0.1:8000`. For a separate API origin set `VITE_API_BASE`.

## Remaining limits

API endpoint reference detection and publication into source files are not implemented. The README is a conservative structural summary. The NER pilot lacks independent accuracy validation and its held-out performance was poor in Phase IV. Verification links exact source evidence but cannot prove arbitrary behavioral claims. GitHub URL import and UI-driven model inference have not been exercised in this checkpoint. A live browser run against a running PostgreSQL backend remains to be verified.
