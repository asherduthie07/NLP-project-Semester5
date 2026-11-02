import type { DependencyGraph, ExploratoryStatistics } from '../../data/api';
import type { ColorToken, DonutModel, BarModel, HistogramModel, LineModel, NetworkModel, Provenance, ScatterModel, WordCloudModel } from '../types';

/** ChartDataAdapter for real Phase I/II records. Every number comes from the typed API response; nothing is estimated. */
const palette: ColorToken[] = ['--cluster-4', '--cluster-8', '--cluster-5', '--cluster-1', '--cluster-2', '--cluster-7', '--cluster-3', '--cluster-6'];
const colorAt = (index: number) => palette[index % palette.length];
const entries = (record: Record<string, number>) => Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

function donut(id: string, title: string, description: string, record: Record<string, number>, provenance: Provenance): DonutModel {
  return { kind: 'donut', id, title, description, provenance, segments: entries(record).map(([label, value], index) => ({ id: label, label, value, color: colorAt(index) })) };
}

function singleBar(id: string, title: string, description: string, record: Record<string, number>, valueLabel: string, provenance: Provenance): BarModel {
  const rows = entries(record);
  return { kind: 'bar', id, title, description, provenance, layout: 'grouped', orientation: 'horizontal', valueLabel, categories: rows.map(([label]) => ({ id: label, label })), series: [{ id: 'count', label: valueLabel, color: '--cyan', values: rows.map(([, value]) => value) }] };
}

/** Unit-width bins from raw measurements. Empty bins are retained so the shape of the distribution is not altered. */
export function histogramFromValues(id: string, title: string, description: string, values: number[], xLabel: string, provenance: Provenance, color: ColorToken = '--cyan', maxBins = 16): HistogramModel {
  if (!values.length) return { kind: 'histogram', id, title, description, provenance, xLabel, color, bins: [] };
  const min = Math.min(...values), max = Math.max(...values);
  const width = Math.max(1, Math.ceil((max - min + 1) / maxBins));
  const bins: HistogramModel['bins'] = [];
  for (let x0 = min; x0 <= max; x0 += width) {
    const x1 = x0 + width;
    bins.push({ id: `${x0}-${x1}`, x0, x1, count: values.filter(value => value >= x0 && value < x1).length });
  }
  return { kind: 'histogram', id, title, description, provenance, xLabel, color, bins };
}

function wordCloud(id: string, title: string, description: string, corpus: WordCloudModel['corpus'], frequencies: ExploratoryStatistics['identifiers'], label: string, color: ColorToken, provenance: Provenance, limit = 60): WordCloudModel {
  return { kind: 'wordcloud', id, title, description, corpus, provenance, categories: [{ id: corpus, label, color }], words: frequencies.slice(0, limit).map(item => ({ id: item.value, text: item.value, count: item.count, category: corpus })) };
}

/** Rank-frequency curve over a single corpus; `token_frequencies` itself mixes punctuation with words, so it is not used here. */
function rankFrequency(id: string, frequencies: ExploratoryStatistics['identifiers'], provenance: Provenance): LineModel {
  const sorted = [...frequencies].sort((a, b) => b.count - a.count);
  return { kind: 'line', id, title: 'Identifier rank and frequency', description: 'Occurrences by frequency rank, identifiers only.', provenance, variant: 'line', valueLabel: 'occurrences', categories: sorted.map((item, index) => ({ id: item.value, label: `${index + 1}` })), series: [{ id: 'count', label: 'Occurrences', color: '--cyan', values: sorted.map(item => item.count) }] };
}

