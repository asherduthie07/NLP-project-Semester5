# Observed limitations

- Four frontend reference images are absent. Only the full textual specification was available.
- Docker was initially offline but was started. Exact container build/startup, PostgreSQL 17.11 migration and the full Linux suite passed. Remote GitHub Actions execution remains NOT RUN. Native PostgreSQL 14.17 provides additional local evidence, not a replacement claim for the container checks.
- GitHub tests are mocked and deterministic. Live upstream availability and real repository licensing were not claimed or benchmarked.
- Corpus is tiny and synthetic; its statistics are not population estimates or ML evaluation results.
- Tree-sitter is a tolerant lexical parser, not a compiler. Broken Python disables AST docstrings while retaining lexical tokens. Java Unicode escape compiler pretranslation is not simulated; warning emitted. Atomic strings do not yield nested interpolation tokens.
- Empty files and duplicates are retained; raw totals include duplicates. Comment counts include JavaDoc. Source text line counts use splitlines semantics.
- Token caps produce explicit partial/error records. Input/deployment budgets remain necessary; no unbounded bulk corpus acquisition is provided.
- Source/configuration identity provides repeatability within a pinned pipeline. Grammar/tokenizer upgrades require a pipeline version bump.
- Optional shared-key, single-tenant local access is implemented; multi-user authorization, public deployment rate/concurrency/retention policies and full operations are not yet implemented.
- Source blobs may be orphaned if a metadata transaction fails; no automatic destructive garbage collection exists.
- Browser automation checks functionality/accessibility/responsiveness, not the deferred 600-node graph FPS target, full marketing animations or all M7 performance criteria.

Native artifact operations rely on POSIX no-follow/atomic-link behavior; verified environments are macOS and Linux containers. Windows hosts can use the Docker stack; native Windows backend behavior has not been verified.
