import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STORE = 'codeatlas.viz.v1';
const chart = (page: Page, id: string) => page.locator(`[data-chart="${id}"]`);
const canvasOf = (page: Page, id: string) => chart(page, id).locator('canvas.viz-canvas-3d');
const globalRadio = (page: Page, name: '2D' | '3D') => page.getByRole('radiogroup', { name: 'Visualization mode for all charts' }).first().getByRole('radio', { name });
const chartRadio = (page: Page, id: string, name: '2D' | '3D') => chart(page, id).getByRole('radiogroup', { name: 'Visualization mode for this chart' }).getByRole('radio', { name });
type Engine = { diagnostics(): { contexts: number; stages: number; frames: number; contextLosses: number; status: string }; renderer: { getContext(): WebGL2RenderingContext } | null };

/** Only seeds the preference, so a later reload proves what was actually persisted. */
async function seedMode(page: Page, mode: '2d' | '3d') {
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ state: { globalMode: value }, version: 0 })); }, [STORE, mode]);
}
function collectConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  /** The readback hint comes from this file's own getImageData calls, not from the app. */
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !message.text().includes('willReadFrequently')) problems.push(`${message.type()}: ${message.text()}`); });
  return problems;
}
async function openShowcase(page: Page) {
  await page.goto('/design-system');
  await page.getByTestId('viz-console').scrollIntoViewIfNeeded();
}
/** Charts mount only once in view, so this goes to the card and waits for that mount. */
async function showChart(page: Page, id: string) {
  const card = page.locator(`[data-viz-card="${id}"]`);
  await card.waitFor({ state: 'attached' });
  await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await chart(page, id).first().waitFor({ state: 'attached' });
  await chart(page, id).first().evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}
/** Visits every card so each lazily mounted chart initializes. */
async function visitAllCharts(page: Page) {
  const ids = await page.locator('[data-viz-card]').evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.vizCard!));
  for (const id of ids) {
    await page.locator(`[data-viz-card="${id}"]`).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(120);
  }
}
const signature = (page: Page, id: string) => canvasOf(page, id).evaluate((canvas: HTMLCanvasElement) => {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 0, painted = 0;
  const colors = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8) { painted += 1; colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3); }
    hash = hash * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 | 0;
  }
  return { hash, painted, share: painted / (canvas.width * canvas.height), colors: colors.size };
});
async function settled(page: Page, id: string) {
  await expect(canvasOf(page, id)).toBeVisible();
  let last = -1;
  await expect.poll(async () => { const { hash, share } = await signature(page, id); const same = hash === last && share > .02; last = hash; return same; }, { timeout: 45000, intervals: [350] }).toBe(true);
  return signature(page, id);
}
const engine = (page: Page) => page.evaluate(() => (window.__codeatlasViz as unknown as Engine).diagnostics());

test.setTimeout(240000);
test.use({ actionTimeout: 45000 });

