# Creative direction and UI design decisions

## Concept: instrument glass, source light

CodeAtlas charts are precision instruments on an engraved drafting plate, seen through dark glass. The product's promise is that every statement can be checked against source, so its charts should feel measured, not decorative.

Three rules follow from that:

1. **Light means data.** Glow comes from data and selection only. Nothing glows for atmosphere inside a chart.
2. **One key light.** 3D charts use a single key light placed to match the top highlight on the CSS glass panels, so WebGL and DOM read as one surface.
3. **Measured things stay measurable.** Measured charts use an orthographic camera. Depth adds separation, never distortion.

## Decisions

| Decision | Reason |
|---|---|
| No tone mapping | ACES tone mapping washed the design tokens to pastels in the first render: the mint donut looked pale and heatmap peaks went white. Token colors now stay recognizable |
| Heatmap ramp ends at cyan, not white | White peaks read as a rendering fault, and the ramp stays in the brand palette in both modes |
| Value axis at the back right | It is the one corner tall bars cannot cover from the default camera |
| Tallest line series in the back lane | A lower series is never hidden behind it |
| Chips for labels over geometry | Plain text was unreadable over bars and network nodes |
| Exact radial percentages in the legend | Labels on the rings collided at 12 o'clock, and the legend cannot be occluded |
| Word cloud matches 2D placement, with slight depth | The earlier sphere layout clumped and overlapped. Now the two modes line up, and parallax is too small to make words collide |
| Interaction hint appears on hover or focus | The same hint repeated on 22 cards was noise. It stays visible on touch devices |
| Subtitles describe the data, not a mode | "Height encodes…" was false on a flat chart. Mode-specific encoding moved to the 3D footnote |

## Self-review against Phase III §14

Reviewed from real screenshots in both modes at 1440 px.

| Question | Assessment |
|---|---|
| Does it look designed, or assembled from defaults? | Designed. No default Recharts styling, and 2D and 3D share tokens and framing |
| Does 3D earn its place? | Yes for heatmap, treemap with a height measure, three-measure scatter, and network. For donut and radial, depth adds presence rather than information, and the footnote says so |
| Is any data misrepresented? | None found. Proportionality is tested for each kind, and non-data channels are declared |
| Where is it weakest? | The timeline's back lanes crowd at the default angle. Toolbars are dense in 4-column cards |

Reference images ref-1 to ref-4 are absent from the repository, so this review could not compare against them. Only their text descriptions were used.

## M2 shell

Instrument glass, source light is kept. No clearly better direction emerged while building the shell. Decisions and reasons are in [shell architecture](../../03-architecture/frontend/SHELL_ARCHITECTURE.md).

Additions beyond the written specification, under the creative freedom approved at the M1 gate:

- A status strip along the bottom that shows route, data source, chart mode and GPU tier.
- A top-bar data source chip, so that provenance is visible on every page.
- Amber reserved for demo and pending states.
- Pending pages that report what the current adapter actually returns.
- Delayed rail expansion, with a tooltip first.

Nothing from the specification was removed. Reviewed from real screenshots at 1440, 1024 and 390 px, listed in [screenshots](SCREENSHOTS.md).
