# Phase III test strategy

## Layers

| Layer | Tool | Location | Covers |
|---|---|---|---|
| Types | `tsc -b`, strict, `skipLibCheck: false` | | Dual-mode rule via `satisfies Record<VizKind, …>` |
| Static | ESLint, `no-explicit-any`, react-hooks | `eslint.config.js` | `src` and `e2e` |
| Unit and component | Vitest, jsdom, Testing Library | `src/viz/__tests__/`, `src/data/__tests__/`, `src/app/__tests__/` | Data integrity, geometry, mode logic, states, tables, exports, adapters, fuzzy search, shell stores |
| Browser | Playwright, axe | `e2e/` | Real WebGL pixels, interaction, fallbacks, accessibility, layout |
| Supply chain | `npm audit` | | Dependencies |

## How data integrity is tested

Builders expose a `magnitudes` map, the actual scene-unit size of each datum. Tests assert `size / value` is constant for every datum of bars, stacked bars, histograms, lines, heatmaps, treemaps and timelines, and that donut and radial angles match exact shares. This tests the 3D geometry itself, not a separate calculation of it.

Backend adapter tests run against the real `docs/07-findings/phase-2/analysis.json`.

A finiteness test walks every vertex of every model. It found a real bug: the treemap's plate divided by zero grid divisions, which produced `NaN` geometry.

## How the browser tests read 3D

They read pixels from each chart's own 2D canvas and compute a hash, painted share and color count. A test passes only if pixels actually changed or a value appears, and it cannot pass on a blank or static canvas.

## GPU paths

| Path | Command | Purpose |
|---|---|---|
| Real GPU | `PLAYWRIGHT_CHROME=1 npm run test:e2e` | Local hardware |
| Software GL | `PLAYWRIGHT_CHROME=1 PLAYWRIGHT_SWIFTSHADER=1 npm run test:e2e` | Same path as CI, which has no GPU |

Running both paid off: the software path exposed a 12.5 s main-thread block during startup. See [performance](PERFORMANCE.md).

## Exports

`e2e/exports-keyboard.spec.ts` decodes real downloads. PNG files are opened and checked for size and painted pixels, for three charts in both modes. JSON and CSV are compared with the values on screen. This found two real defects, listed in [the M1 report](M1_ACCEPTANCE_REPORT.md).

## Demo and Live

| Evidence | Where | Counts as integration? |
|---|---|---|
| Adapter with a stubbed transport | `src/data/__tests__/` | No |
| Browser with routes stubbed to the OpenAPI shape | `e2e/shell.spec.ts`, labeled in the test | No |
| Browser with the backend refused or broken | `e2e/shell.spec.ts` | Failure handling only |
| Browser against the real API | `e2e/shell.spec.ts`, needs `CODEATLAS_LIVE_BACKEND=1` | Yes, in the reduced configuration stated in [integration](FRONTEND_BACKEND_INTEGRATION.md) |

A skipped real-API test is not evidence. Run it this way:

1. Start the backend on port 8000 with a project imported and analyzed.
2. Set `CODEATLAS_LIVE_BACKEND=1` for the browser run.

## Layout stability

The auto-scroll test failed intermittently because the list kept moving while hovered. Rather than relaxing it, a probe traced the cause to a 137 px layout shift when the chart above loaded. The page was fixed, and a dedicated test now guards the shift.

## Performance

`scripts/perf-baseline.mjs` measures a production build, with `--charts`, `--prefs`, `--runs`, `--label` and `--out` options, and writes JSON evidence. See [performance](PERFORMANCE.md) for the M4 plan.

## Not covered

- Other browsers. Only Chromium was run, so Firefox and Safari are unverified.
- Real touch devices. Layout was checked at 390 px wide, but touch gestures were not exercised.
- Screen readers, which need a manual pass.
- Remote GitHub Actions. The workflow was edited but has not run remotely.
- Visual regression baselines. Screenshots are reviewed by eye, not compared automatically.
