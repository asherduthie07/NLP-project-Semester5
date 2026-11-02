# M2 acceptance report

**State: at the gate, awaiting review. Recommended verdict: PASS, with the integration qualifier below. M3 has not started.**

M2 delivers the dashboard shell and the Demo and Live data layer. It does not deliver dashboard page content, which belongs to M3 to M5. Pages are labeled as pending, and nothing on them pretends otherwise.

Records:
- [Shell architecture](../../03-architecture/frontend/SHELL_ARCHITECTURE.md): navigation, palette, transitions, scrolling, global mode and visual decisions.
- [Demo and Live data](../../03-architecture/frontend/DEMO_LIVE_DATA.md): adapters, failure handling, backend status and the contracts needed later.
- [Actual results](ACTUAL_RESULTS.md), [accessibility](ACCESSIBILITY.md), [performance](PERFORMANCE.md), [known limitations](KNOWN_LIMITATIONS.md), [screenshots](SCREENSHOTS.md).

## Pass criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Shell implemented | PASS | `src/app/shell/`. Browser tests for rail, top bar, palette, transitions |
| 2 | All destinations exist | PASS. 9 routes. Settings and Help work, 7 are labeled pending | Route test visits each and checks the badge |
| 3 | Sidebar expansion and pinning | PASS | 64 px collapsed, 240 px on hover, focus and pin, pin persists. Drawer below 768 px |
| 4 | Top bar functional within backend capabilities | PASS | Each control tested in Demo. Live shows what the API lacks. The date range is realized as a snapshot selector |
| 5 | Command palette works | PASS | Ctrl+K, `/`, keyboard navigation, Esc, focus return, highlighting, files and symbols through the adapter, empty and unavailable states |
| 6 | Global 3D and 2D persists and integrates | PASS | Same `useVizStore`, no second system. Persists across routes and reloads. Overrides and WebGL fallback still work |
| 7 | Demo and Live infrastructure works | PASS, with the integration qualifier below | Unit tests on both adapters. Browser tests with the backend down, broken, stubbed, and real |
| 8 | Demo clearly distinguished | PASS | Labeled in the top bar, status strip, palette, menus and each adapter result |
| 9 | Missing backend handled honestly | PASS | Unreachable, invalid response, unauthorized, integration pending and job required states. No demo fallback, and the fixture chunk is never downloaded in Live |
| 10 | Transitions and scrolling correct | PASS | No layout shift on transition. Outgoing page removed and inert. Independent panels, auto-scroll with pause |
| 11 | Responsive verified | PASS in Chromium | 1920, 1440, 1024, 800, 768 and 390 px, and short windows. No overflow, all controls reachable |
| 12 | Accessibility within documented scope | PASS for automated scope | axe on every route and overlay. Keyboard paths. Manual screen reader not run |
| 13 | No M1 regression | PASS | All M1 specs in the same runs |
| 14 | Required tests executed | PASS | Types, lint, 83 unit, build, audit. 73 of 73 browser tests on real GPU. 72 of 73 on software GL, with the one timing-only test fixed and its group rerun, 5 of 5 |
| 15 | Documentation and traceability updated | PASS | This report and the records above. UI-M2-01 to 07 and UI-P3-07 updated |

## Integration qualifier

The Live adapter was verified against the real FastAPI code with a real import, preprocessing and analysis. This used SQLite and inline jobs on Python 3.14, with a Windows launcher patch outside the repository. **The Compose stack was not run**, because Docker was unavailable. The integration is verified for the API code, not for the deployed stack.

## Defects found and fixed during M2 verification

| Defect | Found by | Fix |
|---|---|---|
| `symbols_by_kind['constructor']` read `Object.prototype` | Unit test | Own-property counting |
| Palette ranked "Settings" first for "order", from scattered letters | Browser test | Descriptions match only as written. Spread-out matches rejected |
| Enter could open a stale palette row | Browser test | Selection follows results explicitly |
| Palette focus did not return to its origin | Browser test | Origin tracked with `focusin` |
| Skip link was not the first Tab stop under StrictMode | Browser test | First load tracked by path |
| Activity panel clipped in short windows | Browser test | Panels stack at 760 px tall |
| Several accessible-name and landmark violations | axe | See [accessibility](ACCESSIBILITY.md) |
| Hovered activity list kept moving, after a 137 px layout shift when the chart loaded | Repeated browser test, then a probe | Chart height reserved while loading. Dedicated test |
| Outgoing page stayed in the DOM, invisible, for over 11 s on software GL | Software GL run, then a probe | Removed by timer, and inert while leaving |
| `g` shortcut sequence could fail under load | Real-GPU full run | Timed by event timestamp, with the pending key kept across listener changes |

No test was removed, and no assertion was weakened. Two tests were made race-free by reading the state once instead of twice, and one now waits for results to render before pressing a key.

## Creative additions beyond the specification

- A bottom status strip showing route, data source, chart mode and GPU tier.
- A data source chip in the top bar.
- Amber reserved for demo and pending states.
- Pending pages that show what the adapter actually returns.
- A delayed rail expansion with a tooltip first.
- Corner ticks on panels.

None replaces or simplifies an original requirement. Instrument glass, source light is kept.

## Not done, by design or by limit

- Dashboard page content, which is M3 to M5. No M3 work has begun.
- The Compose-stack integration run.
- Firefox, Safari, physical phones, a manual screen reader pass, and remote CI.
- Reference image comparison, which stays unresolved.

## Status of other phases

- Phase II remains PARTIAL / REVIEW_PENDING.
- Phase IV records and files were not touched.
- VIS-01 to VIS-05 remain DEFERRED pending explicit academic approval.
