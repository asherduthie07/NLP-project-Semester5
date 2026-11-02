import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIZ = 'codeatlas.viz.v1', DATA = 'codeatlas.data.v1', SHELL = 'codeatlas.shell.v1';
const API = '**/api/v1/**';
const LIVE_REAL = !!process.env.CODEATLAS_LIVE_BACKEND;

function collectConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  /** A blocked request logs a browser network line, which the unreachable tests provoke on purpose. */
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !/Failed to load resource|ERR_FAILED|willReadFrequently/.test(message.text())) problems.push(`${message.type()}: ${message.text()}`); });
  return problems;
}
async function seed(page: Page, { data = 'demo', viz, shell }: { data?: 'demo' | 'live'; viz?: '2d' | '3d'; shell?: Record<string, unknown> } = {}) {
  await page.addInitScript(([dataKey, vizKey, shellKey, mode, vizMode, shellState]) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(dataKey as string, JSON.stringify({ state: { mode }, version: 0 }));
      if (vizMode) localStorage.setItem(vizKey as string, JSON.stringify({ state: { globalMode: vizMode }, version: 0 }));
      if (shellState) localStorage.setItem(shellKey as string, JSON.stringify({ state: shellState, version: 0 }));
    }
  }, [DATA, VIZ, SHELL, data, viz ?? null, shell ?? null] as const);
}
const palette = (page: Page) => page.getByTestId('command-palette');
const paletteInput = (page: Page) => palette(page).getByRole('combobox');
const globalRadio = (page: Page, name: '2D' | '3D') => page.getByTestId('global-mode-switch').getByRole('radio', { name });
async function ready(page: Page) { await expect(page.getByTestId('repo-switcher')).toBeVisible(); }
const noPageOverflow = (page: Page) => page.evaluate(() => {
  const layer = document.querySelector('[data-testid=page-layer]')!;
  return Math.max(document.documentElement.scrollWidth - innerWidth, document.getElementById('app-main')!.scrollWidth - document.getElementById('app-main')!.clientWidth, layer.scrollWidth - layer.clientWidth);
});

/** Stands in for the API shape from openapi.json, for failure paths a healthy server cannot produce on demand. Not evidence of integration. */
function contractStub(page: Page) {
  const manifest = { snapshot_id: 's1', files: [{ id: 'f1', snapshot_id: 's1', relative_path: 'pkg/loader.py', language: 'python', content_hash: 'x', size_bytes: 10, encoding: 'utf-8', analysis_status: 'ok' }] };
  return page.route(API, (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/health') return json({ status: 'ok', scope: 'phase-ii', schema_version: '1.0' });
    if (path === '/projects') return json([{ id: 'p1', name: 'stub-project' }]);
    if (path === '/projects/p1/snapshots') return json([{ id: 's1', project_id: 'p1', content_hash: 'h', created_at: '2026-10-01T00:00:00Z', source_kind: 'zip', origin: 'upload', commit_sha: null, manifest }]);
    if (path === '/snapshots/s1/manifest') return json(manifest);
    if (path === '/jobs/j1') return json({ id: 'j1', kind: 'analysis', snapshot_id: 's1', status: 'running', issues: [] });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }) });
  });
}

test.setTimeout(180000);
test.use({ actionTimeout: 30000 });

