import { importCycles } from '../../data/analysisMath';
import type { CoveragePoint, DataProvenance, RepositoryAnalysis } from '../../data/dashboard';
import type { ColorToken, DonutModel, HeatmapModel, LineModel, NetworkModel, Provenance, RadialModel, TreemapModel } from '../../viz/types';

/** Pure derivations from the structural record. Every figure is computed from the record; nothing is estimated. */
export const CLUSTER_COLORS: ColorToken[] = ['--cluster-1', '--cluster-2', '--cluster-3', '--cluster-4', '--cluster-5', '--cluster-6', '--cluster-7', '--cluster-8'];
export const toViz = (provenance: DataProvenance, snapshotId?: string): Provenance => ({ kind: provenance.kind === 'demo' ? 'demo' : 'measured', source: provenance.source, snapshotId });

const CALLABLE = new Set(['function', 'method', 'constructor']);
const CLASSLIKE = new Set(['class', 'interface', 'enum', 'record']);
const DOCUMENTABLE = new Set([...CALLABLE, ...CLASSLIKE]);
export const isDocumentable = (kind: string) => DOCUMENTABLE.has(kind);

/** A module group is the directory that holds the file. */
export const groupOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '(root)';

export type ModuleStatus = 'critical' | 'attention' | 'healthy';
export interface ModuleRow {
  path: string;
  group: string;
  language: string;
  functions: number;
  classes: number;
  documented: number;
  documentable: number;
  /** Percent of documentable symbols with existing documentation. Null when the file has none. */
  coverage: number | null;
  /** Complexity proxy: mean callable length in source lines. Not cyclomatic complexity, which Phase II does not measure. */
  meanLength: number | null;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
  unresolved: number;
  sizeBytes: number;
  status: ModuleStatus;
  /** Ranks attention: undocumented symbols, plus unresolved links and cycle membership. */
  score: number;
}

export interface ImportEdge { source: string; target: string }

/** File-level import edges. Endpoints may be file IDs or symbol IDs; both resolve to the file path. */
export function importEdges(analysis: RepositoryAnalysis): ImportEdge[] {
  const pathById = new Map<string, string>([...analysis.files.map(file => [file.id, file.path] as const), ...analysis.symbols.map(symbol => [symbol.id, symbol.path] as const)]);
  const seen = new Map<string, ImportEdge>();
  analysis.relations.forEach(relation => {
    if (relation.kind !== 'imports' || !relation.target) return;
    const source = pathById.get(relation.source), target = pathById.get(relation.target);
    if (source && target && source !== target) seen.set(`${source}>${target}`, { source, target });
  });
  return [...seen.values()];
}

export function moduleRows(analysis: RepositoryAnalysis): ModuleRow[] {
  const edges = importEdges(analysis);
  const fanIn = new Map<string, number>(), fanOut = new Map<string, number>();
  edges.forEach(edge => { fanOut.set(edge.source, (fanOut.get(edge.source) ?? 0) + 1); fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1); });
  const cyclic = new Set(importCycles(edges).flat());
  const unresolved = new Map<string, number>();
  analysis.relations.forEach(relation => { if (relation.resolution === 'unresolved' || relation.resolution === 'ambiguous') unresolved.set(relation.path, (unresolved.get(relation.path) ?? 0) + 1); });
  const bySymbolPath = new Map<string, RepositoryAnalysis['symbols']>();
  analysis.symbols.forEach(symbol => { if (!bySymbolPath.has(symbol.path)) bySymbolPath.set(symbol.path, []); bySymbolPath.get(symbol.path)!.push(symbol); });
  return analysis.files.map(file => {
    const symbols = (bySymbolPath.get(file.path) ?? []).filter(symbol => isDocumentable(symbol.kind));
    const callables = symbols.filter(symbol => CALLABLE.has(symbol.kind));
    const documented = symbols.filter(symbol => symbol.documented).length;
    const coverage = symbols.length ? Math.round(documented / symbols.length * 1000) / 10 : null;
    const meanLength = callables.length ? Math.round(callables.reduce((sum, symbol) => sum + symbol.endLine - symbol.line + 1, 0) / callables.length * 10) / 10 : null;
    const inCycle = cyclic.has(file.path), open = unresolved.get(file.path) ?? 0;
    const status: ModuleStatus = coverage === null ? 'healthy' : coverage < 30 || inCycle && coverage < 60 ? 'critical' : coverage < 60 || open > 0 ? 'attention' : 'healthy';
    return {
      path: file.path, group: groupOf(file.path), language: file.language, functions: callables.length, classes: symbols.filter(symbol => CLASSLIKE.has(symbol.kind)).length,
      documented, documentable: symbols.length, coverage, meanLength, fanIn: fanIn.get(file.path) ?? 0, fanOut: fanOut.get(file.path) ?? 0, inCycle, unresolved: open, sizeBytes: file.sizeBytes,
      status, score: symbols.length - documented + open * 2 + (inCycle ? 3 : 0),
    };
  });
}

