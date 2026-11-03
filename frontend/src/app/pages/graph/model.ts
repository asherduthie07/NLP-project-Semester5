import type { SimulationNodeDatum } from 'd3-force';
import type { DashboardGraph, DataProvenance, RepositoryAnalysis } from '../../../data/dashboard';
import type { ColorToken } from '../../../viz/types';
import { CLUSTER_COLORS, groupOf, moduleRows } from '../derive';

/** Graph page model: positions live on the nodes so the 2D and 3D views share one layout. */
export type EdgeKind = 'imports' | 'inherits' | 'calls' | 'contains';
export const EDGE_KINDS: EdgeKind[] = ['imports', 'inherits', 'calls', 'contains'];
export type ColorBy = 'module' | 'language' | 'coverage';

export interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: string;
  cluster: string;
  path: string | null;
  language: string | null;
  /** Percent documented: the file's coverage for modules, 100 or 0 for a symbol. Null when the record does not say. */
  coverage: number | null;
  line: number | null;
  endLine: number | null;
  degree: number;
  index: number;
  z: number;
  x: number;
  y: number;
}
export interface GEdge { id: string; source: GNode; target: GNode; kind: EdgeKind }
export interface GCluster { id: string; label: string; color: ColorToken; count: number; index: number }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; clusters: GCluster[]; byId: Map<string, GNode>; neighbors: Map<string, Set<string>>; provenance: DataProvenance; synthetic: number | null }

const LANGUAGES: Record<string, string> = { py: 'Python', java: 'Java', ts: 'TypeScript', js: 'JavaScript', yml: 'YAML', yaml: 'YAML', toml: 'TOML', md: 'Markdown', ini: 'INI' };
export const languageOf = (path: string | null) => path ? LANGUAGES[path.split('.').pop()!.toLowerCase()] ?? (path.endsWith('Dockerfile') ? 'Dockerfile' : 'Other') : null;
const normalKind = (kind: string): EdgeKind | null => kind === 'implements' ? 'inherits' : (EDGE_KINDS as string[]).includes(kind) ? kind as EdgeKind : null;

/** Seeded so the starting layout, and therefore the settled one, is the same on every load. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

/** Readable cluster names: the most common file stems among the cluster's modules. */
function clusterLabel(id: string, members: GNode[]): string {
  if (!/^cluster-\d+$/.test(id)) return id;
  const stems = new Map<string, number>();
  members.forEach(node => { if (node.path) { const stem = node.path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/^test_|^\d+_/, ''); stems.set(stem, (stems.get(stem) ?? 0) + 1); } });
  const top = [...stems].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([stem]) => stem);
  return top.length ? top.join(', ') : id;
}

