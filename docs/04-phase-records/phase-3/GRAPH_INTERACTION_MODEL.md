# Graph interaction model

Status: the Knowledge Graph page (original spec, Page 3) is built at M4: `frontend/src/app/pages/graph/`. The compact network chart from M1 still serves the Overview's architecture map. See the [M4 report](M4_COMPLETION_REPORT.md).

## Knowledge Graph page

| Input | Action | 3D | 2D |
|---|---|---|---|
| Hover | Node and neighbors stay bright, tooltip with kind, cluster, connections, coverage | Yes | Yes |
| Click a node | Select it and open the inspector | Yes | Yes |
| Click empty space | Clear the selection | Yes | Yes |
| Double-click a node | Fly to it and focus on its neighborhood | Yes | Yes |
| Drag empty space | Orbit (3D), pan (2D) | Yes | Yes |
| Right-drag | Pan | Yes | Not applicable |
| Drag a node | Move it. 2D: the layout reacts. 3D: on a plane facing the camera, no re-settle | Yes | Yes |
| Wheel | Zoom toward the pointer | Yes | Yes |
| Search box | Highlight every match; arrow keys and Enter fly to one and select it | Yes | Yes |
| Minimap | Click or drag to move the view | Yes | Yes |
| `S`, `R`, `F` | Screenshot, reset view, toggle focus on the selection | Yes | Yes |
| `+`, `-`, Esc | Zoom; leave focus, then clear the selection | Yes | Yes |
| Inspector relationship chips | Select that node and fly to it | Yes | Yes |

Page shortcuts yield to typing, open overlays, the shell's `G` sequences and the "single-key shortcuts" setting.

## Encoding

- Node size: degree. Node color: module cluster, language, or documentation coverage. Module nodes carry an outer ring in 2D.
- Edges: imports solid, inheritance dashed, calls dotted, containment faint and solid, in both modes. Performance mode drops dashes; edge kinds keep their colors and the legend shows both.
- Position: a seeded, deterministic force layout. Clusters are pulled toward points on a circle, and links across clusters pull weakly. Position carries no data. In 3D, depth separates clusters into layers and carries no other meaning.
- Unresolved relationships: never drawn to a guessed target.
- Live containment: derived from the analysis' parent and file records, because the graph endpoint returns relationships only.

## Accessibility

- The canvas has a text alternative stating mode, node and edge counts, and pointing to the search box.
- Every node is reachable without a pointer: search, then the inspector's relationship chips.
- Selection, focus and view reset are announced in a polite live region.
- The source listing in the inspector is a focusable, labeled scroll region.
- Reduced motion: the layout settles off screen and is drawn once, and camera moves jump instead of easing.

## Not built

- Lasso selection, listed as optional in the spec.
- Pinch zoom on touch screens. The zoom buttons work there.
