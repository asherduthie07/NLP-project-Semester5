import type { ColorBy, GNode, GraphData, ViewFilter } from './model';

/** The contract both graph renderers meet, so the page drives 2D and 3D through one set of calls. */
export interface GraphViewOptions {
  canvas: HTMLCanvasElement;
  /** Element whose CSS custom properties supply the canvas theme. */
  host: HTMLElement;
  labels: HTMLElement;
  minimap: HTMLCanvasElement | null;
  data: GraphData;
  reduced: boolean;
  onHover: (node: GNode | null, point: { x: number; y: number } | null) => void;
  onSelect: (node: GNode | null) => void;
  onFocus: (node: GNode) => void;
  onLayout: (share: number) => void;
  /** The renderer cannot continue, for example after the GPU context was lost. */
  onFailure: (message: string) => void;
  /** Initial force strength, so the first layout uses the page's setting. */
  charge: number;
}

export interface GraphSettings {
  filter: ViewFilter;
  colorBy: ColorBy;
  hulls: boolean;
  labels: boolean;
  fade: boolean;
  charge: number;
  /** Performance mode trades detail (dashes, label count, sphere detail, pixel ratio) for frame rate. */
  performance: boolean;
}

export interface GraphHighlight {
  hover: GNode | null;
  selected: GNode | null;
  /** Focus mode: only this neighborhood keeps full opacity. */
  focus: GNode | null;
  matches: ReadonlySet<string>;
}

export interface GraphStats {
  fps: number | null;
  nodes: number;
  edges: number;
  labels: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  frames: number;
  /** Main-thread draw cost per frame, in milliseconds. */
  costP50: number | null;
  costP95: number | null;
  /** Median frame time while the view animated itself; see FrameStats. */
  recentFrame: number | null;
}

export interface GraphView {
  readonly mode: '2d' | '3d';
  apply(settings: GraphSettings): void;
  highlight(highlight: GraphHighlight): void;
  flyTo(node: GNode): void;
  reset(): void;
  zoom(factor: number): void;
  /** Re-reads theme tokens, after the canvas theme changes. */
  refreshTheme(): void;
  /** Re-runs the force layout from the current positions. */
  reheat(): void;
  screenshot(): Promise<Blob>;
  /** Where a node is drawn, in client coordinates, or null when it is off screen or hidden. */
  locate(node: GNode): { x: number; y: number } | null;
  stats(): GraphStats;
  /** Clears the frame-time sample, so a measurement covers only what follows. */
  resetStats(): void;
  /** Continuous slow camera motion, used to measure sustained frame rate. */
  setDrift(on: boolean): void;
  dispose(): void;
}

/** Nodes that keep full opacity: the focus or selection plus their neighbors, or every node when nothing is chosen. */
export function emphasis(data: GraphData, highlight: GraphHighlight, fade: boolean): ReadonlySet<string> | null {
  const anchor = highlight.focus ?? highlight.hover ?? (fade ? highlight.selected : null);
  if (!anchor && !highlight.matches.size) return null;
  const set = new Set<string>(highlight.matches);
  if (anchor) { set.add(anchor.id); data.neighbors.get(anchor.id)?.forEach(id => set.add(id)); }
  return set;
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode the image.')), 'image/png'));
}
