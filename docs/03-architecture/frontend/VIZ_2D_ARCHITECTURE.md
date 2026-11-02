# 2D visualization architecture

2D is a complete product mode, not a degraded 3D. It is the default wherever 3D is unavailable, and it never loads Three.js.

## Renderers

| Kind | Renderer | File |
|---|---|---|
| Bar (grouped, stacked, horizontal, vertical), histogram, line, area, scatter | Recharts, custom-styled | `viz/two-d/recharts.tsx` |
| Donut, radial, heatmap, treemap, sparkline, word cloud, timeline | Hand-written SVG | `viz/two-d/svg.tsx` |
| Network | Canvas2D, as the original spec requires for graphs | `viz/two-d/svg.tsx` |

The compact Network here is a preview. The 600-node Knowledge Graph with its full control panel belongs to M4.

## Geometry shared with 3D (`viz/scale.ts`, `viz/model.ts`)

These run once and feed both modes, so the modes cannot disagree:

- `valueTicks`, `niceTicks`: axis ticks
- `squarify`: treemap tiles
- `arcLayout`: donut and radial arcs
- `layoutWords`, `wordScale`: word placement and size. The whole cloud shrinks rather than dropping a word, so every table row has its word on screen
- `networkLayout`: seeded node positions, cached per model
- `monotoneSample`: the curve family matching Recharts' `monotone`
- `describeDatum`, `toTable`: tooltip and table content

## Interaction parity with 3D

| Interaction | 2D | 3D |
|---|---|---|
| Hover tooltip | Same `describeDatum` content | Same |
| Click to select, shared selection group | Yes | Yes |
| Legend filter | Same `applyHidden` | Same |
| Arrow keys, Enter, Esc | Yes | Yes |
| Data table, CSV, JSON, PNG export | Yes | Yes |
| Analysis mode | Yes | Yes |
| Orbit, camera presets, zoom | Not applicable | Yes |

## What 2D shows instead of the third channel

| Chart | 3D channel | 2D equivalent |
|---|---|---|
| Three-measure scatter | Depth | Point size, and tooltip |
| Treemap with a height measure | Height | Tooltip |
| Heatmap | Height and color | Color with a labelled scale |
| Line series | Depth lanes | Overlaid on one plane |

Chart subtitles describe the data, not one mode, so they stay true in both. Only the 3D footnote names 3D channels.
