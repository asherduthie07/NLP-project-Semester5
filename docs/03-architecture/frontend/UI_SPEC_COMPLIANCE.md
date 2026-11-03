# Original UI specification compliance

Tracks every feature of [design-refs/ui-master-spec.md](../../../design-refs/ui-master-spec.md) through Phase III. That spec is unchanged and nothing has been removed from scope.

**Current state: milestones M1 to M4.** The dashboard shell, the Overview (M3) and the Knowledge Graph (M4) are built. The other dashboard pages and the marketing site are not, and this document says so row by row.

Evidence paths are relative to the frontend folder unless stated. Test results are in [ACTUAL_RESULTS](../../04-phase-records/phase-3/ACTUAL_RESULTS.md).

## Status values

| Status | Meaning |
|---|---|
| VERIFIED | Built, and checked by an automated test or a recorded review |
| BUILT | Exists and was seen working, with no dedicated automated check |
| PRIMITIVE | The reusable piece exists. The widget the spec describes does not |
| NOT STARTED | Not built. The milestone in brackets owns it |
| BLOCKED | Cannot be done with what is in the repository |

## 1. Stack (§3)

| Requirement | Component | Status | Evidence | Limitations |
|---|---|---|---|---|
| Vite, React 18, strict TS | `frontend/` | VERIFIED | `tsc -b`, build | |
| Tailwind plus CSS variables | `tailwind.config.ts`, `design/tokens.css` | VERIFIED | Build | |
| Framer Motion, layoutId | `components/ui` (Tabs), viz crossfade | VERIFIED | `e2e/design-system.spec.ts` | |
| GSAP, ScrollTrigger, Lenis | Installed | NOT STARTED [M6] | | No scroll scenes yet |
| React Router | `main.tsx`, `app/AppRoutes.tsx` | VERIFIED | `e2e/shell.spec.ts` | `/` still redirects to the showcase until the marketing site [M6] |
| Zustand | `viz/store.ts`, `viz/selection.ts`, `lib/store.ts` | VERIFIED | `viz/__tests__/controls.test.tsx` | |
| d3-force plus Canvas | `app/pages/graph/layout.ts`, `app/pages/graph/canvas2d.ts` | VERIFIED | `e2e/graph.spec.ts`, `app/__tests__/graph.test.ts` | 2D detail mode runs at 30 fps on the measured GPU; see [M4 report](../../04-phase-records/phase-3/M4_COMPLETION_REPORT.md) |
| Recharts, custom-styled | `viz/two-d/recharts.tsx` | VERIFIED | Screenshots, axe | |
| lucide-react only | All components | BUILT | Code review | |
| Shiki | Installed | NOT STARTED [M5] | | |
| cmdk | `app/shell/CommandPalette.tsx` | VERIFIED | `e2e/shell.spec.ts` | |
| Fonts | `main.tsx`, local packages | VERIFIED | M1 evidence | |

## 2. Design system (§4)

| Requirement | Component | Status | Evidence | Limitations |
|---|---|---|---|---|
| Palette, cluster palette, gradients | `design/tokens.css` | VERIFIED | `e2e/design-system.spec.ts`, screenshots | |
| Film grain | `NoiseOverlay`, `design/noise.svg` | BUILT | Screenshots | |
| Dot grid and line grid with radial mask | `.world` in `showcase.css` | BUILT | Screenshots | Line grid added in Phase III |
| Glass panels, gradient border, highlight, glow | `.card` | BUILT | Screenshots | |
| HUD corner brackets | `CornerBrackets` | VERIFIED | Featured chart in screenshots | |
| Scanlines, terminal panels only | `.terminal` | BUILT | Showcase | Real terminal panel not built [M3] |
| Border beam | `GlowBorder` | BUILT | Showcase | |
| Glow orbs | `.orb` | VERIFIED | Reduced-motion test confirms animation stops | |
| Tabular mono numbers, uppercase labels | CSS | BUILT | Screenshots | |
| Radius, spacing, shadow rules | Tokens | BUILT | Code review | |

## 3. Motion and micro-interactions (§5)

