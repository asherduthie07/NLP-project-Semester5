import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import { rampColor } from '../../../viz/palette';
import type { ColorToken } from '../../../viz/types';
import { isVisible, nodeRadius, type ColorBy, type EdgeKind, type GEdge, type GNode, type GraphData, type ViewFilter } from './model';

/** One force configuration for both views. The simulation is always created stopped; callers tick it from their own loop. */
export function createSimulation(data: GraphData, charge: number): Simulation<GNode, GEdge> {
  const count = Math.max(1, data.clusters.length), radius = 260 + count * 34 + Math.sqrt(data.nodes.length) * 4;
  const center = new Map(data.clusters.map(cluster => [cluster.id, { x: Math.cos(cluster.index / count * Math.PI * 2) * radius, y: Math.sin(cluster.index / count * Math.PI * 2) * radius }]));
  const distance: Record<EdgeKind, number> = { contains: 18, imports: 60, calls: 46, inherits: 52 };
  const strength: Record<EdgeKind, number> = { contains: .7, imports: .05, calls: .03, inherits: .08 };
  return forceSimulation<GNode, GEdge>(data.nodes)
    .stop()
    /** Links across clusters pull weakly, so modules group by cluster while cross-cluster dependencies stay visible. */
    .force('link', forceLink<GNode, GEdge>(data.edges).id(node => node.id).distance(edge => distance[edge.kind]).strength(edge => edge.source.cluster === edge.target.cluster ? strength[edge.kind] : strength[edge.kind] * .15))
    .force('charge', forceManyBody<GNode>().strength(-charge).distanceMax(420).theta(.95))
    .force('x', forceX<GNode>(node => center.get(node.cluster)!.x).strength(.14))
    .force('y', forceY<GNode>(node => center.get(node.cluster)!.y).strength(.14))
    .force('collide', forceCollide<GNode>(node => nodeRadius(node) + 1.5).iterations(1))
    .alphaDecay(.028);
}

const settled = new WeakSet<GraphData>();
export const isSettled = (data: GraphData) => settled.has(data);
export const markSettled = (data: GraphData) => settled.add(data);

/** Settles the layout in small timed slices so the page stays responsive. Used by the 3D view, which shows only settled positions. */
export function settleLayout(data: GraphData, charge: number, onProgress: (share: number) => void, signal: AbortSignal, reheat = false): Promise<void> {
  if (settled.has(data) && !reheat) return Promise.resolve();
  const simulation = createSimulation(data, charge);
  if (reheat) simulation.alpha(.6);
  const start = simulation.alpha();
  return new Promise((resolve, reject) => {
    const slice = () => {
      if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const until = performance.now() + 12;
      while (simulation.alpha() > .02 && performance.now() < until) simulation.tick();
      onProgress(Math.min(1, Math.log(start / simulation.alpha()) / Math.log(start / .02)));
      if (simulation.alpha() > .02) window.setTimeout(slice, 0);
      else { settled.add(data); resolve(); }
    };
    slice();
  });
}

export interface GraphColors {
  bg: string;
  label: string;
  halo: string;
  dim: string;
  accent: string;
  warn: string;
  edge: Record<EdgeKind, string>;
  node: (node: GNode) => string;
  cluster: (id: string) => string;
}

const LANGUAGE_TOKENS: ColorToken[] = ['--cluster-6', '--cluster-2', '--cluster-1', '--cluster-5', '--cluster-7', '--cluster-3', '--cluster-4', '--cluster-8'];

/** Resolves theme tokens from the graph's own element, so the light canvas theme comes from CSS, not from hard-coded values. */
export function resolveColors(host: HTMLElement, data: GraphData, colorBy: ColorBy): GraphColors {
  const token = themeReader(host);
  const clusterColor = new Map(data.clusters.map(cluster => [cluster.id, token(cluster.color)]));
  const languages = [...new Set(data.nodes.map(node => node.language ?? 'Other'))].sort();
  const languageColor = new Map(languages.map((language, index) => [language, token(LANGUAGE_TOKENS[index % LANGUAGE_TOKENS.length])]));
  const unknown = token('--graph-unknown');
  return {
    bg: token('--graph-bg'), label: token('--graph-label'), halo: token('--graph-halo'), dim: token('--graph-dim'), accent: token('--cyan'), warn: token('--amber'),
    edge: { imports: token('--blue'), inherits: token('--violet'), calls: token('--cyan'), contains: token('--graph-contains') },
    cluster: id => clusterColor.get(id) ?? unknown,
    node: colorBy === 'module' ? node => clusterColor.get(node.cluster) ?? unknown
      : colorBy === 'language' ? node => languageColor.get(node.language ?? 'Other') ?? unknown
        : node => node.coverage === null ? unknown : rampColor(node.coverage / 100, name => token(name)),
  };
}

