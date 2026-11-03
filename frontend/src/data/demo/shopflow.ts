import type { Claim, ClaimStatus, DocumentRecord, FileNode, GraphEdge, GraphNode, LanguageShare } from '../dashboard';

/**
 * Deterministic fixture for the illustrative "shopflow-api" repository from the UI specification, section 8.
 * Totals are fixed by the specification and asserted in tests. Nothing here was measured from real source.
 */
export const SHOPFLOW = {
  id: 'demo-shopflow-api', name: 'shopflow-api', files: 214, functions: 1386, classes: 142,
  coverageBefore: 41, coverageAfter: 78,
  claims: { total: 3912, verified: 3305, uncertain: 402, unsupported: 205 },
  branch: 'main', commit: 'a3f9c21', origin: 'github.com/shopflow/shopflow-api',
} as const;

export interface DemoFile { id: string; path: string; language: string; domain: string; layer: string; sizeBytes: number }
export interface DemoSymbol { id: string; name: string; qualifiedName: string; kind: 'function' | 'method' | 'class'; fileId: string; parentId: string | null; path: string; line: number; endLine: number; documented: boolean; willBeGenerated: boolean; summary: string; signature: string }

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOMAINS: [string, string][] = [
  ['orders', 'order'], ['carts', 'cart'], ['catalog', 'product'], ['payments', 'payment'], ['customers', 'customer'], ['inventory', 'stock_item'],
  ['shipping', 'shipment'], ['returns', 'return_request'], ['coupons', 'coupon'], ['invoices', 'invoice'], ['reviews', 'review'], ['wishlists', 'wishlist'],
  ['pricing', 'price_rule'], ['tax', 'tax_rate'], ['notifications', 'notification'], ['search', 'search_query'], ['subscriptions', 'subscription'], ['warehouses', 'warehouse'],
];
const LAYERS = ['api/routes', 'services', 'repositories', 'schemas', 'models', 'tasks', 'events', 'tests'];
const CORE = ['app/main.py', 'app/core/config.py', 'app/core/security.py', 'app/core/logging.py', 'app/core/errors.py', 'app/core/pagination.py', 'app/core/idempotency.py', 'app/core/rate_limit.py', 'app/core/telemetry.py', 'app/db/session.py', 'app/db/base.py', 'app/db/unit_of_work.py', 'app/db/retry.py', 'app/api/deps.py', 'app/api/router.py', 'app/api/health.py', 'app/api/middleware/auth.py', 'app/api/middleware/request_id.py', 'app/api/middleware/cors.py', 'app/integrations/stripe_client.py', 'app/integrations/adyen_client.py', 'app/integrations/shippo_client.py', 'app/integrations/sendgrid_client.py', 'app/integrations/s3_storage.py', 'app/integrations/redis_cache.py', 'app/integrations/elastic_client.py', 'app/workers/celery_app.py', 'app/workers/schedules.py', 'app/utils/money.py', 'app/utils/dates.py', 'app/utils/slugs.py', 'app/utils/hashing.py', 'app/utils/retries.py', 'app/utils/currency.py', 'app/utils/addresses.py', 'tests/conftest.py', 'tests/factories.py', 'tests/test_health.py', 'scripts/seed_catalog.py', 'scripts/rotate_keys.py'];
const CONFIG = ['pyproject.toml', 'alembic.ini', 'docker-compose.yml', 'Dockerfile', '.github/workflows/ci.yml', '.github/workflows/release.yml', 'deploy/k8s/api.yaml', 'deploy/k8s/worker.yaml', 'deploy/k8s/ingress.yaml', 'README.md', 'docs/architecture.md', 'docs/runbook.md'];
const MIGRATIONS = 18;
const ACTIONS: [string, string][] = [
  ['create', 'Create'], ['get', 'Fetch'], ['list', 'List'], ['update', 'Update'], ['delete', 'Remove'], ['validate', 'Validate'], ['serialize', 'Serialize'], ['reconcile', 'Reconcile'],
  ['publish', 'Publish an event for'], ['refresh', 'Refresh'], ['archive', 'Archive'], ['restore', 'Restore'], ['audit', 'Record an audit entry for'], ['export', 'Export'], ['import', 'Import'], ['price', 'Compute the price of'],
];
const CONTEXTS = ['for the authenticated customer', 'inside the current unit of work', 'and emit a domain event', 'using the idempotency key', 'with optimistic locking', 'after permission checks', 'from the read replica', 'and invalidate the cache'];
const CLASS_SUFFIX = ['Service', 'Repository', 'Create', 'Update', 'Read', 'Model', 'Event', 'Policy'];

