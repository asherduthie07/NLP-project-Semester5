import { expect, test, type Page } from '@playwright/test';
import { analysisStub, API, axe, collectConsole, expectNoDemo, noOverflow, seed } from './helpers';

test.setTimeout(180000);
test.use({ actionTimeout: 30000, viewport: { width: 1440, height: 900 } });

type Hook = { stats: () => { nodes: number; edges: number; fps: number | null; labels: number } | null; locate: (id: string) => { x: number; y: number } | null; mode: () => string | null; nodes: () => string[]; drift: (on: boolean) => void; resetStats: () => void };
/** Runs `run` in the page against the graph's measurement hook. */
const hook = <T,>(page: Page, run: (graph: Hook) => T) => page.evaluate(`(${run.toString()})(window.__codeatlasGraph)`) as Promise<T>;

/** The renderer is ready when the hook exists and the layout has settled. */
async function settled(page: Page, mode: '2d' | '3d') {
  await expect(page.getByTestId('graph-canvas')).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __codeatlasGraph?: Hook }).__codeatlasGraph?.mode() ?? null), { timeout: 30000 }).toBe(mode);
  await expect(page.getByTestId('graph-progress')).toHaveCount(0, { timeout: 60000 });
}

/** A node that is drawn on screen and not under an overlay, found through the page's measurement hook. */
async function visibleNode(page: Page, prefer?: string) {
  return page.evaluate(preferred => {
    const graph = (window as unknown as { __codeatlasGraph: Hook }).__codeatlasGraph;
    const stage = document.querySelector('[data-testid=graph-stage]')!.getBoundingClientRect();
    const blocked = [...document.querySelectorAll('.graph-toolbar, .graph-counters, .graph-minimap, .graph-inspector, .graph-notice')].map(element => element.getBoundingClientRect());
    const ids = preferred ? [preferred, ...graph.nodes()] : graph.nodes();
    for (const id of ids) {
      const point = graph.locate(id);
      if (!point || point.x < stage.left + 30 || point.x > stage.right - 30 || point.y < stage.top + 60 || point.y > stage.bottom - 30) continue;
      if (blocked.some(box => point.x > box.left - 12 && point.x < box.right + 12 && point.y > box.top - 12 && point.y < box.bottom + 12)) continue;
      const element = document.elementFromPoint(point.x, point.y);
      if (element?.getAttribute('data-testid') !== 'graph-canvas') continue;
      return { id, ...point };
    }
    return null;
  }, prefer ?? null);
}

