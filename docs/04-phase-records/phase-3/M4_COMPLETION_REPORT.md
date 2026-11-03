# M4 completion report: Knowledge Graph

**Status: IMPLEMENTED and TESTED on a real GPU. Verdict: PASS, with the gaps listed below.** Date: 2026-11-03. Branch `feature/my-implementationPhase3`.

The 60 fps target is met in 3D at 703, 1,000 and 2,000 nodes on this machine. It is **not** met in 2D detail mode, which runs at 30 fps here. 2D performance mode reaches 60 fps up to 1,000 nodes. The numbers and their limits are in the performance section below. Software GL is not measured yet; that runs at M7.

## What was built

The page at `/app/graph` replaces the M2 pending page. Code: `frontend/src/app/pages/graph/`.

| File | Role |
|---|---|
| `model.ts` | Graph model shared by both views: nodes with degree, coverage, language and line span; clusters with readable names; filters, search, convex hull, label budget, synthetic benchmark copies |
| `layout.ts` | One d3-force configuration for both views, sliced settling, theme colors, minimap, frame statistics |
| `view.ts` | The `GraphView` contract both renderers implement, and the emphasis rule |
| `canvas2d.ts` | Canvas2D renderer: one rAF loop that ticks the simulation, eases the camera and draws |
| `scene3d.ts` | WebGL renderer: one `InstancedMesh` for nodes, one `LineSegments` per edge kind, OrbitControls, HTML labels |
| `GraphPage.tsx`, `graph.css` | Page: control panel, toolbar, HUD counters, minimap, tooltip, inspector, shortcuts |

| Spec item (original Page 3) | Status | Notes |
|---|---|---|
| 3D and 2D modes | TESTED | 3D is WebGL; 2D is Canvas2D with d3-force. The mode follows the global setting with a per-graph override, and falls back to 2D on context loss |
| 600+ nodes in 6 to 8 clusters | TESTED | Demo: 703 nodes, 1,266 edges, 8 clusters. Cluster names come from file stems |
| Imports solid, inheritance dashed, calls dotted | TESTED | Also faint solid containment edges. In both modes |
| Node size by degree | TESTED | Radius 2.6 + 1.7·√degree |
| Orbit, zoom, pan, drag nodes | TESTED | 2D: drag pans, drag a node to move it (the layout reacts), wheel zooms at the pointer. 3D: drag orbits, right-drag pans, wheel zooms to the cursor, drag a node to move it on a camera-facing plane |
| Hover highlight and tooltip | TESTED | Node and neighbors stay bright, the rest fade |
| Select and inspector drawer | TESTED | Facts, relationships by kind (clickable), source lines from `getFile`, Open in Explorer link with path and line |
| Double-click focus | TESTED | Flies to the node and keeps only its neighborhood bright. `F` toggles focus |
| Search with fly-to | TESTED | Combobox with arrow keys. Every match is highlighted on the canvas |
| Filters: node kinds, edge types, clusters | TESTED | Hidden nodes take their edges with them |
| Cluster hulls | TESTED | Padded convex hulls, with cluster names |
| Color by module, language or doc coverage | TESTED | Legends for language and the coverage ramp. Without coverage data, nodes are grey and the legend says why |
| Minimap | TESTED | Click or drag to move the view |
| FPS and counters | TESTED | FPS reads "idle" when nothing is drawing, instead of a stale number |
| Screenshot and toolbar | TESTED | PNG download. In 3D the labels are drawn into the image |
| Shortcuts S, R, F | TESTED | Also `+`, `-` and Esc. They yield to typing, open overlays, the shell's `G` sequences and the "single-key shortcuts" setting. Listed in the `?` overlay and on Help |
| Label level of detail | TESTED | Hubs first, more as the view closes in, overlaps skipped |
| Dark and light canvas | TESTED | Remembered per browser. Only `--graph-*` tokens change, so the surrounding UI keeps its theme |
| Force slider | TESTED | Repulsion 80 to 600. 2D re-settles live, 3D re-settles and then updates |
| Fade unselected | TESTED | Switch |
| Instancing and a quality mode | TESTED | 3D nodes are one instanced mesh. Performance mode lowers pixel ratio, sphere detail and label count, and drops dashes (edge kinds keep their colors). It turns on by itself when self-animated frames are measured slower than 24 ms |
| Optional lasso | NOT AVAILABLE | Not built |

Live data: the graph comes from `/jobs/{id}/graph`, clusters are directories, coverage comes from the analysis. The Phase II graph endpoint has no containment edges, so they are derived from the analysis' own parent and file records. Nothing else is derived or invented. A synthetic benchmark (`?bench=N`, Demo only) is labeled "Synthetic benchmark, not a repository" and is refused in Live.

## Performance