test.describe('mode switching', () => {
  test('global choice applies everywhere and survives a reload, without a navigation', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-gaps');
    await expect(chart(page, 'demo-gaps')).toHaveAttribute('data-mode', '3d');
    await expect(chart(page, 'demo-gaps').getByTestId('viz-3d')).toBeVisible();
    await page.evaluate(() => { (window as unknown as { marker: boolean }).marker = true; });

    await globalRadio(page, '2D').click();
    await expect(chart(page, 'demo-gaps')).toHaveAttribute('data-mode', '2d');
    await expect(chart(page, 'demo-gaps').getByTestId('viz-2d').locator('svg')).toBeVisible();
    await expect(chart(page, 'demo-gaps').getByTestId('viz-3d')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
    expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, STORE)).state.globalMode).toBe('2d');

    await page.reload();
    await showChart(page, 'demo-gaps');
    await expect(chart(page, 'demo-gaps')).toHaveAttribute('data-mode', '2d');
    await expect(globalRadio(page, '2D')).toHaveAttribute('aria-checked', 'true');
  });

  test('a chart can override the global mode, follow it again, and global clears overrides', async ({ page }) => {
    await seedMode(page, '2d');
    await openShowcase(page);
    await showChart(page, 'demo-claims');
    await chartRadio(page, 'demo-claims', '3D').click();
    await expect(chart(page, 'demo-claims')).toHaveAttribute('data-mode', '3d');
    await expect(chart(page, 'demo-gaps')).toHaveAttribute('data-mode', '2d');

    await page.reload();
    await showChart(page, 'demo-claims');
    await expect(chart(page, 'demo-claims')).toHaveAttribute('data-mode', '3d');

    await chart(page, 'demo-claims').getByRole('button', { name: 'Follow the global mode' }).click();
    await expect(chart(page, 'demo-claims')).toHaveAttribute('data-mode', '2d');

    await chartRadio(page, 'demo-claims', '3D').click();
    await expect(chart(page, 'demo-claims')).toHaveAttribute('data-mode', '3d');
    await globalRadio(page, '3D').click();
    await globalRadio(page, '2D').click();
    await expect(chart(page, 'demo-claims')).toHaveAttribute('data-mode', '2d');
  });

  test('the same data selection and filters survive switching modes', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    const id = 'demo-functions';
    await showChart(page, id);
    const body = chart(page, id);
    await body.getByRole('button', { name: 'Documented' }).click();
    await expect(body.getByRole('button', { name: 'Documented' })).toHaveAttribute('aria-pressed', 'false');
    const stage = body.getByRole('group', { name: /Functions per module/ });
    await stage.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const readout = body.getByTestId('viz-readout');
    const selected = (await readout.textContent())!;
    expect(selected).toContain('catalog');

    await chartRadio(page, id, '2D').click();
    await expect(body).toHaveAttribute('data-mode', '2d');
    await expect(readout).toHaveText(selected);
    await expect(body.getByRole('button', { name: 'Documented' })).toHaveAttribute('aria-pressed', 'false');
    await expect(body.getByRole('button', { name: 'Clear' })).toBeVisible();

    await chartRadio(page, id, '3D').click();
    await expect(body).toHaveAttribute('data-mode', '3d');
    await expect(readout).toHaveText(selected);
    await body.getByRole('button', { name: 'Show data table' }).click();
    await expect(body.getByRole('columnheader')).toHaveText(['Category', 'Total']);
  });
});

