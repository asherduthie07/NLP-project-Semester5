import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { NetworkModel } from './types';

/** Geometry shared by both renderers, so a treemap tile or word size cannot differ between modes. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(m => m >= rough) ?? rough;
  const ticks: number[] = [];
  for (let value = 0; value < max + step * 0.999; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

export function stackedTotals(series: { values: number[] }[], length: number): number[] {
  return Array.from({ length }, (_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
}

export function formatValue(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return unit ? `${text}${unit === '%' ? '%' : ` ${unit}`}` : text;
}

export interface Tile<T> { item: T; x: number; y: number; w: number; h: number }

/** Squarified treemap: tile area is exactly proportional to value. */
export function squarify<T extends { value: number }>(items: T[], width: number, height: number): Tile<T>[] {
  const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (!(total > 0) || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const queue = items.filter(item => item.value > 0).sort((a, b) => b.value - a.value);
  const tiles: Tile<T>[] = [];
  let x = 0, y = 0, w = width, h = height, index = 0;
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return Math.max(...row.map(area => Math.max((side * side * area) / (sum * sum), (sum * sum) / (side * side * area))));
  };
  while (index < queue.length) {
    const side = Math.min(w, h);
    const row: T[] = [];
    let areas: number[] = [];
    while (index + row.length < queue.length) {
      const next = queue[index + row.length];
      const candidate = [...areas, next.value * scale];
      if (row.length && worst(candidate, side) > worst(areas, side)) break;
      row.push(next);
      areas = candidate;
    }
    const sum = areas.reduce((a, b) => a + b, 0);
    let offset = 0;
    if (w >= h) {
      const rowWidth = sum / h;
      row.forEach((item, i) => { const tileHeight = areas[i] / rowWidth; tiles.push({ item, x, y: y + offset, w: rowWidth, h: tileHeight }); offset += tileHeight; });
      x += rowWidth; w -= rowWidth;
    } else {
      const rowHeight = sum / w;
      row.forEach((item, i) => { const tileWidth = areas[i] / rowHeight; tiles.push({ item, x: x + offset, y, w: tileWidth, h: rowHeight }); offset += tileWidth; });
      y += rowHeight; h -= rowHeight;
    }
    index += row.length;
  }
  return tiles;
}

export interface Arc<T> { item: T; start: number; end: number; share: number }

/** Clockwise from 12 o'clock, in radians; sweeps sum to exactly 2π over positive values. */
export function arcLayout<T extends { value: number }>(items: T[]): Arc<T>[] {
  const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  let cursor = 0;
  return items.filter(item => item.value > 0).map(item => {
    const share = item.value / total, start = cursor;
    cursor += share * Math.PI * 2;
    return { item, start, end: cursor, share };
  });
}

/** Font scale for word clouds. Area-proportional: size² is linear in count. */
export function wordScale(count: number, max: number, minSize: number, maxSize: number): number {
  if (!(max > 0)) return minSize;
  return minSize + (maxSize - minSize) * Math.sqrt(Math.max(count, 0) / max);
}

export interface PlacedWord<T> { word: T; id: string; text: string; size: number; x: number; y: number }

/** Deterministic spiral placement, centered on the origin. Both modes use it, so words sit in the same place. Shrinks the whole cloud rather than dropping a word. */
export function layoutWords<T extends { id: string; text: string; count: number }>(words: T[], width: number, height: number): PlacedWord<T>[] {
  const sorted = [...words].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 1;
  let placed: (PlacedWord<T> & { w: number; h: number })[] = [];
  for (let factor = 1; factor >= .4; factor -= .06) {
    placed = [];
    for (const word of sorted) {
      const size = wordScale(word.count, max, 12 * factor, 44 * factor);
      const w = word.text.length * size * .62 + size * .8, h = size * 1.2;
      for (let step = 0; step < 2400; step++) {
        const angle = step * .42, radius = step * .3;
        const x = Math.cos(angle) * radius * 1.7, y = Math.sin(angle) * radius * .78;
        if (Math.abs(x) + w / 2 > width / 2 || Math.abs(y) + h / 2 > height / 2) continue;
        if (placed.some(other => Math.abs(other.x - x) < (other.w + w) / 2 && Math.abs(other.y - y) < (other.h + h) / 2)) continue;
        placed.push({ word, id: word.id, text: word.text, size, x, y, w, h });
        break;
      }
    }
    if (placed.length === sorted.length) break;
  }
  return placed;
}

