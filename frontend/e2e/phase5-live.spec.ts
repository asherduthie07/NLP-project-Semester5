import { expect, test } from '@playwright/test';
import { seed } from './helpers';

test('real Python and Java upload reaches documentation ZIP export', async ({ page }) => {
  test.skip(!process.env.CODEATLAS_LIVE_BACKEND, 'Requires local API with PostgreSQL and inline jobs');
  await seed(page, { data: 'live', viz: '2d' });
  await page.goto('/app/import');
  await page.getByRole('textbox', { name: 'Repository name' }).fill(`Phase V browser ${Date.now()}`);
  await page.locator('input[type=file]').setInputFiles([
    { name: 'calc.py', mimeType: 'text/x-python', buffer: Buffer.from('from fastapi import APIRouter\nrouter = APIRouter()\n@router.get("/add")\ndef add(a: int, b: int) -> int:\n    return a + b\n') },
    { name: 'Calc.java', mimeType: 'text/plain', buffer: Buffer.from('class Calc { int add(int a, int b) { return a + b; } }') },
  ]);
  await page.getByRole('button', { name: 'Upload and analyze' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Analysis complete' })).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => {
    const key = 'codeatlas.data.v1';
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    saved.state.jobIds = {};
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Verification' }).last().click();
  await expect(page.getByRole('heading', { name: /claims/ })).toBeVisible();
  await expect(page.getByTestId('claims-unavailable')).toHaveCount(0);
  await page.getByRole('link', { name: 'Overview', exact: true }).last().click();
  await expect(page.getByTestId('overview-kpis')).toBeVisible();
  await expect(page.getByTestId('kpi-files')).not.toHaveAttribute('data-pending', 'true');
  await page.getByRole('link', { name: 'Codebase Explorer' }).last().click();
  await expect(page.getByTestId('explorer-page')).toBeVisible();
  await expect(page.getByText('calc.py').first()).toBeVisible();
  await page.getByRole('link', { name: 'Knowledge Graph' }).last().click();
  await expect(page.getByTestId('graph-page')).toBeVisible();
  await expect(page.getByTestId('graph-search')).toBeVisible();
  await page.getByRole('link', { name: 'Verification' }).last().click();
  await expect(page.getByTestId('verification-summary')).toBeVisible();
  await expect(page.getByTestId('claims-unavailable')).toHaveCount(0);
  await page.getByRole('link', { name: 'Documentation Studio' }).last().click();
  await expect(page.getByRole('heading', { name: /symbols/ })).toBeVisible();
  await expect(page.getByText('Calc.java', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('GET /add')).toBeVisible();
  await page.getByRole('link', { name: 'Documentation Intelligence' }).last().click();
  await page.mouse.move(900, 300);
  await page.getByRole('combobox', { name: 'Function or method' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Run NLP' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Defines add' })).toBeVisible();
  await page.getByRole('link', { name: 'Exports' }).last().click();
  await page.mouse.move(900, 300);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown package' }).focus();
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('codeatlas-docs.zip');
});