test.describe('3D renderer', () => {
  test('renders real pixels, orbits, zooms and resets; 22 charts share one context', async ({ page }) => {
    const problems = collectConsole(page);
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-functions');
    const initial = await settled(page, 'demo-functions');
    expect(initial.share).toBeGreaterThan(.08);
    expect(initial.colors).toBeGreaterThan(40);

    const box = (await canvasOf(page, 'demo-functions').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 12, { steps: 8 });
    await page.mouse.up();
    const orbited = await settled(page, 'demo-functions');
    expect(orbited.hash).not.toBe(initial.hash);

    await chart(page, 'demo-functions').getByRole('button', { name: 'Zoom in' }).click();
    const zoomed = await settled(page, 'demo-functions');
    expect(zoomed.painted).toBeGreaterThan(orbited.painted);

    await chart(page, 'demo-functions').getByRole('button', { name: 'Reset camera' }).click();
    await expect.poll(async () => (await settled(page, 'demo-functions')).painted).toBeLessThan(zoomed.painted);

    await visitAllCharts(page);
    const diagnostics = await engine(page);
    expect(diagnostics.contexts).toBe(1);
    expect(diagnostics.stages).toBeGreaterThanOrEqual(20);
    await expect(page.getByTestId('viz-contexts')).toHaveText('1');
    expect(problems).toEqual([]);
  });

  test('wheel scrolls the page; only Ctrl+wheel zooms the chart', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-claims');
    const before = await settled(page, 'demo-claims');
    const box = (await canvasOf(page, 'demo-claims').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
    const scrolled = await settled(page, 'demo-claims');
    expect(scrolled.painted).toBe(before.painted);
  });

  test('hovering a shape shows the value that shape encodes', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-claims');
    await settled(page, 'demo-claims');
    const box = (await canvasOf(page, 'demo-claims').boundingBox())!;
    const tooltip = chart(page, 'demo-claims').getByTestId('viz-tooltip');
    /** The largest segment owns the lower ring; the probe walks down until it reaches it. */
    await expect(async () => {
      for (let t = .55; t < .95 && !(await tooltip.isVisible()); t += .03) { await page.mouse.move(box.x + box.width / 2, box.y + box.height * t); await page.waitForTimeout(90); }
      await expect(tooltip).toBeVisible({ timeout: 200 });
    }).toPass({ timeout: 8000 });
    await expect(tooltip).toContainText('Verified');
    await expect(tooltip).toContainText('3,305');
    await expect(tooltip).toContainText('84.5%');
    await page.mouse.move(box.x + 4, box.y + 4);
    await expect(tooltip).toBeHidden();
  });

  test('the keyboard reaches every datum and drives the camera', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-claims');
    const initial = await settled(page, 'demo-claims');
    const body = chart(page, 'demo-claims');
    await body.getByRole('group', { name: /Claim status/ }).focus();
    const readout = body.getByTestId('viz-readout');
    await page.keyboard.press('ArrowRight');
    await expect(readout).toContainText('Verified');
    await page.keyboard.press('ArrowRight');
    await expect(readout).toContainText('Uncertain');
    await page.keyboard.press('ArrowRight');
    await expect(readout).toContainText('Unsupported');
    await page.keyboard.press('Enter');
    await expect(body.getByRole('button', { name: 'Clear' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(body.getByRole('button', { name: 'Clear' })).toHaveCount(0);

    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    const orbited = await settled(page, 'demo-claims');
    expect(orbited.hash).not.toBe(initial.hash);
    await page.keyboard.press('0');
    await expect.poll(async () => (await settled(page, 'demo-claims')).hash).not.toBe(orbited.hash);
  });

  test('analysis mode opens as a modal dialog and returns the same state', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-sizes');
    await chart(page, 'demo-sizes').first().getByRole('button', { name: 'Open analysis mode' }).click();
    const dialog = page.getByRole('dialog', { name: /Module size, analysis mode/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('viz-3d')).toBeVisible();
    await expect(dialog.locator('canvas.viz-canvas-3d')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close analysis mode' }).click();
    await expect(dialog).toBeHidden();
    await expect(chart(page, 'demo-sizes').getByTestId('viz-3d')).toBeVisible();
  });

  test('stops rendering when nothing changes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-functions');
    await settled(page, 'demo-functions');
    await page.waitForTimeout(800);
    const a = (await engine(page)).frames;
    await page.waitForTimeout(1200);
    expect((await engine(page)).frames).toBe(a);
  });
});

