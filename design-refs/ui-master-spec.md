# TASK: Build the complete frontend (marketing website + app dashboard) for "CodeAtlas AI"

You are building a visually exceptional, motion-rich frontend. The backend is handled separately by me, so everything must run on a typed mock-data layer that I can swap for real API calls later. Do NOT build backend logic. Do NOT stop at a basic layout. Visual quality, motion quality and polish are the main success criteria.

Work in milestones (see "BUILD ORDER"). After each milestone: run the dev build, fix all console errors/warnings, and give me a short summary of what exists before moving on. Never skip ahead, and never leave placeholder/lorem content.

---

## 1. PRODUCT CONTEXT

CodeAtlas AI is a web platform where a user uploads a Python/Java project or a public GitHub repo. It produces:

- A searchable map of the codebase (folders, files, classes, functions, imports)
- Multi-level AI explanations (function, class, module, repository)
- An interactive repository knowledge graph (imports, inheritance, reliable calls)
- A documentation studio (README, API reference, architecture overview; preview, edit, regenerate sections, export)
- A documentation intelligence dashboard (coverage, language split, module sizes, dependency stats, attention areas)
- Documentation verification: every AI-generated claim is linked to source lines and flagged Verified / Uncertain / Unsupported

Core differentiator: traceability and verification. The UI must constantly reinforce "every statement is linked to source code you can check." Use source-link chips (file.py:42-58) everywhere explanations appear.

---

## 2. REFERENCE IMAGES (attached, in /design-refs/)

- ref-1 analytics_page_sample: Take the slim left icon rail with a glowing active item, KPI cards with green delta arrows, smooth gradient-filled area chart with two series, a table with inline horizontal bars, and a weekday x hour heatmap with a legend. Dark navy surfaces, subtle 1px borders.
- ref-2 sample_dashboard (Kiro HUD): Take the dense multi-panel "mission control" layout, neon cyan/blue glow, corner-bracket panel frames, circular progress ring with sub-metric bars, terminal panel, task checklist, architecture mini-map, activity/CI strip along the bottom, diff view with red/green. Use this energy for the Overview and Verification pages.
- ref-3 and ref-4 (knowledge graphs): Take the force-directed graph on near-black, nodes colored by cluster (green, orange, red, blue, purple, pale blue), node size by connectivity, thin translucent edges, tiny labels, and the right-side control panel from ref-4 (Dark mode toggle, graph properties: nodes/edges/charge force, toggle labels, force +/-, zoom +/-, search, cluster hulls, heatmap toggle, keyboard shortcuts). Make ours cleaner, glossier and more interactive than both.

Do not copy these pixel for pixel. Synthesize one cohesive original visual language.

---

