# Graph interaction model

Status: the compact network chart exists at M1. The Knowledge Graph page (original spec, Page 3) is **not built** and belongs to M4.

## Available at M1

| Input | Action | 3D | 2D |
|---|---|---|---|
| Hover | Node and neighbors highlight, tooltip | Yes | Yes |
| Click | Select in the chart's selection group | Yes | Yes |
| Legend | Show or hide a cluster. Edges to hidden nodes are removed | Yes | Yes |
| Arrow keys, Enter, Esc | Move through nodes, select, clear | Yes | Yes |
| Drag | Orbit | Yes | Not applicable |
| Ctrl or Cmd plus wheel, `+`, `-` | Zoom | Yes | Not applicable |
| `F` | Fly to the focused node | Yes | Not applicable |
| `0` | Reset camera | Yes | Not applicable |

## Encoding

- Node size: degree. Node color: cluster.
- Edges: imports solid, inheritance dashed, calls dotted, in both modes.
- Position: force layout, seeded and deterministic. It carries no data, and the footnote says so.
- Unresolved relationships: counted on the model, never drawn to a guessed target.

## Still required at M4

Everything in the original Page 3 stays in scope, including: 600 or more nodes in 6 to 8 clusters; drag pan and drag nodes; pin plus inspector drawer; double-click focus; full control panel (Dark/Light, live counters, force slider, edge filters, hulls, color-by, search with fly-to, fade unselected, S/R/F shortcuts); minimap; floating toolbar; live FPS readout; label LOD; optional lasso.

The original spec's 60 fps target at 600+ nodes has **not been measured**. The M1 preview has 132 nodes.