const pascal = (snake: string) => snake.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('');
const words = (snake: string) => snake.replace(/_/g, ' ');

function buildFiles(): DemoFile[] {
  const random = mulberry32(214);
  const files: DemoFile[] = [];
  const add = (path: string, domain: string, layer: string) => {
    const language = path.endsWith('.py') ? 'Python' : path.endsWith('.toml') || path.endsWith('.ini') ? 'TOML' : path.endsWith('.md') ? 'Markdown' : path === 'Dockerfile' ? 'Dockerfile' : 'YAML';
    files.push({ id: `f${String(files.length + 1).padStart(3, '0')}`, path, language, domain, layer, sizeBytes: 900 + Math.floor(random() * 18000) });
  };
  for (const [domain] of DOMAINS) for (const layer of LAYERS) add(layer === 'tests' ? `tests/${domain}/test_${domain}.py` : `app/${layer}/${domain}.py`, domain, layer);
  for (const path of CORE) add(path, 'platform', 'core');
  for (let i = 1; i <= MIGRATIONS; i += 1) add(`alembic/versions/${String(i).padStart(4, '0')}_${DOMAINS[i % DOMAINS.length][0]}_schema.py`, 'platform', 'migrations');
  for (const path of CONFIG) add(path, 'platform', 'config');
  return files;
}

