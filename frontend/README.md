# CodeAtlas frontend — M1

`npm ci`, `npm run dev`, then open http://127.0.0.1:5173/design-system. `/` redirects to the showcase. `npm run build` performs strict TypeScript checking before Vite's production build. Fonts are installed locally, with no runtime Google Fonts dependency.

M1 contains the original tokens, motion presets, all 13 base primitives and all 10 fx primitives. The showcase identifies numerical values and semantic badges as illustrative. No dashboard, marketing site, model inference or verification engine is asserted. The authoritative specification is `../design-refs/ui-master-spec.md`, retained unchanged. All four images referenced by that specification are absent.

Adapters: `src/data/api.ts` uses the generated OpenAPI contract and `/api/v1`; `src/data/mock.ts` is explicitly empty/mock and rejects processing operations. Swap with `useAdapter.getState().setApi(createRealApi())`; pass a runtime key supplier when needed. Vite proxies `/api` to loopback port 8000. `make contracts` regenerates backend OpenAPI and frontend types. Backend source text must be rendered as text/code, never injected as HTML.

Verification: `npm run test:e2e` uses Playwright Chromium and axe. If using installed Chrome, set `PLAYWRIGHT_CHROME=1`. Run `npx playwright install chromium` for managed browser installation. The suite checks controls, keyboard tabs, clipboard, toast, console, reduced motion, WCAG checks and 1440/1024/390px overflow, and writes screenshots under ignored `test-results/`.

M1 route to review: `/design-system`. Deliberately deferred: M2 shell and command palette; M3 overview and specified seeded shopflow-api demo; M4 Canvas graph; M5 remaining pages; M6 marketing site; M7 final audit. Continue only after explicit authorization. No UI requirement is deleted by this staging.
