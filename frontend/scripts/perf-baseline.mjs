// Reproducible chart performance baseline. Run against the production build:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173
//   node scripts/perf-baseline.mjs --label baseline --out perf.json [--prefs '{"quality":"low"}'] [--charts demo-network,demo-gaps] [--runs 3]
// Reports rAF cadence during a scripted orbit, not a claim about any other device. Headed Chrome uses the real GPU.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
const base = arg('base', 'http://127.0.0.1:4173');
const label = arg('label', 'run');
const out = arg('out', null);
const prefs = JSON.parse(arg('prefs', '{}'));
const charts = arg('charts', 'demo-network,demo-gaps').split(',');
const runs = Number(arg('runs', 3));

const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
  return { n: sorted.length, mean: +mean.toFixed(2), p50: sorted[Math.floor(sorted.length * .5)] ?? 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0, fps: +(1000 / (mean || 1)).toFixed(1) };
};
const sampleRaf = (page, ms) => page.evaluate(duration => new Promise(done => {
  const intervals = []; let last = performance.now(); const end = last + duration;
  const frame = now => { intervals.push(+(now - last).toFixed(2)); last = now; if (now < end) requestAnimationFrame(frame); else done(intervals.slice(2)); };
  requestAnimationFrame(frame);
}), ms);

const browser = await chromium.launch({ channel: 'chrome' });
const result = { label, browser: browser.version(), prefs, date: new Date().toISOString(), charts: {} };
for (const id of charts) {
  result.charts[id] = [];
  for (let run = 0; run < runs; run += 1) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(state => localStorage.setItem('codeatlas.viz.v1', JSON.stringify({ state, version: 0 })), { globalMode: '3d', ...prefs });
    await page.goto(`${base}/design-system`);
    const card = page.locator(`[data-viz-card="${id}"]`);
    await card.waitFor({ state: 'attached' });
    await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const canvas = page.locator(`[data-chart="${id}"] canvas.viz-canvas-3d`);
    await canvas.waitFor();
    await page.waitForTimeout(2500);
    const box = await canvas.boundingBox();
    const before = await page.evaluate(() => window.__codeatlasViz.diagnostics());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const sampling = sampleRaf(page, 5000);
    for (let i = 0; i < 90; i += 1) { await page.mouse.move(box.x + box.width / 2 + Math.sin(i / 8) * 120, box.y + box.height / 2 + Math.cos(i / 8) * 30); await page.waitForTimeout(50); }
    const intervals = await sampling;
    await page.mouse.up();
    const after = await page.evaluate(() => window.__codeatlasViz.diagnostics());
    const frames = after.frames - before.frames;
    result.charts[id].push({ ...summary(intervals), engineFrames: frames, visibleStages: after.visibleStages, stages: after.stages, jsFrameMs: frames ? +(((after.averageFrameMs * after.frames) - (before.averageFrameMs * before.frames)) / frames).toFixed(2) : 0 });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(result));
if (out) {
  const existing = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
  writeFileSync(out, JSON.stringify([...existing, result], null, 2));
}