test.describe('routes and pages', () => {
  const pages: [string, string, string | null][] = [['Overview', '/app/overview', 'M3'], ['Codebase Explorer', '/app/explorer', 'M5'], ['Knowledge Graph', '/app/graph', 'M4'], ['Documentation Studio', '/app/docs', 'M5'], ['Documentation Intelligence', '/app/intelligence', 'M5'], ['Verification', '/app/verification', 'M5'], ['Exports', '/app/exports', 'M5'], ['Settings', '/app/settings', null], ['Help', '/app/help', null]];

  test('every destination exists, is reachable from the rail, and says plainly whether it is built', async ({ page }) => {
    const problems = collectConsole(page);
    await seed(page, { viz: '2d' });
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/overview$/);
    const rail = page.getByTestId('rail');
    for (const [label, path, milestone] of pages) {
      await rail.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(rail.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
      await expect(page).toHaveTitle(`${label} | CodeAtlas AI`);
      await expect(page.getByTestId('route-announcer')).toHaveText(`${label} page`);
      await expect(page.locator('[aria-current=page]')).toHaveCount(1);
      if (milestone) await expect(page.getByTestId('pending-badge').last()).toHaveText(`Page pending, milestone ${milestone}`);
      else await expect(page.getByTestId('pending-badge')).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });

  test('a route change moves focus to the new heading, and the old page leaves the DOM', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    await page.getByTestId('rail').getByRole('link', { name: 'Verification' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Verification' })).toBeFocused();
    await expect(page.getByTestId('page-layer')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('deep links, the browser back button and unknown routes all behave', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await page.getByTestId('rail').getByRole('link', { name: 'Help' }).click();
    await expect(page.getByTestId('help-page')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-page=graph]')).toBeVisible();
    await page.goto('/app/nothing-here');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a transition neither shifts the layout nor scrolls the document', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    await expect(page.getByTestId('topbar')).toBeVisible();
    const shift = await page.evaluate(() => new Promise<number>(resolve => {
      let total = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries() as unknown as { value: number }[]) total += entry.value; }).observe({ type: 'layout-shift', buffered: false });
      setTimeout(() => resolve(total), 900);
      document.querySelector<HTMLAnchorElement>('a[href="/app/help"]')!.click();
    }));
    expect(shift).toBeLessThan(.02);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('rail', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is 64 px, expands to 240 px over the page on hover, and shows hints', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    const rail = page.getByTestId('rail');
    const content = page.getByRole('heading', { level: 1 });
    await expect.poll(async () => (await rail.boundingBox())!.width).toBe(64);
    const before = (await content.boundingBox())!.x;
    await rail.hover();
    await expect(rail).toHaveAttribute('data-expanded', 'true');
    await expect.poll(async () => (await rail.boundingBox())!.width).toBe(240);
    expect((await content.boundingBox())!.x).toBe(before);
    await expect(rail.getByRole('link', { name: 'Documentation Intelligence' })).toContainText('G');
    const label = rail.getByRole('link', { name: 'Documentation Intelligence' }).locator('.rail-label');
    expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.mouse.move(900, 500);
    await expect(rail).toHaveAttribute('data-expanded', 'false');
    await expect.poll(async () => (await rail.boundingBox())!.width).toBe(64);
  });

  test('pinning makes room for the rail and survives a reload', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    const rail = page.getByTestId('rail');
    const content = page.getByRole('heading', { level: 1 });
    const before = (await content.boundingBox())!.x;
    await rail.getByRole('button', { name: 'Pin sidebar open' }).click();
    await expect(rail).toHaveAttribute('data-pinned', 'true');
    await expect.poll(async () => (await content.boundingBox())!.x).toBe(before + 176);
    await page.reload();
    await expect(page.getByTestId('rail')).toHaveAttribute('data-pinned', 'true');
    await expect.poll(async () => (await page.getByTestId('rail').boundingBox())!.width).toBe(240);
    await page.getByTestId('rail').getByRole('button', { name: 'Unpin sidebar' }).click();
    await page.mouse.move(900, 500);
    await expect.poll(async () => (await page.getByTestId('rail').boundingBox())!.width).toBe(64);
  });

  test('keyboard focus expands it', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    const rail = page.getByTestId('rail');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(rail.getByRole('link', { name: 'Overview' })).toBeFocused();
    await expect(rail).toHaveAttribute('data-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/overview$/);
  });

  test('the collapsed tooltip names the page and its shortcut', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    /** Recorded by the page as it appears: on software GL the rail expands, replacing the tooltip, faster than a test can poll. */
    await page.evaluate(() => {
      const seen: string[][] = [];
      (window as unknown as { tooltips: string[][] }).tooltips = seen;
      new MutationObserver(() => {
        const element = document.querySelector('.rail-tooltip');
        if (element) seen.push([element.firstChild?.textContent ?? '', [...element.querySelectorAll('kbd')].map(key => key.textContent).join(' ')]);
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.locator('.rail-link[href="/app/graph"]').hover();
    const tip = page.locator('.rail-tooltip');
    await expect.poll(() => page.evaluate(() => (window as unknown as { tooltips: string[][] }).tooltips[0] ?? null)).toEqual(['Knowledge Graph', 'G K']);
    await expect(page.getByTestId('rail')).toHaveAttribute('data-expanded', 'true');
    await expect(tip).toHaveCount(0);
  });
});

test.describe('top bar in Demo', () => {
  test('shows the specified repository, labeled as demo data, and every control works', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await expect(page.getByTestId('repo-switcher')).toContainText('shopflow-api');
    await expect(page.getByTestId('repo-meta')).toContainText('main');
    await expect(page.getByTestId('repo-meta')).toContainText('a3f9c21');
    await expect(page.getByTestId('repo-meta')).toContainText('Python');
    await expect(page.getByTestId('analysis-status')).toContainText('Analysis complete');
    await expect(page.getByTestId('analysis-status')).toContainText('demo');
    await expect(page.getByTestId('data-mode')).toContainText('Demo data');
    await expect(page.getByTestId('status-strip')).toContainText('Demo data, illustrative');

    await page.getByTestId('repo-switcher').getByRole('button').click();
    await expect(page.getByRole('menuitemradio', { name: /shopflow-api/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('repo-switcher').getByRole('button')).toBeFocused();

    const snapshot = page.getByTestId('snapshot-selector').getByRole('button');
    await snapshot.click();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio', { name: /baseline/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(snapshot).toContainText('v2.3.0');

    await page.getByTestId('notifications').getByRole('button').first().click();
    await expect(page.getByRole('dialog', { name: /Notifications/ })).toContainText('205 unsupported claims');
    await expect(page.getByRole('dialog', { name: /Notifications/ })).toContainText('Illustrative');
    await page.mouse.click(700, 600);
    await expect(page.getByRole('dialog', { name: /Notifications/ })).toHaveCount(0);

    await page.getByTestId('user-menu').getByRole('button').click();
    await expect(page.getByRole('menu', { name: 'Session menu' })).toContainText('no user accounts');
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/settings$/);
  });
});

test.describe('command palette', () => {
  test('opens with Ctrl+K, navigates with the keyboard, closes with Esc and returns focus', async ({ page }) => {
    const problems = collectConsole(page);
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    const entry = page.getByTestId('search-entry');
    await entry.focus();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    await expect(entry).toBeFocused();

    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('verif');
    const row = palette(page).getByRole('option', { name: /^Verification/ });
    await expect(row).toBeVisible();
    await expect(row.locator('mark')).toHaveText('Verif');
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toHaveCount(0);
    await expect(page).toHaveURL(/verification$/);

    await page.getByTestId('search-entry').click();
    await expect(palette(page)).toBeVisible();
    await paletteInput(page).fill('zzzzqq');
    await expect(page.getByTestId('palette-empty')).toContainText('zzzzqq');
    await paletteInput(page).fill('');
    await expect(palette(page).getByRole('option', { name: /^Overview/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(palette(page).getByRole('option', { name: /^Codebase Explorer/ })).toHaveAttribute('aria-selected', 'true');
    expect(problems).toEqual([]);
  });

  test('searches files and symbols through the adapter, and opens the target honestly', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('app/services/orders');
    const file = palette(page).getByRole('option', { name: /app\/services\/orders\.py/ });
    await expect(file).toBeVisible();
    await expect(file.locator('mark')).toHaveText('app/services/orders');
    await expect(palette(page).getByText('Files, Demo fixture')).toBeVisible();
    await file.click();
    await expect(page).toHaveURL(/explorer\?path=app%2Fservices%2Forders\.py$/);
    await expect(page.getByTestId('requested-target')).toContainText('app/services/orders.py');
    await expect(page.getByTestId('requested-target')).toContainText('until M5');

    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('OrderService');
    const symbol = palette(page).getByRole('option', { name: /OrderService/ }).first();
    await expect(symbol).toBeVisible();
    await expect(palette(page).getByText('Symbols, Demo fixture')).toBeVisible();
  });

  test('runs actions: chart mode, data source, pin, shortcuts and repository selection', async ({ page }) => {
    await seed(page, { viz: '3d' });
    await page.goto('/app/help');
    await ready(page);
    const run = async (query: string, name: RegExp) => { await page.keyboard.press('Control+k'); await paletteInput(page).fill(query); await palette(page).getByRole('option', { name }).click(); await expect(palette(page)).toHaveCount(0); };
    await run('2D', /Show all charts in 2D/);
    await expect(globalRadio(page, '2D')).toBeChecked();
    await run('pin', /Pin the sidebar open/);
    await expect(page.getByTestId('rail')).toHaveAttribute('data-pinned', 'true');
    await run('shopflow', /^shopflow-api/);
    await run('keyboard', /Show keyboard shortcuts/);
    await expect(page.getByTestId('shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts')).toHaveCount(0);
    await run('live', /Switch to the Live backend/);
    await expect(page.getByTestId('data-mode')).toContainText('Live');
  });

  test('keeps focus inside while open', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await page.keyboard.press('Control+k');
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=command-palette]'))).toBe(true);
    }
  });
});

test.describe('shortcuts', () => {
  test('? and g sequences work, stay out of inputs and charts, and can be turned off', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await page.keyboard.press('Shift+?');
    await expect(page.getByTestId('shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await page.keyboard.press('k');
    await expect(page).toHaveURL(/graph$/);
    await page.keyboard.press('[');
    await expect(page.getByTestId('rail')).toHaveAttribute('data-pinned', 'true');
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect(page).toHaveURL(/settings$/);

    await page.getByTestId('settings-data-mode').getByRole('radio', { name: 'Live backend' }).click();
    const field = page.getByTestId('api-key');
    await field.focus();
    await page.keyboard.type('gh');
    await expect(page).toHaveURL(/settings$/);
    await page.getByTestId('settings-data-mode').getByRole('radio', { name: 'Demo data' }).click();

    await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    await expect(page).toHaveURL(/settings$/);
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
  });
});

test.describe('global visualization mode', () => {
  test('the top bar drives the shared store, persists across routes and reloads, and overrides still work', async ({ page }) => {
    await seed(page, { viz: '3d' });
    await page.goto('/app/overview');
    const body = page.locator('[data-chart="shell-claims"]');
    await expect(body).toHaveAttribute('data-mode', '3d');
    await expect(body.locator('canvas.viz-canvas-3d')).toBeVisible();
    await globalRadio(page, '2D').click();
    await expect(body).toHaveAttribute('data-mode', '2d');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.globalMode, VIZ)).toBe('2d');
    await page.getByTestId('rail').getByRole('link', { name: 'Settings' }).click();
    const settings = page.getByTestId('settings-viz');
    await expect(settings.getByRole('radio', { name: '2D' })).toBeChecked();
    await settings.getByRole('radio', { name: '3D' }).click();
    await expect(globalRadio(page, '3D')).toBeChecked();
    await globalRadio(page, '2D').click();
    await page.reload();
    await expect(globalRadio(page, '2D')).toBeChecked();
    await page.getByTestId('rail').getByRole('link', { name: 'Overview' }).click();
    await expect(page.locator('[data-chart="shell-claims"]')).toHaveAttribute('data-mode', '2d');
    await page.locator('[data-chart="shell-claims"]').getByRole('radio', { name: '3D' }).click();
    await expect(page.locator('[data-chart="shell-claims"]')).toHaveAttribute('data-mode', '3d');
    await expect(globalRadio(page, '2D')).toBeChecked();
    await globalRadio(page, '3D').click();
    await globalRadio(page, '2D').click();
    await expect(page.locator('[data-chart="shell-claims"]')).toHaveAttribute('data-mode', '2d');
  });

  test('without WebGL the shell falls back to 2D and three.js never loads', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) { return /webgl/.test(type) ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest); } as typeof original; });
    await seed(page);
    await page.goto('/app/overview');
    await expect(page.locator('[data-chart="shell-claims"]')).toHaveAttribute('data-mode', '2d');
    await expect(globalRadio(page, '3D')).toBeDisabled();
    await expect(page.getByTestId('status-strip')).toContainText('GPU none');
    expect(requests.filter(url => /ThreeDChartRenderer|node_modules\/three/.test(url))).toEqual([]);
  });
});

