import type { ExploratoryStatistics } from '../api';
import type { AnalysisRelation, AnalysisSymbol, CoveragePoint, RepositoryAnalysis } from '../dashboard';
import { importCycles, namingPattern } from '../analysisMath';
import { SHOPFLOW, type Shopflow } from './shopflow';

/**
 * Builds the Phase II record shape for the demo repository by measuring the fixture's own generated source.
 * The source is illustrative, so the result is too, but every figure follows from that text and from no other input.
 */
const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
const TOKEN = /("""[\s\S]*?"""|f?"[^"\n]*")|(#[^\n]*)|([A-Za-z_][A-Za-z0-9_]*)|(\d+(?:\.\d+)?)|(==|!=|<=|>=|->|[+\-*/%=<>])|([()[\]{}:,.@])/g;

type Counter = Map<string, number>;
const bump = (counter: Counter, key: string, by = 1) => counter.set(key, (counter.get(key) ?? 0) + by);
const frequencies = (counter: Counter, limit = 80) => [...counter].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value, count]) => ({ schema_version: '1.0' as const, value, count }));
const record = (counter: Counter) => Object.fromEntries([...counter].sort((a, b) => a[0].localeCompare(b[0])));

export function buildDemoAnalysis(fixture: Shopflow): RepositoryAnalysis {
  const { files, symbols, graph, sources } = fixture;
  const pathOf = new Map(files.map(file => [file.id, file.path]));
  const tokenTypes: Counter = new Map(), all: Counter = new Map(), identifiers: Counter = new Map(), keywords: Counter = new Map(), terms: Counter = new Map();
  const commentLengths: number[] = [], docstringLengths: number[] = [];
  let sourceLines = 0, commentLines = 0, tokens = 0, nonComment = 0;
  for (const file of files) {
    const text = sources.get(file.id) ?? '';
    for (const line of text.split('\n')) {
      if (line.trim()) sourceLines += 1;
      if (/^\s*(#|""")/.test(line)) commentLines += 1;
    }
    for (const match of text.matchAll(TOKEN)) {
      const [value, string, comment, name, numeral, operator] = match;
      const type = string ? 'string' : comment ? 'comment' : name ? (KEYWORDS.has(name) ? 'keyword' : 'identifier') : numeral ? 'number' : operator ? 'operator' : 'punctuation';
      tokens += 1;
      bump(tokenTypes, type);
      if (type !== 'comment') { nonComment += 1; bump(all, value); }
      if (type === 'identifier') bump(identifiers, value);
      if (type === 'keyword') bump(keywords, value);
      const prose = comment ? comment.replace(/^#\s*/, '') : string?.startsWith('"""') ? string.slice(3, -3) : null;
      if (prose !== null) {
        (comment ? commentLengths : docstringLengths).push(prose.length);
        prose.toLowerCase().match(/[a-z]+/g)?.forEach(term => bump(terms, term));
      }
    }
  }
  const lengths: Counter = new Map(), naming: Counter = new Map();
  identifiers.forEach((_, name) => { bump(lengths, String(name.length)); bump(naming, namingPattern(name)); });

  const byKind: Counter = new Map(), documentedByKind: Counter = new Map(), functionsPerModule: Counter = new Map(), methodsPerClass: Counter = new Map();
  const classById = new Map(symbols.filter(symbol => symbol.kind === 'class').map(symbol => [symbol.id, symbol]));
  symbols.forEach(symbol => {
    bump(byKind, symbol.kind);
    if (symbol.documented) bump(documentedByKind, symbol.kind);
    if (symbol.kind === 'function') bump(functionsPerModule, symbol.path);
    if (symbol.kind === 'method' && symbol.parentId) bump(methodsPerClass, classById.get(symbol.parentId)!.qualifiedName);
  });

  const symbolById = new Map(symbols.map(symbol => [symbol.id, symbol]));
  const relations: AnalysisRelation[] = [];
  const lineOf = (id: string) => symbolById.get(id)?.line ?? 2;
  const add = (relation: Omit<AnalysisRelation, 'id'>) => relations.push({ id: `rel-${relations.length + 1}`, ...relation });
  symbols.forEach(symbol => add({ source: symbol.parentId ?? symbol.fileId, target: symbol.id, targetName: symbol.qualifiedName, kind: 'contains', resolution: 'confirmed', path: symbol.path, line: symbol.line }));
  graph.edges.filter(edge => edge.kind !== 'contains').forEach(edge => {
    const target = symbolById.get(edge.target)?.qualifiedName ?? pathOf.get(edge.target) ?? edge.target;
    add({ source: edge.source, target: edge.target, targetName: target, kind: edge.kind as AnalysisRelation['kind'], resolution: 'confirmed', path: symbolById.get(edge.source)?.path ?? pathOf.get(edge.source)!, line: lineOf(edge.source) });
  });
  files.filter(file => file.language === 'Python').forEach(file => {
    add({ source: file.id, target: null, targetName: 'uuid.UUID', kind: 'imports', resolution: 'external', path: file.path, line: 2 });
    add({ source: file.id, target: null, targetName: 'sqlalchemy.orm.Session', kind: 'imports', resolution: 'external', path: file.path, line: 4 });
  });
  symbols.filter(symbol => symbol.kind !== 'class').forEach((symbol, index) => {
    if (index % 9 === 0) add({ source: symbol.id, target: null, targetName: 'legacy_reconcile', kind: 'calls', resolution: 'unresolved', path: symbol.path, line: symbol.line + 1 });
  });

  const imports = relations.filter(relation => relation.kind === 'imports' && relation.target).map(relation => ({ source: pathOf.get(relation.source)!, target: pathOf.get(relation.target!)! }));
  const fanIn: Counter = new Map(), fanOut: Counter = new Map(), status: Counter = new Map();
  const uniqueImports = [...new Map(imports.map(edge => [`${edge.source}>${edge.target}`, edge])).values()];
  uniqueImports.forEach(edge => { bump(fanOut, edge.source); bump(fanIn, edge.target); });
  relations.forEach(relation => bump(status, relation.resolution));

  const documentable = symbols.length, documented = symbols.filter(symbol => symbol.documented).length;
  const statistics: ExploratoryStatistics = {
    schema_version: '1.0',
    files: files.length,
    languages: record(files.reduce((counter, file) => bump(counter, file.language.toLowerCase()), new Map() as Counter)),
    source_lines: sourceLines,
    comment_lines: commentLines,
    documented_symbols: documented,
    documentable_symbols: documentable,
    documentation_coverage: documented / documentable,
    tokens,
    vocabulary_size: all.size,
    lexical_diversity: nonComment ? all.size / nonComment : 0,
    duplicate_files: 0,
    token_types: record(tokenTypes),
    token_frequencies: frequencies(all),
    identifiers: frequencies(identifiers),
    keywords: frequencies(keywords),
    documentation_terms: frequencies(terms),
    identifier_lengths: record(lengths),
    naming_patterns: record(naming),
    comment_lengths: commentLengths,
    docstring_lengths: docstringLengths,
    symbols_by_kind: record(byKind),
    documentation_by_kind: Object.fromEntries([...byKind].map(([kind, total]) => [kind, { total, documented: documentedByKind.get(kind) ?? 0 }])),
    undocumented_symbols: symbols.filter(symbol => !symbol.documented).map(symbol => symbol.qualifiedName),
    functions_per_module: record(functionsPerModule),
    methods_per_class: record(methodsPerClass),
    function_lengths: symbols.filter(symbol => symbol.kind !== 'class').map(symbol => symbol.endLine - symbol.line + 1),
    class_sizes: symbols.filter(symbol => symbol.kind === 'class').map(symbol => symbol.endLine - symbol.line + 1),
    relationships_by_status: record(status),
    module_fan_in: record(fanIn),
    module_fan_out: record(fanOut),
    circular_dependencies: importCycles(uniqueImports),
  };
  const toSymbol = (symbol: Shopflow['symbols'][number]): AnalysisSymbol => ({ id: symbol.id, name: symbol.name, qualifiedName: symbol.qualifiedName, kind: symbol.kind, parentId: symbol.parentId, fileId: symbol.fileId, path: symbol.path, line: symbol.line, endLine: symbol.endLine, documented: symbol.documented, signature: symbol.kind === 'class' ? null : `${symbol.name}(${symbol.signature})` });
  return {
    snapshotId: 'demo-snapshot-generated',
    analyzedAt: '2026-10-28T09:12:00Z',
    files: files.map(file => ({ id: file.id, path: file.path, language: file.language, sizeBytes: file.sizeBytes })),
    symbols: symbols.map(toSymbol),
    relations,
    statistics,
    issues: [],
    provenance: { kind: 'demo', source: 'Measured from the seeded shopflow-api fixture source. Illustrative, not an analysis of a real repository.' },
  };
}

/** Ninety days of illustrative history, ending at the fixture's figures. Demo only; no real history exists. */
export function buildCoverageHistory(): CoveragePoint[] {
  const days = 90, end = Date.UTC(2026, 10, 1), baselineDay = 41, generationStart = 77, generationEnd = 85;
  let seed = 90;
  const jitter = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - .5) * .6; };
  return Array.from({ length: days }, (_, day) => {
    const date = new Date(end - (days - 1 - day) * 86_400_000).toISOString().slice(0, 10);
    const existing = day >= baselineDay ? SHOPFLOW.coverageBefore : 33 + (SHOPFLOW.coverageBefore - 33) * day / baselineDay + jitter();
    const ramp = Math.min(1, Math.max(0, (day - generationStart) / (generationEnd - generationStart)));
    const generated = (SHOPFLOW.coverageAfter - SHOPFLOW.coverageBefore) * ramp;
    const growth = Math.min(1, day / baselineDay);
    const verified = Math.round(SHOPFLOW.claims.verified * ramp);
    return {
      date, existing: Math.round(existing * 10) / 10, generated: Math.round(generated * 10) / 10,
      files: Math.round(196 + (SHOPFLOW.files - 196) * growth), functions: Math.round(1290 + (SHOPFLOW.functions - 1290) * growth), classes: Math.round(133 + (SHOPFLOW.classes - 133) * growth),
      verified, needsReview: Math.round((SHOPFLOW.claims.uncertain + SHOPFLOW.claims.unsupported) * ramp),
    };
  });
}