function buildSymbols(files: DemoFile[]): DemoSymbol[] {
  const random = mulberry32(1386);
  const python = files.filter(file => file.language === 'Python');
  const symbols: DemoSymbol[] = [];
  const nextLine = new Map<string, number>();
  const lineIn = (fileId: string) => { const line = nextLine.get(fileId) ?? 12; nextLine.set(fileId, line + 7 + Math.floor(random() * 26)); return line; };
  const domainFiles = python.filter(file => file.domain !== 'platform' && file.layer !== 'tests');

  const classes: DemoSymbol[] = [];
  for (let i = 0; classes.length < SHOPFLOW.classes; i += 1) {
    const file = domainFiles[i % domainFiles.length];
    const entity = DOMAINS.find(([domain]) => domain === file.domain)![1];
    const name = `${pascal(entity)}${CLASS_SUFFIX[i % CLASS_SUFFIX.length]}${i >= domainFiles.length ? 'V2' : ''}`;
    const qualifiedName = `${file.path.replace(/\.py$/, '').replace(/\//g, '.')}.${name}`;
    if (classes.some(item => item.qualifiedName === qualifiedName)) continue;
    classes.push({ id: `c${String(classes.length + 1).padStart(3, '0')}`, name, qualifiedName, kind: 'class', fileId: file.id, parentId: null, path: file.path, line: lineIn(file.id), endLine: 0, documented: false, willBeGenerated: false, summary: `${pascal(entity)} ${CLASS_SUFFIX[i % CLASS_SUFFIX.length].toLowerCase()} for the ${file.domain} domain.`, signature: `class ${name}` });
  }
  symbols.push(...classes);

  const used = new Set<string>();
  let functions = 0;
  for (let i = 0; functions < SHOPFLOW.functions; i += 1) {
    const file = python[Math.floor(random() * python.length)];
    const entity = DOMAINS.find(([domain]) => domain === file.domain)?.[1] ?? file.path.split('/').pop()!.replace('.py', '').replace(/^\d+_/, '');
    const [verb, phrase] = ACTIONS[Math.floor(random() * ACTIONS.length)];
    const variant = i % 5 === 0 ? `${verb}_${entity}_batch` : i % 7 === 0 ? `${verb}_${entity}_by_id` : `${verb}_${entity}`;
    const owner = classes.find(item => item.fileId === file.id);
    const asMethod = !!owner && random() < .45;
    const module = file.path.replace(/\.py$/, '').replace(/\//g, '.');
    const qualifiedName = `${module}.${asMethod ? `${owner.name}.` : ''}${variant}`;
    if (used.has(qualifiedName)) continue;
    used.add(qualifiedName);
    functions += 1;
    const context = CONTEXTS[Math.floor(random() * CONTEXTS.length)];
    symbols.push({ id: `s${String(functions).padStart(4, '0')}`, name: variant, qualifiedName, kind: asMethod ? 'method' : 'function', fileId: file.id, parentId: asMethod ? owner.id : null, path: file.path, line: lineIn(file.id), endLine: 0, documented: false, willBeGenerated: false, summary: `${phrase} ${words(entity)}${variant.endsWith('_batch') ? ' records in bulk' : ''} ${context}.`, signature: `${asMethod ? 'self, ' : ''}${entity}_id: UUID, session: Session` });
  }

  /** Coverage is exact over documentable symbols: 41 percent exist, and generation raises that to 78 percent. */
  const order = symbols.map((symbol, index) => ({ symbol, key: mulberry32(index + 41)() })).sort((a, b) => a.key - b.key);
  const existing = Math.round(symbols.length * SHOPFLOW.coverageBefore / 100);
  const after = Math.round(symbols.length * SHOPFLOW.coverageAfter / 100);
  order.forEach(({ symbol }, index) => { symbol.documented = index < existing; symbol.willBeGenerated = index >= existing && index < after; });
  return symbols;
}

function buildClaims(symbols: DemoSymbol[]): Claim[] {
  const random = mulberry32(3912);
  const { verified, uncertain, unsupported, total } = SHOPFLOW.claims;
  const statuses: ClaimStatus[] = [...Array<ClaimStatus>(verified).fill('verified'), ...Array<ClaimStatus>(uncertain).fill('uncertain'), ...Array<ClaimStatus>(unsupported).fill('unsupported')];
  for (let i = statuses.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [statuses[i], statuses[j]] = [statuses[j], statuses[i]]; }
  const templates: ((symbol: DemoSymbol) => string)[] = [
    symbol => `${symbol.name} raises NotFoundError when the record does not exist.`,
    symbol => `${symbol.name} writes inside the caller's transaction.`,
    symbol => `${symbol.name} returns a paginated result ordered by creation time.`,
    symbol => `${symbol.name} requires an authenticated session.`,
    symbol => `${symbol.name} emits a domain event after a successful commit.`,
    symbol => `${symbol.name} is safe to retry with the same idempotency key.`,
  ];
  return Array.from({ length: total }, (_, index) => {
    const symbol = symbols[Math.floor(random() * symbols.length)];
    return { id: `claim-${String(index + 1).padStart(4, '0')}`, status: statuses[index], text: templates[index % templates.length](symbol), symbol: symbol.qualifiedName, path: symbol.path, line: symbol.line };
  });
}

function buildGraph(files: DemoFile[], symbols: DemoSymbol[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const random = mulberry32(600);
  const domainIds = [...DOMAINS.map(([domain]) => domain), 'platform'];
  const cluster = (domain: string) => `cluster-${(domainIds.indexOf(domain) % 8) + 1}`;
  const domainOf = new Map(files.map(file => [file.id, file.domain]));
  const classes = symbols.filter(symbol => symbol.kind === 'class');
  const callable = symbols.filter(symbol => symbol.kind !== 'class').filter((_, index) => index % 4 === 0);
  const nodes: GraphNode[] = [
    ...files.map(file => ({ id: file.id, label: file.path.split('/').pop()!, kind: 'module', cluster: cluster(file.domain), path: file.path })),
    ...classes.map(symbol => ({ id: symbol.id, label: symbol.name, kind: 'class', cluster: cluster(domainOf.get(symbol.fileId)!), path: symbol.path })),
    ...callable.map(symbol => ({ id: symbol.id, label: symbol.name, kind: symbol.kind, cluster: cluster(domainOf.get(symbol.fileId)!), path: symbol.path })),
  ];
  const edges: GraphEdge[] = [];
  [...classes, ...callable].forEach(symbol => edges.push({ source: symbol.fileId, target: symbol.id, kind: 'contains' }));
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const python = files.filter(file => file.language === 'Python');
  /** Imports follow the layering, so they point only to a lower rank (or an earlier file at equal rank) and form no cycles. A few cycles are then added on purpose. */
  const rank = (file: DemoFile) => ({ tests: 7, 'api/routes': 6, tasks: 5, services: 4, events: 3, repositories: 3, models: 1, schemas: 1, migrations: 2, core: 0 } as Record<string, number>)[file.layer] ?? 0;
  const order = new Map(python.map((file, index) => [file.id, index]));
  const below = (file: DemoFile, other: DemoFile) => rank(other) < rank(file) || rank(other) === rank(file) && order.get(other.id)! < order.get(file.id)!;
  python.forEach(file => {
    const peers = python.filter(other => other.domain === file.domain && below(file, other));
    const shared = python.filter(other => other.domain === 'platform' && below(file, other));
    for (let i = 0; i < 2; i += 1) {
      const pool = random() < .75 && peers.length ? peers : shared;
      if (pool.length) edges.push({ source: file.id, target: pick(pool).id, kind: 'imports' });
    }
  });
  const byPath = new Map(files.map(file => [file.path, file.id]));
  [['app/services/orders.py', 'app/services/payments.py'], ['app/services/carts.py', 'app/services/coupons.py'], ['app/core/config.py', 'app/core/logging.py']].forEach(([a, b]) => {
    edges.push({ source: byPath.get(a)!, target: byPath.get(b)!, kind: 'imports' }, { source: byPath.get(b)!, target: byPath.get(a)!, kind: 'imports' });
  });
  callable.forEach(symbol => { const target = pick(callable); if (target.id !== symbol.id) edges.push({ source: symbol.id, target: target.id, kind: 'calls' }); });
  classes.forEach((symbol, index) => { if (index % 6 === 0) { const target = pick(classes); if (target.id !== symbol.id) edges.push({ source: symbol.id, target: target.id, kind: 'inherits' }); } });
  return { nodes, edges };
}

function buildTree(files: DemoFile[]): FileNode[] {
  const root: FileNode[] = [];
  for (const file of files) {
    let level = root, prefix = '';
    const parts = file.path.split('/');
    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (index === parts.length - 1) { level.push({ path: file.path, name: part, type: 'file', language: file.language, sizeBytes: file.sizeBytes }); return; }
      let directory = level.find(node => node.type === 'directory' && node.name === part);
      if (!directory) { directory = { path: prefix, name: part, type: 'directory', language: null, sizeBytes: null, children: [] }; level.push(directory); }
      level = directory.children!;
    });
  }
  return root;
}

