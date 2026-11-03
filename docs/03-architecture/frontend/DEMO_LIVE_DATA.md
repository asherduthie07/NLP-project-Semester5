# Demo and Live data architecture (M2)

The dashboard reads all data through one interface, `DashboardApi` in `frontend/src/data/dashboard.ts`. There are two implementations and nothing moves data between them.

| | Demo | Live |
|---|---|---|
| Implementation | `demoApi.ts`, `demo/shopflow.ts` | `liveApi.ts`, over `createRealApi` in `api.ts` |
| Source | Seeded `shopflow-api` fixture | `/api/v1` of the CodeAtlas backend |
| Provenance | `demo`, labeled as illustrative | `measured` |
| Downloaded | On first use | Fixture is a separate chunk that Live never loads |

The original interface from the UI specification (`getOverview`, `getFileTree`, `getFile`, `getGraph`, `getDocs`, `getClaims`, `getStats`) is preserved, with an optional scope that Demo ignores. The earlier `PhaseOneApi`, `PhaseTwoApi` and empty `createMockApi` seam is unchanged apart from two added transport methods, `getHealth` and `getOriginal`.

## Demo fixture

Tests assert every total from the specification: 214 files, 1,386 functions, 142 classes, 41% coverage rising to 78%, and 3,912 claims made of 3,305 verified, 402 uncertain and 205 unsupported. Coverage is derived from flags on the fixture's own symbols. The graph has over 600 nodes. Builds are identical between runs. Page calls wait 600 to 1200 ms so that skeletons are exercised, as the specification asks.

## No silent fallback

- The selected mode changes only through a person's action, or the `VITE_DATA_MODE` default for a fresh browser.
- Changing mode clears the repository and snapshot, so an ID cannot cross sources.
- `useResource` drops late responses for an old key and clears data on failure, so old values are not left on screen.
- `liveApi.ts` does not import the demo code at all.
- Browser tests check that with the backend down, the page contains no demo identifiers or numbers and the fixture chunk is never requested.

## Configuration

| Setting | Where | Notes |
|---|---|---|
| `VITE_DATA_MODE` | Build environment | `demo` (default) or `live` |
| `VITE_API_BASE` | Build environment | Empty uses the same origin and the Vite proxy |
| API key | Settings | In memory for the tab only. Never stored or bundled |
| Analysis job ID | Settings, per snapshot | Needed because of the gap below |

## Failure handling

| Condition | Code | Shown as | Retry |
|---|---|---|---|
| Refused connection, timeout, bare proxy 5xx | `service_unreachable` | Backend unreachable | Automatic, twice with backoff, then manual |
| Other 5xx | From the API | Request failed | Same |
| HTML or other non-JSON answer, wrong shape | `invalid_response` | Request failed | Manual |
| 401 | `unauthorized` | API key required | Manual |
| 4xx | From the API | Request failed | Never automatic |
| No endpoint exists | `integration_pending` | Integration pending | None |
| Job ID missing | `analysis_job_required` | Analysis job required, with a Settings link | None |

Reads time out after 15 s. Uploads have no timeout.

## Backend integration status

Inspected: `docs/03-architecture/openapi.json`, `API_CONTRACTS.md`, `backend/codeatlas/api.py`.

| Dashboard need | Backend today | Live behavior |
|---|---|---|
| Health | `GET /health` | Works |
| Repositories, snapshots | `GET /projects`, `/projects/{id}/snapshots` | Works |
| Branch | Not recorded | Shows "branch not recorded" |
| Commit | `commit_sha`, null for uploads | Shows "no commit" when null |
| Languages, file tree, file search | Snapshot manifest | Works |
| File content | `/snapshots/{id}/files/{file}/original` | Adapter method, unit-level only. No page uses it until M5 |
| Analysis status | `GET /jobs/{id}` | Works once a job ID is given. Polls every 5 s |
| Symbols, overview, statistics, graph | `/jobs/{id}/analysis`, `/overview`, `/graph` | Works once a job ID is given |
| Activity | `/jobs/{id}/issues` | Shows job issues, the only activity the API records |
| Notifications | None | Integration pending |
| Documentation, claims, generated coverage | None | Integration pending. Overview returns them as null |
| User accounts | None | Session menu says so |

**Largest gap:** the API cannot list jobs for a snapshot. Live does not start analysis on its own, because that writes to the server, so the job ID is entered by hand.

## What was verified against a running backend

The real FastAPI app ran through the Vite proxy, with a real import, preprocessing and analysis of one small Python file. A browser test then read the repository, connection state, job status, files, symbols, overview and graph.

**This is not the Compose stack.** Docker was unavailable, so it used SQLite and inline jobs instead of PostgreSQL, Redis and Celery, on Python 3.14 rather than the required 3.13. The launcher, outside the repository, also patched two POSIX-only calls in memory for Windows (see [known limitations](../../04-phase-records/phase-3/KNOWN_LIMITATIONS.md)). The full stack remains unverified. The test is skipped unless `CODEATLAS_LIVE_BACKEND=1`, and a skipped run is not evidence.

Other Live browser tests use a stub of the OpenAPI shape, in order to reach failure paths. They prove adapter behavior, not integration.

## Contracts needed from later phases

These are requests, written from the UI's needs. **They are not schemas.** Phase IV owns its response formats, and the adapter will map whatever is defined, which is why the UI types are separate from the generated API types. Nothing here was added to `openapi.json`.

| UI method | Needs from the backend |
|---|---|
| Job discovery | List jobs for a snapshot, with kind, status and time |
| `getDocs` | Per symbol: path, qualified name, whether documentation existed, whether it was generated, text. Plus coverage before and after |
| `getClaims` | Per claim: status, text, linked symbol, source path and line. Plus counts by status |
| `getNotifications` | Events with severity, title, detail and time |
| `getRepositories` | Branch, where it is known at import |

Any metric from Phase IV has to arrive with its evaluation status, so the UI does not present a provisional number as final. Phase II's accuracy evaluation remains PARTIAL / REVIEW_PENDING.
