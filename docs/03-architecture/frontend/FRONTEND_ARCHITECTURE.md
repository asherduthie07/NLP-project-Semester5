# Frontend architecture

Status: Phase III, through milestone M2. `/design-system` and the dashboard shell at `/app/*` exist. Dashboard page content (M3 to M5) and the marketing site at `/` (M6) are not built yet.

The original specification, [design-refs/ui-master-spec.md](../../../design-refs/ui-master-spec.md), stays authoritative and unchanged. Phase III adds to it.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Tokens and motion | `frontend/src/design/` | CSS variables, easings, springs, durations |
| Primitives | `frontend/src/components/ui`, `components/fx` | The 13 base and 10 effect components, plus `CopyButton` |
| Visualization system | `frontend/src/viz/` | Every chart in the product, in both modes |
| Data | `frontend/src/data/` | `dashboard.ts` (dashboard interface), `demoApi.ts` and `demo/` (Demo), `liveApi.ts` (Live), `source.ts` (selection and hooks), `api.ts` (real transport), `mock.ts` (explicit empty mock), `generated.ts` (from OpenAPI), `vizDemo.ts` (labeled sample models) |
| Shell | `frontend/src/app/` | Navigation, top bar, palette, scroll regions, transitions, pending pages, Settings, Help |
| Routes | `frontend/src/main.tsx`, `src/app/AppRoutes.tsx`, `src/DesignSystem.tsx` | The showcase and the lazy shell. `src/site` is reserved for M6 |

## Visualization system at a glance

```
backend contract ─ adapters/backend.ts ─┐
                                        ├─ VizModel ─ VisualizationContainer ─┬─ TwoDChartRenderer  (Recharts, SVG, Canvas2D)
sample data ──────── data/vizDemo.ts ───┘                                     └─ ThreeDChartRenderer (lazy) ─ shared engine
```

- One model per chart, and both renderers read it. Filters are applied once, by `applyHidden` in `viz/model.ts`, before either renderer or the table sees the data.
- `VisualizationContainer` owns filter, table and analysis-mode state, and the selection store owns selection. Because renderers hold none of it, switching modes cannot lose it.
- `vizRegistry` is declared with `satisfies Record<VizKind, …>`, so adding a chart kind without a 2D renderer fails compilation. `buildScene` applies the same rule to 3D.
- `three` is reachable only through the lazy `ThreeDChartRenderer`, so 2D sessions never download it. A browser test checks this.

## Component map

| Required name (Phase III §2) | Implementation |
|---|---|
| VisualizationRegistry | `viz/registry.ts` |
| VisualizationContainer | `viz/components/VisualizationContainer.tsx` |
| VisualizationModeProvider | `viz/store.ts` (`useResolvedMode`, `resolveMode`). A Zustand store replaces a React provider, so no wrapper is needed |
| VisualizationToolbar, ChartLegend, InteractiveTooltip | `viz/components/VisualizationContainer.tsx` |
| ChartDataAdapter | `viz/adapters/backend.ts`, `viz/model.ts` |
| ThreeDChartRenderer | `viz/components/ThreeDChartRenderer.tsx`, `viz/engine/` |
| TwoDChartRenderer | `viz/components/VisualizationContainer.tsx`, `viz/two-d/` |
| CameraController | `viz/engine/camera.ts` |
| SelectionManager | `viz/selection.ts` |
| VisualizationExport | `viz/export.ts` |
| WebGLCapabilityDetector | `viz/capability.ts` |

## State

| State | Owner | Persisted |
|---|---|---|
| Global mode, per-chart overrides, quality, labels, glow, camera sensitivity, chart animation, motion | `useVizStore` | Yes, `localStorage` key `codeatlas.viz.v1` |
| WebGL failure for this session | `useVizStore` | No, so a later visit can retry |
| Selection and hover, per group | `useSelectionStore` | No |
| Hidden series, table view, analysis mode | `VisualizationContainer` | No |
| Camera per chart | Shared engine | In memory, for the session |
| Data mode, repository, snapshot, job IDs per snapshot | `useDataStore` | Yes, `localStorage` key `codeatlas.data.v1` |
| API key | `data/source.ts` module variable | No, memory only |
| Rail pin, single-key shortcuts on or off | `useShellStore` | Yes, `localStorage` key `codeatlas.shell.v1` |
| Palette, drawer and overlay open state | `useShellStore` | No |

## Related records

- [Dashboard shell architecture](SHELL_ARCHITECTURE.md)
- [Demo and Live data architecture](DEMO_LIVE_DATA.md)
- [3D visualization architecture](VIZ_3D_ARCHITECTURE.md)
- [2D visualization architecture](VIZ_2D_ARCHITECTURE.md)
- [Shared data contracts](SHARED_DATA_CONTRACTS.md)
- [Design system enhancements](DESIGN_SYSTEM_ENHANCEMENTS.md)
- [Original spec compliance](UI_SPEC_COMPLIANCE.md)
