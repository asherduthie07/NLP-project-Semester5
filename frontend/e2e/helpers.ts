import { expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Shared by the M3 to M5 page specs. The M2 shell spec keeps its own copies so its history stays readable. */
export const VIZ = 'codeatlas.viz.v1', DATA = 'codeatlas.data.v1';
export const API = '**/api/v1/**';
export const LIVE_REAL = !!process.env.CODEATLAS_LIVE_BACKEND;

export function collectConsole(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !/Failed to load resource|ERR_FAILED|willReadFrequently/.test(message.text())) problems.push(`${message.type()}: ${message.text()}`); });
  return problems;
}

export async function seed(page: Page, { data = 'demo', viz, jobId }: { data?: 'demo' | 'live'; viz?: '2d' | '3d'; jobId?: string } = {}) {
  await page.addInitScript(([dataKey, vizKey, mode, vizMode, job]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(dataKey as string, JSON.stringify({ state: { mode, ...(job ? { repositoryId: 'p1', snapshotId: 's1', jobIds: { s1: job } } : {}) }, version: 0 }));
    if (vizMode) localStorage.setItem(vizKey as string, JSON.stringify({ state: { globalMode: vizMode }, version: 0 }));
  }, [DATA, VIZ, data, viz ?? null, jobId ?? null] as const);
}

