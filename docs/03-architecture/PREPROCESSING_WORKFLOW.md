# Preprocessing workflow

The API validates the requested configuration, records the effective server-capped token budget, persists a stable job, and queues its id. Workers load source artifacts only by manifest hashes and verify each hash before parsing. Original bytes never enter Redis.

A committed running status supports polling. A second row-locked transaction serializes duplicate delivery and atomically stores the CAIR result and completed status. A worker crash rolls back that result transaction; redelivery can safely recompute. Expected acquisition/integrity failures persist a failed job with structured issues. Unexpected worker exceptions are logged, persisted as worker_failure, and re-raised; errors are not suppressed to produce a passing status.

Each file is decoded, parsed/tokenized, linked to source spans, inspected for Python AST docstrings, normalized into a separate view, and converted into source-linked NLP segments. Empty/malformed sources produce explicit warnings. Exceeding a token budget produces explicit error/partial records. Statistics are calculated from actual records; a completed job can contain file-level warnings/errors and clients must inspect them.

Files with duplicate bytes are retained and linked, not silently dropped. All artifacts remain read-only to the application API. Re-running a completed job returns the persisted result. Celery uses JSON only, late acknowledgment, one-message prefetch, a visibility timeout and hard/soft execution limits. No periodic reaper or public deployment scheduler is claimed.