## 3. TECH STACK (use exactly this unless something blocks you; tell me if so)

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS + CSS variables for design tokens
- Framer Motion (component and layout animations, layoutId transitions)
- GSAP + ScrollTrigger (scroll-driven timelines, pinning, parallax)
- Lenis (smooth scrolling on the marketing site)
- React Router (routes: / for website, /app/* for dashboard)
- Zustand (UI state)
- d3-force + HTML Canvas for the knowledge graph (must stay at 60fps with 600+ nodes). Do not use SVG for the main graph.
- Recharts or visx for standard charts (custom-styled; no default Recharts look)
- lucide-react icons only (no emoji icons)
- Monaco or Shiki for code display (Shiki preferred for the static viewer)
- cmdk for the command palette
- Fonts: "Space Grotesk" (display), "Inter" (UI), "JetBrains Mono" (code, numbers, labels)

Folder structure:
src/
design/ (tokens.css, noise.svg, motion.ts presets, easings)
components/ui/ (Button, Card, Chip, Tooltip, Tabs, Toggle, Slider, Skeleton, Toast, Kbd, ProgressRing, Sparkline, Badge)
components/fx/ (SpotlightCard, TiltCard, MagneticButton, GlowBorder, CornerBrackets, NoiseOverlay, CountUp, ScrambleText, ParallaxLayer, Marquee)
site/ (landing sections)
app/ (shell, pages, widgets)
data/ (mock generators and typed API adapter interface in api.ts)
lib/

---

## 4. DESIGN SYSTEM (implement as CSS variables first)

Palette (dark-first; this is a dark product):

- --bg-0 #060912 (page), --bg-1 #0A1020 (panels), --bg-2 #101933 (raised), --bg-3 #16213f (hover)
- --line rgba(120,160,255,0.12), --line-strong rgba(120,180,255,0.28)
- --text-hi #EAF1FF, --text-mid #9DB0D3, --text-low #5F7196
- --blue #3B82F6, --cyan #22D3EE, --violet #8B5CF6, --mint #34D399 (verified), --amber #F5B642 (uncertain), --coral #FB7185 (unsupported), --pink #F472B6
- Graph cluster palette (8 colors): #86EFAC, #FDBA74, #FCA5A5, #60A5FA, #C4B5FD, #93C5FD, #F9A8D4, #67E8F9
- Gradients: primary = blue to cyan; accent = violet to pink; use mesh gradients for hero and section backgrounds.

Textures and surfaces (these are what make it feel rich, so do all of them):

- Global film-grain noise overlay (SVG feTurbulence, ~4-6% opacity, mix-blend-mode overlay), fixed.
- Dot-grid and fine line-grid backgrounds with radial mask fade at the edges.
- Glassmorphism panels: backdrop-blur-xl, 1px gradient border (white 14% to transparent), inner top highlight, soft outer glow in the panel's accent color.
- HUD corner brackets (small L-shaped ticks at the 4 corners) on hero panels and key widgets.
- Subtle scanline overlay on terminal/log panels only.
- Animated conic-gradient "border beam" that travels around featured cards.
- Soft blurred glow orbs behind content (blue, violet, cyan) with slow drift animation.
- Tabular, monospaced numbers for all metrics. Use tiny uppercase tracking-wide labels (like "SYSTEM OVERVIEW" in ref-2).

Radius: 14px cards, 10px inputs, 999px chips. Spacing: 4px base grid. Shadows: layered, colored glow, never plain black.

---

## 5. MOTION SYSTEM (global rules)

- Create src/design/motion.ts with shared easings (easeOutExpo, a spring preset for UI, a soft spring for layout) and durations. Everything uses these; no random per-component values.
- Stagger all list/grid entrances (40-80ms). Elements animate in from y:16 + blur(6px) + opacity 0.
- Charts: lines draw in with stroke-dashoffset; areas fade up after; bars grow from 0; numbers count up with CountUp; sparklines draw on mount.
- Respect prefers-reduced-motion: disable parallax, pins and loops, and keep simple fades.
- Everything hover-able gets feedback within 120ms.
- Use will-change/transform only; never animate layout properties in scroll handlers. Keep 60fps.

Micro-interactions (implement ALL):

1. SpotlightCard: radial gradient follows the cursor inside each card (border and fill).
2. TiltCard: 3D tilt (max 6 degrees) with a light glare on hero previews.
3. MagneticButton: primary CTAs pull toward the cursor within 80px.
4. Animated underline/pill for tabs and sidebar using Framer layoutId.
5. Sidebar icons: glow + tooltip (with Kbd hint) + small scale spring on hover; active item has a glowing blue plate like ref-1.
6. Cmd/Ctrl+K command palette (cmdk) with fuzzy search over files, functions, pages, actions; blurred backdrop; animated results.
7. ScrambleText effect on key headings/labels when entering view.
8. Pulsing live-status dots; shimmering skeleton loaders for every async widget (fake a 600-1200ms load on mount).
9. Copy buttons morph to a check icon with a tiny confetti-free "pop".
10. Toasts slide in from the bottom-right with progress bar.
11. Table rows: hover highlights the row, reveals a row-action arrow, and the inline bar brightens.
12. Chart hover: crosshair line, glowing dot, floating tooltip with a blur backdrop, synchronized across the stacked charts.
13. Toggles/sliders have springy thumbs and a glow trail.
14. Custom thin scrollbars (cyan thumb on hover) and a custom cursor ring on the marketing site (grows over interactive elements).
15. Keyboard shortcuts overlay (press ?).

---

## 6. PART A: MARKETING WEBSITE (route /)

Goal: looks insanely good, feels alive, with dynamic two-layer scrolling.

### The two-layer scroll architecture (critical)

Enable Lenis smooth scroll synced to GSAP ScrollTrigger. Build the page as TWO stacked layers that scroll at different rates:

- LAYER 0, "World" (position: fixed, behind everything): an animated background that is driven by scroll progress, not just scrolled. It contains: mesh gradient, dot grid, drifting glow orbs, vertical columns of faint falling code glyphs, and a full-screen canvas knowledge graph that is scattered/unorganized at the top of the page, then progressively pulls into organized colored clusters as the user scrolls (chaos to understanding). Its parallax speed is ~0.15-0.35x of scroll and colors shift per section (blue to violet to cyan to mint).
- LAYER 1, "Content" (normal flow at 1x): the sections themselves.
- LAYER 1.5, "Floating" (inside each section): decorative UI cards, code snippets, chips and badges positioned absolutely, moving at DIFFERENT speeds and directions (0.6x, 1.3x, -0.4x) using ParallaxLayer so they never move in sync. Also include sections with two vertical Marquee columns scrolling in OPPOSITE directions at different speeds (code snippets on one side, generated docs on the other).

No two things should move in lockstep. Intentional desync is the effect.

### Sections (in order)

1. Hero: giant Space Grotesk headline ("Understand any codebase. Prove every word." or similar), ScrambleText reveal, subline, two CTAs (MagneticButton "Analyze a repo", ghost "Watch demo"), a repo-URL input with animated placeholder typing "github.com/..." and a gradient glow border. Behind it: Layer 0. In front: 3-4 floating glass cards at different depths (mini graph, coverage ring, a code-claim-verified chip, a terminal log) with mouse-driven parallax and slow idle float. Scroll indicator at the bottom.
2. Trust/compat strip: infinite marquee of "Python, Java, GitHub, Transformers, NLP, AST, Qiskit-free" style tech tokens with logo-like glyphs (no real brand logos needed, use lucide or custom SVG).
3. Problem to solution (PINNED scroll story, GSAP pin): left side text changes across 3 beats ("Hundreds of files." "No map." "Now there is."). Right side visual: a pile of file cards that fly into a folder tree, then become graph nodes, then a documented module. Scrubbed to scroll.
4. Capabilities bento grid (A to F from the six capabilities): asymmetric grid, each tile is a SpotlightCard with a live mini-demo: explorer (tree expanding), AI explanation (typing text with source chips), knowledge graph (mini force graph that reacts to hover), docs studio (README lines streaming), intelligence (animated bars/ring), verification (claim lines turning green/amber/red one by one).
5. Verification showcase: wide section, left = AI paragraph with claims highlighted; right = code panel; as the user scrolls, each claim highlights and a glowing SVG line connects it to the exact source lines, then a badge stamps Verified/Uncertain/Unsupported.
6. Dashboard preview: huge TiltCard with a screenshot-like live render of the real dashboard components (not an image), with scroll-driven scale-up and perspective tilt-flat as it reaches center. Annotated callouts pop in around it.
7. How it works: horizontal scroll-pinned pipeline (Upload, Parse AST, Extract facts, Summarize with transformers, Verify, Publish docs) with animated connector line and step cards.
8. Metrics band: count-up numbers (files analyzed, functions documented, claims verified, coverage gain) over a texture with a marquee in the background.
9. Final CTA: big gradient headline, glowing orb, MagneticButton, and an animated graph burst on button hover.
10. Footer: multi-column, grain texture, large faded wordmark that reveals on scroll.

Sticky glass navbar: shrinks on scroll, blur increases, active-section pill indicator via layoutId, "Open dashboard" button linking to /app.

---

## 7. PART B: DASHBOARD APP (route /app/*)

### Shell

- Left icon rail (64px, like ref-1): logo mark at top, icons for Overview, Explorer, Knowledge Graph, Docs Studio, Intelligence, Verification, Exports, then Settings/Help at the bottom. Active = glowing blue plate. Rail expands to 240px on hover/pin with labels sliding in.
- Top bar: repo switcher dropdown (repo name, branch, commit hash, language chips), global search that opens the command palette, analysis status pill ("Analysis complete" with a pulsing dot), date/version range select, notifications bell, avatar.
- Page transitions: crossfade + slight y-shift via AnimatePresence.
- The background of the app is bg-0 with a faint grid + a few drifting glow orbs + noise. It must not be flat.
- IMPORTANT, unsynced scrolling in the dashboard: each major panel is its own scroll container (like ref-2's independent panes). The page background layer moves at a different rate (subtle parallax tied to the main scroll). Long lists (activity feed, claims, logs) auto-scroll slowly on their own when idle and pause on hover. No two panels should scroll in sync.

### Page 1: Overview (the hero page, make it spectacular)

Grid layout inspired by ref-1 + ref-2, with HUD header strip labeled "REPOSITORY OVERVIEW":

- Row of 6 KPI cards (SpotlightCard + Sparkline + delta arrow): Files analyzed, Functions, Classes, Doc coverage %, Verified claims, Needs review.
- Large "Documentation coverage over time" area chart (two series: Existing docs and Generated docs, gradient fills like ref-1, glow line, hover crosshair), with a range selector (7d / 30d / 90d) and a series toggle.
- Right column: big ProgressRing "Documentation completeness 76%" with sub-metric bars (Parsed, Summarized, Verified, Reviewed, Published) like Kiro's SPEC TO CODE PROGRESS, plus "Est. completion" and "Blockers".
- "Top modules needing attention" table: Module (breadcrumb path), Functions, Coverage (inline gradient bar), Complexity, Last analyzed, Status chip; sortable; row hover effects; "View all modules" button.
- Heatmap: "Documentation gaps by module x metric" or "Analysis activity by weekday x hour" with a legend and cell hover tooltips (styled like ref-1).
- Language distribution donut (Python/Java) with animated segment hover; module size treemap; dependency stats mini cards (most imported modules, circular deps count, orphan files).
- Mini architecture map widget (like ref-2): small node diagram with animated dashed data-flow lines.
- Bottom status strip (like ref-2): Analysis pipeline (6 steps with animated progress), Last analysis time, Verification score, Unsupported-claim rate.
- Live activity feed and a terminal-style log panel (scanlines, blinking cursor, streaming mock lines like "[parse] resolved 214 files", "[summarize] module auth/service.py done").

### Page 2: Codebase Explorer

Three resizable panes (draggable dividers with glow on drag):

- Left: file tree (animated expand/collapse, icons by type, language colors, doc-coverage dot per file, filter box).
- Center: code viewer with Shiki highlighting, line numbers, gutter badges for "documented / undocumented", symbol outline breadcrumb, hover on a function shows a floating explanation card.
- Right: inspector with tabs (Explanation / Signature / Relationships / Docs) showing AI explanation with params and returns and clickable source chips that scroll+flash the code lines in the center pane. Each pane scrolls independently.

### Page 3: Knowledge Graph (centerpiece)

Full-bleed canvas (d3-force + Canvas2D) with devicePixelRatio handling, on a near-black background with a faint radial vignette and star-dust texture.

- ~600 mock nodes in 6-8 clusters (modules), node radius by degree, node color by cluster, translucent edges (imports solid, inheritance dashed, calls dotted), glow on hubs.
- Interactions: wheel zoom + drag pan, drag nodes, hover = highlight node + neighbors and fade the rest, click = pin + open inspector drawer (slides in from the right with source snippet and docs coverage), double-click = focus zoom with smooth camera animation, lasso/shift-select optional.
- Right control panel (glass, inspired by ref-4 but nicer): Dark/Light toggle, repo meta, Nodes/Edges/Charge-force live counters, Toggle labels, Force +/- slider, Zoom +/-, Edge-type filter chips, Cluster legend with show/hide, Cluster hulls toggle (soft blurred convex hulls), Color by (Module / Language / Doc coverage heatmap), Search nodes with highlight + camera fly-to, "Fade unselected" toggle, shortcut list (S select, R reset, F fade).
- Minimap in the bottom-left corner, a floating toolbar (fit, reset, screenshot), and a live FPS/nodes readout in the HUD style.
- Labels: LOD, only show labels for hubs when zoomed out, more as you zoom in.

### Page 4: Documentation Studio

- Left: document outline (README, Architecture, API Reference, per-module docs), drag-reorder, completion dots.
- Center: split editor/preview (markdown editor + rendered preview) with a toolbar; selected section shows a floating "Regenerate" button, which triggers a streaming typewriter effect with a shimmer and a diff-style reveal of the new text.
- Right: sources panel listing source-link chips supporting the selected section, and a verification badge summary.
- "Export" button opens a modal with options (Markdown ZIP, Static docs website, PDF), animated progress, success state with confetti-free glow burst.

### Page 5: Documentation Intelligence

Charts page: function frequency bar chart, language split, module sizes treemap, dependency stats (top imported modules, fan-in/fan-out scatter), existing vs generated coverage stacked bars, a "Attention needed" ranked list with severity chips and sparklines. All charts cross-filterable by clicking a module.

### Page 6: Verification

- Top: summary strip (Verified / Uncertain / Unsupported counts with an animated stacked bar and Verification score ring like Security score in ref-2).
- Left: claims queue list (status chip, confidence meter, module). Keyboard nav: J/K move, A approve, R reject, U mark uncertain.
- Right: side-by-side diff-style view: the claim text on the left; on the right the evidence code with highlighted lines in the style of ref-2's diff (green for supported lines, red for contradicting lines), a glowing connector line between claim and evidence, and extracted facts list (params, return type, called functions) with check/cross icons.

---

## 8. MOCK DATA

Create realistic mock data in src/data/ behind an interface (api.ts: getOverview(), getFileTree(), getFile(path), getGraph(), getDocs(), getClaims(), getStats()). Use one demo repository, "shopflow-api" (Python, FastAPI), 214 files, 1,386 functions, 142 classes, 41 percent existing doc coverage rising to 78 percent after generation, 3,912 extracted claims (3,305 verified, 402 uncertain, 205 unsupported). Generate the graph procedurally with seeded randomness so it is stable between reloads. Use believable file paths, function names and docstrings. No lorem ipsum anywhere.

---

## 9. QUALITY BAR AND HARD RULES

- Visual density and polish should match ref-2's richness with ref-1's cleanliness. If something looks flat, add depth (glow, glass, texture, motion).
- No default-looking UI: no stock Tailwind blue buttons, no plain white cards, no unstyled scrollbars, no default Recharts tooltips, no browser-default selects.
- Responsive: website is fully responsive; the dashboard is optimized for 1440px+, and degrades gracefully down to 1024px (rail collapses, panes stack).
- Accessibility: focus-visible rings (cyan glow), aria labels on icon buttons, sufficient contrast, reduced-motion support.
- Performance: lazy-load routes, canvas for graph, memoize charts, never run more than one rAF loop per canvas, pause off-screen animations with IntersectionObserver.
- Code quality: strict TypeScript, no any, reusable components, tokens only (no hardcoded hex in components), clear README with run instructions and where to plug in the real API.

---

## 10. BUILD ORDER (stop and report after each)

M1. Scaffold, tokens, fonts, NoiseOverlay, base UI components, fx components, motion.ts. Show a /design-system showcase page of every component.
M2. Dashboard shell (rail, top bar, command palette, page transitions, background layer).
M3. Overview page with all widgets and mock data.
M4. Knowledge Graph page (canvas, controls, inspector, minimap).
M5. Explorer, then Verification, then Docs Studio, then Intelligence.
M6. Marketing website, Layer 0 world + all sections, pinned scenes, marquees, parallax.
M7. Polish pass: micro-interactions audit against section 5 list, reduced motion, performance profiling, responsive fixes, README.

At the end of every milestone, list: what is done, what is deliberately left, any deviation from this spec, and screenshots or a route list to check. Do not move to the next milestone until I say "continue".
