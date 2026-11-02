# Design system enhancements (Phase III M1)

All additions use existing tokens. No original token, primitive or showcase section was removed.

## Audit fixes to the original M1

| Item | Before | Now |
|---|---|---|
| App motion preference | The app-level setting was ignored by components | `useMotionPreference` honors it, and `html[data-reduced-motion]` drives CSS |
| MagneticButton (spec item 3) | Pulled only while over the button | Pulls within 80 px |
| Copy button (item 9) | Inline in the showcase | `CopyButton` primitive that morphs to a check with a small pop |
| Line grid (§4) | Missing, only the dot grid existed | Added to the showcase background with a radial mask |
| Toggle and slider (item 13) | Springy, no glow trail | Glow trail added |

## New controls

| Control | Location | Notes |
|---|---|---|
| `ModeSwitch` | Showcase nav, render console, each chart toolbar | A radiogroup. When 3D is unavailable it is disabled and says why |
| `VisualizationToolbar` | Each chart | Camera presets, zoom, reset, table, export, analysis mode. Zoom buttons hide in narrow cards, and keyboard zoom still works |
| Follow global | Chart toolbar, when overridden | Removes the override |
| `ChartLegend` | Each chart | Toggles series, or shows a labelled scale for heatmaps |
| Encoding footnote | Each 3D chart | Names what each visual channel means, including "not data" |
| Provenance chip | Each chart | Measured, Demo data or Illustrative |
| State views | Each chart | Loading, empty, error with retry, unavailable |
| Render console | Showcase | Mode and its source, GPU tier, WebGL contexts, live stages, quality, JS frame time |

## Preferences

Quality, labels, glow, camera sensitivity, chart animation and motion exist in `useVizStore`. Their settings panel is **not built**; it belongs with the dashboard shell. Only the mode controls are exposed in UI at M1.

## Where to see it

`/design-system`, section 05 Visualization.
