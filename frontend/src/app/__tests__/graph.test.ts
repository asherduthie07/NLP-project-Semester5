import { describe, expect, it } from 'vitest';
import { buildDemoAnalysis } from '../../data/demo/analysis';
import { buildShopflow } from '../../data/demo/shopflow';
import { benchmarkGraph, buildGraphData, convexHull, EDGE_KINDS, labelBudget, searchNodes, visibleEdges } from '../pages/graph/model';
import { createSimulation, FrameStats } from '../pages/graph/layout';
import { emphasis } from '../pages/graph/view';

const fixture = buildShopflow();
const analysis = buildDemoAnalysis(fixture);
const graph = { ...fixture.graph, provenance: { kind: 'demo' as const, source: 'test' } };

describe('graph model', () => {
  const data = buildGraphData(graph, analysis);

  it('keeps every node and every edge whose ends exist, with 600+ nodes in 6 to 8 clusters', () => {
    expect(data.nodes).toHaveLength(graph.nodes.length);
    expect(data.nodes.length).toBeGreaterThanOrEqual(600);
    expect(data.clusters.length).toBeGreaterThanOrEqual(6);
    expect(data.clusters.length).toBeLessThanOrEqual(8);
    expect(data.edges).toHaveLength(graph.edges.length);
    expect(new Set(data.edges.map(edge => edge.kind))).toEqual(new Set(EDGE_KINDS));
    expect(data.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(data.nodes.length);
  });

  it('degree is the number of edge ends, and neighbors are symmetric', () => {
    const ends = new Map<string, number>();
    data.edges.forEach(edge => { ends.set(edge.source.id, (ends.get(edge.source.id) ?? 0) + 1); ends.set(edge.target.id, (ends.get(edge.target.id) ?? 0) + 1); });
    data.nodes.forEach(node => expect(node.degree).toBe(ends.get(node.id) ?? 0));
    data.edges.forEach(edge => { expect(data.neighbors.get(edge.source.id)!.has(edge.target.id)).toBe(true); expect(data.neighbors.get(edge.target.id)!.has(edge.source.id)).toBe(true); });
  });

  it('takes coverage from the analysis: documented symbols are 100, modules use their file coverage', () => {
    const symbols = new Map(analysis.symbols.map(symbol => [symbol.id, symbol]));
    data.nodes.filter(node => symbols.has(node.id) && node.kind !== 'module').forEach(node => expect(node.coverage).toBe(symbols.get(node.id)!.documented ? 100 : 0));
    expect(data.nodes.filter(node => node.kind === 'module').some(node => node.coverage !== null)).toBe(true);
    /** Without an analysis nothing is invented. */
    expect(buildGraphData(graph, null).nodes.every(node => node.coverage === null || node.kind === 'module')).toBe(true);
  });

  it('places nodes the same way on every build, so the settled layout is stable', () => {
    const again = buildGraphData(graph, analysis);
    expect(again.nodes.slice(0, 20).map(node => [node.x, node.y, node.z])).toEqual(data.nodes.slice(0, 20).map(node => [node.x, node.y, node.z]));
  });

  it('derives containment from parent and file records only when the graph has none', () => {
    const relationsOnly = { ...graph, edges: graph.edges.filter(edge => edge.kind !== 'contains') };
    const derived = buildGraphData(relationsOnly, analysis);
    const contains = derived.edges.filter(edge => edge.kind === 'contains');
    expect(contains.length).toBeGreaterThan(0);
    const symbols = new Map(analysis.symbols.map(symbol => [symbol.id, symbol]));
    contains.forEach(edge => {
      const child = symbols.get(edge.target.id)!;
      expect(child.parentId ?? analysis.symbols.find(symbol => symbol.kind === 'module' && symbol.fileId === child.fileId)?.id).toBe(edge.source.id);
    });
    expect(buildGraphData(relationsOnly, null).edges.some(edge => edge.kind === 'contains')).toBe(false);
    expect(data.edges.filter(edge => edge.kind === 'contains')).toHaveLength(graph.edges.filter(edge => edge.kind === 'contains').length);
  });

  it('readable cluster names come from file stems', () => {
    data.clusters.forEach(cluster => expect(cluster.label).not.toMatch(/^cluster-\d+$/));
  });

  it('filters hide edges whose ends are in a hidden cluster', () => {
    const hidden = data.clusters[0].id;
    const edges = visibleEdges(data, { edgeKinds: new Set(['imports']), hiddenClusters: new Set([hidden]), hiddenKinds: new Set() });
    expect(edges.length).toBeGreaterThan(0);
    edges.forEach(edge => { expect(edge.kind).toBe('imports'); expect(edge.source.cluster).not.toBe(hidden); expect(edge.target.cluster).not.toBe(hidden); });
    /** Hiding a node kind removes those nodes' edges too. */
    const noClasses = visibleEdges(data, { edgeKinds: new Set(EDGE_KINDS), hiddenClusters: new Set(), hiddenKinds: new Set(['class']) });
    expect(noClasses.length).toBeLessThan(data.edges.length);
    noClasses.forEach(edge => { expect(edge.source.kind).not.toBe('class'); expect(edge.target.kind).not.toBe('class'); });
  });

  it('search ranks exact, then prefix, then substring, then path matches', () => {
    const results = searchNodes(data, 'OrderModel', 50);
    expect(results[0].label).toBe('OrderModel');
    const order = searchNodes(data, 'order', 200).map(node => node.label.toLowerCase());
    const firstSubstring = order.findIndex(label => !label.startsWith('order'));
    if (firstSubstring >= 0) order.slice(firstSubstring).forEach(label => expect(label.startsWith('order')).toBe(false));
    expect(searchNodes(data, '   ')).toEqual([]);
  });

  it('benchmark copies are synthetic, sized as asked, and keep the edge pattern', () => {
    const big = benchmarkGraph(graph, 2000);
    expect(big.nodes).toHaveLength(2000);
    expect(big.provenance.source).toMatch(/Synthetic benchmark/);
    expect(new Set(big.nodes.map(node => node.id)).size).toBe(2000);
    const ids = new Set(big.nodes.map(node => node.id));
    big.edges.forEach(edge => { expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true); });
    expect(benchmarkGraph(graph, 10)).toBe(graph);
  });
});