test.describe('Knowledge Graph in Demo, 2D', () => {
  test('renders 600+ nodes in 6 to 8 clusters with every control, labeled as demo data', async ({ page }) => {
    const problems = collectConsole(page);
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await expect(page.getByRole('heading', { level: 1, name: /Knowledge Graph, 703 nodes, 1,266 edges/ })).toBeVisible();
    await expect(page.getByTestId('graph-page')).toContainText('Demo, illustrative');
    const clusters = page.getByTestId('cluster-filter');
    expect(await clusters.count()).toBeGreaterThanOrEqual(6);
    expect(await clusters.count()).toBeLessThanOrEqual(8);
    const stats = await hook(page, graph => graph.stats());
    expect(stats!.nodes).toBe(703);
    expect(stats!.edges).toBe(1266);
    expect(stats!.labels).toBeGreaterThan(0);
    for (const name of ['Imports', 'Inheritance', 'Calls', 'Contains']) await expect(page.getByLabel(name)).toBeChecked();
    for (const name of ['Cluster hulls', 'Labels', 'Fade unselected', 'Performance mode']) await expect(page.getByRole('switch', { name })).toBeVisible();
    await expect(page.getByRole('slider', { name: /Repulsion/ })).toBeVisible();
    for (const name of ['Zoom in', 'Zoom out', 'Reset view (R)', 'Focus on selection (F)', 'Save screenshot (S)', 'Light canvas', 'Fullscreen']) await expect(page.getByRole('button', { name })).toBeVisible();
    await expect(page.getByTestId('graph-minimap')).toBeVisible();
    await expect(page.getByTestId('graph-counters')).toContainText('703');
    /** Pixels are actually drawn: the canvas is not a single flat color. */
    const distinct = await page.getByTestId('graph-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 97) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return colors.size;
    });
    expect(distinct).toBeGreaterThan(20);
    expect(await axe(page)).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('search highlights matches and flies to a node; the inspector shows facts, relationships and source', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    const search = page.getByTestId('graph-search');
    await search.fill('OrderModel');
    await expect(page.getByTestId('graph-search-count')).toContainText('matches highlighted');
    await expect(page.getByRole('listbox', { name: 'Matching nodes' })).toBeVisible();
    await search.press('Enter');
    const inspector = page.getByTestId('graph-inspector');
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('OrderModel');
    await expect(inspector).toContainText('class');
    await expect(inspector).toContainText('Cluster');
    await expect(inspector).toContainText('.py:');
    await expect(inspector.getByTestId('graph-snippet')).toContainText('class OrderModel', { timeout: 10000 });
    const explorer = inspector.getByRole('link', { name: 'Open in Explorer' });
    await expect(explorer).toHaveAttribute('href', /\/app\/explorer\?path=.+\.py&line=\d+/);
    await expect(page.getByTestId('graph-announcer')).toContainText('Selected OrderModel');
    /** A relationship chip moves the selection to that node. */
    const relation = inspector.locator('.graph-relations button').first();
    const target = (await relation.innerText()).split('\n')[0];
    await relation.click();
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(target);
    await inspector.press('Escape');
    await expect(inspector).toHaveCount(0);
  });

  test('filters change what is drawn: edge types, clusters, color by, hulls, labels', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await page.getByLabel('Contains').uncheck();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.edges).toBe(1266 - 489);
    await page.getByLabel('Contains').check();
    const first = page.getByTestId('cluster-filter').first();
    const size = Number((await first.locator('.graph-count').innerText()).replace(/,/g, ''));
    await first.locator('input').uncheck();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.nodes).toBe(703 - size);
    await first.locator('input').check();
    const kind = page.getByTestId('kind-filter').filter({ hasText: 'class' });
    const classes = Number((await kind.locator('.graph-count').innerText()).replace(/,/g, ''));
    await kind.locator('input').uncheck();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.nodes).toBe(703 - classes);
    await kind.locator('input').check();
    await page.getByRole('button', { name: 'Hide all' }).click();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.nodes).toBe(0);
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.nodes).toBe(703);
    await page.getByRole('radio', { name: 'Language' }).click();
    await expect(page.locator('.graph-legend')).toContainText('Python');
    await page.getByRole('radio', { name: 'Doc coverage' }).click();
    await expect(page.getByTestId('coverage-legend')).toContainText('0% documented');
    await page.getByRole('switch', { name: 'Labels' }).click();
    await expect.poll(async () => (await hook(page, graph => graph.stats()))!.labels).toBe(0);
    await page.getByRole('switch', { name: 'Cluster hulls' }).click();
    await expect(page.getByRole('switch', { name: 'Cluster hulls' })).toHaveAttribute('aria-checked', 'false');
  });

  test('pointer: hover tooltip, click to select, double-click to focus, drag a node, wheel zoom', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(800);
    const node = await visibleNode(page);
    expect(node).not.toBeNull();
    await page.mouse.move(node!.x, node!.y);
    await expect(page.getByTestId('graph-tooltip')).toBeVisible();
    await page.mouse.click(node!.x, node!.y);
    await expect(page.getByTestId('graph-inspector')).toBeVisible();
    /** The inspector now covers part of the stage, so the double-click target is found again. */
    const target = await visibleNode(page, node!.id);
    await page.mouse.dblclick(target!.x, target!.y);
    await expect(page.getByRole('button', { name: 'Focus on selection (F)' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(900);
    /** Dragging moves the node with the pointer. */
    const grab = await visibleNode(page, target!.id);
    await page.mouse.move(grab!.x, grab!.y);
    await page.mouse.down();
    await page.mouse.move(grab!.x + 60, grab!.y + 40, { steps: 8 });
    const moved = await page.evaluate(id => (window as unknown as { __codeatlasGraph: Hook }).__codeatlasGraph.locate(id), grab!.id);
    await page.mouse.up();
    expect(Math.hypot(moved!.x - grab!.x - 60, moved!.y - grab!.y - 40)).toBeLessThan(6);
    /** Wheel zoom changes how far apart two nodes are drawn. */
    const [a, b] = await page.evaluate(() => (window as unknown as { __codeatlasGraph: Hook }).__codeatlasGraph.nodes().slice(0, 2));
    const distance = () => page.evaluate(([x, y]) => { const g = (window as unknown as { __codeatlasGraph: Hook }).__codeatlasGraph; const p = g.locate(x), q = g.locate(y); return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : null; }, [a, b]);
    await page.getByRole('button', { name: 'Reset view (R)' }).click();
    await page.waitForTimeout(900);
    const before = await distance();
    const box = (await page.getByTestId('graph-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    expect((await distance())!).toBeGreaterThan(before! * 1.3);
  });

  test('shortcuts S, R and F act on the graph, and yield to typing and to G sequences', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await page.getByTestId('graph-search').fill('OrderModel');
    await page.getByTestId('graph-search').press('Enter');
    await expect(page.getByTestId('graph-inspector')).toBeVisible();
    /** Typing S in the search box does not take a screenshot. */
    await page.getByTestId('graph-search').press('s');
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.getByRole('heading', { level: 1 }).focus();
    const download = page.waitForEvent('download');
    await page.keyboard.press('s');
    const file = await download;
    expect(file.suggestedFilename()).toBe('codeatlas-graph-demo-2d.png');
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Focus on selection (F)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Focus on selection (F)' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('r');
    await expect(page.getByTestId('graph-announcer')).toHaveText('View reset');
    /** G then S is the shell's route to Settings, not a screenshot. */
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect(page).toHaveURL(/\/app\/settings$/);
    expect(downloads).toBe(0);
  });

  test('the light canvas theme is remembered, and no layout overflows at 1024 and 390 px', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await page.getByTestId('graph-theme').click();
    await expect(page.getByTestId('graph-workspace')).toHaveAttribute('data-graph-theme', 'light');
    const background = await page.getByTestId('graph-canvas').evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(2, canvas.height - 2, 1, 1).data].slice(0, 3));
    expect(background[0]).toBeGreaterThan(200);
    await page.reload();
    await settled(page, '2d');
    await expect(page.getByTestId('graph-workspace')).toHaveAttribute('data-graph-theme', 'light');
    for (const [width, height] of [[1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      expect(await noOverflow(page), `${width} overflow`).toBeLessThanOrEqual(0);
      const stage = (await page.getByTestId('graph-stage').boundingBox())!;
      const frame = (await page.locator('.graph-page').boundingBox())!;
      expect(stage.width).toBeGreaterThan(frame.width - 60);
      expect(stage.height).toBeGreaterThanOrEqual(400);
    }
    expect(await axe(page)).toEqual([]);
  });

  test('reduced motion: the layout settles off screen and then draws once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page);
    await page.goto('/app/graph');
    await settled(page, '2d');
    await expect(page.getByTestId('graph-mode').getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true');
    expect((await hook(page, graph => graph.stats()))!.nodes).toBe(703);
    await page.waitForTimeout(600);
    expect((await hook(page, graph => graph.stats()))!.fps).toBeNull();
  });

  test('a synthetic benchmark graph is labeled as such and never offered in Live', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/graph?bench=1500');
    await settled(page, '2d');
    await expect(page.getByTestId('graph-synthetic')).toHaveText('Synthetic benchmark, not a repository');
    expect((await hook(page, graph => graph.stats()))!.nodes).toBe(1500);
  });
});

