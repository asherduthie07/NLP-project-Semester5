# Accessibility

Scope: `/design-system` and the `/app/*` shell. Automated results are in [ACTUAL_RESULTS](ACTUAL_RESULTS.md).

## Charts (M1)

| Need | Implementation |
|---|---|
| Chart meaning without vision | Each stage is a labeled group with a generated summary. A data table lists every value |
| Keyboard use | Arrow keys move through every datum, Enter selects, Esc clears. In 3D, Shift plus arrows orbit, `+` and `-` zoom, `0` resets, `F` focuses |
| Screen reader updates | The readout under each chart is an `aria-live` region. The canvas and floating labels are `aria-hidden`, since the same content is available as text |
| Mode control | A labeled radiogroup, disabled with its reason when 3D is unavailable |
| Status | Error is `role="alert"`. Loading, empty, unavailable and fallback notices are `role="status"` |
| Color | Legends carry names and heatmaps a numbered scale, so color is never the only channel. Tooltips and tables state values |
| Reduced motion | Charts start in 2D unless 3D was chosen. In 3D, entry animation, camera flights and ambient motion stop |
| Scroll safety | A plain wheel always scrolls the page. Charts never trap it |

## Shell (M2)

| Need | Implementation |
|---|---|
| Bypass navigation | A skip link is the first Tab stop and moves focus to the page heading |
| Route changes | Focus moves to the new `h1`, the title updates and a live region announces the page. First load does not move focus |
| Landmarks | Navigation, banner and main each appear once, and the palette footer is not a second `contentinfo` |
| Palette, drawer, shortcuts overlay | Modal dialogs with a focus trap, Esc, and focus returned to where it came from |
| Menus | Arrow keys, Home, End, Esc, outside click, focus return, and correct `menu` and `menuitemradio` roles |
| Single-key shortcuts | Can be turned off in Settings (WCAG 2.1.4), and ignored inside inputs and focused charts |
| Moving content | Auto-scroll has a pause button (WCAG 2.2.2), stops on hover and focus, and never runs under reduced motion |
| Scroll regions | Focusable and labeled only when they really overflow. Stacked layouts have a single scroll surface |
| Touch targets | 44 px minimum on narrow screens |
| Provenance | Demo and pending states always have text, not only an amber color |

## Findings fixed during M2

| Finding | Found by | Fix |
|---|---|---|
| Search entry name did not contain its visible text | axe | Name comes from the content |
| Search entry had no name where its text was hidden, 1025 to 1320 px | axe | Text stays available to screen readers, visually hidden |
| Data chip label did not match its visible text | axe | Label now contains "Demo data" or "Live backend" |
| Two `contentinfo` landmarks with the palette open | axe | Palette footer is a plain `div` |
| Skip link was not first: the first-load focus effect ran under StrictMode | Browser test | First load now tracked by path, not by a mount flag |
| Palette did not return focus, because the input took focus first | Browser test | Origin tracked with `focusin` |
| Activity panel out of reach in short windows | Browser test | Panels stack at 760 px tall and below |
| Shortcuts overlay used `<header>`, a second banner landmark | axe, software GL run | Plain `div` |
| An outgoing page could stay in the DOM, invisible, so two headings were read | Browser test, software GL run | Removed by timer, and `inert` and `aria-hidden` while leaving |
| Hovered activity list kept moving: a late chart pushed it out from under the pointer | Browser test | Chart height reserved while loading. Test for the shift added |

## Checked by test

- axe, WCAG 2.0 A and AA and 2.1 AA tags: visualization section in 3D and 2D, every shell route at several widths, open palette, shortcuts overlay, open menus, drawer, and Live failure states.
- Keyboard: rail, menus, palette, shortcuts, skip link, chart F key, zoom and mode switching.
- Reduced motion: no idle frames in 3D, no auto-scroll, no looping or page-transition animation, and charts start in 2D. Parallax under reduced motion has no dedicated test.
- Dialog open and close, focus return, legend `aria-pressed`, disabled 3D control without WebGL, alert and status roles.

## Not checked

- No manual screen reader session has been run with NVDA, JAWS or VoiceOver.
- Keyboard-only use has been automated, not walked end to end by a person.
- Contrast on floating 3D labels depends on what is behind them. They use a halo or chip, but axe does not assess text over a canvas.
- Windows High Contrast mode.
- Physical touch devices.
