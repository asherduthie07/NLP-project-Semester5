# Phase II synthetic dataset and measured findings

The same MIT project-authored fixtures in `datasets/samples/` were run through the real import → preprocessing → analysis pipeline by `.venv/bin/python -m scripts.phase2_report`. This set includes duplicated Python content, Unicode, empty files and malformed Python/Java. It is not a sampled real-world repository.

The latest generated `docs/07-findings/phase-2/analysis.json` reports 7 files (4 Python, 3 Java), 65 source lines, 205 lexical tokens, 59 non-comment token spellings, 20 symbols and 20 relationships. The coverage numerator is 10 documented symbols over 11 documentable symbols: 90.9% on this small synthetic corpus only. There are 2 structure warnings (one invalid Python AST, one partially malformed Java). No API endpoints are present in this corpus; route extraction is tested with separate accepted fixtures. Duplicated content is intentionally retained in totals.

Measured SVG bar plots alongside the JSON report show identifier frequencies, token types, functions per module, documented-symbol counts and module dependency fan-out. They are generated directly from the analysis result. A zero dependency graph in this small corpus should not be interpreted as a model capability or repository benchmark. The JSON contains every symbol and edge summary with path/line or resolution status for review.

This result does not establish general extraction precision or recall. The sample is too small and is authored for exercising the pipeline.
