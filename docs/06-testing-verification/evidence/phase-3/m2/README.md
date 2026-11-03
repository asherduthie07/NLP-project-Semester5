# M2 evidence, 2026-11-02

From `frontend/`, base commit `b025edc`, branch `feature/my-implementationPhase3`.

| File | What it is |
|---|---|
| `typecheck.txt`, `lint.txt`, `unit.txt`, `npm-audit.txt`, `build.txt` | Final static checks, unit tests, audit and production build |
| `browser-real-gpu.txt` | Final full browser run, real GPU, real backend enabled: 73 passed |
| `browser-software-gl.txt` | Final full browser run, software GL: 72 passed, 1 failed (rail tooltip test timing) |
| `browser-software-gl-rail-rerun.txt` | Rail tests on software GL after that test was made timing-independent: 5 passed |
| `*-run1-before-fixes.txt`, `*-run2.txt` | Earlier full runs, kept. Their failures and fixes are in the M2 report |
| `performance.json` | Five-run orbit measurement of the production build |
| `production-console.txt`, `screenshots/` | Production build at 1440, 1024 and 390 px |
