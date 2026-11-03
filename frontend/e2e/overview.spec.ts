import { expect, test } from '@playwright/test';
import { analysisStub, API, axe, collectConsole, expectNoDemo, noOverflow, seed } from './helpers';

test.setTimeout(180000);
test.use({ actionTimeout: 30000, viewport: { width: 1440, height: 900 } });

test.describe('Overview in Demo', () => {
  test('shows every widget with the fixture figures, labeled as demo data', async ({ page }) => {
    const problems = collectConsole(page);
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const hud = page.getByTestId('overview-hud');
    await expect(hud).toContainText('Repository overview');
    await expect(hud).toContainText('Demo, illustrative');
    await expect(page.getByRole('heading', { level: 1, name: /Overview/ })).toBeVisible();
    await expect(page.getByTestId('kpi-files')).toContainText('214', { timeout: 15000 });
    await expect(page.getByTestId('kpi-functions')).toContainText('1,386');
    await expect(page.getByTestId('kpi-classes')).toContainText('142');
    await expect(page.getByTestId('kpi-coverage')).toContainText('78%');
    await expect(page.getByTestId('kpi-coverage')).toContainText('41% existing');
    await expect(page.getByTestId('kpi-verified')).toContainText('84.5% of 3,912 claims');
    await expect(page.getByTestId('kpi-review')).toContainText('402 uncertain, 205 unsupported');
    for (const id of ['overview-coverage', 'overview-gaps', 'overview-languages', 'overview-treemap', 'overview-architecture']) {
      const card = page.locator(`[data-viz-card="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator(`[data-chart="${id}"]`)).toBeVisible({ timeout: 15000 });
      await expect(card).toContainText('Demo data');
    }
    await expect(page.getByTestId('completeness-panel')).toContainText('Documentation completeness');
    await expect(page.getByTestId('stage-parsed')).toContainText('100%');
    await expect(page.getByTestId('stage-verified')).toContainText('84.5%');
    await expect(page.getByTestId('estimate')).toHaveText('About 15 days at the 7-day rate');
    await expect(page.getByTestId('cycle-count')).toHaveText('3');
    await expect(page.getByTestId('orphan-count')).toHaveText(/\d+/);
    await expect(page.getByTestId('dependency-cards')).toContainText('Most imported');
    await expect(page.getByTestId('activity-panel')).toBeVisible();
    await page.getByTestId('terminal-panel').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('terminal-log')).toContainText('[parse] resolved 214 files', { timeout: 10000 });
    await expect(page.getByTestId('terminal-panel')).toContainText('Illustrative replay');
    const strip = page.getByTestId('pipeline-strip');
    for (const step of ['upload', 'parse', 'extract', 'summarize', 'verify']) await expect(strip.getByTestId(`step-${step}`)).toHaveAttribute('data-state', 'done');
    await expect(strip.getByTestId('step-publish')).toHaveAttribute('data-state', 'waiting');
    await expect(page.getByTestId('verification-score')).toHaveText('84.5%');
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    expect(problems).toEqual([]);
  });

  test('range and series controls change the coverage chart', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const card = page.locator('[data-viz-card="overview-coverage"]');
    await expect(card).toContainText('last 30 days', { timeout: 15000 });
    await page.getByTestId('coverage-range').getByRole('radio', { name: '7d' }).click();
    await expect(card).toContainText('last 7 days');
    await expect(page.getByTestId('coverage-range').getByRole('radio', { name: '7d' })).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('coverage-series').getByRole('radio', { name: 'Existing' }).click();
    await card.getByRole('button', { name: /table/i }).first().click();
    await expect(card.locator('table')).toContainText('Existing docs');
    await expect(card.locator('table')).not.toContainText('Generated docs');
    await expect(card.locator('table tbody tr')).toHaveCount(7);
  });

  test('the attention table sorts, expands and opens a module in the explorer', async ({ page }) => {
    await seed(page, { viz: '2d' });
    await page.goto('/app/overview');
    const table = page.getByTestId('attention-table');
    await table.scrollIntoViewIfNeeded();
    await expect(table.getByTestId('attention-row')).toHaveCount(8, { timeout: 15000 });
    const coverage = () => table.getByTestId('attention-row').evaluateAll(rows => rows.map(row => parseFloat(row.children[2].textContent!.replace('%', ''))));
    await table.getByRole('button', { name: /Coverage/ }).click();
    const descending = await coverage();
    expect([...descending].sort((a, b) => b - a)).toEqual(descending);
    await table.getByRole('button', { name: /Coverage/ }).click();
    const ascending = await coverage();
    expect([...ascending].sort((a, b) => a - b)).toEqual(ascending);
    await expect(table.getByRole('columnheader', { name: /Coverage/ })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByTestId('view-all-modules').click();
    expect(await table.getByTestId('attention-row').count()).toBeGreaterThan(100);
    const first = await table.getByTestId('attention-row').first().locator('.ov-crumb').getAttribute('title');
    await table.getByTestId('attention-row').first().click();
    await expect(page).toHaveURL(new RegExp(`/app/explorer\\?path=${encodeURIComponent(first!).replace(/[.]/g, '\\.')}`));
  });

  test('the overview has no axe findings and no overflow at 1024 and 390 px', async ({ page }) => {
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await seed(page, { viz: '2d' });
      await page.goto('/app/overview');
      await expect(page.getByTestId('kpi-files')).toContainText('214', { timeout: 15000 });
      await page.waitForTimeout(800);
      expect(await axe(page)).toEqual([]);
      expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Overview in Live', () => {
  test('shows measured figures from a completed job and marks later phases pending', async ({ page }) => {
    const problems = collectConsole(page);
    await analysisStub(page);
    await seed(page, { data: 'live', viz: '2d', jobId: 'j1' });
    await page.goto('/app/overview');
    await expect(page.getByTestId('overview-hud')).toContainText('Live, measured', { timeout: 20000 });
    await expect(page.getByTestId('kpi-files')).toContainText('3', { timeout: 20000 });
    await expect(page.getByTestId('kpi-functions')).toContainText('2');
    await expect(page.getByTestId('kpi-classes')).toContainText('2');
    await expect(page.getByTestId('kpi-coverage')).toContainText('60%');
    await expect(page.getByTestId('kpi-coverage')).toContainText('Existing documentation only');
    await expect(page.getByTestId('kpi-verified')).toHaveAttribute('data-pending', 'true');
    await expect(page.getByTestId('kpi-review')).toContainText('Pending');
    await expect(page.getByTestId('kpi-files')).toContainText('No history in this source');
    await expect(page.locator('[data-viz-card="overview-coverage"]')).toContainText('No coverage history in this source');
    await expect(page.locator('[data-viz-card="overview-coverage"]')).toContainText('The current measured coverage is 60%');
    await expect(page.getByTestId('stage-parsed')).toContainText('100%');
    for (const stage of ['summarized', 'verified', 'reviewed', 'published']) await expect(page.getByTestId(`stage-${stage}`)).toContainText('Phase IV');
    await expect(page.getByTestId('completeness-panel')).toContainText('1 unresolved relationships');
    await expect(page.getByTestId('estimate')).toContainText('keeps no history');
    const strip = page.getByTestId('pipeline-strip');
    await expect(strip.getByTestId('step-parse')).toHaveAttribute('data-state', 'done');
    for (const step of ['summarize', 'verify', 'publish']) await expect(strip.getByTestId(`step-${step}`)).toHaveAttribute('data-state', 'pending');
    await expect(strip).toContainText('Not recorded by the API');
    const table = page.getByTestId('attention-table');
    await table.scrollIntoViewIfNeeded();
    await expect(table.getByTestId('attention-row')).toHaveCount(3);
    await expect(table).toContainText('payments.py');
    await page.getByTestId('terminal-panel').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('terminal-panel')).toContainText('Replay of the job record');
    await expect(page.getByTestId('terminal-log')).toContainText('[parse] resolved 3 files', { timeout: 10000 });
    await expectNoDemo(page);
    expect(problems).toEqual([]);
  });

  test('without a job, every widget says so and nothing is invented', async ({ page }) => {
    await page.route(API, route => route.abort());
    await seed(page, { data: 'live', viz: '2d' });
    await page.goto('/app/overview');
    await expect(page.getByTestId('overview-kpis').locator('[data-failure]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('attention-table').locator('[data-failure]')).toBeVisible();
    await expectNoDemo(page);
  });
});
