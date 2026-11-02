# Dashboard shell architecture (M2)

The shell is everything around a dashboard page: navigation, top bar, command palette, background, scroll regions and route transitions. Pages arrive in M3 to M5. Code is in `frontend/src/app/`.

## Structure

| File | Role |
|---|---|
| `AppRoutes.tsx` | `/app/*` routes. The shell and pages are lazy chunks, so `/design-system` does not load them |
| `nav.ts` | The nine destinations: route, shortcut, milestone and planned contents |
| `store.ts` | Persisted pin and shortcut preferences (`codeatlas.shell.v1`), plus runtime overlay state |
| `shell/Shell.tsx` | Layout, background, global shortcuts, route transitions, focus handling, overlays, status strip |
| `shell/Rail.tsx` | Rail and phone drawer, from one component |
| `shell/TopBar.tsx` | Repository, search entry, analysis status, snapshot, data source, chart mode, notifications, session menu |
| `shell/Menu.tsx` | Popover and menu with arrow keys, Esc, outside click and focus return |
| `shell/CommandPalette.tsx`, `fuzzy.ts` | cmdk palette with its own ranking and highlighting |
| `layout/ScrollPanel.tsx` | Independent scroll region, scroll state and auto-scroll |
| `pages/pages.tsx` | Pending page shell, Settings, Help |
| `shell.css` | Shell styling. Design tokens only |

## Navigation

- **Collapsed, 64 px.** Icons with a glowing plate on the active item, moved by a shared `layoutId` spring.
- **Hover or keyboard focus, 240 px.** The rail expands over the page, so content does not move. A tooltip with the shortcut appears first, and expansion waits 450 ms, so a quick pass over an icon does not open the whole rail.
- **Pinned, 240 px.** Content moves aside, and the choice persists. From 1100 px down, pinning expands over the page instead, so the page keeps its width.
- **768 px and below.** The rail is replaced by a modal drawer with a focus trap, Esc and focus return.

Long names such as "Documentation Intelligence" wrap to two lines instead of truncating, because two truncated "Documentation ..." rows were indistinguishable.

Routes are `/app/overview`, `explorer`, `graph`, `docs`, `intelligence`, `verification`, `exports`, `settings` and `help`.

Settings and Help work now. The other seven are pending shells with a visible "Page pending, milestone Mx" badge. They list what is planned, and show what the current data adapter actually returns for that page. They contain no placeholder widgets.

## Route transitions

Each page is an absolutely positioned layer: a crossfade plus a 10 px vertical shift, on opacity and transform only. Because layers are absolute, incoming and outgoing pages cannot shift layout. Under reduced motion there is no outgoing layer and no shift.

`PageLayers` in `Shell.tsx` removes the outgoing page with a 260 ms timer, not with `AnimatePresence`'s exit callback. On software GL, a page whose chart finished loading during the exit kept its invisible layer in the DOM for over 11 s, so screen readers found two pages. The outgoing layer is now also `inert` and `aria-hidden` from the moment it starts leaving.

After a route change, focus moves to the new `h1`, `document.title` updates and a live region announces the page. The first load does not move focus.

## Command palette

The palette is a modal dialog around cmdk's `Command`, with `shouldFilter={false}`. It does not use `Command.Dialog`, because that renders a Radix dialog with no title. Opening and closing use the shared motion settings.

- **Sources:** pages, actions and repositories locally; files and symbols from `api.getSearchIndex(scope)`.
- **Ranking:** consecutive letters and word starts score higher. A subsequence spread over a long string is rejected, and descriptions match only as written. Scattered matching across descriptions ranked "Settings" first for "order" before this rule.
- **Selection:** it follows the results explicitly. cmdk selects its first row before new results render, so Enter could otherwise open a stale row.
- **States:** loading, no results, no repository, failed index with retry, and symbols not searched with the reason. An empty list always means no records, never missing access.
- **Focus:** the origin is tracked with `focusin`, because the input takes focus during the commit that opens the dialog.

## Visualization mode

There is no second state system. The top bar and Settings both render the existing `ModeSwitch`, on the existing `useVizStore` (`codeatlas.viz.v1`). Per-chart overrides, `resolveMode`, WebGL fallback, context-loss recovery and reduced motion all come from M1 unchanged. The Overview pending page renders a real `VisualizationContainer` from adapter data, which is what the integration tests exercise. The shell never downloads Three.js unless a chart needs 3D.

## Scrolling

`ScrollPanel` is one region with `overscroll-behavior: contain`. It becomes a labeled, focusable region only when it actually overflows, and its edges fade only when more content exists in that direction.

At 1024 px and below, or 760 px tall and below, panels stack. They then stop scrolling internally and the page is the single scroll surface, so nothing is nested and nothing is clipped. The height rule exists because a short window clipped the Overview activity panel out of reach.

`useAutoScroll` is ready for long lists. It runs one rAF loop per panel, and only while moving. It stops for hover, focus within, off-screen, a hidden tab, recent manual scrolling and the pause button, which WCAG 2.2.2 requires. It never runs under reduced motion or while stacked.

## Background

The page background is a masked grid, three blurred orbs and the existing noise overlay. The layer moves at -0.06 times the page's scroll, on transform in a single rAF. Fixed panels do not move it, because the page itself is not scrolling then. Loops and parallax stop under reduced motion through the existing global rule.

## Keyboard

| Keys | Action |
|---|---|
| Ctrl or Cmd + K | Palette, always available |
| `/` | Search |
| `?` | Shortcuts overlay |
| `[` | Pin or unpin |
| `G` then a letter | Go to a page |

Single-key shortcuts can be turned off in Settings, as WCAG 2.1.4 requires. They ignore inputs and focused charts, which have their own keys.

## Visual decisions

Instrument glass, source light is kept.

| Decision | Reason |
|---|---|
| Amber is reserved for demo and pending | A reader can tell at a glance that something is illustrative or unbuilt |
| Demo data is labeled in the top bar, status strip, palette footer, snapshot menu and each adapter result | A screenshot of any one region still shows its provenance |
| Status strip along the bottom | HUD detail from the specification that also carries useful state: route, source, chart mode, GPU tier |
| Corner ticks on panels | A quieter version of the HUD frame that survives dense layouts |
| Short panels take their content height | Stretched panels were large empty boxes on pending pages |
| Top bar wraps on phones instead of hiding controls | Every control stays reachable, at the cost of a taller bar |