export function languageLegend(host: HTMLElement, data: GraphData): { id: string; label: string; color: string }[] {
  const token = themeReader(host);
  return [...new Set(data.nodes.map(node => node.language ?? 'Other'))].sort().map((language, index) => ({ id: language, label: language, color: token(LANGUAGE_TOKENS[index % LANGUAGE_TOKENS.length]) }));
}

/** Reads a design token, preferring the canvas theme's `--graph-` override, so the light canvas never recolors the surrounding UI. */
function themeReader(host: HTMLElement) {
  const style = getComputedStyle(host);
  return (name: string) => style.getPropertyValue(`--graph-${name.slice(2)}`).trim() || style.getPropertyValue(name).trim() || style.getPropertyValue('--text-mid').trim();
}

/** Top-down overview shared by both views. `view` is the visible world rectangle in 2D, or null in 3D. */
export function drawMinimap(canvas: HTMLCanvasElement, data: GraphData, filter: ViewFilter, colors: GraphColors, view: { x: number; y: number; width: number; height: number } | null, focus: { x: number; y: number } | null) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  data.nodes.forEach(node => { minX = Math.min(minX, node.x); minY = Math.min(minY, node.y); maxX = Math.max(maxX, node.x); maxY = Math.max(maxY, node.y); });
  const pad = 30, scale = Math.min(width / (maxX - minX + pad * 2), height / (maxY - minY + pad * 2));
  const ox = (width - (maxX - minX) * scale) / 2 - minX * scale, oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  data.nodes.forEach(node => {
    if (!isVisible(node, filter)) return;
    context.fillStyle = colors.node(node);
    context.fillRect(node.x * scale + ox - 1, node.y * scale + oy - 1, 2, 2);
  });
  context.strokeStyle = colors.accent;
  context.lineWidth = 1;
  if (view) context.strokeRect(view.x * scale + ox, view.y * scale + oy, view.width * scale, view.height * scale);
  if (focus) { context.beginPath(); context.arc(focus.x * scale + ox, focus.y * scale + oy, 4, 0, Math.PI * 2); context.stroke(); }
  /** Maps a minimap point back to world coordinates, for click-to-pan. */
  return (x: number, y: number) => ({ x: (x - ox) / scale, y: (y - oy) / scale });
}

/** Rolling frame statistics. Only frames that were actually drawn count; an idle graph draws nothing and reports no rate. */
export class FrameStats {
  private last = 0;
  private intervals: number[] = [];
  private recent: number[] = [];
  private costs: number[] = [];
  private driven: number[] = [];
  private lastDriven = false;
  /**
   * `cost` is main-thread time spent drawing the frame; for WebGL it is submission time, and the GPU work is not included.
   * `driven` marks frames the view animates by itself (camera flights, damping, layout). Only gaps between two such frames
   * measure rendering speed: other gaps also wait for input.
   */
  frame(time: number, cost: number, driven = false) {
    this.costs.push(cost);
    if (this.costs.length > 2400) this.costs.shift();
    if (driven && this.lastDriven && this.last && time - this.last < 250) { this.driven.push(time - this.last); if (this.driven.length > 120) this.driven.shift(); }
    this.lastDriven = driven;
    if (this.last && time - this.last < 250) { this.intervals.push(time - this.last); if (this.intervals.length > 2400) this.intervals.shift(); }
    this.last = time;
    this.recent.push(time);
    while (this.recent.length && time - this.recent[0] > 1000) this.recent.shift();
  }
  /** Frames drawn in the last second, or null when the graph has been idle for half a second. */
  get fps(): number | null {
    const now = performance.now();
    if (!this.last || now - this.last > 500 || this.recent.length < 2) return null;
    const span = this.recent[this.recent.length - 1] - this.recent[0];
    return span > 0 ? Math.round((this.recent.length - 1) * 1000 / span) : null;
  }
  reset() { this.intervals = []; this.costs = []; this.driven = []; }
  /** Median gap between recent self-animated frames, for the automatic performance mode. Null until enough were seen. */
  recentFrame(count = 30): number | null {
    if (this.driven.length < count) return null;
    return quantile(this.driven.slice(-count), .5);
  }
  summary() {
    return { frames: this.intervals.length, p50: quantile(this.intervals, .5), p95: quantile(this.intervals, .95), max: quantile(this.intervals, 1), costP50: quantile(this.costs, .5), costP95: quantile(this.costs, .95) };
  }
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100;
}