export interface DependencyStats { mostImported: { path: string; count: number }[]; cycles: string[][]; orphans: string[]; edges: number }
export function dependencyStats(analysis: RepositoryAnalysis, rows = moduleRows(analysis)): DependencyStats {
  const edges = importEdges(analysis);
  const touched = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  const code = new Set(analysis.symbols.map(symbol => symbol.path));
  return {
    mostImported: [...rows].filter(row => row.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path)).slice(0, 3).map(row => ({ path: row.path, count: row.fanIn })),
    cycles: importCycles(edges),
    orphans: analysis.files.filter(file => code.has(file.path) && !touched.has(file.path)).map(file => file.path),
    edges: edges.length,
  };
}

export function languageDonut(analysis: RepositoryAnalysis, provenance: Provenance): DonutModel {
  const counts = new Map<string, number>();
  analysis.files.forEach(file => counts.set(file.language, (counts.get(file.language) ?? 0) + 1));
  return { kind: 'donut', id: 'overview-languages', title: 'Language distribution', description: 'Files by detected language.', provenance, unit: 'files', segments: [...counts].sort((a, b) => b[1] - a[1]).map(([label, value], index) => ({ id: label, label, value, color: CLUSTER_COLORS[(index * 3) % 8] })) };
}

/** Code modules sized by bytes, grouped by directory. Height carries the measured undocumented-symbol count. Files without symbols, such as configuration, are left out. */
export function moduleTreemap(rows: ModuleRow[], provenance: Provenance, limit = 60): TreemapModel {
  const top = rows.filter(row => row.documentable > 0).sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
  const groups = [...new Set(top.map(row => row.group))].sort();
  return {
    kind: 'treemap', id: 'overview-treemap', title: 'Module size', description: `The ${top.length} largest files, by size in bytes.`, provenance, valueLabel: 'bytes', heightLabel: 'Undocumented symbols',
    groups: groups.map((group, index) => ({ id: group, label: group, color: CLUSTER_COLORS[index % 8] })),
    nodes: top.map(row => ({ id: row.path, label: row.path.split('/').pop()!, value: row.sizeBytes, group: row.group, heightValue: row.documentable - row.documented, source: { path: row.path } })),
  };
}

/** Undocumented share per directory and symbol kind, for the directories with the most undocumented symbols. */
export function gapHeatmap(analysis: RepositoryAnalysis, provenance: Provenance, limit = 12): HeatmapModel {
  const kinds = [...new Set(analysis.symbols.map(symbol => symbol.kind).filter(isDocumentable))].sort();
  const cells = new Map<string, { total: number; missing: number }>();
  const missingByGroup = new Map<string, number>();
  analysis.symbols.forEach(symbol => {
    if (!isDocumentable(symbol.kind)) return;
    const group = groupOf(symbol.path), key = `${group}|${symbol.kind}`;
    const cell = cells.get(key) ?? { total: 0, missing: 0 };
    cell.total += 1;
    if (!symbol.documented) { cell.missing += 1; missingByGroup.set(group, (missingByGroup.get(group) ?? 0) + 1); }
    cells.set(key, cell);
  });
  const groups = [...missingByGroup].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([group]) => group);
  return {
    kind: 'heatmap', id: 'overview-gaps', title: 'Documentation gaps by module and symbol kind', description: 'Percent of symbols without existing documentation. Empty cells have no symbols of that kind.', provenance, valueLabel: '% undocumented',
    xLabels: kinds, yLabels: groups,
    values: groups.map(group => kinds.map(kind => { const cell = cells.get(`${group}|${kind}`); return cell ? Math.round(cell.missing / cell.total * 100) : 0; })),
  };
}