export function buildGraphData(graph: DashboardGraph, analysis: RepositoryAnalysis | null): GraphData {
  const symbols = new Map(analysis?.symbols.map(symbol => [symbol.id, symbol]) ?? []);
  const files = new Map(analysis?.files.map(file => [file.id, file]) ?? []);
  const fileCoverage = new Map(analysis ? moduleRows(analysis).map(row => [row.path, row.coverage]) : []);
  const random = seeded(graph.nodes.length * 31 + graph.edges.length);
  const clusterIds = [...new Set(graph.nodes.map(node => node.cluster))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const clusterIndex = new Map(clusterIds.map((id, index) => [id, index]));
  const radius = 260 + clusterIds.length * 14;
  const nodes: GNode[] = graph.nodes.map((node, index) => {
    const symbol = symbols.get(node.id), file = files.get(node.id);
    const path = node.path ?? symbol?.path ?? file?.path ?? null;
    const coverage = symbol ? (symbol.documented ? 100 : 0) : path && fileCoverage.has(path) ? fileCoverage.get(path)! : null;
    const c = clusterIndex.get(node.cluster)!, angle = c / clusterIds.length * Math.PI * 2;
    return {
      id: node.id, label: node.label, kind: node.kind, cluster: node.cluster, path, language: file?.language ?? languageOf(path), coverage,
      line: symbol?.line ?? null, endLine: symbol?.endLine ?? null, degree: 0, index,
      x: Math.cos(angle) * radius + (random() - .5) * 160, y: Math.sin(angle) * radius + (random() - .5) * 160,
      z: (c - (clusterIds.length - 1) / 2) * 95 + (random() - .5) * 50,
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const neighbors = new Map(nodes.map(node => [node.id, new Set<string>()]));
  const edges: GEdge[] = [];
  graph.edges.forEach((edge, index) => {
    const source = byId.get(edge.source), target = byId.get(edge.target), kind = normalKind(edge.kind);
    if (!source || !target || !kind || source === target) return;
    edges.push({ id: `e${index}`, source, target, kind });
    source.degree += 1; target.degree += 1;
    neighbors.get(source.id)!.add(target.id); neighbors.get(target.id)!.add(source.id);
  });
  /**
   * The Phase II graph endpoint returns relationships only. When it has no containment edges, they are derived from the
   * analysis' own parent and file records: a symbol belongs to its parent, or else to its file's module symbol.
   */
  if (analysis && !edges.some(edge => edge.kind === 'contains')) {
    const moduleOfFile = new Map(analysis.symbols.filter(symbol => symbol.kind === 'module').map(symbol => [symbol.fileId, symbol.id]));
    analysis.symbols.forEach(symbol => {
      const owner = symbol.parentId ?? (symbol.kind === 'module' ? null : moduleOfFile.get(symbol.fileId) ?? null);
      const source = owner ? byId.get(owner) : undefined, target = byId.get(symbol.id);
      if (!source || !target || source === target) return;
      edges.push({ id: `c${edges.length}`, source, target, kind: 'contains' });
      source.degree += 1; target.degree += 1;
      neighbors.get(source.id)!.add(target.id); neighbors.get(target.id)!.add(source.id);
    });
  }
  const clusters: GCluster[] = clusterIds.map((id, index) => {
    const members = nodes.filter(node => node.cluster === id);
    return { id, label: clusterLabel(id, members), color: CLUSTER_COLORS[index % CLUSTER_COLORS.length], count: members.length, index };
  });
  return { nodes, edges, clusters, byId, neighbors, provenance: graph.provenance, synthetic: null };
}

/**
 * Scales the demo graph to `target` nodes for performance measurement only. Copies keep their cluster and their
 * edge pattern, and the result is labeled synthetic wherever it is shown. Never used for Live data.
 */
export function benchmarkGraph(graph: DashboardGraph, target: number): DashboardGraph {
  if (target <= graph.nodes.length) return graph;
  const nodes = [...graph.nodes], edges = [...graph.edges];
  for (let copy = 1; nodes.length < target; copy += 1) {
    const take = graph.nodes.slice(0, Math.min(graph.nodes.length, target - nodes.length));
    const ids = new Set(take.map(node => node.id));
    take.forEach(node => nodes.push({ ...node, id: `${node.id}~${copy}`, label: `${node.label}~${copy}` }));
    graph.edges.forEach(edge => { if (ids.has(edge.source) && ids.has(edge.target)) edges.push({ ...edge, source: `${edge.source}~${copy}`, target: `${edge.target}~${copy}` }); });
  }
  return { nodes, edges, provenance: { kind: 'demo', source: `Synthetic benchmark: the demo graph copied to ${nodes.length} nodes. Not a repository.` } };
}

export interface ViewFilter { edgeKinds: ReadonlySet<EdgeKind>; hiddenClusters: ReadonlySet<string>; hiddenKinds: ReadonlySet<string> }
export function visibleEdges(data: GraphData, filter: ViewFilter): GEdge[] {
  return data.edges.filter(edge => filter.edgeKinds.has(edge.kind) && isVisible(edge.source, filter) && isVisible(edge.target, filter));
}
export const isVisible = (node: GNode, filter: ViewFilter) => !filter.hiddenClusters.has(node.cluster) && !filter.hiddenKinds.has(node.kind);

/** Prefix matches first, then substring matches, then by degree. */
export function searchNodes(data: GraphData, query: string, limit = 8): GNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.nodes.map(node => {
    const label = node.label.toLowerCase(), path = node.path?.toLowerCase() ?? '';
    const rank = label === q ? 0 : label.startsWith(q) ? 1 : label.includes(q) ? 2 : path.includes(q) ? 3 : -1;
    return { node, rank };
  }).filter(hit => hit.rank >= 0).sort((a, b) => a.rank - b.rank || b.node.degree - a.node.degree || a.node.label.localeCompare(b.node.label)).slice(0, limit).map(hit => hit.node);
}

export const nodeRadius = (node: GNode) => 2.6 + Math.sqrt(node.degree) * 1.7;

/** Andrew's monotone chain. Returns the hull in order, or the points themselves when there are fewer than three. */
export function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Which labels to draw at a zoom level: hubs when zoomed out, more as the view gets closer. */
export function labelBudget(zoom: number, count: number): number {
  if (zoom < .45) return Math.min(count, 14);
  if (zoom < .8) return Math.min(count, 24);
  if (zoom < 1.4) return Math.min(count, 70);
  if (zoom < 2.2) return Math.min(count, 180);
  return count;
}

export { groupOf };
