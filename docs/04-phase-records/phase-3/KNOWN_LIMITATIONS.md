# Known limitations at the M2 gate

## Scope

- The dashboard shell and data layer exist. Seven of the nine destinations are labeled pending shells: page content arrives in M3 to M5. Settings and Help work now.
- The marketing site is not built, so `/` still redirects to `/design-system`.
- Chart kinds work in both modes, but the only chart on a dashboard route is the Overview claims donut. Range selectors and cross-filtering between page widgets do not exist yet.
- The Knowledge Graph is a 132-node preview. The 600-node graph and its 60 fps target are not built or measured.
- Palette results for files and symbols open the Explorer pending page, which says it cannot open them until M5.
- Auto-scroll is built and tested on the Overview activity panel. Other long lists arrive with their pages.

## Data and backend

- **The full stack is unverified.** Live was checked against the real FastAPI code on SQLite with inline jobs and one small Python file. Docker was unavailable, so PostgreSQL, Redis, Celery and Compose were not exercised. See [Demo and Live data](../../03-architecture/frontend/DEMO_LIVE_DATA.md).
- That check ran on Python 3.14, while the project requires 3.13 or newer but below 3.14.
- **Backend defect, not changed here:** `backend/codeatlas/storage.py` is POSIX-only on this path. `os.O_NOFOLLOW` does not exist on Windows, `os.fchmod` raises an error, and unlinking a read-only file fails. The verification launcher patched these in memory, outside the repository. The backend is unchanged.
- The API cannot list jobs for a snapshot, so Live needs an analysis job ID entered in Settings.
- The API has no branch, notifications, documentation, claims or user accounts. The shell says so instead of showing values.
- The API key is held in memory, so it is lost on reload.
- Live file search reads the manifest of the selected snapshot. Live symbol search needs a job ID and is limited to what that job's analysis returned.
- Phase II remains PARTIAL / REVIEW_PENDING, and no extraction metric is shown. Demo numbers are illustrative.

## Design inputs

- **Reference images ref-1 to ref-4 are unresolved.** They have not been supplied. Work follows the written specification and the approved creative direction. No comparison has been made, and none should be inferred.

## Interpretation of the specification

- The top bar "date range" is realized as a snapshot selector, because a snapshot is the time unit the backend records. The specification's range selector on the coverage chart remains M3 work.
- Rail hover expansion waits 450 ms and shows a tooltip first, so that a pass across the icons does not open the rail. This is a refinement, and an immediate focus or click still works.

## 3D

- Plain Three.js with a shared renderer was approved at the M1 gate, instead of React Three Fiber and Drei.
- Bloom and postprocessing are deferred by the same decision, and may be revisited in M7 if measured performance allows.
- Depth can occlude data at any camera angle. Tooltips, the keyboard path and the data table remain the guaranteed way to read a value.
- In a word cloud, parallax during orbit can still bring words close together. The front view lines up with 2D.
- On software GL, the first frame blocks the main thread for several seconds while shaders compile. Software GPUs default to 2D, so this applies only if 3D is chosen explicitly.
- The `three` chunk triggers Vite's chunk-size warning. It is lazy and never loads in 2D. It is not split further.
- Automatic quality steps down on sustained slow frames, but this was not exercised by a test.

## Layout

- Reserved chart height is the 3D card. In 2D, the panel below moves up by about 19 px when data arrives. A Live chart that resolves to "integration pending" collapses to its shorter notice.
- When panels stack, late-loading rows in earlier panels can move later panels by up to about 30 px, within normal page flow.
- At 390 px the top bar takes three rows, which is the cost of keeping every control reachable.
- Chart cards reserve one line for the interaction hint, which leaves a small empty strip until hover.

## Verification gaps

- Only Chromium was tested. Firefox and Safari are unverified.
- Touch gestures were not exercised, and no physical phone was used. Narrow layouts were checked in a narrow browser window.
- No manual screen reader pass. See [accessibility](ACCESSIBILITY.md).
- axe covers the tested tags only, and cannot judge everything.
- Performance was measured on one machine in headless Chrome. No FPS figure should be read as general.
- Remote GitHub Actions has not run the edited workflow.
- Browser tests run against the dev server. The production build was exercised by the screenshot and performance scripts only.
