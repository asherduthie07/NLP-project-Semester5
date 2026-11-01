import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('M1 components, controls, keyboard navigation and clean console', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: 'Interface components' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Show labels' })).toBeChecked();
  await page.getByRole('switch', { name: 'Show labels' }).click();
  await expect(page.getByRole('switch', { name: 'Show labels' })).not.toBeChecked();
  await page.getByRole('slider', { name: 'Glow intensity preview' }).fill('82');
  await expect(page.getByRole('progressbar', { name: 'Slider-controlled demonstration progress' })).toHaveAttribute('aria-valuenow', '82');
  await page.getByRole('tab', { name: 'Source', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tokens', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Lexical tokens');
  await page.getByRole('button', { name: 'Copy token' }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Copied var(--cyan)' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.getByRole('button', { name: 'Preview notification' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'preference saved' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reduced motion, accessibility and responsive layouts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system');
  await expect(page.getByText('reduced motion enabled')).toBeVisible();
  await expect(page.locator('span[aria-hidden=true]').filter({ hasText: /^1,386$/ })).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('heading', { name: 'Foundations', exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `test-results/design-system-${width}.png`, fullPage: true });
  }
  await expect(page.locator('.orb').first()).toHaveCSS('animation-name', 'none');
});

test('typed real and mock adapters keep provenance and surface API failures', async ({ page }) => {
  await page.route('**/api/v1/projects', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ schema_version: '1.0', error: { schema_version: '1.0', code: 'unauthorized', message: 'API key required', details: [] } }) }));
  await page.goto('/design-system');
  const result = await page.evaluate(async () => {
    const realPath = '/src/data/api.ts', mockPath = '/src/data/mock.ts';
    const { createRealApi } = await import(realPath) as typeof import('../src/data/api');
    const { createMockApi } = await import(mockPath) as typeof import('../src/data/mock');
    const real = createRealApi(), mock = createMockApi();
    let realFailure = '', mockFailure = '';
    try { await real.getProjects(); } catch (error) { if (error instanceof Error && 'code' in error) realFailure = String(error.code); }
    try { await mock.startPreprocessing('snapshot'); } catch (error) { if (error instanceof Error && 'code' in error) mockFailure = String(error.code); }
    return { modes: [real.mode, mock.mode], projects: await mock.getProjects(), realFailure, mockFailure };
  });
  expect(result).toEqual({ modes: ['real', 'mock'], projects: [], realFailure: 'unauthorized', mockFailure: 'mock_only' });
});
