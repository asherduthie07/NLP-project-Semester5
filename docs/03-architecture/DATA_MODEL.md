# Data model

Phase II: Alembic `0002_phase_two` adds indexed `analysis_symbols` and `analysis_relationships` with UUID keys and foreign keys to immutable snapshots/jobs/files. Each row stores a versioned source-evidenced payload. The analysis job stores complete statistics, endpoints and warnings in its atomic result JSON. See `../04-phase-records/phase-2/IMPLEMENTATION_AND_CONTRACTS.md`.

`Project` is a named acquisition container. `SourceSnapshot` is an immutable source-kind/origin/commit/manifest record. Snapshot UUIDs derive from project plus canonical sorted path/hash/provenance/ignored-entry metadata. Their `content_hash` is the hash of that canonical identity payload, not of a ZIP's incidental compression or timestamps. File ids derive from snapshot plus relative path. Reimporting identical content into the same project returns the same persisted snapshot; separate API uploads create separate projects by design.

`SourceFile` records language, relative path, original-byte hash, size, encoding and first same-hash file id for duplicates. No import path is used as a storage path. Source blobs are immutable SHA-256 filenames. File metadata's `analysis_status=pending` describes the immutable import; per-configuration processing status belongs to `PreprocessingResult` and `Job`.

SQLAlchemy tables: `projects`, `snapshots` (project FK/index), `source_files` (snapshot FK, unique snapshot/path, hash index), `jobs` (request parameters, persistent state/issues, optional CAIR result). Contracts are stored as versioned JSON envelopes, with relational identity/FKs for integrity and inspection. Decoded source views/tokens live in structured results; original bytes remain artifacts. Alembic revision `0001_phase_one` creates these tables, indexes and constraints.

`CAIR 1.0` contains snapshot id, effective preprocessing configuration, per-file results and computed statistics. It does not yet contain semantic symbol tables, relationships, AI claims, model output or verification labels. `TokenRecord`, `ExtractedComment` and `NlpSegment` retain file id/path and original-decoded source spans.

Preprocessing job ids derive from snapshot plus effective configuration. Result ids derive from file plus that configuration. Completed jobs are reused. Version changes must bump the pipeline configuration version to avoid stale identities. Updates to source contents create new snapshots rather than mutating old ones. Administrative DB writes are outside the API immutability guarantee.