test.describe('Live with no backend', () => {
  test('says the backend is unreachable, shows no demo data, and never downloads the fixture', async ({ page }) => {
    const problems = collectConsole(page);
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.route(API, route => route.abort());
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/overview');
    await expect(page.getByTestId('data-mode')).toContainText('Live');
    await expect(page.getByTestId('topbar').getByRole('alert')).toContainText('Backend unreachable', { timeout: 20000 });
    await expect(page.getByTestId('analysis-status')).toContainText('No repository');
    await expect(page.getByTestId('snapshot-selector')).toContainText('No snapshot');
    await expect(page.getByTestId('readiness-getOverview()')).toHaveAttribute('data-state', /needs-job|unreachable/, { timeout: 20000 });
    await expect(page.getByTestId('shell-chart')).toContainText(/Analysis job required|could not load/, { timeout: 20000 });
    await expect(page.getByTestId('notifications').getByRole('button').first()).toHaveAttribute('aria-label', 'Notifications');

    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/shopflow|3,912|3912|1,386|a3f9c21|Illustrative|Demo data/);
    expect(requests.filter(url => /shopflow/.test(url))).toEqual([]);

    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('orders');
    await expect(page.getByTestId('palette-no-scope')).toBeVisible();
    await expect(palette(page).getByRole('option', { name: /orders\.py/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByTestId('rail').getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('connection')).toHaveAttribute('data-state', 'unreachable', { timeout: 20000 });
    await expect(page.getByTestId('connection')).toContainText('Demo data is not used in its place');
    expect(problems).toEqual([]);
  });

  test('a bare proxy 500 reads as unreachable, retry recovers, and selection returns only from the backend', async ({ page }) => {
    let healthy = false;
    await page.route(API, route => healthy ? route.fallback() : route.fulfill({ status: 500, body: '' }));
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/help');
    const alert = page.getByTestId('topbar').getByRole('alert');
    await expect(alert).toContainText('Backend unreachable', { timeout: 20000 });
    await contractStub(page);
    healthy = true;
    await page.unroute(API);
    await contractStub(page);
    await alert.getByRole('button', { name: 'Retry loading repositories' }).click();
    await expect(page.getByTestId('repo-switcher')).toContainText('stub-project');
  });

  test('switching to Demo is an explicit choice, and returning to Live does not keep demo data', async ({ page }) => {
    await page.route(API, route => route.abort());
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/help');
    await expect(page.getByTestId('topbar').getByRole('alert')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('data-mode').getByRole('button').click();
    await page.getByRole('menuitemradio', { name: /Demo data/ }).click();
    await expect(page.getByTestId('repo-switcher')).toContainText('shopflow-api');
    await page.getByTestId('data-mode').getByRole('button').click();
    await page.getByRole('menuitemradio', { name: /Live backend/ }).click();
    await expect(page.getByTestId('repo-switcher')).toHaveCount(0);
    await expect(page.getByTestId('topbar')).not.toContainText('shopflow-api');
    await expect(page.getByTestId('topbar').getByRole('alert')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Live with a contract stub', () => {
  test('uses the API shape, and marks what is missing rather than filling it in', async ({ page }) => {
    await contractStub(page);
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/overview');
    await expect(page.getByTestId('repo-switcher')).toContainText('stub-project');
    await expect(page.getByTestId('repo-meta')).toContainText('branch not recorded');
    await expect(page.getByTestId('repo-meta')).toContainText('no commit');
    await expect(page.getByTestId('analysis-status')).toContainText('No analysis job');
    await expect(page.getByTestId('snapshot-selector')).toContainText('zip snapshot, 2026-10-01');
    await expect(page.getByTestId('readiness-getOverview()')).toHaveAttribute('data-state', 'needs-job');
    await expect(page.getByTestId('shell-chart')).toContainText('Analysis job required');
    await page.getByTestId('notifications').getByRole('button').first().click();
    await expect(page.getByTestId('notifications-unavailable')).toContainText('Integration pending');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('loader');
    await expect(palette(page).getByRole('option', { name: /pkg\/loader\.py/ })).toBeVisible();
    await expect(page.getByTestId('palette-symbols-unavailable')).toContainText('needs a completed analysis job');
    await page.keyboard.press('Escape');

    await page.getByTestId('rail').getByRole('link', { name: 'Verification' }).click();
    await expect(page.getByTestId('readiness-getClaims()')).toHaveAttribute('data-state', 'pending');
    await page.getByTestId('rail').getByRole('link', { name: 'Settings' }).click();
    await page.getByTestId('job-id').fill('j1');
    await expect(page.getByTestId('analysis-status')).toContainText('Analysis running');
    await expect(page.locator('body')).not.toContainText('shopflow');
  });

  test('an API key stays out of storage', async ({ page }) => {
    await contractStub(page);
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/settings');
    await page.getByTestId('api-key').fill('very-secret-key');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stored).not.toContain('very-secret-key');
  });
});

test.describe('real backend', () => {
  test.skip(!LIVE_REAL, 'Set CODEATLAS_LIVE_BACKEND=1 with the backend running. Skipped runs are not integration evidence.');

  test('reads a repository, files and symbols from the running API, through the proxy', async ({ page, request }) => {
    const projects = await (await request.get('/api/v1/projects')).json();
    expect(projects.length).toBeGreaterThan(0);
    const snapshots = await (await request.get(`/api/v1/projects/${projects[0].id}/snapshots`)).json();
    const created = await (await request.post(`/api/v1/snapshots/${snapshots[0].id}/analysis`, { data: {} })).json();
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/settings');
    await expect(page.getByTestId('connection')).toContainText('Backend reachable');
    await expect(page.getByTestId('repo-switcher')).toContainText(projects[0].name);
    await page.getByTestId('job-id').fill(created.id);
    await expect(page.getByTestId('analysis-status')).toContainText('Analysis complete');
    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('live_sample');
    await expect(palette(page).getByRole('option', { name: /live_sample\.py/ })).toBeVisible();
    await paletteInput(page).fill('compute_total');
    await expect(palette(page).getByRole('option', { name: /compute_total/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('rail').getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByTestId('readiness-getOverview()')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('readiness-getOverview()')).toContainText('From the backend');
    await expect(page.getByTestId('shell-chart')).toContainText('Claims integration pending');
    await page.getByTestId('rail').getByRole('link', { name: 'Knowledge Graph' }).click();
    await expect(page.getByTestId('readiness-getGraph()')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('body')).not.toContainText('shopflow');
  });
});

test.describe('independent scrolling', () => {
  test.use({ viewport: { width: 1440, height: 800 } });

  test('panels scroll on their own, stay reachable by keyboard, and do not chain into the page', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await expect(page.getByTestId('help-page')).toBeVisible();
    const panels = page.locator('[data-scroll-region]');
    const heights = await panels.evaluateAll(items => items.map(item => item.scrollHeight > item.clientHeight + 1));
    expect(heights.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const index = heights.indexOf(true);
    const region = panels.nth(index);
    await expect(region).toHaveAttribute('tabindex', '0');
    await region.hover();
    await page.mouse.wheel(0, 150);
    await expect.poll(() => region.evaluate(item => item.scrollTop)).toBeGreaterThan(0);
    const others = await panels.evaluateAll((items, skip) => items.filter((_, i) => i !== skip).map(item => item.scrollTop), index);
    expect(others.every(value => value === 0)).toBe(true);
    await page.mouse.wheel(0, 9000);
    await page.waitForTimeout(150);
    expect(await page.getByTestId('page-layer').evaluate(item => item.scrollTop)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await region.focus();
    const before = await region.evaluate(item => item.scrollTop);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => region.evaluate(item => item.scrollTop)).toBeLessThan(before);
  });

  test('auto-scroll advances when idle, pauses on hover and on request, and resumes', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const panel = page.getByTestId('activity-panel');
    const body = panel.locator('[data-scroll-region]');
    await expect(panel).toHaveAttribute('data-autoscroll', 'running', { timeout: 15000 });
    const position = () => body.evaluate(item => item.scrollTop);
    const start = await position();
    await expect.poll(position).toBeGreaterThan(start);
    await body.hover();
    await expect(panel).toHaveAttribute('data-autoscroll', 'paused');
    const held = await position();
    await page.waitForTimeout(500);
    expect(await position()).toBe(held);
    await page.mouse.move(600, 300);
    await expect(panel).toHaveAttribute('data-autoscroll', 'running');
    await panel.getByRole('button', { name: 'Pause auto-scroll' }).click();
    await page.mouse.move(600, 300);
    await expect(panel).toHaveAttribute('data-autoscroll', 'paused');
    await expect(panel.getByRole('button', { name: 'Resume auto-scroll' })).toHaveAttribute('aria-pressed', 'true');
    const stopped = await position();
    await page.waitForTimeout(500);
    expect(await position()).toBe(stopped);
  });

  test('the panel under the chart stays put when the chart data arrives', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const chart = page.getByTestId('shell-chart');
    const body = page.getByTestId('activity-panel').locator('[data-scroll-region]');
    await expect(chart).toHaveAttribute('data-loading', 'true');
    const top = () => body.evaluate(item => item.getBoundingClientRect().top);
    const before = await top();
    await expect(chart).not.toHaveAttribute('data-loading', 'true', { timeout: 15000 });
    await expect(chart.locator('.viz-stage-3d, .viz-stage-2d').first()).toBeVisible();
    await page.waitForTimeout(400);
    // The reservation is the taller 3D card. A 2D card is 19 px shorter, against a 137 px jump with no reservation.
    expect(Math.abs(await top() - before)).toBeLessThan(24);
  });

  test('the background moves at a different rate from a scrolling page', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    const layer = page.getByTestId('page-layer');
    await expect(page.getByTestId('help-page')).toBeVisible();
    await layer.evaluate(item => { item.scrollTop = 300; });
    await expect.poll(() => page.locator('.app-world-layer').evaluate(item => item.style.transform)).toContain('-18');
  });
});

test.describe('short windows', () => {
  test('nothing is clipped: the page scrolls to every panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 560 });
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const activity = page.getByTestId('activity-panel');
    await activity.scrollIntoViewIfNeeded();
    await expect(activity).toBeInViewport();
    await expect(page.getByTestId('page-layer').getByText('Verified app.', { exact: false }).last()).toBeAttached();
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('stops loops and auto-scroll, removes transforms, and starts charts in 2D', async ({ page }) => {
    await seed(page);
    await page.goto('/app/overview');
    await expect(page.locator('[data-chart="shell-claims"]')).toHaveAttribute('data-mode', '2d');
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    expect(await page.locator('.app-orb').first().evaluate(item => getComputedStyle(item).animationName)).toBe('none');
    await expect(page.getByTestId('activity-panel')).toHaveAttribute('data-autoscroll', 'off');
    await page.getByTestId('rail').getByRole('link', { name: 'Help' }).click();
    await expect(page.getByTestId('help-page')).toBeVisible();
    await expect(page.getByTestId('page-layer')).toHaveCount(1);
    expect(await page.getByTestId('page-layer').evaluate(item => getComputedStyle(item).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    expect(await page.getByTestId('rail').evaluate(item => getComputedStyle(item).transitionDuration)).toMatch(/^0s/);
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    expect(await palette(page).locator('[cmdk-item]').first().evaluate(item => getComputedStyle(item).animationName)).toBe('none');
  });

  test('the Settings override applies to the whole shell', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/settings');
    await page.getByTestId('settings-motion').getByRole('radio', { name: 'Full' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
    await page.getByTestId('settings-motion').getByRole('radio', { name: 'Reduce' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  });
});

test.describe('responsive', () => {
  for (const [width, height, kind] of [[1920, 1080, 'rail'], [1440, 900, 'rail'], [1024, 768, 'rail'], [800, 1024, 'rail'], [768, 1024, 'drawer'], [390, 844, 'drawer'], [320, 640, 'drawer']] as const) {
    test(`${width} px: no sideways overflow, navigation reachable, every top bar control on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await seed(page, { viz: '2d' });
      for (const path of ['/app/overview', '/app/settings', '/app/help', '/app/graph']) {
        await page.goto(path);
        await ready(page);
        await page.waitForTimeout(150);
        expect(await noPageOverflow(page), `${path} overflow`).toBeLessThanOrEqual(0);
        for (const id of ['repo-switcher', 'search-entry', 'analysis-status', 'snapshot-selector', 'data-mode', 'global-mode-switch', 'notifications', 'user-menu']) {
          const box = await page.getByTestId(id).boundingBox();
          expect(box, `${id} visible`).not.toBeNull();
          expect(box!.x, `${id} left`).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width, `${id} right`).toBeLessThanOrEqual(width);
        }
      }
      if (kind === 'rail') {
        await expect(page.getByTestId('rail')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
      } else {
        await expect(page.getByTestId('rail')).toBeHidden();
        const trigger = page.getByRole('button', { name: 'Open navigation' });
        await trigger.click();
        const drawer = page.getByTestId('nav-drawer');
        await expect(drawer.getByRole('link', { name: 'Documentation Intelligence' })).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Navigation' }).getByRole('button', { name: 'Close navigation' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByTestId('nav-drawer').getByRole('link', { name: 'Help' }).click();
        await expect(page).toHaveURL(/help$/);
        await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
      }
    });
  }

  test('below 1024 px panels stack into one page scroll, with no nested scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    const page_ = page.getByTestId('page-layer');
    await expect(page.getByTestId('help-page')).toBeVisible();
    await expect.poll(() => page_.evaluate(item => item.scrollHeight > item.clientHeight)).toBe(true);
    const nested = await page.locator('[data-scroll-region]').evaluateAll(items => items.filter(item => getComputedStyle(item).overflowY !== 'visible').length);
    expect(nested).toBe(0);
    await page.getByTestId('rail').getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByTestId('activity-panel')).toHaveAttribute('data-autoscroll', 'off');
  });

  test('the popup menus stay on screen on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    for (const id of ['repo-switcher', 'snapshot-selector', 'data-mode', 'notifications', 'user-menu']) {
      await page.getByTestId(id).getByRole('button').first().click();
      const box = (await page.locator('.popover').boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(390);
      expect(box.y + box.height, id).toBeLessThanOrEqual(844);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('accessibility', () => {
  const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`);

  for (const width of [1440, 390]) {
    test(`${width} px: axe finds nothing on any page, in Demo`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seed(page, { viz: '2d' });
      for (const path of ['overview', 'explorer', 'graph', 'docs', 'intelligence', 'verification', 'exports', 'settings', 'help']) {
        await page.goto(`/app/${path}`);
        await ready(page);
        await page.waitForTimeout(1400);
        expect(await axe(page), path).toEqual([]);
      }
    });
  }

  test('axe finds nothing in overlays, open menus, the drawer, or Live failure states', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await page.keyboard.press('Control+k');
    await paletteInput(page).fill('order');
    await page.waitForTimeout(400);
    expect(await axe(page), 'palette').toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(300);
    expect(await axe(page), 'shortcuts').toEqual([]);
    await page.keyboard.press('Escape');
    for (const id of ['repo-switcher', 'data-mode', 'notifications', 'user-menu']) {
      await page.getByTestId(id).getByRole('button').first().click();
      await page.waitForTimeout(200);
      expect(await axe(page), id).toEqual([]);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.waitForTimeout(350);
    expect(await axe(page), 'drawer').toEqual([]);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(API, route => route.abort());
    await page.getByTestId('data-mode').getByRole('button').click();
    await page.getByRole('menuitemradio', { name: /Live backend/ }).click();
    await expect(page.getByTestId('topbar').getByRole('alert')).toBeVisible({ timeout: 20000 });
    expect(await axe(page), 'live failure').toEqual([]);
    await page.goto('/app/settings');
    await expect(page.getByTestId('connection')).toHaveAttribute('data-state', 'unreachable', { timeout: 20000 });
    expect(await axe(page), 'live settings').toEqual([]);
  });

  test('the skip link moves focus to the page heading', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('every shell icon button has a name, and focus rings are visible', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/help');
    await ready(page);
    const unnamed = await page.locator('.shell button, .shell a').evaluateAll(items => items.filter(item => !(item.getAttribute('aria-label') || item.textContent?.trim())).length);
    expect(unnamed).toBe(0);
    await page.getByTestId('search-entry').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page.getByTestId('search-entry').evaluate(item => getComputedStyle(item).outlineStyle);
    expect(outline).toBe('solid');
  });
});
