# M1 acceptance report

**State: the final M1 checks requested at the gate are complete, and M2 was authorized to proceed. The result is recommended as PASS, subject to review.** This records implementation and test evidence. It is not academic approval, and VIS-01 to VIS-05 remain DEFERRED pending explicit academic approval in the [traceability matrix](../../REQUIREMENTS_TRACEABILITY.md).

## Decisions made at the gate

| Question | Decision | Effect |
|---|---|---|
| Plain Three.js with a shared renderer, or React Three Fiber and Drei | Plain Three.js approved | Engine kept. No rewrite |
| Bloom or postprocessing | Deferred | Not built. May be revisited in M7 if measured performance allows |
| Reference images ref-1 to ref-4 | Not supplied | Work follows the written specification and creative direction. No comparison is claimed |
| Creative freedom beyond the specification | Approved | Original requirements may not be removed or simplified |

## Original acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Original tokens, type, primitives, effects, motion verified | PASS, with 5 audit fixes | [Enhancements](../../03-architecture/frontend/DESIGN_SYSTEM_ENHANCEMENTS.md) |
| Existing browser tests still pass, unchanged | PASS | [Results](ACTUAL_RESULTS.md) |
| Global 3D and 2D switch, default 3D on capable devices, persisted | PASS | Browser tests |
| Per-chart override and follow-global | PASS | Browser tests |
| Selection and filters survive a switch, no reload | PASS | Browser test |
| Real geometry, no CSS or screenshot 3D | PASS | Pixel tests, orbit changes the image |
| All 12 chart kinds in both modes | PASS on `/design-system` | Unit tests, screenshots |
| Geometry proportional to data | PASS | `magnitudes` unit tests |
| WebGL unavailable: full 2D, no Three.js download | PASS | Browser test |
| Context loss recovers, then falls back | PASS | Browser test |
| One WebGL context across all charts | PASS, 22 stages, 1 context | Browser test, `performance.json` |
| Reduced motion | PASS | Browser test |
| axe, both modes, tested WCAG tags | PASS, 0 violations | Browser test |
| No overflow at 1440, 1024, 390 | PASS, both modes | Browser test |
| Failed request never shows sample data | PASS | Unit and browser tests |

## Final M1 checks, requested at the gate

### A. Exports

The new `e2e/exports-keyboard.spec.ts` decodes real downloads. **It found two defects, both now fixed:**

| Defect | Cause | Fix |
|---|---|---|
| A 2D PNG export produced an 11 × 11 image | The exporter took the first SVG in the card, which was a toolbar icon | Exports the chart surface's largest SVG |
| A 3D PNG was transparent and had no labels | Only the WebGL canvas was copied | Composites the background, the canvas, the DOM labels, and a footer with the title and provenance |

A failed export now shows an alert instead of failing silently.

**Tests now cover:**
- PNG files for three charts in both modes, checked for signature, size, opacity and painted colors;
- JSON and CSV against the values in the data table, including the legend filter.

### B. Keyboard

Tests now cover:
- `F` with and without a focused datum;
- `+`, `-` and `0`;
- Ctrl plus wheel zoom, alongside the existing check that a plain wheel scrolls the page;
- mode switching from the keyboard.

### C. Network performance

- **At the gate:** 42.6 fps, from one run.
- **Cause:** a reproducible five-run matrix traced it to ambient motion redrawing every visible 3D chart during a drag.
- **Fix:** ambient updates are capped at about 30 per second and pause while any chart is being dragged.
- **Final build:** 60.1 fps on all five runs, with p95 frame spacing of 16.8 ms, at 132 nodes on Intel HD 520.

The 600-node case is not measured. The M4 measurement plan and risks are in [performance](PERFORMANCE.md).

### D. Regression

The full browser suite was rerun on the final code on the real GPU and on software GL, including all M1 specs. Results are in [actual results](ACTUAL_RESULTS.md).

### E. Requirement status

VIS-01 to VIS-04 had lost their "DEFERRED — explicit academic approval required" wording when the implementation state was recorded. The wording is restored.

Each row now keeps two things separate:
- **Approval:** deferred.
- **Implementation:** partial, with evidence.

Implementation completion does not imply academic approval.

## Still not met or not verified

- Firefox, Safari, physical phones and screen readers are untested.
- Reference image comparison is unresolved.
- The 600-node graph target belongs to M4.

See [known limitations](KNOWN_LIMITATIONS.md).