Measured with `graph-bench.cjs` (kept with the evidence): Chrome 156 headless on an Intel HD Graphics 520, 1440 × 900, device pixel ratio 1. Each row is a fresh page, after the layout settles, with 5 s of continuous camera motion driven by the page itself (`drift`), so input timing does not pace the frames. "Frame" is the spacing between drawn frames; "draw" is main-thread time per frame and excludes GPU work. Raw data: [benchmark-real-gpu.json](../../06-testing-verification/evidence/phase-3/m4/benchmark-real-gpu.json).

| Mode | Nodes | Edges | Performance mode | Frame p50 | Frame p95 | FPS at p50 | Draw p50 |
|---|---|---|---|---|---|---|---|
| 3D | 703 | 1,266 | off | 16.6 ms | 16.8 ms | 60 | 3.0 ms |
| 3D | 1,000 | 1,764 | off | 16.6 ms | 16.8 ms | 60 | 3.0 ms |
| 3D | 2,000 | 3,512 | off | 16.6 ms | 16.7 ms | 60 | 3.9 ms |
| 2D | 703 | 1,266 | off | 33.3 ms | 99.7 ms | 30 | 3.8 ms |
| 2D | 703 | 1,266 | on | 16.7 ms | 33.3 ms | 60 | 3.9 ms |
| 2D | 1,000 | 1,764 | off | 33.3 ms | 133 ms | 30 | 4.6 ms |
| 2D | 1,000 | 1,764 | on | 16.7 ms | 33.7 ms | 60 | 4.5 ms |
| 2D | 2,000 | 3,512 | off | 66.6 ms | 83.3 ms | 15 | 7.9 ms |
| 2D | 2,000 | 3,512 | on | 33.3 ms | 50 ms | 30 | 7.9 ms |

The 1,000 and 2,000 node graphs are synthetic copies of the demo graph. 60 fps is this display's refresh rate.

What was changed to get here, each step measured:

1. The first 3D version spent 20 to 37 ms per frame placing labels, because it read `offsetWidth` after writing transforms. Labels are now measured with canvas text metrics and cached, and DOM writes happen only when a value changes: 1.8 to 3.9 ms.
2. Toolbar and counters used `backdrop-filter` over the canvas, which is recomputed every animated frame. Removed; the panels use a near-opaque fill.
3. A Chrome trace of 2D showed the GPU process rasterizing the canvas for about 2 of every 3 seconds. Edges dominate: with edges hidden, 2D holds 60 fps. Drawing each edge and node as its own path, butt caps and widths of one pixel or less helped at 2,000 nodes (133 ms to 83 ms, then 67 ms). Dashes are the remaining cost, which is why performance mode drops them.
4. The automatic switch first used main-thread cost, which never sees GPU raster cost, then frame rate, which also falls when input is slow. It now uses only gaps between frames the view animated by itself.

**No claim of 60 fps is made for 2D detail mode, or for any mode on software GL, phones or other GPUs.**

## Tests

- Unit: `src/app/__tests__/graph.test.ts`, 14 tests: model counts and clusters, degree and neighbor symmetry, coverage only from the analysis, deterministic placement, containment derivation, filters, search ranking, benchmark copies, hull, label budget, emphasis, cluster separation after the force layout, and frame statistics. Full unit suite: 113 of 113.
- Browser, real GPU: `e2e/graph.spec.ts`, 11 of 11. Covers the full control set and demo labeling, pixels actually drawn, axe at 1440 and 390 px and in 3D, search and inspector with source, every filter, hover, click, double-click focus, node drag, wheel zoom, S/R/F and their interaction with typing and `G` sequences, light theme persistence, responsive layout at 1024 and 390 px, reduced motion, the labeled synthetic benchmark, 3D instancing with screenshot and mode switching, Live with a completed-job stub, and Live with no backend.
- `shell.spec.ts`: the Knowledge Graph route is now expected to be built. One timing test (Overview auto-scroll) failed once under load and passed 3 of 3 alone. A scroll step already in flight could land just after the pause; the test now lets it settle (150 ms) before checking that the position holds. The assertion itself is unchanged.
- Not run yet: the full suite, software GL and the real backend. Those run at M7.

## Gaps and deviations

- 3D shows the settled layout. Dragging a node in 3D moves only that node; the layout does not re-settle until "Re-run layout" or the force slider.
- In 3D, depth separates clusters into layers and carries no other meaning.
- The 3D view owns a WebGL context rather than using the chart engine's shared one, which copies each frame into a 2D canvas. The engine releases its context when no chart is on screen, so the page holds at most two.
- Picking is done in screen space from projected node centres, not by raycasting meshes.
- The inspector's source is plain text. Highlighting with Shiki is part of the M5 Explorer.
- Touch: pinch zoom is not implemented. The zoom buttons work on touch screens.
- Lasso selection is not built.
- Live: containment edges are derived as described above. Calls to unresolved targets are not drawn, because the graph endpoint gives them no target.
- Screenshots in `evidence/phase-3/m4/` were taken during development, before the node-kind filter was added.
