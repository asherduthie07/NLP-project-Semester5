import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import analysis from '../../../../docs/07-findings/phase-2/analysis.json';
import { vizDemo } from '../../data/vizDemo';
import type { DependencyGraph, ExploratoryStatistics } from '../../data/api';
import { exploratoryModels, histogramFromValues, networkFromGraph } from '../adapters/backend';
import { buildScene } from '../engine/builders';
import { cssColor } from '../engine/scene';
import { applyHidden, barDatumId, datumIds, describeDatum, encodings, heatDatumId, isEmptyModel, legendItems, toTable, valueTicks } from '../model';
import { resolveToken } from '../palette';
import { arcLayout, layoutWords, monotoneSample, networkLayout, niceTicks, squarify, wordScale } from '../scale';
import { toCsv } from '../export';
import { vizRegistry } from '../registry';
import type { BarModel, Provenance, VizKind, VizModel } from '../types';

const demoModels: VizModel[] = [vizDemo.coverage, vizDemo.completeness, vizDemo.groupedBars, vizDemo.stackedBars, vizDemo.claims, vizDemo.gaps, vizDemo.sizes, vizDemo.fan, vizDemo.fanFlat, vizDemo.lengths, vizDemo.words, vizDemo.activity, vizDemo.network, vizDemo.sparklines[0]];
const measured: Provenance = { kind: 'measured', source: 'test fixture' };
const stats = exploratoryModels(analysis.statistics as unknown as ExploratoryStatistics, measured);
const build = (model: VizModel) => buildScene(model, { resolve: resolveToken });
const ratios = (pairs: [number, number][]) => pairs.filter(([value]) => value > 0).map(([value, size]) => size / value);
function expectProportional(pairs: [number, number][]) {
  const all = ratios(pairs);
  all.forEach(ratio => expect(ratio).toBeCloseTo(all[0], 5));
}

