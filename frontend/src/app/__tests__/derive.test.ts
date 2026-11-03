import { describe, expect, it } from 'vitest';
import { buildCoverageHistory, buildDemoAnalysis } from '../../data/demo/analysis';
import { buildShopflow, SHOPFLOW } from '../../data/demo/shopflow';
import { architectureMap, completeness, coverageChart, delta, dependencyStats, gapHeatmap, groupOf, languageDonut, moduleRows, moduleTreemap } from '../pages/derive';

const analysis = buildDemoAnalysis(buildShopflow());
const provenance = { kind: 'demo' as const, source: 'test' };

describe('overview derivations', () => {
  const rows = moduleRows(analysis);

  it('counts every documentable symbol exactly once across modules', () => {
    expect(rows.reduce((sum, row) => sum + row.documentable, 0)).toBe(SHOPFLOW.functions + SHOPFLOW.classes);
    expect(rows.reduce((sum, row) => sum + row.documented, 0)).toBe(analysis.statistics.documented_symbols);
  });

  it('finds only the three deliberate import cycles in the layered fixture', () => {
    const { cycles } = dependencyStats(analysis, rows);
    expect(cycles.map(cycle => cycle.join(' ')).sort()).toEqual(['app/core/config.py app/core/logging.py', 'app/services/carts.py app/services/coupons.py', 'app/services/orders.py app/services/payments.py']);
    expect(rows.filter(row => row.inCycle)).toHaveLength(6);
  });

  it('ranks modules by fan-in and marks status from coverage', () => {
    const { mostImported } = dependencyStats(analysis, rows);
    expect(mostImported).toHaveLength(3);
    expect(mostImported[0].count).toBeGreaterThanOrEqual(mostImported[2].count);
    rows.filter(row => row.coverage !== null && row.coverage < 30).forEach(row => expect(row.status).toBe('critical'));
    rows.filter(row => row.coverage !== null && row.coverage >= 60 && !row.unresolved).forEach(row => expect(row.status).toBe('healthy'));
  });

  it('builds charts whose totals match the record', () => {
    expect(languageDonut(analysis, provenance).segments.reduce((sum, segment) => sum + segment.value, 0)).toBe(SHOPFLOW.files);
    const heat = gapHeatmap(analysis, provenance);
    expect(heat.values).toHaveLength(heat.yLabels.length);
    heat.values.flat().forEach(value => { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100); });
    const tree = moduleTreemap(rows, provenance, 60);
    expect(tree.nodes).toHaveLength(60);
    tree.nodes.forEach(node => expect(tree.groups.map(group => group.id)).toContain(node.group));
    const map = architectureMap(analysis, provenance);
    const ids = new Set(map.nodes.map(node => node.id));
    map.edges.forEach(edge => { expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true); });
    expect(map.flow).toBe(true);
  });

  it('slices coverage history and toggles series', () => {
    const history = buildCoverageHistory();
    expect(coverageChart(history, 7, 'both', provenance).categories).toHaveLength(7);
    expect(coverageChart(history, 90, 'existing', provenance).series.map(series => series.id)).toEqual(['existing']);
  });

  it('averages only the stages that have data, and names the rest pending', () => {
    const result = completeness({ parsed: 100, summarized: null, verified: null, reviewed: null, published: null }, provenance);
    expect(result.overall).toBe(100);
    expect(result.pending).toEqual(['Summarized', 'Verified', 'Reviewed', 'Published']);
    expect(completeness({ parsed: null, summarized: null, verified: null, reviewed: null, published: null }, provenance).overall).toBeNull();
  });

  it('computes deltas only with a baseline', () => {
    expect(delta([10, 15])).toBe(50);
    expect(delta([0, 5])).toBeNull();
    expect(delta([5])).toBeNull();
    expect(groupOf('README.md')).toBe('(root)');
  });
});
