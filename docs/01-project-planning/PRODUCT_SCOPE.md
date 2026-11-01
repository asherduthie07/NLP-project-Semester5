# Product scope

The complete product is a Python/Java documentation platform with source-backed explanations, repository maps, generated API/README documents, architecture graphs, documentation analytics, model evaluation and export. These are retained requirements, not claims of current capability.

Current authorized slice: collection and lexical preprocessing of Python/Java files, mixed ZIP projects and public GitHub repositories; byte-preserving immutable snapshots; PostgreSQL metadata; versioned API; Redis/Celery work; reproducible quality statistics; tests and methodology. The frontend stops at original milestone M1. No structural symbol/dependency analyzer, NLP model, generated documentation, verification classifier or export is implemented.

Success means correct evidence and explicit issues, including when parsing is incomplete. Malformed source is preserved and tokenized with warnings; invalid encodings and binary input are rejected. Empty supported files are retained with warnings. A zero-file import is rejected. Unsupported archive entries are recorded as ignored; unsupported direct file uploads fail.

See DEFINITION_OF_DONE.md and the root traceability matrix. Requirement status is evidence-based, never inferred from scaffolding.
