# Performance

Raw data:
- [M1 gate, single run](../../06-testing-verification/evidence/phase-3/m1/performance.json)
- [Network investigation matrix](../../06-testing-verification/evidence/phase-3/m1/performance-network-matrix.json)
- [Final M2 build](../../06-testing-verification/evidence/phase-3/m2/performance.json)
- [M4 Knowledge Graph benchmark](../../06-testing-verification/evidence/phase-3/m4/benchmark-real-gpu.json), script [graph-bench.cjs](../../06-testing-verification/evidence/phase-3/m4/graph-bench.cjs)

## How this was measured

| Item | Value |
|---|---|
| Script | `frontend/scripts/perf-baseline.mjs`, against `vite preview` on a production build |
| Browser | Chrome 156, headless, 1440 × 1000 |
| GPU | Intel HD Graphics 520, integrated, Direct3D 11 |
| Quality | `medium`, chosen automatically for this GPU tier |
| Action | Scripted orbit drag on one chart while the rest of `/design-system` is present |
| Runs | 5 per chart, each in a fresh page |

**These numbers come from one machine in headless Chrome.** They are not benchmarks. "FPS" is derived from `requestAnimationFrame` spacing during the drag, and the 60 fps ceiling is this display's refresh rate. JS cost per frame excludes GPU time.

## Network orbit, 132 nodes

| Build | FPS over 5 runs | Frame spacing p95 | JS per frame |
|---|---|---|---|
| M1 gate, one run | 42.6 | 49.9 ms | 6.7 ms |
| Before the fix, repeated | 47.4, 46.7, 58.3, 59.5, 48.3 | Up to 34.6 ms | About 6 ms |
| **Final M2 build** | **60.1, 60.1, 60.1, 60.1, 60.1** | **16.8 ms** | **1.5 ms** |

Heatmap orbit on the final build: 60.1, 59.7, 59.9, 60.1, 60.1 fps, p95 16.8 ms, 1.2 ms JS. Seven chart stages were visible during the network runs.

### What was wrong

The matrix isolated the cause. Turning off chart animation or lowering quality changed little: 57.9 to 59.7 fps, all noisy. The real cost was ambient motion. Every other visible 3D chart redrew its ambient animation on every frame while one chart was being dragged, so a drag paid for seven scenes.

### What changed

- Ambient motion is capped at about 30 updates per second.
- While any chart is being dragged or flown, ambient motion pauses on all the others.

No visual feature was removed. One earlier patch failed to apply, and its run was first recorded as "after the fix". It was relabeled in the matrix file as a before-fix repeat, and the fix was applied and verified separately.

## Other measures, at the M1 gate

| Measure | 3D | 2D |
|---|---|---|
| Time to first chart, from navigation | 3427 ms | 1162 ms |
| Three.js chunk downloaded | Yes | No |
| Long tasks over the whole script | 13, longest 1097 ms | 14, longest 614 ms |
| Console errors and warnings | 0 | 0 |

After visiting all charts: 22 stages, **1 WebGL context**, 0 context losses.

## Bugs found by measuring

| Finding | Before | After |
|---|---|---|
| PMREM environment map on software GL blocked the main thread at startup | 12.5 s longest task | 3.9 s. Skipped at `low` quality |
| CSS minifier turned `rgba()` line tokens into `#rrggbbaa`, which Three.js rejects, in production only | Wrong line color, repeated warnings | Parsed correctly, 0 warnings, with a regression test |
| Ambient motion on every visible chart during a drag | 43 to 59 fps, noisy | 60 fps on this machine |

## Shell

The shell adds no continuous work, except the parallax layer. That layer runs one rAF loop only while the page scrolls, and stops under reduced motion.

- **Auto-scroll:** one loop per panel, only while moving.
- **Route transitions:** opacity and transform only, removed by a timer.
- **Production console:** clean at 1440, 1024 and 390 px. See `production-console.txt`.

## Bundle, final M2 build

| Chunk | Size | Gzip | Loads |
|---|---|---|---|
| `ThreeDChartRenderer` | 647.27 kB | 164.57 kB | Only in 3D |
| `recharts` | 404.76 kB | 114.96 kB | With 2D charts |
| `index` | 341.91 kB | 114.45 kB | Always |
| `Shell` | 100.98 kB | 32.41 kB | `/app/*` only |
| `pages` | 18.69 kB | 6.10 kB | `/app/*` only |
| `shopflow` | 8.68 kB | 3.72 kB | Demo mode only |

Vite warns that the 3D chunk exceeds 500 kB. It is isolated and lazy, so the warning stands rather than being silenced. The `index` chunk grew from 188 kB at the M1 gate, because shared code moved out of the design-system chunk, which fell from 347 kB to 16 kB. Splitting `index` further is M7 work.

## Knowledge Graph, M4

Measured on the same machine, real GPU, headless Chrome, 1440 × 900, with 5 s of camera motion the page drives itself, one fresh page per row. Full method and the optimization steps are in the [M4 report](M4_COMPLETION_REPORT.md#performance).

| Mode | 703 nodes | 1,000 nodes | 2,000 nodes |
|---|---|---|---|
| 3D | 60 fps, p95 16.8 ms | 60 fps, p95 16.8 ms | 60 fps, p95 16.7 ms |
| 2D, detail | 30 fps, p95 99.7 ms | 30 fps, p95 133 ms | 15 fps, p95 83.3 ms |
| 2D, performance mode | 60 fps, p95 33.3 ms | 60 fps, p95 33.7 ms | 30 fps, p95 50 ms |

The M4 target was 60 fps p50 and under 20 ms p95 while orbiting 600 nodes. **3D meets it. 2D detail mode does not**: on this integrated GPU its cost is rasterizing the canvas's edges, mostly dashes, in the GPU process. Performance mode is the documented fallback and turns on by itself when self-animated frames are measured slower than 24 ms.

## Not measured

- The Knowledge Graph on software GL. Scheduled for M7.
- Discrete or high-end GPUs, Firefox and Safari, and phones.
- Memory over long sessions.
- Time to interactive for dashboard pages, which have no content yet.

**No 60 fps claim is made for 2D detail mode, software GL, or other devices.**

## Plan for M4 (kept for the record; results above)

The Knowledge Graph's 60 fps target at 600+ nodes is measured, not assumed:

1. **Synthetic benchmark.** Add `--nodes` to `perf-baseline.mjs`, with seeded graphs of 600, 1,000 and 2,000 nodes. Measure orbit, pan, hover, and the force layout while it settles, in 3D, Canvas2D and SVG.
2. **Report per run.** FPS, p95 frame spacing, JS frame cost, long tasks and memory, five runs per configuration, on this integrated GPU and on software GL.
3. **Optimize in this order, measuring each step:**
   - one instanced mesh for nodes, which the engine already uses for repeated shapes;
   - merged line geometry for edges;
   - labels limited to hovered, selected and hub nodes;
   - layout in a worker or precomputed, so simulation never competes with rendering;
   - level of detail and quality steps at high node counts.
4. **Target.** 60 fps p50 and under 20 ms p95 while orbiting 600 nodes on this machine. If it is missed, report the measured figure and fall back to reduced quality, not a hidden cap.

**Risks:**
- Label layout cost grows with node count.
- Large edge counts on integrated GPUs.
- Main-thread contention between the force simulation and React.
- Software GL, which defaults to 2D and stays far below 60 fps in 3D.
