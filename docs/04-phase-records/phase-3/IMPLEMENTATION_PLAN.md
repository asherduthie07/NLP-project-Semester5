# Phase III plan

Phase III keeps the original milestone order and adds the dual-mode visualization requirement to each one. Each milestone stops at a gate and waits for approval.

| Milestone | Original scope | Phase III addition | State |
|---|---|---|---|
| M1 | Tokens, primitives, motion, `/design-system` | Shared 3D and 2D architecture, mode controls, reusable chart kinds | Accepted at the M1 gate, with final evidence in [the M1 report](M1_ACCEPTANCE_REPORT.md) |
| M2 | Dashboard shell | Global mode switch in the top bar, Demo and Live data mode | **At gate, awaiting review.** See [the M2 report](M2_ACCEPTANCE_REPORT.md) |
| M3 | Overview page | All Overview charts in both modes | Not started |
| M4 | Knowledge Graph | 3D graph mode alongside the Canvas2D graph, at 600+ nodes | Not started |
| M5 | Explorer, Verification, Docs Studio, Intelligence | NLP analytics workspace, cross-filtering | Not started |
| M6 | Marketing website | Live 3D previews where they serve the story | Not started |
| M7 | Polish, audits, README | Full performance, accessibility and visual review | Not started |

Phase IV and V are out of scope here. Nothing in Phase III may present model metrics as if Phase IV had run.

## Preservation checklist

Every item stays in scope. Status per item is in [UI_SPEC_COMPLIANCE](../../03-architecture/frontend/UI_SPEC_COMPLIANCE.md).

- [x] Original spec file unchanged
- [x] Palette, fonts, textures, motion presets kept
- [x] 13 base and 10 effect primitives kept
- [x] Existing three browser tests kept unchanged and still passing
- [ ] Marketing site with two-layer scroll [M6]
- [x] Dashboard shell [M2]
- [ ] All pages [M3 to M5]
- [ ] 600+ node Canvas graph at the 60 fps target [M4, M7]
- [ ] Full 15-item micro-interaction audit [M7]
- [ ] Reference image review. Unresolved: the images were not supplied, and no comparison is claimed

## Decisions made at the M1 gate

1. Plain Three.js with a shared renderer is approved. See [3D architecture](../../03-architecture/frontend/VIZ_3D_ARCHITECTURE.md).
2. Missing reference images: work follows the written specification and creative direction. Their contents are not to be invented, and no comparison is claimed.
3. Bloom and postprocessing are deferred, and may be revisited in M7 if measured performance allows.
4. Creative freedom beyond the specification is approved, as long as no original requirement is removed or simplified.
