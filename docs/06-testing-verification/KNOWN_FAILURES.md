# Known failures and unrun checks

Remediation update: review/scoring framework now exists; seven sources, 42 symbol and 50 edge candidates are preserved as analyzer output. Independently reviewed annotations remain **0**; final extraction metrics are null. Unicode AST source-column defect is fixed. Full Linux suite **80 passed**, no skips, 94% coverage; strict build, 3 browser tests and live HTTP flow passed. No failing test is currently open. See `../04-phase-records/phase-2/ACCEPTANCE_REMEDIATION.md`.

Phase II acceptance is PARTIAL: independently reviewed Python/Java gold annotations and precision/recall/F1 evaluation have not been completed. Final Linux integration: 73 passed, no skips, 94% coverage; M1 browser: 3 passed. Supported static subset and limitations are in `../04-phase-records/phase-2/COMPLETION_REPORT.md`.

No backend/native database/queue or M1 browser test failure is currently open. Full native run: 69 passed; browser run: 3 passed. The default fast suite explicitly skips two service-dependent checks, both of which were separately executed successfully with real PostgreSQL/Redis/Celery.

Container verification passed: image build and migration/startup succeeded; full Linux suite 69 passed, no skips, 95% coverage, and real HTTP/Celery readback passed. The initial transient MarkupSafe index failure resolved without changing pins. A host PostgreSQL port conflict was resolved with configurable isolated host ports, leaving existing services untouched. Earlier failures remain recorded as resolved, not hidden.

Remote GitHub Actions was NOT RUN. Live GitHub fetching was intentionally NOT RUN; deterministic acquisition tests do not rely on upstream availability. Four described UI images are missing, so reference-image fidelity cannot be verified. No later-phase experiment, model accuracy, semantic verification, export integration or graph FPS test has been run.