| # | Requirement | Component | Status | Evidence | Limitations |
|---|---|---|---|---|---|
| | Shared motion presets | `design/motion.ts` | BUILT | Code review | |
| | Stagger, enter from y and blur | `design/motion.ts` | BUILT | Showcase | |
| | Chart entrance animation | Engine `setProgress`, Recharts | BUILT | Seen in 3D and 2D | Line draw not separately checked |
| | Reduced motion | `lib/motion.ts`, `MotionPreferences`, `useReducedMotion` | VERIFIED | Browser tests | |
| 1 | SpotlightCard | `components/fx` | BUILT | Showcase | |
| 2 | TiltCard, max 6° | `components/fx` | BUILT | Code: ±6° | |
| 3 | MagneticButton within 80 px | `components/fx` | BUILT | Code | Fixed in Phase III |
| 4 | Tabs pill via layoutId | `Tabs`, `Rail` | VERIFIED | `e2e/design-system.spec.ts`, `e2e/shell.spec.ts` | |
| 5 | Sidebar icons | `app/shell/Rail.tsx` | VERIFIED | `e2e/shell.spec.ts` | Tooltip with shortcut, glow plate, label transition |
| 6 | Command palette | `app/shell/CommandPalette.tsx` | VERIFIED | `e2e/shell.spec.ts` | Live symbols need an analysis job ID |
| 7 | ScrambleText | `components/fx` | BUILT | Showcase | |
| 8 | Live dots, shimmer skeletons | `Skeleton`, CSS | VERIFIED | Unit test for chart loading state | Fake 600–1200 ms load per widget [M3] |
| 9 | Copy morph and pop | `CopyButton` | VERIFIED | `e2e/design-system.spec.ts` | Added in Phase III |
| 10 | Toast with progress | `Toast` | VERIFIED | `e2e/design-system.spec.ts` | |
| 11 | Table row hover | Overview attention table | VERIFIED | `e2e/overview.spec.ts` | |
| 12 | Chart hover: crosshair, dot, blur tooltip | `InteractiveTooltip`, builders | BUILT | Tooltip tested | Synchronization across stacked charts: selection groups exist; cross-chart crosshair sync is not checked. Overview drilldowns filter across widgets [M3] |
| 13 | Spring toggle and slider with glow trail | `Toggle`, `Slider` | BUILT | Showcase | |
| 14 | Thin scrollbars | CSS | BUILT | Showcase | Cursor ring [M6] |
| 15 | Shortcuts overlay (?) | `app/shell/Shell.tsx` | VERIFIED | `e2e/shell.spec.ts` | |

## 4. Marketing website (§6)

**All NOT STARTED [M6].** No section exists.

Two-layer scroll (World, Content, Floating), Lenis and ScrollTrigger sync, opposite marquees, Hero, Trust strip, pinned Problem-to-solution story, six-tile Capabilities bento, Verification showcase, Dashboard preview, horizontal How it works, Metrics band, Final CTA, Footer, sticky navbar with active pill.

`ParallaxLayer`, `Marquee`, `MagneticButton`, `TiltCard`, `SpotlightCard` and `ScrambleText` exist as primitives.

## 5. Dashboard (§7)

| Area | Requirement | Route | Status | Reusable pieces that exist |
|---|---|---|---|---|
| Shell | Icon rail, top bar, transitions, background, independent panel scrolling | `/app/*` | VERIFIED in Chromium. Date range is the snapshot selector | [Shell architecture](SHELL_ARCHITECTURE.md) |
| Overview | 6 KPI cards, coverage chart, completeness ring, attention table, heatmap, donut, treemap, dependency cards, architecture map, status strip, activity feed, terminal | `/app/overview` | VERIFIED [M3]. Completeness ring is an HTML meter; flow animation is 2D only | [M3 report](../../04-phase-records/phase-3/M3_COMPLETION_REPORT.md) |
| Explorer | Three resizable panes, tree, Shiki, inspector, source chips | `/app/explorer` | NOT STARTED [M5] | |
| Knowledge Graph | Full-bleed canvas, 600 nodes, all interactions, control panel, minimap, toolbar, FPS | `/app/graph` | VERIFIED [M4] on a real GPU. Lasso (optional) and touch pinch zoom not built | [M4 report](../../04-phase-records/phase-3/M4_COMPLETION_REPORT.md) |
| Docs Studio | Outline, editor and preview, regenerate, sources, export | `/app/docs` | NOT STARTED [M5] | |
| Intelligence | All charts, cross-filter | `/app/intelligence` | NOT STARTED [M5] | Chart kinds, selection groups |
| Verification | Summary, claims queue, J/K/A/R/U, evidence diff, facts | `/app/verification` | NOT STARTED [M5] | Donut, stacked bar |
| Exports | Rail entry | `/app/exports` | NOT STARTED [M5] | |

## 6. Mock data and quality rules (§8, §9)

