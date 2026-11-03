import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const STORE = 'codeatlas.viz.v1';
const chart = (page: Page, id: string) => page.locator(`[data-chart="${id}"]`);
const canvasOf = (page: Page, id: string) => chart(page, id).locator('canvas.viz-canvas-3d');

async function show(page: Page, id: string) {
  const card = page.locator(`[data-viz-card="${id}"]`);
  await card.waitFor({ state: 'attached' });
  await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await chart(page, id).first().waitFor({ state: 'attached' });
  await chart(page, id).first().evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}
async function open(page: Page, mode: '2d' | '3d', id: string) {
  await page.addInitScript(([key, value]) => { localStorage.setItem(key, JSON.stringify({ state: { globalMode: value }, version: 0 })); }, [STORE, mode]);
  await page.goto('/design-system');
  await page.getByTestId('viz-console').scrollIntoViewIfNeeded();
  await show(page, id);
}
async function exported(page: Page, id: string, format: 'PNG snapshot' | 'CSV data' | 'JSON model') {
  const body = chart(page, id);
  await body.getByRole('button', { name: 'Export' }).click();
  const downloading = page.waitForEvent('download');
  await body.getByRole('button', { name: format }).click();
  const download = await downloading;
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}
/** Decodes the file in the browser, so a PNG that passes here is one a real image decoder accepts. */
function decodePng(page: Page, bytes: Buffer) {
  return page.evaluate(async base64 => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<number>();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 250) opaque += 1; colors.add((data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | data[i + 2] >> 4); }
    return { width: bitmap.width, height: bitmap.height, opaqueShare: opaque / (data.length / 4), colors: colors.size };
  }, bytes.toString('base64'));
}
const signature = (page: Page, id: string) => canvasOf(page, id).evaluate((canvas: HTMLCanvasElement) => {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 0;
  for (let i = 0; i < data.length; i += 4) hash = hash * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 | 0;
  return hash;
});
async function settled(page: Page, id: string) {
  await expect(canvasOf(page, id)).toBeVisible();
  let last: number | null = null;
  await expect.poll(async () => { const hash = await signature(page, id); const same = hash === last; last = hash; return same; }, { timeout: 45000, intervals: [350] }).toBe(true);
  return signature(page, id);
}

test.setTimeout(240000);
test.use({ actionTimeout: 45000 });