function languageShares(files: DemoFile[]): LanguageShare[] {
  const counts = new Map<string, number>();
  files.forEach(file => counts.set(file.language, (counts.get(file.language) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, files: count, share: Math.round(count / files.length * 1000) / 10 }));
}

const STATEMENTS: ((entity: string, pad: string) => string[])[] = [
  (entity, pad) => [`${pad}record = session.get(${pascal(entity)}, ${entity}_id)`],
  (entity, pad) => [`${pad}if record is None:`, `${pad}    raise NotFoundError(${entity}_id)`],
  (_, pad) => [`${pad}# Keep the write inside the caller's transaction.`],
  (entity, pad) => [`${pad}audit.record("${entity}", record.id)`],
  (_, pad) => [`${pad}events.publish(record.to_event())`],
  (entity, pad) => [`${pad}cache.invalidate(f"${entity}:{record.id}")`],
  (_, pad) => [`${pad}# Retries are safe because the key is checked first.`],
  (_, pad) => [`${pad}session.flush()`],
  (entity, pad) => [`${pad}for item in record.items:`, `${pad}    totals.add(item.${entity}_id, item.amount)`],
];

/**
 * Lays out each Python file and writes its text in one pass, so every symbol's line span points at its own code.
 * Docstrings are written only for symbols marked documented, so the source agrees with the coverage figures.
 */