describe('graph geometry and rendering helpers', () => {
  it('convex hull returns the outer points in order', () => {
    const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, .5]]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([1, 1]);
  });

  it('labels grow with zoom', () => {
    const counts = [.3, .6, 1, 2, 3].map(zoom => labelBudget(zoom, 700));
    counts.slice(1).forEach((count, index) => expect(count).toBeGreaterThanOrEqual(counts[index]));
    expect(counts[4]).toBe(700);
  });

  it('emphasis keeps the anchor and its neighbors, plus search matches', () => {
    const data = buildGraphData(graph, analysis);
    const node = data.nodes.find(entry => entry.degree > 3)!;
    const set = emphasis(data, { hover: null, selected: node, focus: null, matches: new Set() }, true)!;
    expect(set.has(node.id)).toBe(true);
    data.neighbors.get(node.id)!.forEach(id => expect(set.has(id)).toBe(true));
    expect(set.size).toBe(data.neighbors.get(node.id)!.size + 1);
    expect(emphasis(data, { hover: null, selected: node, focus: null, matches: new Set() }, false)).toBeNull();
    expect(emphasis(data, { hover: null, selected: null, focus: null, matches: new Set(['x']) }, true)).toEqual(new Set(['x']));
  });

  it('the force layout separates clusters: nodes sit nearer their own cluster centre than others', () => {
    const data = buildGraphData(graph, analysis);
    const simulation = createSimulation(data, 260);
    for (let i = 0; i < 160; i += 1) simulation.tick();
    const centre = new Map(data.clusters.map(cluster => {
      const members = data.nodes.filter(node => node.cluster === cluster.id);
      return [cluster.id, { x: members.reduce((s, n) => s + n.x, 0) / members.length, y: members.reduce((s, n) => s + n.y, 0) / members.length }];
    }));
    const nearest = data.nodes.filter(node => {
      let best = '', distance = Infinity;
      centre.forEach((point, id) => { const d = Math.hypot(node.x - point.x, node.y - point.y); if (d < distance) { distance = d; best = id; } });
      return best === node.cluster;
    }).length;
    expect(nearest / data.nodes.length).toBeGreaterThan(.8);
  });

  it('frame statistics count only self-animated gaps toward the performance switch', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 40; i += 1) stats.frame(i * 100, 1, false);
    expect(stats.recentFrame()).toBeNull();
    for (let i = 0; i < 40; i += 1) stats.frame(10000 + i * 33, 1, true);
    expect(stats.recentFrame()).toBe(33);
    expect(stats.summary().costP50).toBe(1);
  });
});
