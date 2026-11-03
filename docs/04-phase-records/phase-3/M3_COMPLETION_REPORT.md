# M3 completion report: Overview

**Status: IMPLEMENTED and TESTED. Verdict: PASS, with the gaps listed below.** Date: 2026-11-03. Branch `feature/my-implementationPhase3`.

## What was built

The Overview at `/app/overview` replaces the M2 pending page. Code: `frontend/src/app/pages/overview/`, `frontend/src/app/pages/derive.ts`, `frontend/src/app/pages/common.tsx`, `frontend/src/app/pages/workStore.ts`.

| Spec item (section 7, page 1) | Status | Demo | Live |
|---|---|---|---|
| HUD header "Repository overview" | TESTED | Fixture name, snapshot, status, time | Snapshot, job status. Time reads "Not recorded by the API", because the Job record has no timestamps |
| 6 KPI cards with sparkline and delta | TESTED | All six, with 30-day sparklines (3D or 2D) and deltas | Files, functions, classes and coverage are measured. Verified and Needs review read "Pending" (no claims endpoint). No sparkline: "No history in this source" |
| Coverage over time, two series, 7d/30d/90d, series toggle | TESTED | Illustrative 90-day history ending at 41% and 78% | Unavailable state naming the missing history endpoint and the current measured coverage |
| Completeness ring, 5 sub-metrics, est. completion, blockers | TESTED | Parsed 100, Summarized 78, Verified 84.5, Reviewed from local review decisions, Published from local export history. Overall is their mean | Parsed is measured. The other four read "Phase IV". Overall is the mean of stages that have data |
| Attention table: module, functions, coverage bar, complexity, last analyzed, status; sortable; row hover; View all | TESTED | 202 code modules | Measured modules |
| Heatmap with legend and tooltips | TESTED | Gaps by directory × symbol kind | Same, measured |
| Language donut, module treemap, dependency cards | TESTED | Most imported, 3 deliberate import cycles, orphan files | Measured from relationships |
| Mini architecture map with animated dashed flow | IMPLEMENTED | Directories and the imports between them | Same |
| Status strip: 6-step pipeline, last analysis, verification score, unsupported rate | TESTED | All steps done except Publish, which waits for an export | Upload, Parse and Extract from the job. Summarize, Verify, Publish pending |
| Activity feed and terminal log with scanlines and cursor | TESTED | Illustrative replay | Replay of the job record: counts, relationship states and issues |
| Global filtering and drilldowns | IMPLEMENTED | Donut segment filters by language. Heatmap row and architecture node filter by module. Filter chips with Clear all. Table rows, treemap tiles and most-imported links open the Explorer at that path | Same |

Every chart uses the shared `VisualizationContainer`, so each has 3D and 2D, export, data table, provenance badge and fullscreen.

## Data layer additions

- `DashboardApi.getAnalysis(scope)` returns one structural record (files, symbols, relationships, Phase II statistics, issues). Live maps `/jobs/{id}/analysis` and the manifest without changing any number, and a unit test checks this against the committed Phase II statistics. Demo measures the fixture's own generated source with the same field definitions.
- `DashboardApi.getCoverageHistory(scope)`: Demo returns illustrative history. Live throws integration pending. No history is invented for Live.
- The demo fixture now writes source whose line spans match each symbol, with docstrings only on documented symbols. Imports follow the layering, with exactly three deliberate cycles. Previously, random imports made nearly every module part of one cycle.

## Defects found and fixed

| Defect | Found by | Fix |
|---|---|---|
| Every module showed "Critical, cycle" | Screenshot review | Layered fixture imports. A unit test asserts exactly three cycles |
| KPI row loaded 18.6 px taller than its skeleton, moving the chart below | Retargeted M2 layout-shift test | Same card classes and a fixed min-height in both states. Measured equal at 1920, 1440, 1024, 800 and 390 px |
| Heading focus could miss a lazily loaded page | M2 focus test after Overview became its own chunk | The shell waits for the incoming heading (up to 3 s), and never takes focus the user has moved |
| KPI loading and failed states had no test ID | New Live test | Added |
| axe: `aria-label` on a bare span, and h1 to h3 heading order | New axe test | Bar hidden from assistive tech (the value is in text). Hidden "Key figures" h2 |
| Chart models recomputed on every render | Long-task probe | Memoized per record and filter |

## Tests

- Unit: 99 of 99, including `data/__tests__/analysis.test.ts` (9) and `app/__tests__/derive.test.ts` (7).
- Browser, real GPU: `e2e/overview.spec.ts`, 6 of 6. This covers Demo widgets, controls, the sortable table, axe and overflow at 1024 and 390 px, Live with a completed-job contract stub, and Live with no backend. Also `visualization.spec.ts` and `exports-keyboard.spec.ts`, 27 of 27, and the retargeted `shell.spec.ts` tests.
- M2 tests that read the pending Overview were retargeted to the real widgets with the same strength. Two changed in their wording:
  - The layout-shift test now guards the KPI row. Its tolerance is tighter, under 4 px instead of under 24.
  - The rail test moves the pointer off the expanded rail before clicking a chart control.
- Not run yet: the full suite, software GL and the real backend. Those are scheduled for the end of M7.

## Gaps and deviations

- The flow animation on the architecture map is drawn in 2D only. In 3D the same edges are static.
- Complexity is a proxy, the mean callable length in lines, because Phase II does not measure cyclomatic complexity. The column header says so.
- The completeness ring and stage bars are HTML meters, not a 3D or 2D chart.
- Live has no history, claims, generated coverage or analysis timestamp, because the backend does not provide them. Each is shown as pending or not recorded.
- Screenshots in `evidence/phase-3/m3/` were taken during development. `ov-2d-1440-s2100.png` predates the treemap change that leaves out configuration files.