test.describe('Knowledge Graph in Demo, 3D', () => {
  test('renders with instancing, selects through search, saves a screenshot, and switches to 2D and back', async ({ page }) => {
    const problems = collectConsole(page);
    await seed(page, { viz: '3d' });
    await page.goto('/app/graph');
    await settled(page, '3d');
    const stats = await hook(page, graph => graph.stats());
    expect(stats!.nodes).toBe(703);
    expect(stats!.edges).toBe(1266);
    await expect(page.locator('.graph-label').first()).toBeVisible();
    await page.getByTestId('graph-search').fill('OrderModel');
    await page.getByTestId('graph-search').press('Enter');
    await expect(page.getByTestId('graph-inspector').getByRole('heading', { level: 2 })).toHaveText('OrderModel');
    await page.waitForTimeout(900);
    const node = await visibleNode(page);
    expect(node).not.toBeNull();
    await page.mouse.move(node!.x, node!.y);
    await expect(page.getByTestId('graph-tooltip')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save screenshot (S)' }).click();
    expect((await download).suggestedFilename()).toBe('codeatlas-graph-demo-3d.png');
    /** Orbiting needs frames, and the HUD reports them while the camera moves. */
    await hook(page, graph => graph.drift(true));
    await expect(page.getByTestId('graph-fps')).toHaveText(/^\d+$/, { timeout: 5000 });
    await hook(page, graph => graph.drift(false));
    await page.getByTestId('graph-mode').getByRole('radio', { name: '2D' }).click();
    await settled(page, '2d');
    await page.getByTestId('graph-mode').getByRole('radio', { name: '3D' }).click();
    await settled(page, '3d');
    expect(await axe(page)).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe('Knowledge Graph in Live', () => {
  test('with a completed job, draws the measured graph with directory clusters and no demo content', async ({ page }) => {
    await analysisStub(page);
    await seed(page, { data: 'live', viz: '2d', jobId: 'j1' });
    await page.goto('/app/graph');
    await settled(page, '2d');
    await expect(page.getByRole('heading', { level: 1, name: /6 nodes, 4 edges/ })).toBeVisible();
    await expect(page.getByTestId('graph-page')).toContainText('Live, measured');
    await expect(page.getByTestId('cluster-filter')).toHaveCount(2);
    await expect(page.getByTestId('graph-controls')).toContainText('pkg');
    await expectNoDemo(page);
    await page.getByTestId('graph-search').fill('orders');
    await page.getByTestId('graph-search').press('Enter');
    const inspector = page.getByTestId('graph-inspector');
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('orders');
    await expect(inspector).toContainText('pkg/orders.py');
    await expect(inspector.getByTestId('graph-snippet')).toContainText('class Order', { timeout: 10000 });
    /** The stub file is shorter than the span the analysis recorded for Order; the inspector says so instead of showing nothing. */
    await expect(inspector).toContainText('Imported by');
    /** Containment comes from the analysis' parent and file records, because the graph endpoint has none. */
    await expect(inspector).toContainText('Contains');
    await page.getByTestId('graph-search').fill('Order');
    await page.getByTestId('graph-search').press('Enter');
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('Order');
    await expect(inspector.getByTestId('graph-snippet-outside')).toContainText('line 3, but the file has 2 lines');
    await expect(page.getByTestId('graph-synthetic')).toHaveCount(0);
  });

  test('without a backend, says so instead of drawing anything', async ({ page }) => {
    await page.route(API, route => route.abort());
    await seed(page, { data: 'live', viz: '2d', jobId: 'j1' });
    await page.goto('/app/graph?bench=2000');
    await expect(page.getByTestId('graph-failure').locator('[data-failure]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('graph-canvas')).toHaveCount(0);
    await expect(page.getByTestId('graph-synthetic')).toHaveCount(0);
    await expectNoDemo(page);
  });
});
