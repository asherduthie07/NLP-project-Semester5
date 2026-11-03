# 3D visualization architecture

## Decision: one renderer shared by every chart

The Phase III prompt names React Three Fiber and Drei as preferred, not required. This implementation uses plain Three.js with a single offscreen `WebGLRenderer`, and copies each chart's frame into that chart's own 2D canvas with `drawImage`.

| Option | Problem on a dashboard with 20 or more charts |
|---|---|
| R3F `<Canvas>` per chart | One WebGL context per chart. Browsers evict the oldest contexts at about 16, so charts go blank |
| Single canvas with scissored views | The canvas sits outside the document flow, so views lag and clip across independently scrolling panels, which the original spec requires |
| Shared renderer, blit per chart (chosen) | One context, normal DOM flow and clipping. Costs one `drawImage` per visible chart per rendered frame |

This is a deviation from the stated preference and should be reviewed at the M1 gate. Reversing it would mean rewriting `engine/engine.ts`. The scene builders are plain Three.js and would largely carry over.

## Engine lifecycle (`viz/engine/engine.ts`)

- **One loop.** A single `requestAnimationFrame` loop serves all stages.
- **Demand rendering.** A stage redraws only when it is invalidated, or when a flight, entry animation or ambient motion is active. The loop stops when nothing needs drawing.
- **Off-screen pause.** `IntersectionObserver` removes hidden stages from the frame.
- **Lazy charts.** A chart creates no stage until it comes near the viewport.
- **Context release.** When the last stage leaves, the context is released after 1500 ms, so a quick mode toggle does not rebuild it.
- **Context loss.** A lost context shows a "Recovering" notice and is restored if the browser allows it, within 5 s. After 3 losses, or on timeout, the session falls back to 2D with a visible notice.
- **Quality.** `low`, `medium` and `high` set pixel ratio, ambient motion and label budget. `auto` follows the GPU tier and can step down if frames are slow.

Postprocessing (bloom) is not implemented. Emphasis comes from color, instanced highlight and additive glow sprites on network hubs.

## Scene contract (`viz/engine/scene.ts`)

A builder is a pure function from a model to a `BuiltScene`. It holds no global state and can be tested without WebGL.

| Member | Purpose |
|---|---|
| `root`, `pickables`, `pick` | Geometry and hit testing |
| `labels` | World-anchored text, projected to DOM after each render. Lower-priority labels drop on collision or at the stage edge |
| `camera` | Projection, presets and the preset that aligns with the 2D view |
| `magnitudes` | The scene-unit size of every datum, used by tests to prove geometry is proportional to data |
| `setProgress` | Entry animation. At 1, geometry is exactly to scale |
| `highlight`, `anchor`, `tick`, `dispose` | Interaction, tooltip anchoring, ambient motion, cleanup |

## Camera (`viz/engine/camera.ts`)

- Measured charts use an **orthographic** camera, so depth cannot change the apparent size of a bar or word. Only the network uses perspective, because its position carries no measurement.
- The view is fitted to the scene's actual bounding box, including label anchors, not a fixed radius.
- The wheel scrolls the page. Zoom needs Ctrl or Cmd plus wheel, except in analysis mode, so a chart can never trap page scrolling.
- Leaving 3D flies the camera to the preset aligned with the 2D view while the renderers crossfade.

## Data integrity

| Kind | What carries data in 3D | What does not, and is declared on screen |
|---|---|---|
| Bar, histogram | Height from a zero baseline on the same ticks as 2D | Depth |
| Line, area | Height, passing through every datum | Depth lane. The tallest series takes the back lane, so it cannot hide a lower one |
| Donut | Arc angle | Thickness |
| Radial | Arc sweep | Tube depth |
| Heatmap | Height and color | None |
| Scatter | x, y, and z only if the model has a real third measure | Otherwise z is a labelled group lane |
| Treemap | Footprint area, and height only if the model has a height measure | Otherwise a constant height |
| Word cloud | Word size. Placement matches 2D | Position and depth |
| Timeline | Stem height, time on x | Lane depth |
| Network | Node size by degree, real edges | Position, which is a force layout |

The footnote under each 3D chart lists these channels. `encodings()` in `viz/model.ts` is its source, and unit tests assert the "not data" entries.

## Known 3D limitations

Depth can still occlude data in any 3D view. Tooltips, the data table and the keyboard path are the guaranteed way to read a hidden value. See [known limitations](../../04-phase-records/phase-3/KNOWN_LIMITATIONS.md).
