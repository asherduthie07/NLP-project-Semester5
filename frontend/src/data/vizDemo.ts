import type { ColorToken, BarModel, DonutModel, HeatmapModel, HistogramModel, LineModel, NetworkModel, Provenance, RadialModel, ScatterModel, SparklineModel, TimelineModel, TreemapModel, WordCloudModel } from '../viz/types';

/** Seeded, labeled sample data for the design-system gallery. It is not an analysis of any repository. */
const provenance: Provenance = { kind: 'illustrative', source: 'Seeded design-system sample. Not an analysis result.' };

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const modules = ['auth', 'catalog', 'orders', 'payments', 'inventory', 'notify', 'gateway', 'shared'];
const moduleColors: ColorToken[] = ['--cluster-4', '--cluster-8', '--cluster-5', '--cluster-1', '--cluster-2', '--cluster-7', '--cluster-3', '--cluster-6'];
const groups = modules.map((label, index) => ({ id: label, label, color: moduleColors[index] }));
const random = seeded(214);
const whole = (min: number, max: number, r = random) => Math.round(min + r() * (max - min));

const coverage: LineModel = (() => {
  const days = Array.from({ length: 30 }, (_, index) => ({ id: `d${index + 1}`, label: `D${index + 1}` }));
  const existing = days.map((_, index) => Math.round(30 + index * .38 + Math.sin(index / 3) * 1.4));
  const generated = days.map((_, index) => Math.min(78, Math.round(34 + index * 1.52 + Math.sin(index / 2.5) * 1.8)));
  return { kind: 'line', id: 'demo-coverage', title: 'Documentation coverage over time', description: 'Existing and generated documentation, in percent.', unit: '%', provenance, variant: 'area', valueLabel: 'coverage', categories: days, series: [{ id: 'existing', label: 'Existing docs', color: '--violet', values: existing }, { id: 'generated', label: 'Generated docs', color: '--cyan', values: generated }] };
})();

const completeness: RadialModel = { kind: 'radial', id: 'demo-completeness', title: 'Documentation completeness', description: 'Exact percentages in both modes.', provenance, metrics: [{ id: 'overall', label: 'Overall', value: 76, max: 100, color: '--cyan', status: 'In progress' }, { id: 'parsed', label: 'Parsed', value: 100, max: 100, color: '--mint', status: 'Complete' }, { id: 'verified', label: 'Verified', value: 84, max: 100, color: '--blue' }, { id: 'reviewed', label: 'Reviewed', value: 52, max: 100, color: '--violet' }] };

const groupedBars: BarModel = (() => {
  const functions = modules.map(() => whole(70, 260));
  return { kind: 'bar', id: 'demo-functions', title: 'Functions per module', description: 'Grouped: total and documented.', provenance, layout: 'grouped', orientation: 'vertical', valueLabel: 'functions', categories: modules.map(label => ({ id: label, label, source: { path: `shopflow/${label}/__init__.py` } })), series: [{ id: 'total', label: 'Total', color: '--blue', values: functions }, { id: 'documented', label: 'Documented', color: '--mint', values: functions.map(value => Math.round(value * (.3 + random() * .5))) }] };
})();

const stackedBars: BarModel = { kind: 'bar', id: 'demo-coverage-stacked', title: 'Coverage by module', description: 'Horizontal and stacked: existing plus generated.', unit: '%', provenance, layout: 'stacked', orientation: 'horizontal', valueLabel: 'coverage', categories: modules.slice(0, 6).map(label => ({ id: label, label })), series: [{ id: 'existing', label: 'Existing', color: '--violet', values: modules.slice(0, 6).map(() => whole(20, 48)) }, { id: 'generated', label: 'Generated', color: '--cyan', values: modules.slice(0, 6).map(() => whole(14, 42)) }] };

const claims: DonutModel = { kind: 'donut', id: 'demo-claims', title: 'Claim status', description: 'Share of extracted claims at each status.', provenance, segments: [{ id: 'verified', label: 'Verified', value: 3305, color: '--mint' }, { id: 'uncertain', label: 'Uncertain', value: 402, color: '--amber' }, { id: 'unsupported', label: 'Unsupported', value: 205, color: '--coral' }] };

const gaps: HeatmapModel = (() => {
  const metrics = ['Docstrings', 'Params', 'Returns', 'Examples', 'Raises', 'Types'];
  return { kind: 'heatmap', id: 'demo-gaps', title: 'Documentation gaps by module and metric', description: 'Missing documentation, per module and metric.', provenance, valueLabel: 'gaps', xLabels: metrics, yLabels: modules, values: modules.map(() => metrics.map(() => whole(0, 40))) };
})();

const sizes: TreemapModel = { kind: 'treemap', id: 'demo-sizes', title: 'Module size', description: 'Area is lines of code. Complexity is in 3D height and the tooltip.', unit: 'LOC', provenance, valueLabel: 'Lines of code', heightLabel: 'Complexity', groups, nodes: modules.flatMap(module => Array.from({ length: whole(2, 4) }, (_, index) => ({ id: `${module}-${index}`, label: `${module}/${['service', 'routes', 'models', 'schemas'][index]}.py`, group: module, value: whole(180, 1800), heightValue: whole(2, 24), source: { path: `shopflow/${module}/${['service', 'routes', 'models', 'schemas'][index]}.py` } }))) };

