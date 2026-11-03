const { chromium } = require('C:/Users/ADMIN/.vscode/NLP_26/NLP-project-Semester5/frontend/node_modules/@playwright/test');
const swiftshader = process.argv[2] === 'swiftshader';
const base = 'http://127.0.0.1:5173';
(async () => {
  const args = swiftshader ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  const b = await chromium.launch({ channel: 'chrome', args });
  const rows = [];
  for (const mode of (process.argv[5] || '2d,3d').split(',')) for (const size of (process.argv[3] || '0,1000,2000').split(',').map(Number)) for (const perf of (process.argv[4] || 'false,true').split(',').map(v => v === 'true')) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(m => { localStorage.setItem('codeatlas.viz.v1', JSON.stringify({ state: { globalMode: m, overrides: {}, motion: 'full' }, version: 0 })); }, mode);
    await p.goto(`${base}/app/graph${size ? `?bench=${size}` : ''}`);
    await p.waitForSelector('[data-testid=graph-canvas]', { timeout: 30000 });
    await p.waitForFunction(() => !document.querySelector('[data-testid=graph-progress]') && window.__codeatlasGraph?.mode(), null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    const actualMode = await p.evaluate(() => window.__codeatlasGraph.mode());
    if (perf) { await p.getByRole('switch', { name: 'Performance mode' }).click(); await p.waitForTimeout(500); }
    const performanceOn = await p.getByRole('switch', { name: 'Performance mode' }).getAttribute('aria-checked');
    await p.evaluate(() => { window.__codeatlasGraph.resetStats(); window.__codeatlasGraph.drift(true); });
    await p.waitForTimeout(5000);
    const s = await p.evaluate(() => { const s = window.__codeatlasGraph.stats(); window.__codeatlasGraph.drift(false); return s; });
    const fpsFromP50 = s.p50 ? Math.round(1000 / s.p50) : null;
    rows.push({ mode: actualMode, nodes: s.nodes, edges: s.edges, performance: performanceOn, frames: s.frames, p50ms: s.p50, p95ms: s.p95, fpsAtP50: fpsFromP50, drawP50: s.costP50, drawP95: s.costP95, labels: s.labels, errors: errors.length });
    await p.close();
  }
  console.log(JSON.stringify(rows, null, 1));
  await b.close();
})();