function layoutSources(files: DemoFile[], symbols: DemoSymbol[]): Map<string, string> {
  const random = mulberry32(4096);
  const sources = new Map<string, string>();
  for (const file of files) {
    if (file.language !== 'Python') { sources.set(file.id, `# ${file.path}\n# Illustrative ${file.language} file in the shopflow-api demo fixture.\n`); continue; }
    const own = symbols.filter(symbol => symbol.fileId === file.id);
    const entity = DOMAINS.find(([domain]) => domain === file.domain)?.[1] ?? 'record';
    const lines = [`"""${file.domain} ${file.layer} module. Illustrative demo source, not a real repository."""`, 'from uuid import UUID', '', 'from sqlalchemy.orm import Session', '', ''];
    const writeCallable = (symbol: DemoSymbol, pad: string) => {
      symbol.line = lines.length + 1;
      const length = 4 + Math.floor(random() ** 2 * 26);
      lines.push(`${pad}def ${symbol.name}(${symbol.signature}):`);
      if (symbol.documented) lines.push(`${pad}    """${symbol.summary}"""`);
      while (lines.length - symbol.line + 2 < length) lines.push(...STATEMENTS[Math.floor(random() * STATEMENTS.length)](entity, `${pad}    `));
      lines.push(`${pad}    return record`);
      symbol.endLine = lines.length;
      lines.push('');
    };
    for (const owner of own.filter(symbol => symbol.kind === 'class')) {
      owner.line = lines.length + 1;
      lines.push(`class ${owner.name}:`);
      if (owner.documented) lines.push(`    """${owner.summary}"""`);
      lines.push(`    __domain__ = "${file.domain}"`, '');
      own.filter(symbol => symbol.parentId === owner.id).forEach(method => writeCallable(method, '    '));
      owner.endLine = lines.length - 1;
      lines.push('');
    }
    own.filter(symbol => symbol.kind === 'function').forEach(symbol => writeCallable(symbol, ''));
    const content = lines.join('\n');
    file.sizeBytes = content.length;
    sources.set(file.id, content);
  }
  return sources;
}

export function buildShopflow() {
  const files = buildFiles();
  const symbols = buildSymbols(files);
  const sources = layoutSources(files, symbols);
  return {
    files, symbols,
    languages: languageShares(files),
    tree: buildTree(files),
    claims: buildClaims(symbols),
    graph: buildGraph(files, symbols),
    documents: symbols.map((symbol): DocumentRecord => ({ id: symbol.id, path: symbol.path, symbol: symbol.qualifiedName, kind: symbol.kind, existing: symbol.documented, generated: symbol.willBeGenerated, summary: symbol.summary })),
    sources,
    source: (path: string) => { const file = files.find(item => item.path === path); return file ? { file, content: sources.get(file.id)! } : null; },
  };
}
export type Shopflow = ReturnType<typeof buildShopflow>;
