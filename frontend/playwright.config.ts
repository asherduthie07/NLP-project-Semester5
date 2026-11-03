import { defineConfig, devices } from '@playwright/test';
/** CI has no GPU. Software GL compiles shaders in seconds, not milliseconds, so waits are longer there. */
const softwareGl = !process.env.PLAYWRIGHT_CHROME || !!process.env.PLAYWRIGHT_SWIFTSHADER;
export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: true, timeout: softwareGl ? 120000 : 30000, expect: { timeout: softwareGl ? 30000 : 5000 }, forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHROME ? 'chrome' : undefined, launchOptions: { args: softwareGl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] } } }],
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
