# Frontend and backend integration

Status at M2: **the Live adapter reads the real API. The full stack is not verified.**

The design, the endpoint-by-endpoint status, failure handling and the contracts needed from later phases are in [Demo and Live data](../../03-architecture/frontend/DEMO_LIVE_DATA.md).

## Evidence levels

| Level | What ran | What it proves |
|---|---|---|
| Unit | Adapter with a stubbed transport, typed from the OpenAPI shape | Mapping, retries, error codes, and no demo data in Live |
| Browser, stubbed | Routes answered by test stubs, labeled as such in the test names | UI states for failures that are hard to trigger on a real server |
| Browser, real API | Real FastAPI app through the Vite proxy, `CODEATLAS_LIVE_BACKEND=1` | The adapter and UI read a real import, preprocessing and analysis |
| Compose stack | **Not run.** The Docker daemon was unavailable | Nothing yet |

## The real API run

- **Pipeline:** import, preprocess and analyze ran as real jobs on one small Python file, in project `live-verification`.
- **Observed through the API:** 1 file, Python, documentation coverage 0.333, class, function, method and module symbols, and a graph of 4 nodes and 4 edges.
- **Observed in the browser:** repository name, connected state, job status, file and symbol search, overview and graph readiness.
- **Reduced configuration:** SQLite and inline jobs, Python 3.14, and a launcher outside the repository that patches two POSIX-only storage calls in memory for Windows.

This shows that the frontend and the API code agree. It does not cover PostgreSQL, Redis, Celery or the Compose network, and it says nothing about accuracy on real repositories.

## What the design-system page still reads

| Data on screen | Source | Live? |
|---|---|---|
| "Measured data" section | `docs/07-findings/phase-2/analysis.json`, imported at build time | No. Real analyzer output, from a static file |
| "Chart kinds" section, KPI cards | `data/vizDemo.ts`, labeled Illustrative | No |

`analysis.json` summarizes symbols and relationships and is not a full `DependencyGraph`, so the graph page needs the real endpoint at M4.

## Still required

- A run against the Compose stack, when Docker is available.
- Page-level wiring at M3 to M5.
- Backend endpoints listed in the contracts section of [Demo and Live data](../../03-architecture/frontend/DEMO_LIVE_DATA.md). Phase IV owns its own response formats, and no schema was added or changed for them.
