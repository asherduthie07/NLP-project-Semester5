# CodeAtlas frontend — through M2

Phase III adds the shared 3D and 2D visualization system in `src/viz/`, shown in `/design-system` section 05. Render any chart through `VisualizationContainer`, with a `VizModel` from `viz/adapters/backend.ts`. See [frontend architecture](../docs/03-architecture/frontend/FRONTEND_ARCHITECTURE.md).

The dashboard shell is at `/app/overview`. See [shell architecture](../docs/03-architecture/frontend/SHELL_ARCHITECTURE.md). Seven of its nine pages are labeled pending shells until M3 to M5.

Data comes from one interface with two implementations, described in [Demo and Live data](../docs/03-architecture/frontend/DEMO_LIVE_DATA.md):

| Variable | Values | Default |
|---|---|---|
| `VITE_DATA_MODE` | `demo`, `live`. Only the starting mode, changeable in the top bar | `demo` |
| `VITE_API_BASE` | API origin. Empty uses the same origin and the Vite proxy | Empty |

Demo data is illustrative. Live never falls back to it. An API key, if needed, is entered in Settings and kept in memory only, so do not put one in a `VITE_` variable, which would be bundled.

Checks: `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Commands and GPU paths are in [TEST_COMMANDS](../docs/06-testing-verification/TEST_COMMANDS.md).

`npm ci`, `npm run dev`, then open http://127.0.0.1:5173/design-system. `/` redirects to the showcase. `npm run build` performs strict TypeScript checking before Vite's production build. Fonts are installed locally, with no runtime Google Fonts dependency.

M1 contains the original tokens, motion presets, all 13 base primitives and all 10 fx primitives. The showcase identifies numerical values and semantic badges as illustrative. No dashboard, marketing site, model inference or verification engine is asserted. The authoritative specification is `../design-refs/ui-master-spec.md`, retained unchanged. All four images referenced by that specification are absent.

Adapters: `src/data/api.ts` uses the generated OpenAPI contract and `/api/v1`; `src/data/mock.ts` is explicitly empty/mock and rejects processing operations. Swap with `useAdapter.getState().setApi(createRealApi())`; pass a runtime key supplier when needed. Vite proxies `/api` to loopback port 8000. `make contracts` regenerates backend OpenAPI and frontend types. Backend source text must be rendered as text/code, never injected as HTML.

Verification: `npm run test:e2e` uses Playwright Chromium and axe. If using installed Chrome, set `PLAYWRIGHT_CHROME=1`. Run `npx playwright install chromium` for managed browser installation. The suite checks controls, keyboard tabs, clipboard, toast, console, reduced motion, WCAG checks and 1440/1024/390px overflow, and writes screenshots under ignored `test-results/`.

M1 route to review: `/design-system`. Deliberately deferred: M2 shell and command palette; M3 overview and specified seeded shopflow-api demo; M4 Canvas graph; M5 remaining pages; M6 marketing site; M7 final audit. Continue only after explicit authorization. No UI requirement is deleted by this staging.