/** Monotone cubic (Fritsch–Carlson), the same family as Recharts' `monotone`. Passes exactly through every datum. */
export function monotoneSample(values: number[], samples = 8): { position: number; value: number }[] {
  const count = values.length;
  if (count < 2) return values.map((value, index) => ({ position: index, value }));
  const delta = values.slice(1).map((value, index) => value - values[index]);
  const tangent = values.map((_, index) => index === 0 ? delta[0] : index === count - 1 ? delta[count - 2] : delta[index - 1] * delta[index] <= 0 ? 0 : (delta[index - 1] + delta[index]) / 2);
  delta.forEach((slope, index) => {
    if (slope === 0) { tangent[index] = 0; tangent[index + 1] = 0; return; }
    const a = tangent[index] / slope, b = tangent[index + 1] / slope, sum = a * a + b * b;
    if (sum > 9) { const t = 3 / Math.sqrt(sum); tangent[index] = t * a * slope; tangent[index + 1] = t * b * slope; }
  });
  const out: { position: number; value: number }[] = [];
  for (let index = 0; index < count - 1; index++) {
    for (let step = 0; step < samples; step++) {
      const t = step / samples, t2 = t * t, t3 = t2 * t;
      out.push({ position: index + t, value: (2 * t3 - 3 * t2 + 1) * values[index] + (t3 - 2 * t2 + t) * tangent[index] + (-2 * t3 + 3 * t2) * values[index + 1] + (t3 - t2) * tangent[index + 1] });
    }
  }
  out.push({ position: count - 1, value: values[count - 1] });
  return out;
}

export interface LaidOutNode { id: string; x: number; y: number; z: number; degree: number; cluster: string; label: string }

export function hashUnit(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0) / 4294967295;
}

const layoutCache = new WeakMap<NetworkModel, LaidOutNode[]>();

/** Deterministic layout, computed once per model; x/y are shared by both modes. z is a spatial cluster offset, not a measurement. */
export function networkLayout(model: NetworkModel): LaidOutNode[] {
  const cached = layoutCache.get(model);
  if (cached) return cached;
  const clusterIndex = new Map(model.clusters.map((cluster, index) => [cluster.id, index]));
  const degree = new Map<string, number>();
  model.edges.forEach(edge => { degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1); degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1); });
  const count = Math.max(model.clusters.length, 1);
  const centers = model.clusters.map((_, index) => ({ x: Math.cos(index / count * Math.PI * 2) * 170, y: Math.sin(index / count * Math.PI * 2) * 170 }));
  const nodes = model.nodes.map(node => {
    const center = centers[clusterIndex.get(node.cluster) ?? 0] ?? { x: 0, y: 0 };
    return { id: node.id, x: center.x + (hashUnit(node.id) - .5) * 80, y: center.y + (hashUnit(`${node.id}y`) - .5) * 80 } as SimulationNodeDatum & { id: string };
  });
  const ids = new Set(nodes.map(node => node.id));
  const links = model.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({ source: edge.source, target: edge.target })) as SimulationLinkDatum<SimulationNodeDatum & { id: string }>[];
  const byId = new Map(model.nodes.map(node => [node.id, node]));
  forceSimulation(nodes)
    .force('link', forceLink(links).id(node => (node as { id: string }).id).distance(24).strength(.3))
    .force('charge', forceManyBody().strength(-34))
    .force('collide', forceCollide(7))
    .force('x', forceX<SimulationNodeDatum & { id: string }>(node => centers[clusterIndex.get(byId.get(node.id)?.cluster ?? '') ?? 0]?.x ?? 0).strength(.12))
    .force('y', forceY<SimulationNodeDatum & { id: string }>(node => centers[clusterIndex.get(byId.get(node.id)?.cluster ?? '') ?? 0]?.y ?? 0).strength(.12))
    .force('center', forceCenter(0, 0))
    .stop()
    .tick(160);
  const extent = Math.max(1, ...nodes.flatMap(node => [Math.abs(node.x ?? 0), Math.abs(node.y ?? 0)]));
  const laid = nodes.map(node => {
    const source = byId.get(node.id)!;
    const index = clusterIndex.get(source.cluster) ?? 0;
    return { id: node.id, x: (node.x ?? 0) / extent, y: (node.y ?? 0) / extent, z: Math.sin(index * 2.399) * .42 + (hashUnit(`${node.id}z`) - .5) * .32, degree: degree.get(node.id) ?? 0, cluster: source.cluster, label: source.label };
  });
  layoutCache.set(model, laid);
  return laid;
}