describe('dual-mode contract', () => {
  it('registers a 2D renderer for each kind, and each kind builds a 3D scene', () => {
    const kinds = new Set(demoModels.map(model => model.kind));
    expect([...kinds].sort()).toEqual((Object.keys(vizRegistry) as VizKind[]).sort());
    demoModels.forEach(model => { const scene = build(model); expect(scene.root.children.length).toBeGreaterThan(0); scene.dispose(); });
  });
  it('produces finite geometry for every model, including measured data', () => {
    const consoleError = vi.spyOn(console, 'error');
    [...demoModels, ...Object.values(stats)].filter(model => !isEmptyModel(model)).forEach(model => {
      const scene = build(model);
      scene.setProgress(0); scene.setProgress(1);
      scene.root.traverse(object => {
        const position = (object as THREE.Mesh).geometry?.attributes?.position;
        if (position) expect(Array.from(position.array as ArrayLike<number>).every(Number.isFinite), `${model.id} ${object.type}`).toBe(true);
      });
      expect(new THREE.Box3().setFromObject(scene.root).isEmpty(), model.id).toBe(false);
      scene.dispose();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
  it('exposes the same datums, table and tooltip whichever renderer asks', () => {
    demoModels.forEach(model => {
      const ids = datumIds(model);
      expect(ids.length, model.id).toBeGreaterThan(0);
      expect(new Set(ids).size, `${model.id} ids unique`).toBe(ids.length);
      ids.slice(0, 40).forEach(id => expect(describeDatum(model, id), `${model.id}:${id}`).not.toBeNull());
      expect(toTable(model).rows.length).toBeGreaterThan(0);
    });
  });
});

describe('3D geometry is proportional to data', () => {
  it('vertical bar height', () => {
    const model = vizDemo.groupedBars;
    const scene = build(model);
    const pairs = model.series.flatMap(series => model.categories.map((category, c): [number, number] => [series.values[c], scene.magnitudes.get(barDatumId(category.id, series.id))!]));
    expectProportional(pairs);
  });
  it('stacked bars never exceed the shared axis', () => {
    const model = vizDemo.stackedBars;
    const top = valueTicks(model).at(-1)!;
    model.categories.forEach((_, c) => expect(model.series.reduce((sum, series) => sum + series.values[c], 0)).toBeLessThanOrEqual(top));
    const scene = build(model);
    expectProportional(model.series.flatMap(series => model.categories.map((category, c): [number, number] => [series.values[c], scene.magnitudes.get(barDatumId(category.id, series.id))!])));
  });
  it('histogram height', () => {
    const scene = build(vizDemo.lengths);
    expectProportional(vizDemo.lengths.bins.map((bin): [number, number] => [bin.count, scene.magnitudes.get(bin.id)!]));
  });
  it('line height at every datum', () => {
    const model = vizDemo.coverage;
    const scene = build(model);
    expectProportional(model.series.flatMap(series => model.categories.map((category, c): [number, number] => [series.values[c], scene.magnitudes.get(barDatumId(category.id, series.id))!])));
  });
  it('heatmap height', () => {
    const model = vizDemo.gaps;
    const scene = build(model);
    expectProportional(model.values.flatMap((row, y) => row.map((value, x): [number, number] => [value, scene.magnitudes.get(heatDatumId(x, y))!])));
  });
  it('donut angle sums to a full turn and follows share', () => {
    const model = vizDemo.claims;
    const scene = build(model);
    const total = model.segments.reduce((sum, segment) => sum + segment.value, 0);
    expect([...scene.magnitudes.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(Math.PI * 2, 8);
    model.segments.forEach(segment => expect(scene.magnitudes.get(segment.id)).toBeCloseTo(segment.value / total * Math.PI * 2, 8));
  });
  it('radial sweep matches the exact percentage', () => {
    const scene = build(vizDemo.completeness);
    vizDemo.completeness.metrics.forEach(metric => expect(scene.magnitudes.get(metric.id)).toBeCloseTo(metric.value / metric.max * Math.PI * 2, 8));
  });
  it('treemap footprint', () => {
    const scene = build(vizDemo.sizes);
    expectProportional(vizDemo.sizes.nodes.map((node): [number, number] => [node.value, scene.magnitudes.get(node.id)!]));
  });
  it('timeline stem height', () => {
    const scene = build(vizDemo.activity);
    expectProportional(vizDemo.activity.events.map((event): [number, number] => [event.value, scene.magnitudes.get(event.id)!]));
  });
  it('word size is the shared size scale in 3D', () => {
    const scene = build(vizDemo.words);
    const placed = layoutWords(vizDemo.words.words, 640, 320);
    placed.forEach(word => expect(scene.magnitudes.get(word.id)).toBeCloseTo(word.size, 8));
    const lowest = placed.at(-1)!, highest = placed[0];
    const factor = highest.size / wordScale(highest.word.count, highest.word.count, 12, 44);
    placed.forEach(word => expect(word.size).toBeCloseTo(wordScale(word.word.count, highest.word.count, 12 * factor, 44 * factor), 8));
    expect(highest.size).toBeGreaterThan(lowest.size);
  });
  it('analytical charts default to orthographic, so depth cannot distort comparisons', () => {
    [vizDemo.groupedBars, vizDemo.lengths, vizDemo.gaps, vizDemo.sizes, vizDemo.claims, vizDemo.coverage, vizDemo.fan, vizDemo.words].forEach(model => expect(build(model).camera.projection, model.id).toBe('orthographic'));
  });
  it('declares every non-data channel', () => {
    expect(encodings(vizDemo.claims).height).toBe('not data');
    expect(encodings(vizDemo.fanFlat).depth).toMatch(/not data/);
    expect(encodings(vizDemo.fan).depth).toBe('Complexity');
    expect(encodings(vizDemo.words).position).toBe('not data');
  });
});

describe('shared geometry helpers', () => {
  it('squarify conserves area exactly', () => {
    const items = [{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 2 }, { value: 1 }];
    const tiles = squarify(items, 6, 4);
    expect(tiles.length).toBe(items.length);
    expect(tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0)).toBeCloseTo(24, 8);
    tiles.forEach(tile => { expect(tile.w * tile.h).toBeCloseTo(tile.item.value, 8); expect(tile.x + tile.w).toBeLessThanOrEqual(6 + 1e-9); expect(tile.y + tile.h).toBeLessThanOrEqual(4 + 1e-9); });
  });
  it('arcLayout is clockwise and skips non-positive values', () => {
    const arcs = arcLayout([{ value: 1 }, { value: 0 }, { value: 3 }]);
    expect(arcs).toHaveLength(2);
    expect(arcs[1].end).toBeCloseTo(Math.PI * 2);
    expect(arcs[0].share).toBeCloseTo(.25);
  });
  it('monotone curve passes through every datum without overshoot', () => {
    const values = [5, 5, 9, 2, 2, 8];
    const samples = monotoneSample(values, 6);
    values.forEach((value, index) => expect(samples.find(sample => sample.position === index)?.value).toBeCloseTo(value, 9));
    samples.forEach(sample => { expect(sample.value).toBeGreaterThanOrEqual(2 - 1e-9); expect(sample.value).toBeLessThanOrEqual(9 + 1e-9); });
  });
  it('niceTicks start at zero and cover the maximum', () => {
    [1, 7, 42, 99, 100, 3912, .5].forEach(max => { const ticks = niceTicks(max); expect(ticks[0]).toBe(0); expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max); });
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it('word placement is deterministic and non-overlapping', () => {
    const a = layoutWords(vizDemo.words.words, 640, 320), b = layoutWords(vizDemo.words.words, 640, 320);
    expect(a).toEqual(b);
    [vizDemo.words, stats.identifiers, stats.documentationTerms].forEach(model => expect(layoutWords(model.words, 640, 320), model.id).toHaveLength(model.words.length));
  });
});

describe('stability and color parsing', () => {
  it('lays out the network identically on every reload', () => {
    /** A fresh object per run, because the layout is cached per model instance. */
    const first = networkLayout({ ...vizDemo.network }), second = networkLayout({ ...vizDemo.network });
    expect(second).toEqual(first);
    first.forEach(node => [node.x, node.y, node.z].forEach(value => expect(Number.isFinite(value)).toBe(true)));
  });
  it('reads alpha tokens in source form and in the 8-digit form the CSS minifier produces', () => {
    const warn = vi.spyOn(console, 'warn');
    const expected = new THREE.Color('rgb(120,180,255)').getHex();
    ['rgba(120,180,255,.28)', '#78b4ff47', '#78B4FF'].forEach(value => expect(cssColor(resolveToken, value).getHex()).toBe(expected));
    expect(cssColor(resolveToken, '#abcd').getHex()).toBe(new THREE.Color('#abc').getHex());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('builds no material color from a raw alpha token', () => {
    const warn = vi.spyOn(console, 'warn');
    const minified = (token: `--${string}`) => token === '--line-strong' ? '#78b4ff47' : token === '--line' ? '#78a0ff1f' : resolveToken(token);
    demoModels.forEach(model => buildScene(model, { resolve: minified }).dispose());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('filters', () => {
  it('apply once, for every renderer and the table', () => {
    const model = vizDemo.groupedBars;
    const visible = applyHidden(model, new Set(['total']));
    expect(visible.series.map(series => series.id)).toEqual(['documented']);
    expect(toTable(visible).columns).toEqual(['Category', 'Documented']);
    expect(datumIds(visible).every(id => id.endsWith('|documented'))).toBe(true);
    const scene = build(visible);
    expect([...scene.magnitudes.keys()].every(id => id.endsWith('|documented'))).toBe(true);
    expect(legendItems(model).map(item => item.id)).toEqual(['total', 'documented']);
  });
  it('drop network edges whose endpoints are hidden', () => {
    const visible = applyHidden(vizDemo.network, new Set(['auth']));
    const ids = new Set(visible.nodes.map(node => node.id));
    expect(visible.nodes.every(node => node.cluster !== 'auth')).toBe(true);
    expect(visible.edges.every(edge => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
  it('report an emptied model as empty', () => {
    expect(isEmptyModel(applyHidden(vizDemo.groupedBars, new Set(['total', 'documented'])))).toBe(true);
  });
});

describe('backend adapter on real Phase II statistics', () => {
  it('keeps every measured value', () => {
    expect(stats.languages.segments.map(segment => [segment.label, segment.value])).toEqual([['python', 4], ['java', 3]]);
    expect(stats.tokenCategories.segments.reduce((sum, segment) => sum + segment.value, 0)).toBe(205);
    expect(stats.relationships.series[0].values.reduce((a, b) => a + b, 0)).toBe(20);
    const coverage = stats.documentationByKind;
    const [documented, undocumented] = coverage.series;
    expect(documented.values.reduce((a, b) => a + b, 0)).toBe(10);
    expect(undocumented.values.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('never mixes code tokens, punctuation and documentation prose', () => {
    expect(stats.identifiers.corpus).toBe('code-identifiers');
    expect(stats.documentationTerms.corpus).toBe('documentation-terms');
    const punctuation = /^[^\w]+$/;
    stats.identifiers.words.forEach(word => expect(word.text).not.toMatch(punctuation));
    expect(stats.identifiers.words.map(word => word.text)).toEqual(analysis.statistics.identifiers.slice(0, 60).map(item => item.value));
    expect(stats.documentationTerms.words.map(word => word.text)).toEqual(analysis.statistics.documentation_terms.slice(0, 60).map(item => item.value));
    expect(stats.identifiers.words.map(word => word.count)).toEqual(analysis.statistics.identifiers.slice(0, 60).map(item => item.count));
  });
  it('carries provenance, and reports empty data as empty', () => {
    Object.values(stats).forEach(model => expect(model.provenance).toEqual(measured));
    expect(isEmptyModel(stats.fan)).toBe(true);
    expect(stats.fan.zLabel).toBeUndefined();
  });
  it('bins raw values without dropping any', () => {
    const values = analysis.statistics.function_lengths;
    expect(stats.functionLengths.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(values.length);
    const empty = histogramFromValues('x', 'x', 'x', [], 'x', measured);
    expect(isEmptyModel(empty)).toBe(true);
  });
  it('counts unresolved relationships rather than guessing a target', () => {
    const evidence = { schema_version: '1.0', snapshot_id: 's', file_id: 'f', relative_path: 'a.py', span: { schema_version: '1.0', start: { schema_version: '1.0', line: 2, column: 0 }, end: { schema_version: '1.0', line: 4, column: 0 } } };
    const node = (id: string) => ({ schema_version: '1.0', id, snapshot_id: 's', file_id: 'f', name: id, qualified_name: id, kind: 'function', parent_id: null, signature: null, parameters: [], return_type: null, modifiers: [], decorators: [], documented: false, documentation_evidence: null, evidence, analyzer_version: 'phase2-v1' });
    const edge = (id: string, target: string | null, resolution: string) => ({ schema_version: '1.0', id, snapshot_id: 's', source_id: 'a', target_id: target, target_name: target ?? 'unknown', alias: null, kind: 'calls', resolution, evidence, analyzer_version: 'phase2-v1' });
    const graph = { schema_version: '1.0', snapshot_id: 's', nodes: [node('a'), node('b')], edges: [edge('1', 'b', 'confirmed'), edge('2', null, 'unresolved')] } as unknown as DependencyGraph;
    const model = networkFromGraph(graph, measured);
    expect(model.edges).toHaveLength(1);
    expect(model.unresolvedEdges).toBe(1);
    expect(model.provenance.snapshotId).toBe('s');
    expect(model.nodes[0].source).toEqual({ path: 'a.py', startLine: 2, endLine: 4 });
  });
});

describe('tooltips and export', () => {
  it('state the right value for a datum', () => {
    const model = vizDemo.groupedBars;
    const tooltip = describeDatum(model, barDatumId(model.categories[2].id, 'total'))!;
    expect(tooltip.title).toBe(model.categories[2].label);
    expect(tooltip.rows[0]).toMatchObject({ label: 'Total', value: model.series[0].values[2].toLocaleString('en-US') });
    expect(tooltip.source?.path).toContain(model.categories[2].label);
    const claim = describeDatum(vizDemo.claims, 'verified')!;
    expect(claim.rows.map(row => row.value)).toEqual(['3,305', '84.5%']);
    const stacked: BarModel = { ...vizDemo.stackedBars, categories: [{ id: 'a', label: 'a' }], series: [{ id: 'x', label: 'X', color: '--cyan', values: [2] }, { id: 'y', label: 'Y', color: '--blue', values: [3] }] };
    expect(describeDatum(stacked, 'a|x')!.rows.at(-1)).toMatchObject({ label: 'Stack total' });
    expect(describeDatum(vizDemo.claims, 'missing')).toBeNull();
  });
  it('states provenance in CSV and neutralizes spreadsheet formulas', () => {
    const model: VizModel = { kind: 'donut', id: 'x', title: 'T', provenance: { kind: 'measured', source: 'S' }, segments: [{ id: 'a', label: '=HYPERLINK("x")', value: 1, color: '--cyan' }] };
    const csv = toCsv(model).split('\n');
    expect(csv[0]).toBe('# T | measured: S');
    expect(csv[2].startsWith('"\'=HYPERLINK')).toBe(true);
  });
});