const fan: ScatterModel = { kind: 'scatter', id: 'demo-fan', title: 'Fan-in, fan-out and complexity', description: 'Complexity is depth in 3D and point size in 2D.', provenance, xLabel: 'Fan-out', yLabel: 'Fan-in', zLabel: 'Complexity', groups, points: modules.flatMap(module => Array.from({ length: 6 }, (_, index) => ({ id: `${module}-${index}`, label: `${module}.mod_${index}`, group: module, x: whole(1, 28), y: whole(1, 34), z: whole(2, 30) }))) };

const fanFlat: ScatterModel = { kind: 'scatter', id: 'demo-fan-flat', title: 'Fan-in and fan-out', description: 'Two measured axes, grouped by module.', provenance, xLabel: 'Fan-out', yLabel: 'Fan-in', groups: groups.slice(0, 4), points: modules.slice(0, 4).flatMap(module => Array.from({ length: 8 }, (_, index) => ({ id: `${module}-f${index}`, label: `${module}.mod_${index}`, group: module, x: whole(1, 28), y: whole(1, 34) }))) };

const lengths: HistogramModel = (() => {
  const counts = [212, 318, 264, 196, 141, 96, 72, 44, 25, 13, 5];
  return { kind: 'histogram', id: 'demo-lengths', title: 'Function length', description: 'Identical bins in both modes.', provenance, xLabel: 'Lines', color: '--cyan', bins: counts.map((count, index) => ({ id: `b${index}`, x0: index * 5, x1: (index + 1) * 5, count })) };
})();

const words: WordCloudModel = (() => {
  const terms = ['order', 'user', 'token', 'payment', 'item', 'session', 'cart', 'price', 'request', 'response', 'product', 'config', 'status', 'customer', 'invoice', 'shipment', 'stock', 'handler', 'router', 'schema', 'client', 'cache', 'query', 'event', 'retry', 'webhook', 'refund', 'tenant', 'audit', 'queue', 'worker', 'coupon', 'tax', 'address', 'currency', 'gateway'];
  return { kind: 'wordcloud', id: 'demo-words', title: 'Identifier vocabulary', description: 'Size is count. Position carries no data.', corpus: 'code-identifiers', provenance, categories: [{ id: 'domain', label: 'Domain', color: '--cyan' }, { id: 'infra', label: 'Infrastructure', color: '--cluster-5' }], words: terms.map((text, index) => ({ id: text, text, count: Math.round(420 / (index * .55 + 1)), category: index % 3 === 1 ? 'infra' : 'domain' })) };
})();

const activity: TimelineModel = (() => {
  const lanes = [{ id: 'parse', label: 'Parse', color: '--cluster-4' as ColorToken }, { id: 'extract', label: 'Extract', color: '--cluster-8' as ColorToken }, { id: 'verify', label: 'Verify', color: '--mint' as ColorToken }];
  return { kind: 'timeline', id: 'demo-activity', title: 'Pipeline activity', description: 'Files processed per minute, by pipeline stage.', provenance, timeLabel: 'Minute', valueLabel: 'Files', lanes, events: lanes.flatMap(lane => Array.from({ length: 9 }, (_, index) => ({ id: `${lane.id}-${index}`, label: `${lane.label} batch ${index + 1}`, lane: lane.id, time: index * 6 + whole(0, 4), value: whole(4, 64) }))) };
})();

const network: NetworkModel = (() => {
  const r = seeded(600);
  const nodes = modules.slice(0, 6).flatMap(module => Array.from({ length: 22 }, (_, index) => ({ id: `${module}/${index}`, label: index === 0 ? module : `${module}.${index}`, cluster: module, source: { path: `shopflow/${module}/m${index}.py` } })));
  const kinds = ['imports', 'imports', 'imports', 'calls', 'calls', 'inherits'] as const;
  const edges: NetworkModel['edges'] = [];
  nodes.forEach((node, index) => {
    const hub = `${node.cluster}/0`;
    if (node.id !== hub) edges.push({ id: `e${index}h`, source: node.id, target: hub, kind: 'imports' });
    const links = whole(0, 2, r);
    for (let i = 0; i < links; i++) {
      const target = nodes[Math.floor(r() * nodes.length)];
      if (target.id !== node.id) edges.push({ id: `e${index}-${i}`, source: node.id, target: target.id, kind: kinds[Math.floor(r() * kinds.length)] });
    }
  });
  return { kind: 'network', id: 'demo-network', title: 'Repository relationships', description: 'A compact preview. The full graph arrives in M4.', provenance, clusters: groups.slice(0, 6), nodes, edges };
})();

const sparkline = (id: string, title: string, color: ColorToken, seed: number): SparklineModel => {
  const r = seeded(seed);
  let value = 30;
  return { kind: 'sparkline', id, title, color, provenance, values: Array.from({ length: 18 }, () => (value = Math.max(4, value + (r() - .38) * 9))).map(item => Math.round(item)) };
};

export const vizDemo = { coverage, completeness, groupedBars, stackedBars, claims, gaps, sizes, fan, fanFlat, lengths, words, activity, network, sparklines: [sparkline('demo-spark-files', 'Files', '--cyan', 1), sparkline('demo-spark-functions', 'Functions', '--blue', 2), sparkline('demo-spark-coverage', 'Coverage', '--mint', 3), sparkline('demo-spark-review', 'Review', '--amber', 4)] };