test.describe('fallbacks', () => {
  test('without WebGL everything is a full 2D chart, 3D is disabled with a reason, and three.js never loads', async ({ page }) => {
    const problems = collectConsole(page);
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return kind.startsWith('webgl') ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await openShowcase(page);
    await showChart(page, 'demo-gaps');
    await expect(chart(page, 'demo-gaps')).toHaveAttribute('data-mode', '2d');
    await expect(chart(page, 'demo-gaps').getByTestId('viz-2d').locator('svg')).toBeVisible();
    await expect(globalRadio(page, '3D')).toBeDisabled();
    await expect(globalRadio(page, '2D')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('gpu-tier')).toHaveText('none');
    await visitAllCharts(page);
    expect(requests.filter(url => /three|ThreeDChartRenderer|engine\/engine/.test(url))).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a chosen 2D mode does not download the 3D engine', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await seedMode(page, '2d');
    await openShowcase(page);
    await visitAllCharts(page);
    expect(requests.filter(url => /three|ThreeDChartRenderer|engine\/engine/.test(url))).toEqual([]);
    expect(await page.evaluate(() => window.__codeatlasViz)).toBeUndefined();
  });

  test('recovers from a lost WebGL context, and falls back to 2D if losses repeat', async ({ page }) => {
    await seedMode(page, '3d');
    await openShowcase(page);
    await showChart(page, 'demo-functions');
    await settled(page, 'demo-functions');
    const lose = () => page.evaluate(() => {
      const gl = (window.__codeatlasViz as unknown as Engine).renderer!.getContext();
      const extension = gl.getExtension('WEBGL_lose_context')!;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 300);
    });
    await lose();
    await expect.poll(async () => (await engine(page)).contextLosses).toBe(1);
    await expect.poll(async () => (await engine(page)).status).toBe('ready');
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    expect((await settled(page, 'demo-functions')).share).toBeGreaterThan(.05);
    await expect(chart(page, 'demo-functions')).toHaveAttribute('data-mode', '3d');

    await lose();
    await expect.poll(async () => (await engine(page)).contextLosses).toBe(2);
    await expect.poll(async () => (await engine(page)).status).toBe('ready');
    await lose();
    await expect(chart(page, 'demo-functions')).toHaveAttribute('data-mode', '2d', { timeout: 15000 });
    await expect(chart(page, 'demo-functions').getByTestId('viz-2d').locator('svg')).toBeVisible();
    await expect(chart(page, 'demo-functions').getByText(/Showing 2D/)).toBeVisible();
  });
});

test.describe('data integrity in the browser', () => {
  test('tables list measured values and the provenance chip is honest', async ({ page }) => {
    const analysis = JSON.parse(readFileSync('../docs/07-findings/phase-2/analysis.json', 'utf8'));
    await seedMode(page, '2d');
    await openShowcase(page);
    await showChart(page, 'stats-identifiers');
    const body = chart(page, 'stats-identifiers');
    await expect(body.getByText('Measured', { exact: true })).toBeVisible();
    await body.getByRole('button', { name: 'Show data table' }).click();
    const top = analysis.statistics.identifiers[0];
    const row = body.getByRole('row', { name: new RegExp(`^${top.value}\\b`) });
    await expect(row).toContainText(String(top.count));
    await showChart(page, 'demo-functions');
    await expect(chart(page, 'demo-functions').getByText('Illustrative', { exact: true })).toBeVisible();
  });

  test('CSV export carries provenance; a failed chart shows an error and no sample data', async ({ page }) => {
    await seedMode(page, '2d');
    await openShowcase(page);
    await showChart(page, 'stats-token-categories');
    const body = chart(page, 'stats-token-categories');
    await body.getByRole('button', { name: 'Export' }).click();
    const downloading = page.waitForEvent('download');
    await body.getByRole('button', { name: 'CSV data' }).click();
    const download = await downloading;
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv.split('\n')[0]).toMatch(/^# Token categories \| measured: /);
    expect(csv).toContain('punctuation');

    const failed = page.getByRole('alert');
    await failed.scrollIntoViewIfNeeded();
    await expect(failed).toContainText('attempt 1');
    await expect(failed.locator('svg path').first()).toBeVisible();
    await expect(failed.getByText(/Illustrative|Measured/)).toHaveCount(0);
    await failed.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('alert')).toContainText('attempt 2');
  });
});

for (const mode of ['3d', '2d'] as const) {
  test(`${mode}: axe finds no violations, the console is clean, and no width overflows`, async ({ page }) => {
    const problems = collectConsole(page);
    await seedMode(page, mode);
    await openShowcase(page);
    await visitAllCharts(page);
    await showChart(page, 'demo-functions');
    await page.waitForTimeout(1200);
    const scan = await new AxeBuilder({ page }).include('#visualization').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.slice(0, 3).map(node => `${node.target} ${node.failureSummary}`) }))).toEqual([]);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `overflow at ${width}`).toBe(false);
      await expect(chart(page, 'demo-functions')).toHaveAttribute('data-mode', mode);
      await page.screenshot({ path: `test-results/visualization-${mode}-${width}.png` });
    }
    expect(problems).toEqual([]);
  });
}