| Requirement | Status | Evidence | Limitations |
|---|---|---|---|
| Typed adapter with `getOverview` and the rest | VERIFIED | `data/dashboard.ts`, `data/demoApi.ts`, `data/liveApi.ts`, `data/__tests__/` | `getDocs`, `getClaims` return integration pending in Live |
| `shopflow-api` demo: 214 files, 1,386 functions, 142 classes, 3,912 claims | VERIFIED | `data/demo/shopflow.ts`, `data/__tests__/` asserts each total | Labeled illustrative. The pages that present it are [M3 to M5] |
| Seeded, stable graph | VERIFIED | Unit test for deterministic layout | |
| Responsive at 1440, 1024, 390 | VERIFIED for `/design-system` and the shell | Browser tests | Page rules [M3 onward] |
| Focus rings, ARIA, contrast | VERIFIED for tested tags | axe in both modes | Manual screen reader NOT RUN |
| Lazy routes, canvas graph, one rAF per canvas, off-screen pause | VERIFIED for viz | Browser and engine diagnostics | |
| 60 fps with 600+ nodes | PARTIAL | `evidence/phase-3/m4/benchmark-real-gpu.json` | Measured on one integrated GPU: 3D 60 fps at 703, 1,000 and 2,000 nodes; 2D 30 fps in detail mode, 60 fps in performance mode up to 1,000 nodes. Software GL and other devices [M7] |
| No `any`, tokens only | VERIFIED | ESLint `no-explicit-any`; code review of `viz/` | |
| README | BUILT | `frontend/README.md` | Final README [M7] |

## 7. Reference images (§2)

| Requirement | Status | Note |
|---|---|---|
| ref-1 to ref-4 | BLOCKED | The images are absent from `design-refs/`. Only text descriptions exist, tracked as UI-REF. By decision at the M1 gate, work follows the written specification and creative direction. No visual comparison has been made, and none is claimed |

## 8. 3D and 2D matrix

"Kind ready" means the chart kind works in both modes on `/design-system` with sample or measured data. "Widget" means the placed, wired chart on its real page. Overview (M3) and Knowledge Graph (M4) widgets are placed and wired; the rest are kind-ready at most.

| Original chart | Page | Kind | 3D | 2D | Widget |
|---|---|---|---|---|---|
| KPI sparklines (6) | Overview | Sparkline | Kind ready | Kind ready | VERIFIED [M3] |
| Documentation coverage over time, range selector, series toggle | Overview | Line, area | Kind ready | Kind ready | VERIFIED [M3], with 7d, 30d and 90d range selector |
| Completeness ring with sub-metrics | Overview | Radial | Kind ready | Kind ready | VERIFIED [M3] as an HTML meter with stage bars, not the radial chart kind |
| Module attention table inline bars | Overview | Table | Not applicable, a table | HTML bars | VERIFIED [M3] |
| Documentation gaps heatmap | Overview | Heatmap | Kind ready | Kind ready | VERIFIED [M3] |
| Language distribution donut | Overview, Intelligence | Donut | Kind ready | Kind ready | Overview VERIFIED [M3]; Intelligence NOT STARTED [M5] |
| Module size treemap | Overview, Intelligence | Treemap | Kind ready | Kind ready | Overview VERIFIED [M3]; Intelligence NOT STARTED [M5] |
| Mini architecture map | Overview | Network | Kind ready | Kind ready | VERIFIED [M3]. Animated flow lines in 2D only |
| Knowledge graph | Graph | Network, own renderers | VERIFIED, instanced, 703 nodes | VERIFIED, Canvas2D, 703 nodes | VERIFIED [M4] |
| Minimap | Graph | Network | VERIFIED | VERIFIED | VERIFIED [M4] |
| Function frequency bars | Intelligence | Bar | Kind ready | Kind ready | NOT STARTED [M5] |
| Fan-in and fan-out scatter | Intelligence | Scatter | Kind ready | Kind ready | NOT STARTED [M5] |
| Existing vs generated stacked bars | Intelligence | Bar | Kind ready | Kind ready | NOT STARTED [M5] |
| Attention list sparklines | Intelligence | Sparkline | Kind ready | Kind ready | NOT STARTED [M5] |
| Verification stacked bar | Verification | Bar | Kind ready | Kind ready | NOT STARTED [M5] |
| Verification score ring | Verification | Radial | Kind ready | Kind ready | NOT STARTED [M5] |
| Marketing mini charts and hero graph | Website | Mixed | NOT STARTED | NOT STARTED | NOT STARTED [M6]. World layer is its own canvas scene |

Phase III additions, also kind-ready only: word clouds, histograms, timelines.

## Summary

| Area | State |
|---|---|
| M1 design system | Verified, with Phase III fixes |
| Shared 3D and 2D system | Verified on `/design-system` |
| Dashboard shell and data layer, M2 | Verified in Chromium. Live checked in a reduced configuration, see [Demo and Live data](DEMO_LIVE_DATA.md) |
| Dashboard pages, M3 to M5 | Overview (M3) and Knowledge Graph (M4) verified. Five pending shells are labeled as such [M5] |
| Marketing site, M6 | Not started |
| Polish pass, M7 | Not started |
| Reference images | Unresolved. Not supplied, so no visual comparison has been made |
