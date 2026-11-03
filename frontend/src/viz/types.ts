/** Normalized chart contract. Both renderers receive the same model; neither may derive its own values. */
export type VizMode = '3d' | '2d';
export type ColorToken = `--${string}`;

/** Every model states where its numbers come from. There is no default, so a chart cannot omit it. */
export interface Provenance {
  kind: 'measured' | 'demo' | 'illustrative';
  source: string;
  snapshotId?: string;
}

export interface SourceRef { path: string; startLine?: number; endLine?: number }

interface VizBase {
  id: string;
  title: string;
  description?: string;
  unit?: string;
  provenance: Provenance;
}

export interface Series { id: string; label: string; color: ColorToken; values: number[] }
export interface Category { id: string; label: string; source?: SourceRef }

export interface BarModel extends VizBase {
  kind: 'bar';
  categories: Category[];
  series: Series[];
  layout: 'grouped' | 'stacked';
  orientation: 'vertical' | 'horizontal';
  valueLabel: string;
}
export interface HistogramModel extends VizBase {
  kind: 'histogram';
  bins: { id: string; x0: number; x1: number; count: number }[];
  xLabel: string;
  color: ColorToken;
}
export interface LineModel extends VizBase {
  kind: 'line';
  categories: Category[];
  series: Series[];
  variant: 'line' | 'area';
  valueLabel: string;
}
export interface DonutModel extends VizBase {
  kind: 'donut';
  segments: { id: string; label: string; value: number; color: ColorToken; source?: SourceRef }[];
}
export interface RadialModel extends VizBase {
  kind: 'radial';
  metrics: { id: string; label: string; value: number; max: number; color: ColorToken; status?: string }[];
}
export interface HeatmapModel extends VizBase {
  kind: 'heatmap';
  xLabels: string[];
  yLabels: string[];
  /** values[y][x] */
  values: number[][];
  valueLabel: string;
}
export interface ScatterModel extends VizBase {
  kind: 'scatter';
  points: { id: string; label: string; x: number; y: number; z?: number; group: string; source?: SourceRef }[];
  groups: { id: string; label: string; color: ColorToken }[];
  xLabel: string;
  yLabel: string;
  /** Present only when a third measured quantity exists. Never synthesized. */
  zLabel?: string;
}
export interface TreemapModel extends VizBase {
  kind: 'treemap';
  nodes: { id: string; label: string; value: number; group: string; heightValue?: number; source?: SourceRef }[];
  groups: { id: string; label: string; color: ColorToken }[];
  valueLabel: string;
  /** Names the measured quantity carried by `heightValue`; omit for constant non-data height. */
  heightLabel?: string;
}
export interface SparklineModel extends VizBase {
  kind: 'sparkline';
  values: number[];
  color: ColorToken;
}
export interface WordCloudModel extends VizBase {
  kind: 'wordcloud';
  /** A cloud is a single corpus. Code tokens and documentation prose must never share one. */
  corpus: 'code-identifiers' | 'code-keywords' | 'documentation-terms';
  words: { id: string; text: string; count: number; category: string }[];
  categories: { id: string; label: string; color: ColorToken }[];
}
export interface TimelineModel extends VizBase {
  kind: 'timeline';
  lanes: { id: string; label: string; color: ColorToken }[];
  events: { id: string; label: string; lane: string; time: number; value: number; source?: SourceRef }[];
  timeLabel: string;
  valueLabel: string;
}
export interface NetworkModel extends VizBase {
  kind: 'network';
  clusters: { id: string; label: string; color: ColorToken }[];
  nodes: { id: string; label: string; cluster: string; source?: SourceRef }[];
  edges: { id: string; source: string; target: string; kind: 'imports' | 'inherits' | 'calls' | 'contains' }[];
  /** Relationships in the source record that have no resolved target and are not drawn. */
  unresolvedEdges?: number;
  /** Animates dashes along import edges to show direction. Decorative; it encodes no extra value. */
  flow?: boolean;
}

export type VizModel = BarModel | HistogramModel | LineModel | DonutModel | RadialModel | HeatmapModel | ScatterModel | TreemapModel | SparklineModel | WordCloudModel | TimelineModel | NetworkModel;
export type VizKind = VizModel['kind'];

/** Async state of a chart. `unavailable` is the honest state for capabilities that do not exist yet. */
export type VizState =
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'unavailable'; title: string; message: string }
  | { status: 'ready'; model: VizModel; warnings?: string[] };

export interface RendererProps {
  model: VizModel;
  activeId: string | null;
  selected: ReadonlySet<string>;
  onHover: (id: string | null, point?: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
}

export interface LegendItem { id: string; label: string; color: ColorToken }
export interface TooltipContent {
  title: string;
  rows: { label: string; value: string; color?: ColorToken }[];
  source?: SourceRef;
}
export interface DataTable { columns: string[]; rows: (string | number)[][] }
export interface Encodings { height?: string; footprint?: string; depth?: string; color?: string; size?: string; position?: string }