/** Directories as nodes, with one edge per directory pair that has at least one import. */
export function architectureMap(analysis: RepositoryAnalysis, provenance: Provenance, limit = 14): NetworkModel {
  const edges = importEdges(analysis);
  const weight = new Map<string, number>();
  edges.forEach(edge => { [edge.source, edge.target].forEach(path => weight.set(groupOf(path), (weight.get(groupOf(path)) ?? 0) + 1)); });
  analysis.files.forEach(file => { if (!weight.has(groupOf(file.path))) weight.set(groupOf(file.path), 0); });
  const groups = [...weight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([group]) => group);
  const keep = new Set(groups);
  const pairs = new Map<string, { source: string; target: string }>();
  edges.forEach(edge => { const source = groupOf(edge.source), target = groupOf(edge.target); if (source !== target && keep.has(source) && keep.has(target)) pairs.set(`${source}>${target}`, { source, target }); });
  return {
    kind: 'network', id: 'overview-architecture', title: 'Architecture map', description: 'Directories and the imports between them.', provenance, flow: true,
    clusters: groups.map((group, index) => ({ id: group, label: group, color: CLUSTER_COLORS[index % 8] })),
    nodes: groups.map(group => ({ id: group, label: group.split('/').pop() || group, cluster: group, source: { path: group } })),
    edges: [...pairs.values()].map((pair, index) => ({ id: `arch-${index}`, source: pair.source, target: pair.target, kind: 'imports' })),
  };
}

export type CoverageSeries = 'both' | 'existing' | 'generated';
export function coverageChart(history: CoveragePoint[], days: number, series: CoverageSeries, provenance: Provenance): LineModel {
  const slice = history.slice(-days);
  const all = [
    { id: 'existing', label: 'Existing docs', color: '--blue' as ColorToken, values: slice.map(point => point.existing) },
    { id: 'generated', label: 'Generated docs', color: '--cyan' as ColorToken, values: slice.map(point => point.generated) },
  ];
  return {
    kind: 'line', id: 'overview-coverage', title: 'Documentation coverage over time', description: `Percent of documentable symbols, last ${days} days.`, provenance, variant: 'area', valueLabel: '% of symbols', unit: '%',
    categories: slice.map(point => ({ id: point.date, label: point.date.slice(5) })),
    series: all.filter(item => series === 'both' || item.id === series),
  };
}

export interface CompletenessInput { parsed: number | null; summarized: number | null; verified: number | null; reviewed: number | null; published: number | null }
/** Each stage is a percent, or null when the stage has no data source. The overall figure averages only stages that have one. */
export function completeness(input: CompletenessInput, provenance: Provenance): { model: RadialModel; overall: number | null; pending: string[] } {
  const stages: [keyof CompletenessInput, string, ColorToken][] = [['parsed', 'Parsed', '--blue'], ['summarized', 'Summarized', '--cyan'], ['verified', 'Verified', '--mint'], ['reviewed', 'Reviewed', '--violet'], ['published', 'Published', '--pink']];
  const known = stages.filter(([key]) => input[key] !== null);
  const overall = known.length ? Math.round(known.reduce((sum, [key]) => sum + input[key]!, 0) / known.length) : null;
  return {
    overall,
    pending: stages.filter(([key]) => input[key] === null).map(([, label]) => label),
    model: { kind: 'radial', id: 'overview-completeness', title: 'Documentation completeness', description: 'Share of the pipeline each stage has completed.', provenance, unit: '%', metrics: known.map(([key, label, color]) => ({ id: key, label, value: Math.round(input[key]! * 10) / 10, max: 100, color })) },
  };
}

/** Percent change between the first and last point of a window, or null without history. */
export function delta(values: number[]): number | null {
  if (values.length < 2 || values[0] === 0) return null;
  return Math.round((values.at(-1)! - values[0]) / values[0] * 1000) / 10;
}
