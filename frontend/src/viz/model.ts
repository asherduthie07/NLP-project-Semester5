import { arcLayout, formatValue, niceTicks, stackedTotals } from './scale';
import type { DataTable, Encodings, LegendItem, TooltipContent, VizModel } from './types';

/** ChartDataAdapter core: pure transforms from one normalized model to everything a renderer or table needs. */
export function legendItems(model: VizModel): LegendItem[] {
  switch (model.kind) {
    case 'bar': case 'line': return model.series.map(({ id, label, color }) => ({ id, label, color }));
    case 'donut': return model.segments.map(({ id, label, color }) => ({ id, label, color }));
    case 'radial': return model.metrics.map(({ id, label, color, value, max }) => ({ id, label: `${label} ${(value / max * 100).toFixed(value % 1 ? 1 : 0)}%`, color }));
    case 'scatter': case 'treemap': return model.groups;
    case 'wordcloud': return model.categories;
    case 'timeline': return model.lanes;
    case 'network': return model.clusters;
    case 'histogram': case 'heatmap': case 'sparkline': return [];
  }
}

/** The single place filters apply, so 2D, 3D and the table can never disagree on what is visible. */
export function applyHidden<T extends VizModel>(model: T, hidden: ReadonlySet<string>): T {
  if (hidden.size === 0) return model;
  const keep = <I extends { id: string }>(items: I[]) => items.filter(item => !hidden.has(item.id));
  const out: VizModel = (() => {
    const source: VizModel = model;
    switch (source.kind) {
      case 'bar': case 'line': return { ...source, series: keep(source.series) };
      case 'donut': return { ...source, segments: keep(source.segments) };
      case 'radial': return { ...source, metrics: keep(source.metrics) };
      case 'scatter': return { ...source, points: source.points.filter(point => !hidden.has(point.group)) };
      case 'treemap': return { ...source, nodes: source.nodes.filter(node => !hidden.has(node.group)) };
      case 'wordcloud': return { ...source, words: source.words.filter(word => !hidden.has(word.category)) };
      case 'timeline': return { ...source, lanes: keep(source.lanes), events: source.events.filter(event => !hidden.has(event.lane)) };
      case 'network': {
        const nodes = source.nodes.filter(node => !hidden.has(node.cluster));
        const ids = new Set(nodes.map(node => node.id));
        return { ...source, clusters: keep(source.clusters), nodes, edges: source.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
      }
      default: return source;
    }
  })();
  return out as T;
}

export function isEmptyModel(model: VizModel): boolean {
  switch (model.kind) {
    case 'bar': case 'line': return !model.categories.length || !model.series.length;
    case 'histogram': return !model.bins.length;
    case 'donut': return !model.segments.some(segment => segment.value > 0);
    case 'radial': return !model.metrics.length;
    case 'heatmap': return !model.values.length;
    case 'scatter': return !model.points.length;
    case 'treemap': return !model.nodes.some(node => node.value > 0);
    case 'sparkline': return !model.values.length;
    case 'wordcloud': return !model.words.length;
    case 'timeline': return !model.events.length;
    case 'network': return !model.nodes.length;
  }
}

/** Shared y-domain: both modes use these exact ticks. */
export function valueTicks(model: Extract<VizModel, { kind: 'bar' | 'line' | 'histogram' }>): number[] {
  if (model.kind === 'histogram') return niceTicks(Math.max(0, ...model.bins.map(bin => bin.count)));
  const length = model.categories.length;
  const max = model.kind === 'bar' && model.layout === 'stacked' ? Math.max(0, ...stackedTotals(model.series, length)) : Math.max(0, ...model.series.flatMap(series => series.values));
  return niceTicks(max);
}

export const barDatumId = (categoryId: string, seriesId: string) => `${categoryId}|${seriesId}`;
export const heatDatumId = (x: number, y: number) => `${x}|${y}`;
const sparkDatumId = (index: number) => `${index}`;

/** Datum identifiers in reading order. Keyboard navigation and selection use these in both modes. */
export function datumIds(model: VizModel): string[] {
  switch (model.kind) {
    case 'bar': return model.categories.flatMap(category => model.series.map(series => barDatumId(category.id, series.id)));
    case 'histogram': return model.bins.map(bin => bin.id);
    case 'line': return model.categories.map(category => category.id);
    case 'donut': return arcLayout(model.segments).map(arc => arc.item.id);
    case 'radial': return model.metrics.map(metric => metric.id);
    case 'heatmap': return model.values.flatMap((row, y) => row.map((_, x) => heatDatumId(x, y)));
    case 'scatter': return model.points.map(point => point.id);
    case 'treemap': return model.nodes.filter(node => node.value > 0).map(node => node.id);
    case 'sparkline': return model.values.map((_, index) => sparkDatumId(index));
    case 'wordcloud': return model.words.map(word => word.id);
    case 'timeline': return model.events.map(event => event.id);
    case 'network': return model.nodes.map(node => node.id);
  }
}

/** Tooltip content. One implementation, called by both modes. */
export function describeDatum(model: VizModel, id: string): TooltipContent | null {
  const fmt = (value: number) => formatValue(value, model.unit);
  switch (model.kind) {
    case 'bar': {
      const [categoryId, seriesId] = id.split('|');
      const index = model.categories.findIndex(category => category.id === categoryId);
      const series = model.series.find(item => item.id === seriesId);
      if (index < 0 || !series) return null;
      const rows: TooltipContent['rows'] = [{ label: series.label, value: fmt(series.values[index]), color: series.color }];
      if (model.layout === 'stacked' && model.series.length > 1) rows.push({ label: 'Stack total', value: fmt(stackedTotals(model.series, index + 1)[index]) });
      return { title: model.categories[index].label, rows, source: model.categories[index].source };
    }
    case 'histogram': {
      const bin = model.bins.find(item => item.id === id);
      return bin ? { title: `${model.xLabel} ${bin.x0}–${bin.x1}`, rows: [{ label: 'Count', value: fmt(bin.count), color: model.color }] } : null;
    }
    case 'line': {
      const index = model.categories.findIndex(category => category.id === id);
      if (index < 0) return null;
      return { title: model.categories[index].label, rows: model.series.map(series => ({ label: series.label, value: fmt(series.values[index]), color: series.color })), source: model.categories[index].source };
    }
    case 'donut': {
      const arc = arcLayout(model.segments).find(item => item.item.id === id);
      return arc ? { title: arc.item.label, rows: [{ label: 'Value', value: fmt(arc.item.value), color: arc.item.color }, { label: 'Share', value: `${(arc.share * 100).toFixed(1)}%` }], source: arc.item.source } : null;
    }
    case 'radial': {
      const metric = model.metrics.find(item => item.id === id);
      if (!metric) return null;
      const rows: TooltipContent['rows'] = [{ label: 'Value', value: `${formatValue(metric.value)} of ${formatValue(metric.max)}`, color: metric.color }, { label: 'Percent', value: `${(metric.value / metric.max * 100).toFixed(1)}%` }];
      if (metric.status) rows.push({ label: 'Status', value: metric.status });
      return { title: metric.label, rows };
    }
    case 'heatmap': {
      const [x, y] = id.split('|').map(Number);
      const value = model.values[y]?.[x];
      return value === undefined ? null : { title: `${model.yLabels[y]} × ${model.xLabels[x]}`, rows: [{ label: model.valueLabel, value: fmt(value) }] };
    }
    case 'scatter': {
      const point = model.points.find(item => item.id === id);
      if (!point) return null;
      const rows: TooltipContent['rows'] = [{ label: model.xLabel, value: formatValue(point.x), color: model.groups.find(group => group.id === point.group)?.color }, { label: model.yLabel, value: formatValue(point.y) }];
      if (model.zLabel && point.z !== undefined) rows.push({ label: model.zLabel, value: formatValue(point.z) });
      return { title: point.label, rows, source: point.source };
    }
    case 'treemap': {
      const node = model.nodes.find(item => item.id === id);
      if (!node) return null;
      const total = model.nodes.reduce((sum, item) => sum + item.value, 0);
      const rows: TooltipContent['rows'] = [{ label: model.valueLabel, value: fmt(node.value), color: model.groups.find(group => group.id === node.group)?.color }, { label: 'Share', value: `${(node.value / total * 100).toFixed(1)}%` }];
      if (model.heightLabel && node.heightValue !== undefined) rows.push({ label: model.heightLabel, value: formatValue(node.heightValue) });
      return { title: node.label, rows, source: node.source };
    }
    case 'sparkline': {
      const value = model.values[Number(id)];
      return value === undefined ? null : { title: `Point ${Number(id) + 1} of ${model.values.length}`, rows: [{ label: 'Value', value: fmt(value), color: model.color }] };
    }
    case 'wordcloud': {
      const word = model.words.find(item => item.id === id);
      return word ? { title: word.text, rows: [{ label: 'Count', value: formatValue(word.count), color: model.categories.find(category => category.id === word.category)?.color }, { label: 'Category', value: model.categories.find(category => category.id === word.category)?.label ?? word.category }] } : null;
    }
    case 'timeline': {
      const event = model.events.find(item => item.id === id);
      if (!event) return null;
      const lane = model.lanes.find(item => item.id === event.lane);
      return { title: event.label, rows: [{ label: model.timeLabel, value: formatValue(event.time) }, { label: model.valueLabel, value: fmt(event.value), color: lane?.color }, { label: 'Lane', value: lane?.label ?? event.lane }], source: event.source };
    }
    case 'network': {
      const node = model.nodes.find(item => item.id === id);
      if (!node) return null;
      const links = model.edges.filter(edge => edge.source === id || edge.target === id);
      const cluster = model.clusters.find(item => item.id === node.cluster);
      return { title: node.label, rows: [{ label: 'Cluster', value: cluster?.label ?? node.cluster, color: cluster?.color }, { label: 'Outgoing', value: formatValue(links.filter(edge => edge.source === id).length) }, { label: 'Incoming', value: formatValue(links.filter(edge => edge.target === id).length) }], source: node.source };
    }
  }
}

/** Accessible tabular alternative. Also the CSV export. */
export function toTable(model: VizModel): DataTable {
  switch (model.kind) {
    case 'bar': case 'line': return { columns: ['Category', ...model.series.map(series => series.label)], rows: model.categories.map((category, index) => [category.label, ...model.series.map(series => series.values[index])]) };
    case 'histogram': return { columns: [`${model.xLabel} from`, `${model.xLabel} to`, 'Count'], rows: model.bins.map(bin => [bin.x0, bin.x1, bin.count]) };
    case 'donut': return { columns: ['Segment', 'Value', 'Share %'], rows: arcLayout(model.segments).map(arc => [arc.item.label, arc.item.value, Number((arc.share * 100).toFixed(2))]) };
    case 'radial': return { columns: ['Metric', 'Value', 'Max', 'Percent', 'Status'], rows: model.metrics.map(metric => [metric.label, metric.value, metric.max, Number((metric.value / metric.max * 100).toFixed(2)), metric.status ?? '']) };
    case 'heatmap': return { columns: ['', ...model.xLabels], rows: model.values.map((row, y) => [model.yLabels[y], ...row]) };
    case 'scatter': return { columns: ['Point', 'Group', model.xLabel, model.yLabel, ...(model.zLabel ? [model.zLabel] : [])], rows: model.points.map(point => [point.label, model.groups.find(group => group.id === point.group)?.label ?? point.group, point.x, point.y, ...(model.zLabel ? [point.z ?? ''] : [])]) };
    case 'treemap': return { columns: ['Node', 'Group', model.valueLabel, ...(model.heightLabel ? [model.heightLabel] : [])], rows: model.nodes.map(node => [node.label, model.groups.find(group => group.id === node.group)?.label ?? node.group, node.value, ...(model.heightLabel ? [node.heightValue ?? ''] : [])]) };
    case 'sparkline': return { columns: ['Point', 'Value'], rows: model.values.map((value, index) => [index + 1, value]) };
    case 'wordcloud': return { columns: ['Term', 'Category', 'Count'], rows: model.words.map(word => [word.text, model.categories.find(category => category.id === word.category)?.label ?? word.category, word.count]) };
    case 'timeline': return { columns: ['Event', 'Lane', model.timeLabel, model.valueLabel], rows: model.events.map(event => [event.label, model.lanes.find(lane => lane.id === event.lane)?.label ?? event.lane, event.time, event.value]) };
    case 'network': return { columns: ['Source', 'Relationship', 'Target'], rows: model.edges.map(edge => [model.nodes.find(node => node.id === edge.source)?.label ?? edge.source, edge.kind, model.nodes.find(node => node.id === edge.target)?.label ?? edge.target]) };
  }
}

/** States what each visual channel means in 3D, including which channels carry no data. */
export function encodings(model: VizModel): Encodings {
  const value = 'unit' in model && model.unit ? model.unit : 'value';
  switch (model.kind) {
    case 'bar': return model.orientation === 'vertical' ? { height: model.valueLabel, depth: 'not data' } : { position: `length = ${model.valueLabel}`, depth: 'not data', height: 'not data' };
    case 'histogram': return { height: 'count', footprint: 'equal bin width as drawn', depth: 'not data' };
    case 'line': return { height: model.valueLabel, depth: 'series lane, not data' };
    case 'donut': return { position: 'arc angle = share', height: 'not data' };
    case 'radial': return { position: 'arc sweep = percent', depth: 'not data' };
    case 'heatmap': return { height: model.valueLabel, color: model.valueLabel };
    case 'scatter': return model.zLabel ? { position: `x = ${model.xLabel}, height = ${model.yLabel}`, depth: model.zLabel } : { position: `x = ${model.xLabel}, height = ${model.yLabel}`, depth: 'group lane, not data' };
    case 'treemap': return { footprint: model.valueLabel, height: model.heightLabel ?? 'not data' };
    case 'sparkline': return { height: value };
    case 'wordcloud': return { size: 'count', position: 'not data' };
    case 'timeline': return { position: `x = ${model.timeLabel}`, height: model.valueLabel, depth: 'lane, not data' };
    case 'network': return { size: 'degree', position: 'force layout, not data' };
  }
}

/** Screen-reader summary. Computed from real values, never a static description. */
export function summarize(model: VizModel): string {
  const table = toTable(model);
  const kindLabel: Record<VizModel['kind'], string> = { bar: 'Bar chart', histogram: 'Histogram', line: model.kind === 'line' && model.variant === 'area' ? 'Area chart' : 'Line chart', donut: 'Donut chart', radial: 'Radial chart', heatmap: 'Heatmap', scatter: 'Scatter plot', treemap: 'Treemap', sparkline: 'Sparkline', wordcloud: 'Word cloud', timeline: 'Timeline', network: 'Network graph' };
  return `${kindLabel[model.kind]}: ${model.title}. ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'} of data. Data source: ${model.provenance.source}.`;
}

export const provenanceLabel: Record<VizModel['provenance']['kind'], string> = { measured: 'Measured', demo: 'Demo data', illustrative: 'Illustrative' };
