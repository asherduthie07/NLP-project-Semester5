# Known failures and unrun checks

No backend/native database/queue or M1 browser test failure is currently open. Full native run: 69 passed; browser run: 3 passed. The default fast suite explicitly skips two service-dependent checks, both of which were separately executed successfully with real PostgreSQL/Redis/Celery.

Container verification passed: image build and migration/startup succeeded; full Linux suite 69 passed, no skips, 95% coverage, and real HTTP/Celery readback passed. The initial transient MarkupSafe index failure resolved without changing pins. A host PostgreSQL port conflict was resolved with configurable isolated host ports, leaving existing services untouched. Earlier failures remain recorded as resolved, not hidden.

Remote GitHub Actions was NOT RUN. Live GitHub fetching was intentionally NOT RUN; deterministic acquisition tests do not rely on upstream availability. Four described UI images are missing, so reference-image fidelity cannot be verified. No later-phase experiment, model accuracy, semantic verification, export integration or graph FPS test has been run.