export const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`);

export const noOverflow = (page: Page) => page.evaluate(() => {
  const layer = document.querySelector('[data-testid=page-layer]')!;
  const frame = layer.querySelector('.page-frame');
  return Math.max(document.documentElement.scrollWidth - innerWidth, layer.scrollWidth - layer.clientWidth, frame ? frame.scrollWidth - frame.clientWidth : 0);
});

const evidence = (line: number, end: number, path = 'pkg/orders.py', file = 'f1') => ({ schema_version: '1.0', snapshot_id: 's1', file_id: file, relative_path: path, span: { schema_version: '1.0', start: { schema_version: '1.0', line, column: 0 }, end: { schema_version: '1.0', line: end, column: 0 } } });

/**
 * A small analysis in the exact API shape, served for one completed job.
 * It stands in for the backend in failure-free paths and is not integration evidence; the real-backend test is.
 */
export const STUB_ANALYSIS = {
  files: [
    { id: 'f1', snapshot_id: 's1', relative_path: 'pkg/orders.py', language: 'python', content_hash: 'a', size_bytes: 1800, encoding: 'utf-8', analysis_status: 'pending' },
    { id: 'f2', snapshot_id: 's1', relative_path: 'pkg/payments.py', language: 'python', content_hash: 'b', size_bytes: 900, encoding: 'utf-8', analysis_status: 'pending' },
    { id: 'f3', snapshot_id: 's1', relative_path: 'src/Ledger.java', language: 'java', content_hash: 'c', size_bytes: 1200, encoding: 'utf-8', analysis_status: 'pending' },
  ],
  symbols: [
    { id: 'm1', file_id: 'f1', name: 'orders', qualified_name: 'orders', kind: 'module', documented: true, evidence: evidence(1, 40) },
    { id: 'm2', file_id: 'f2', name: 'payments', qualified_name: 'payments', kind: 'module', documented: false, evidence: evidence(1, 20, 'pkg/payments.py', 'f2') },
    { id: 's1', file_id: 'f1', name: 'Order', qualified_name: 'orders.Order', kind: 'class', documented: true, evidence: evidence(3, 30) },
    { id: 's2', file_id: 'f1', name: 'total', qualified_name: 'orders.Order.total', kind: 'method', parent_id: 's1', documented: false, signature: 'total(self)', evidence: evidence(10, 18) },
    { id: 's3', file_id: 'f2', name: 'charge', qualified_name: 'payments.charge', kind: 'function', documented: false, signature: 'charge(order)', evidence: evidence(4, 12, 'pkg/payments.py', 'f2') },
    { id: 's4', file_id: 'f3', name: 'Ledger', qualified_name: 'Ledger', kind: 'class', documented: true, evidence: evidence(2, 25, 'src/Ledger.java', 'f3') },
  ],
  relationships: [
    { id: 'r1', source_id: 'm2', target_id: 'm1', target_name: 'orders', kind: 'imports', resolution: 'confirmed', evidence: evidence(1, 1, 'pkg/payments.py', 'f2') },
    { id: 'r2', source_id: 's3', target_id: null, target_name: 'gateway.send', kind: 'calls', resolution: 'unresolved', evidence: evidence(6, 6, 'pkg/payments.py', 'f2') },
  ],
  statistics: {
    schema_version: '1.0', files: 3, languages: { python: 2, java: 1 }, source_lines: 85, comment_lines: 9, documented_symbols: 3, documentable_symbols: 5, documentation_coverage: 0.6,
    tokens: 410, vocabulary_size: 96, lexical_diversity: 0.25, duplicate_files: 0, token_types: { identifier: 140, keyword: 60, punctuation: 150, string: 20, comment: 9, operator: 25, number: 6 },
    token_frequencies: [{ schema_version: '1.0', value: '(', count: 30 }], identifiers: [{ schema_version: '1.0', value: 'order', count: 14 }, { schema_version: '1.0', value: 'total', count: 9 }],
    keywords: [{ schema_version: '1.0', value: 'def', count: 7 }], documentation_terms: [{ schema_version: '1.0', value: 'order', count: 5 }],
    identifier_lengths: { 5: 12, 6: 8 }, naming_patterns: { snake_case: 10, other: 20 }, comment_lengths: [30, 44], docstring_lengths: [40, 61, 52],
    symbols_by_kind: { module: 2, class: 2, method: 1, function: 1 }, documentation_by_kind: { class: { total: 2, documented: 2 }, method: { total: 1, documented: 0 }, function: { total: 1, documented: 0 } },
    undocumented_symbols: ['orders.Order.total', 'payments.charge'], functions_per_module: { 'payments.py': 1 }, methods_per_class: { 'orders.Order': 1 }, function_lengths: [9, 9], class_sizes: [28, 24],
    relationships_by_status: { confirmed: 1, unresolved: 1 }, module_fan_in: { orders: 1 }, module_fan_out: { payments: 1 }, circular_dependencies: [],
  },
};

/** Live API shape with one completed analysis job, `j1`, for snapshot `s1`. */
export function analysisStub(page: Page) {
  const manifest = { schema_version: '1.0', snapshot_id: 's1', files: STUB_ANALYSIS.files };
  const stamp = <T extends object>(item: T) => ({ schema_version: '1.0', snapshot_id: 's1', analyzer_version: 'stub', ...item });
  return page.route(API, (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/health') return json({ status: 'ok', scope: 'phase-ii', schema_version: '1.0' });
    if (path === '/projects') return json([{ id: 'p1', name: 'stub-project' }]);
    if (path === '/projects/p1/snapshots') return json([{ id: 's1', project_id: 'p1', content_hash: 'h', created_at: '2026-10-01T00:00:00Z', source_kind: 'zip', origin: 'upload', commit_sha: null, manifest }]);
    if (path === '/snapshots/s1/manifest') return json(manifest);
    if (path.startsWith('/snapshots/s1/files/')) return route.fulfill({ status: 200, contentType: 'text/plain', body: 'class Order:\n    """An order."""\n' });
    if (path === '/jobs/j1') return json({ schema_version: '1.0', id: 'j1', kind: 'analyze', snapshot_id: 's1', status: 'complete', issues: [] });
    if (path === '/jobs/j1/issues') return json([]);
    if (path === '/jobs/j1/overview') return json(STUB_ANALYSIS.statistics);
    if (path === '/jobs/j1/analysis') return json({ schema_version: '1.0', snapshot_id: 's1', preprocessing_job_id: 'p0', analyzer_version: 'stub', endpoints: [], issues: [], statistics: STUB_ANALYSIS.statistics, symbols: STUB_ANALYSIS.symbols.map(stamp), relationships: STUB_ANALYSIS.relationships.map(stamp) });
    if (path === '/jobs/j1/graph') return json({ schema_version: '1.0', snapshot_id: 's1', nodes: STUB_ANALYSIS.symbols.map(stamp), edges: STUB_ANALYSIS.relationships.map(stamp) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }) });
  });
}

export async function expectNoDemo(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/shopflow|3,912|1,386|a3f9c21|Illustrative|Demo data/);
}
