# Phase I test plan

Tests use synthetic/local fixtures and mocked HTTP. Never execute imported corpus files.

| Area | Meaningful assertions | Location |
|---|---|---|
| File acquisition | Python/Java bytes, Latin-1, unsupported/binary/invalid encoding, empty selection | tests/test_ingestion.py |
| Archives | Mixed files, ignored paths, traversal (POSIX/Windows/NUL), links/special files, malformed/truncated ZIP, counts, bytes, ratios, duplicate paths | tests/test_ingestion.py |
| Artifact integrity | Stable hash, readback, write-once publication, symlink defense, tamper-visible failure | tests/test_ingestion.py, test_pipeline.py |
| GitHub | Canonical URL, public metadata, commit pin, bounded download, all redirects rejected, network/rate/timeout errors, DNS safety, pinned IP/SNI/Host | tests/test_github.py |
| Lexical records | Correct operators/braces/string/comment distinctions, JavaDoc, actual Python AST docstrings including nested definitions, source slices, Unicode/CRLF/UTF-16/Latin-1, syntax warnings, caps | tests/test_preprocessing.py |
| Contracts | Frozen fields, version, extra-field rejection, position bounds, hash requirements | tests/test_contracts.py |
| Persistence/API | End-to-end file/ZIP/GitHub mocked acquisition, projects/snapshots/manifests/original bytes, jobs/results/issues/stats, error envelopes, actual/chunked body caps, API key, reopen DB | tests/test_api.py |
| Repeat/concurrency | Snapshot/job identity, duplicate contents, alternate configurations, concurrent imports, immutable snapshot after processing | tests/test_pipeline.py |
| PostgreSQL | Migration up/check/down, real FK/schema persistence and row-lock duplicate delivery | tests/test_postgres.py; full suite uses temporary PG schemas when configured |
| Queue | Actual Celery task entry, explicit dispatch failure, live Redis delivery with persisted result | tests/test_jobs.py, test_live_worker.py |
| Properties | SHA-256 consistency for arbitrary bytes; safe relative path preservation | tests/test_ingestion.py (Hypothesis) |
| Frontend M1 | Strict build, every component showcased, pointer/control demos, keyboard tabs, copy/toast, WCAG axe scan, reduced motion, three viewport widths, clean application console | frontend/e2e/design-system.spec.ts |

No live GitHub fetch, downloaded ML weights, semantic analyzer, generated documentation, model accuracy benchmark or future dashboard performance claim forms part of this phase's test evidence. Docker and remote CI checks require an available daemon/runner and must remain NOT RUN until actually executed.
