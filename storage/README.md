# Controlled artifact storage

Runtime source blobs are SHA-256 addressed, never named using imported paths. They are write-once and hash-checked on reads. This directory's runtime contents are ignored by Git. Back up artifacts and PostgreSQL metadata together. A database failure can leave an unreferenced immutable blob; no automatic garbage collection/deletion is implemented in Phase I. Restrict filesystem ownership and do not expose this directory as a static web root.
