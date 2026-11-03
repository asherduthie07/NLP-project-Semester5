# Phase III: actual results

## Final M1 checks and M2, 2026-11-02

Observed on the final code, from the `frontend` folder, on base commit `b025edc` and branch `feature/my-implementationPhase3`. Hardware: Intel HD Graphics 520, Chrome 156. Output is in [evidence/phase-3/m2](../../06-testing-verification/evidence/phase-3/m2/).

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b` | PASS, no output |
| Lint | `npm run lint` | PASS, no findings |
| Unit and component | `npm test` | PASS, 83 of 83 in 4 files |
| Build | `npm run build` | PASS, with the known chunk-size warning for the lazy 3D chunk |
| Dependencies | `npm audit` | 0 vulnerabilities |
| Browser, real GPU, real backend | `CODEATLAS_LIVE_BACKEND=1 PLAYWRIGHT_CHROME=1 npx playwright test --workers=1` | **PASS, 73 of 73**, 9.0 min |
| Browser, software GL, real backend | `CODEATLAS_LIVE_BACKEND=1 PLAYWRIGHT_CHROME=1 PLAYWRIGHT_SWIFTSHADER=1 npx playwright test --workers=1` | **72 of 73**, 20.0 min. 1 failure: rail tooltip test timing, see below |
| Software GL, rail tests after the test fix | `PLAYWRIGHT_CHROME=1 PLAYWRIGHT_SWIFTSHADER=1 npx playwright test e2e/shell.spec.ts -g rail --workers=1` | PASS, 5 of 5 |
| Production console and layout | Script against `vite preview` | Clean console. No overflow at 1440, 1024 and 390 px |
| Performance | `node scripts/perf-baseline.mjs --runs 5` against `vite preview` | Network orbit 60.1 fps on all 5 runs. See [performance](PERFORMANCE.md) |

The 73 browser tests are:

| Spec | Tests | Covers |
|---|---|---|
| `design-system.spec.ts` | 3 | Phase I and II tests, unchanged |
| `visualization.spec.ts` | 16 | M1 |
| `exports-keyboard.spec.ts` | 11 | Final M1 checks |
| `shell.spec.ts` | 43 | M2 |

Both runs included the real-backend test, and it passed on both. It is not skipped evidence.

### The final software GL failure

The test checked that the rail tooltip names the page and its shortcut. On software GL, the rail expands and replaces the tooltip faster than the test could poll for it. The test now records the tooltip from inside the page as it appears, so the assertion is unchanged.

Only that test file changed after the full runs. The full software GL suite was not run a fourth time, because each run takes 20 minutes to 1.5 hours. The rail group was rerun instead, and passed 5 of 5.

### Earlier full runs on the same day

These are kept in the evidence folder.

| Run | Real GPU | Software GL | Outcome |
|---|---|---|---|
| 1 | 73 of 73 | 69 of 73, 1.5 h | Found the stuck outgoing page and the shortcuts landmark. Two test races |
| 2 | 72 of 73 | 72 of 73 | Found the `g` sequence timing defect. One export click timed out on software GL, then passed 3 of 3 alone |
| 3, final | 73 of 73 | 72 of 73 | As above |

The software GL export timeout in run 2 did not recur in run 3 or in isolation. It is recorded as an intermittent wait under heavy load, with no product defect identified.

## Not run

| Check | Reason |
|---|---|
| Compose stack: PostgreSQL, Redis, Celery | The Docker daemon was not running. Live was checked against the real API code on SQLite with inline jobs |
| Remote GitHub Actions | Nothing was pushed |
| Firefox, Safari | Only Chromium is configured |
| Bundled Playwright Chromium, which CI uses | Installed Chrome was used locally, with the same software GL flags |
| Backend test suite | No backend code changed |
| Manual screen reader, physical phones | Need a person and devices |
| Reference image comparison | Images are absent |

## M1 gate, 2026-11-01

At the gate: types and lint clean, 49 of 49 unit tests, build PASS, 0 audit findings, and 19 of 19 browser tests on real GPU (3.9 min) and on software GL (11.4 min). Evidence is in [evidence/phase-3/m1](../../06-testing-verification/evidence/phase-3/m1/).

Failures found and resolved during M1:

| Failure | Resolution |
|---|---|
| `NaN` bounding sphere in the treemap | Fixed. Finiteness test added |
| Three.js alpha color warnings | `cssColor` used throughout |
| Production-only invalid color warnings, from the CSS minifier | Handled, with a regression test |
| 12.5 s startup block on software GL from PMREM | Skipped at low quality |
| Word cloud could silently drop words | Cloud shrinks instead, and a test checks every word is placed |
| Value-axis labels culled at the stage edge | Camera fit reserves width |
| Early test helper errors | Corrected, with no assertion weakened |
| `design-system` test timed out on software GL | Limit raised for that path only |
| 11 moderate audit findings, `minimatch` | Scoped overrides |