export function exploratoryModels(stats: ExploratoryStatistics, provenance: Provenance) {
  const kinds = entries(Object.fromEntries(Object.entries(stats.documentation_by_kind).map(([kind, value]) => [kind, value.total ?? 0])));
  const modules = [...new Set([...Object.keys(stats.module_fan_in ?? {}), ...Object.keys(stats.module_fan_out ?? {})])];
  const fan: ScatterModel = {
    kind: 'scatter', id: 'stats-fan', title: 'Module fan-in and fan-out', description: 'Two measured quantities per module.', provenance,
    xLabel: 'Fan-out', yLabel: 'Fan-in', groups: [{ id: 'modules', label: 'Modules', color: '--cyan' }],
    points: modules.map(module => ({ id: module, label: module, x: stats.module_fan_out?.[module] ?? 0, y: stats.module_fan_in?.[module] ?? 0, group: 'modules' })),
  };
  const coverage: BarModel = {
    kind: 'bar', id: 'stats-coverage', title: 'Existing documentation by symbol kind', description: 'Symbols with and without an extracted docstring or JavaDoc.', provenance,
    layout: 'stacked', orientation: 'vertical', valueLabel: 'symbols', categories: kinds.map(([kind]) => ({ id: kind, label: kind })),
    series: [
      { id: 'documented', label: 'Documented', color: '--mint', values: kinds.map(([kind]) => stats.documentation_by_kind[kind].documented ?? 0) },
      { id: 'undocumented', label: 'Undocumented', color: '--coral', values: kinds.map(([kind]) => (stats.documentation_by_kind[kind].total ?? 0) - (stats.documentation_by_kind[kind].documented ?? 0)) },
    ],
  };
  const identifierLengths: HistogramModel = (() => {
    const lengths = Object.entries(stats.identifier_lengths).map(([length, count]) => ({ length: Number(length), count }));
    const expanded = lengths.flatMap(({ length, count }) => Array.from({ length: count }, () => length));
    return histogramFromValues('stats-identifier-lengths', 'Identifier length', 'Distinct identifier spellings by character length.', expanded, 'Characters', provenance);
  })();
  return {
    languages: donut('stats-languages', 'Language distribution', 'Imported source files by detected language.', stats.languages, provenance),
    tokenCategories: donut('stats-token-categories', 'Token categories', 'Every lexical token by category, punctuation included.', stats.token_types, provenance),
    namingPatterns: donut('stats-naming', 'Identifier naming patterns', 'Distinct identifier spellings by naming convention.', stats.naming_patterns, provenance),
    identifiers: wordCloud('stats-identifiers', 'Most frequent identifiers', 'Code identifiers only. No punctuation, keywords or prose.', 'code-identifiers', stats.identifiers, 'Identifiers', '--cyan', provenance),
    documentationTerms: wordCloud('stats-doc-terms', 'Most frequent documentation terms', 'Comments and docstrings only. No source code tokens.', 'documentation-terms', stats.documentation_terms, 'Documentation terms', '--cluster-5', provenance),
    keywords: singleBar('stats-keywords', 'Language keywords', 'Keyword occurrences across the corpus.', Object.fromEntries(stats.keywords.map(item => [item.value, item.count])), 'occurrences', provenance),
    rankFrequency: rankFrequency('stats-rank', stats.identifiers, provenance),
    identifierLengths,
    functionLengths: histogramFromValues('stats-function-lengths', 'Function length', 'Source lines per function.', stats.function_lengths, 'Lines', provenance, '--violet'),
    classSizes: histogramFromValues('stats-class-sizes', 'Class size', 'Source lines per class.', stats.class_sizes, 'Lines', provenance, '--blue'),
    commentLengths: histogramFromValues('stats-comment-lengths', 'Comment length', 'Characters per extracted comment.', stats.comment_lengths, 'Characters', provenance, '--pink'),
    docstringLengths: histogramFromValues('stats-docstring-lengths', 'Docstring length', 'Characters per extracted docstring.', stats.docstring_lengths, 'Characters', provenance, '--mint'),
    documentationByKind: coverage,
    functionsPerModule: singleBar('stats-functions', 'Functions per module', 'Top-level functions found in each module.', stats.functions_per_module, 'functions', provenance),
    methodsPerClass: singleBar('stats-methods', 'Methods per class', 'Methods found in each class.', stats.methods_per_class, 'methods', provenance),
    relationships: singleBar('stats-relationships', 'Relationship resolution', 'Extracted relationships by resolution state.', stats.relationships_by_status, 'relationships', provenance),
    fan,
  };
}

const edgeKind = { contains: 'contains', imports: 'imports', inherits: 'inherits', implements: 'inherits', calls: 'calls' } as const;

/** Only relationships with a resolved target become edges; the remainder are counted and reported, never guessed. */
export function networkFromGraph(graph: DependencyGraph, provenance: Provenance, title = 'Repository relationships'): NetworkModel {
  const paths = [...new Set(graph.nodes.map(node => node.evidence.relative_path))].sort();
  const ids = new Set(graph.nodes.map(node => node.id));
  const resolved = graph.edges.filter(edge => edge.target_id && ids.has(edge.source_id) && ids.has(edge.target_id));
  return {
    kind: 'network', id: `graph-${graph.snapshot_id}`, title, provenance: { ...provenance, snapshotId: graph.snapshot_id },
    clusters: paths.map((path, index) => ({ id: path, label: path, color: colorAt(index) })),
    nodes: graph.nodes.map(node => ({ id: node.id, label: node.name, cluster: node.evidence.relative_path, source: { path: node.evidence.relative_path, startLine: node.evidence.span.start.line, endLine: node.evidence.span.end.line } })),
    edges: resolved.map(edge => ({ id: edge.id, source: edge.source_id, target: edge.target_id as string, kind: edgeKind[edge.kind] })),
    unresolvedEdges: graph.edges.length - resolved.length,
  };
}