test.describe('exports', () => {
  for (const mode of ['3d', '2d'] as const) {
    for (const id of ['demo-functions', 'demo-network', 'demo-gaps']) {
      test(`${mode} ${id}: the PNG is a decodable, opaque image of the chart surface`, async ({ page }) => {
        await open(page, mode, id);
        if (mode === '3d') await settled(page, id);
        else await page.waitForTimeout(800);
        const surface = (await chart(page, id).getByTestId(mode === '3d' ? 'viz-3d' : 'viz-2d').boundingBox())!;
        const file = await exported(page, id, 'PNG snapshot');
        expect(file.name).toBe(`${id}-${mode}.png`);
        expect([...file.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const image = await decodePng(page, file.bytes);
        expect(image.width).toBeGreaterThanOrEqual(surface.width * .9);
        expect(image.height).toBeGreaterThanOrEqual(surface.height * .9);
        expect(image.opaqueShare).toBeGreaterThan(.99);
        expect(image.colors).toBeGreaterThan(8);
      });
    }

    test(`${mode}: JSON and CSV hold the same visible data as the table, and respect the legend`, async ({ page }) => {
      const id = 'demo-functions';
      await open(page, mode, id);
      const body = chart(page, id);
      await body.getByRole('button', { name: 'Show data table' }).click();
      const firstCategory = (await body.getByRole('rowheader').first().textContent())!;
      const firstValue = (await body.getByRole('row').nth(1).getByRole('cell').first().textContent())!;
      await body.getByRole('button', { name: 'Show chart' }).click();

      const full = JSON.parse((await exported(page, id, 'JSON model')).bytes.toString('utf8'));
      expect(full.id).toBe(id);
      expect(full.provenance.kind).toBe('illustrative');
      expect(full.categories[0].label).toBe(firstCategory);
      expect(String(full.series[0].values[0])).toBe(firstValue);
      const names = full.series.map((series: { label: string }) => series.label);
      expect(names).toContain('Documented');

      const csv = (await exported(page, id, 'CSV data')).bytes.toString('utf8').split('\n');
      expect(csv[0]).toMatch(/\| illustrative: /);
      expect(csv[1].split(',')[0]).toBe('Category');
      expect(csv).toHaveLength(2 + full.categories.length);
      expect(csv[2].split(',').slice(0, 2)).toEqual([firstCategory, firstValue]);

      await body.getByRole('button', { name: 'Documented' }).click();
      const filtered = JSON.parse((await exported(page, id, 'JSON model')).bytes.toString('utf8'));
      expect(filtered.series.map((series: { label: string }) => series.label)).not.toContain('Documented');
      expect((await exported(page, id, 'CSV data')).bytes.toString('utf8').split('\n')[1]).not.toContain('Documented');
    });
  }
});

test.describe('keyboard', () => {
  test('F frames the focused datum, and does nothing without one', async ({ page }) => {
    await open(page, '3d', 'demo-network');
    const before = await settled(page, 'demo-network');
    await chart(page, 'demo-network').getByRole('group', { name: /./ }).first().focus();
    await page.keyboard.press('f');
    expect(await settled(page, 'demo-network')).toBe(before);
    await page.keyboard.press('ArrowRight');
    await expect(chart(page, 'demo-network').getByTestId('viz-readout')).not.toBeEmpty();
    const highlighted = await settled(page, 'demo-network');
    await page.keyboard.press('f');
    await expect.poll(() => signature(page, 'demo-network'), { timeout: 15000 }).not.toBe(highlighted);
    const focused = await settled(page, 'demo-network');
    await page.keyboard.press('0');
    await expect.poll(() => signature(page, 'demo-network'), { timeout: 15000 }).not.toBe(focused);
  });

  test('+ and - zoom, and Ctrl+wheel zooms', async ({ page }) => {
    await open(page, '3d', 'demo-claims');
    const start = await settled(page, 'demo-claims');
    const box = (await canvasOf(page, 'demo-claims').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await expect.poll(() => signature(page, 'demo-claims'), { timeout: 15000 }).not.toBe(start);
    await settled(page, 'demo-claims');
    await chart(page, 'demo-claims').getByRole('group', { name: /Claim status/ }).focus();
    await page.keyboard.press('0');
    const reset = await settled(page, 'demo-claims');
    await page.keyboard.press('+');
    await expect.poll(() => signature(page, 'demo-claims'), { timeout: 15000 }).not.toBe(reset);
    const zoomed = await settled(page, 'demo-claims');
    await page.keyboard.press('-');
    await expect.poll(() => signature(page, 'demo-claims'), { timeout: 15000 }).not.toBe(zoomed);
  });

  test('the mode switch works from the keyboard, globally and per chart', async ({ page }) => {
    await open(page, '3d', 'demo-claims');
    const body = chart(page, 'demo-claims');
    await body.getByRole('radiogroup', { name: 'Visualization mode for this chart' }).getByRole('radio', { name: '3D' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(body).toHaveAttribute('data-mode', '2d');
    await expect(body.getByRole('radio', { name: '2D' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(body).toHaveAttribute('data-mode', '3d');
    const global = page.getByRole('radiogroup', { name: 'Visualization mode for all charts' }).first();
    await global.getByRole('radio', { name: '3D' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(global.getByRole('radio', { name: '2D' })).toBeChecked();
    await expect(body).toHaveAttribute('data-mode', '2d');
  });
});
