import * as THREE from 'three';
import { barDatumId, heatDatumId, valueTicks } from '../../model';
import { rampColor } from '../../palette';
import { formatValue, monotoneSample, niceTicks } from '../../scale';
import type { BarModel, HeatmapModel, HistogramModel, LineModel, ScatterModel, SparklineModel, TimelineModel } from '../../types';
import { BoxField, cssColor, defaultPresets, disposeTree, draftingPlate, shade, valueWall, type Box, type BuiltScene, type SceneBuilder, type SceneCamera, type SceneLabel } from '../scene';

const WIDTH = 2.8, DEPTH = 1, HEIGHT = 1.1;
const camera = (overrides: Partial<SceneCamera> = {}): SceneCamera => ({ projection: 'orthographic', presets: defaultPresets(), flat: 'front', initial: 'iso', ...overrides });

function boxScene(root: THREE.Group, field: BoxField, labels: SceneLabel[], sceneCamera: SceneCamera, magnitudes: Map<string, number>): BuiltScene {
  root.add(field.mesh, field.frame);
  return {
    root, labels, camera: sceneCamera, magnitudes,
    pickables: [field.mesh],
    pick: hit => field.idAt(hit.instanceId),
    anchor: id => field.anchor(id),
    highlight: (active, selected) => field.highlight(active, selected),
    setProgress: progress => field.setProgress(progress),
    dispose: () => disposeTree(root),
  };
}

export const buildBar: SceneBuilder<BarModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const ticks = valueTicks(model), top = ticks[ticks.length - 1];
  const count = Math.max(model.categories.length, 1), lanes = model.layout === 'grouped' ? Math.max(model.series.length, 1) : 1;
  const boxes: Box[] = [], labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  const horizontal = model.orientation === 'horizontal';
  const span = horizontal ? WIDTH : HEIGHT;
  const scale = (value: number) => value / top * span;
  const along = horizontal ? DEPTH * 1.5 : WIDTH;
  const slot = along / count, thickness = Math.min(slot * .72 / lanes, .32);
  model.categories.forEach((category, c) => {
    const center = -along / 2 + slot * (c + .5);
    let stack = 0;
    model.series.forEach((series, s) => {
      const value = series.values[c] ?? 0, size = scale(value), id = barDatumId(category.id, series.id);
      const offset = model.layout === 'grouped' ? (s - (lanes - 1) / 2) * thickness : 0;
      const base = model.layout === 'stacked' ? stack : 0;
      if (horizontal) boxes.push({ id, x: -WIDTH / 2 + base, z: center + offset, base: 0, width: .12, depth: thickness * .92, height: size, color: resolve(series.color), axis: 'x' });
      else boxes.push({ id, x: center + offset, z: 0, base, width: thickness * .92, depth: Math.min(.34, thickness * 1.1), height: size, color: resolve(series.color) });
      magnitudes.set(id, size);
      if (count * lanes <= 14) labels.push({ text: formatValue(value, model.unit), position: horizontal ? new THREE.Vector3(-WIDTH / 2 + base + size + .12, .06, center + offset) : new THREE.Vector3(center + offset, base + size + .07, 0), tone: 'value', priority: 3, datumId: id });
      stack += model.layout === 'stacked' ? size : 0;
    });
    labels.push({ text: category.label, position: horizontal ? new THREE.Vector3(-WIDTH / 2 - .08, 0, center) : new THREE.Vector3(center, -.02, DEPTH / 2 + .12), tone: 'axis', priority: 1, align: horizontal ? 'end' : 'center' });
  });
  const plateDepth = horizontal ? along + .1 : DEPTH;
  root.add(draftingPlate(WIDTH + .1, plateDepth, resolve, horizontal ? 10 : 8));
  if (horizontal) {
    ticks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(-WIDTH / 2 + scale(tick), 0, along / 2 + .14), tone: 'axis', priority: 2 }));
  } else {
    root.add(valueWall(ticks, scale, WIDTH + .1, -DEPTH / 2, resolve));
    /** Back-right is the one corner tall bars cannot cover from the default camera. */
    ticks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(WIDTH / 2 + .1, scale(tick), -DEPTH / 2), tone: 'axis', priority: 2, align: 'start' }));
  }
  const presets = defaultPresets();
  if (horizontal) presets.iso = new THREE.Vector3(.18, 1, .62).normalize();
  return boxScene(root, new BoxField(boxes, resolve('--text-hi')), labels, camera({ presets, flat: horizontal ? 'top' : 'front' }), magnitudes);
};

export const buildHistogram: SceneBuilder<HistogramModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const ticks = valueTicks(model), top = ticks[ticks.length - 1];
  const slot = WIDTH / Math.max(model.bins.length, 1), color = resolve(model.color);
  const boxes: Box[] = [], labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  model.bins.forEach((bin, i) => {
    const height = bin.count / top * HEIGHT;
    boxes.push({ id: bin.id, x: -WIDTH / 2 + slot * (i + .5), z: 0, base: 0, width: slot * .96, depth: .42, height, color });
    magnitudes.set(bin.id, height);
    labels.push({ text: `${bin.x0}`, position: new THREE.Vector3(-WIDTH / 2 + slot * i, -.02, DEPTH / 2 + .1), tone: 'axis', priority: 1 + i % 2 });
    if (model.bins.length <= 14 && bin.count > 0) labels.push({ text: formatValue(bin.count), position: new THREE.Vector3(-WIDTH / 2 + slot * (i + .5), height + .07, 0), tone: 'value', priority: 3, datumId: bin.id });
  });
  root.add(draftingPlate(WIDTH + .1, DEPTH, resolve), valueWall(ticks, tick => tick / top * HEIGHT, WIDTH + .1, -DEPTH / 2, resolve));
  ticks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(WIDTH / 2 + .1, tick / top * HEIGHT, -DEPTH / 2), tone: 'axis', priority: 2, align: 'start' }));
  return boxScene(root, new BoxField(boxes, resolve('--text-hi')), labels, camera(), magnitudes);
};

/** A ribbon on top of a gradient curtain, on its own depth lane. Passes through every datum exactly. */
function ribbon(values: number[], xFor: (position: number) => number, yFor: (value: number) => number, z: number, color: THREE.Color, opacity: number, ribbonWidth: number): THREE.Mesh[] {
  const samples = monotoneSample(values);
  const curtain: number[] = [], curtainColor: number[] = [], top: number[] = [];
  const indexCurtain: number[] = [], indexTop: number[] = [];
  samples.forEach(({ position, value }, i) => {
    const x = xFor(position), y = Math.max(yFor(value), 0);
    curtain.push(x, 0, z, x, y, z);
    curtainColor.push(color.r, color.g, color.b, 0, color.r, color.g, color.b, opacity);
    top.push(x, y, z - ribbonWidth / 2, x, y, z + ribbonWidth / 2);
    if (i < samples.length - 1) {
      const a = i * 2;
      indexCurtain.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      indexTop.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const curtainGeometry = new THREE.BufferGeometry();
  curtainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curtain, 3));
  curtainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(curtainColor, 4));
  curtainGeometry.setIndex(indexCurtain);
  const topGeometry = new THREE.BufferGeometry();
  topGeometry.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  topGeometry.setIndex(indexTop);
  topGeometry.computeVertexNormals();
  return [
    new THREE.Mesh(curtainGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })),
    new THREE.Mesh(topGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })),
  ];
}

export const buildLine: SceneBuilder<LineModel> = (model, { resolve }) => {
  const root = new THREE.Group(), curves = new THREE.Group();
  const ticks = valueTicks(model), top = ticks[ticks.length - 1];
  const count = model.categories.length;
  const xFor = (position: number) => -WIDTH / 2 + (count > 1 ? position / (count - 1) : .5) * WIDTH;
  const yFor = (value: number) => value / top * HEIGHT;
  const lanes = Math.max(model.series.length, 1);
  /** The tallest series takes the back lane, so a lower series is never hidden behind it. */
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const laneOrder = model.series.map((series, s) => ({ s, mean: mean(series.values) })).sort((a, b) => b.mean - a.mean).map(item => item.s);
  const zFor = (s: number) => lanes === 1 ? 0 : (laneOrder.indexOf(s) - (lanes - 1) / 2) * (DEPTH * .72 / (lanes - 1));
  const labels: SceneLabel[] = [], magnitudes = new Map<string, number>(), pickables: THREE.Object3D[] = [];
  model.series.forEach((series, s) => {
    const color = cssColor(resolve, series.color);
    const [curtain, line] = ribbon(series.values, xFor, yFor, zFor(s), color, model.variant === 'area' ? .5 : .14, .024);
    curves.add(curtain, line);
    pickables.push(curtain, line);
    series.values.forEach((value, c) => magnitudes.set(barDatumId(model.categories[c].id, series.id), yFor(value)));
  });
  const step = Math.ceil(count / 8);
  model.categories.forEach((category, c) => { if (c % step === 0 || c === count - 1) labels.push({ text: category.label, position: new THREE.Vector3(xFor(c), -.02, DEPTH / 2 + .12), tone: 'axis', priority: 1 }); });
  ticks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(WIDTH / 2 + .1, yFor(tick), -DEPTH / 2), tone: 'axis', priority: 2, align: 'start' }));
  const accent = resolve('--text-hi');
  const crosshairGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -DEPTH / 2), new THREE.Vector3(0, HEIGHT, -DEPTH / 2), new THREE.Vector3(0, 0, -DEPTH / 2), new THREE.Vector3(0, 0, DEPTH / 2)]);
  const crosshair = new THREE.LineSegments(crosshairGeometry, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: .6 }));
  crosshair.visible = false;
  const beads = model.series.map(series => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(.028, 16, 12), new THREE.MeshBasicMaterial({ color: cssColor(resolve, series.color).multiplyScalar(1.35) }));
    bead.visible = false;
    return bead;
  });
  root.add(draftingPlate(WIDTH + .1, DEPTH, resolve), valueWall(ticks, yFor, WIDTH + .1, -DEPTH / 2, resolve), curves, crosshair, ...beads);
  const placeAt = (id: string | undefined) => {
    const index = model.categories.findIndex(category => category.id === id);
    crosshair.visible = index >= 0;
    beads.forEach((bead, s) => {
      bead.visible = index >= 0;
      if (index >= 0) bead.position.set(xFor(index), yFor(model.series[s].values[index]), zFor(s));
    });
    if (index >= 0) crosshair.position.x = xFor(index);
  };
  return {
    root, labels, magnitudes, pickables, camera: camera(),
    pick: hit => model.categories[Math.max(0, Math.min(count - 1, Math.round((hit.point.x + WIDTH / 2) / WIDTH * (count - 1))))]?.id ?? null,
    anchor: id => {
      const index = model.categories.findIndex(category => category.id === id);
      return index < 0 ? null : new THREE.Vector3(xFor(index), Math.max(...model.series.map(series => yFor(series.values[index]))), 0);
    },
    highlight: (active, selected) => placeAt(active ?? [...selected][selected.size - 1]),
    setProgress: progress => { curves.scale.y = Math.max(progress, 1e-3); },
    dispose: () => disposeTree(root),
  };
};

export const buildSparkline: SceneBuilder<SparklineModel> = (model, { resolve }) => {
  const root = new THREE.Group(), curve = new THREE.Group();
  const max = Math.max(...model.values), min = Math.min(...model.values), range = max - min || 1;
  const width = 2.4, height = .3, count = model.values.length;
  const xFor = (position: number) => -width / 2 + (count > 1 ? position / (count - 1) : .5) * width;
  /** Sparklines read trend, not magnitude, so the baseline is the series minimum in both modes. */
  const yFor = (value: number) => .04 + (value - min) / range * height;
  const magnitudes = new Map<string, number>();
  model.values.forEach((value, index) => magnitudes.set(`${index}`, yFor(value)));
  const color = cssColor(resolve, model.color);
  const meshes = ribbon(model.values, xFor, yFor, 0, color, .5, .05);
  curve.add(...meshes);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.3) }));
  bead.visible = false;
  root.add(curve, bead);
  const presets = defaultPresets();
  presets.iso = new THREE.Vector3(.16, .16, 1).normalize();
  return {
    root, labels: [], magnitudes, pickables: meshes, camera: camera({ presets }),
    pick: hit => `${Math.max(0, Math.min(count - 1, Math.round((hit.point.x + width / 2) / width * (count - 1))))}`,
    anchor: id => new THREE.Vector3(xFor(Number(id)), yFor(model.values[Number(id)] ?? 0), 0),
    highlight: active => {
      bead.visible = active !== null;
      if (active !== null) bead.position.set(xFor(Number(active)), yFor(model.values[Number(active)] ?? 0), 0);
    },
    setProgress: progress => { curve.scale.y = Math.max(progress, 1e-3); },
    dispose: () => disposeTree(root),
  };
};

export const buildHeatmap: SceneBuilder<HeatmapModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const columns = model.xLabels.length, rows = model.yLabels.length;
  const cell = Math.min(WIDTH / Math.max(columns, 1), 1.9 / Math.max(rows, 1));
  const width = cell * columns, depth = cell * rows;
  const max = Math.max(1e-9, ...model.values.flat());
  const boxes: Box[] = [], labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  model.values.forEach((row, y) => row.forEach((value, x) => {
    const id = heatDatumId(x, y), height = Math.max(value / max * .72, .006);
    boxes.push({ id, x: -width / 2 + cell * (x + .5), z: -depth / 2 + cell * (y + .5), base: 0, width: cell * .9, depth: cell * .9, height, color: rampColor(value / max, resolve) });
    magnitudes.set(id, value / max * .72);
  }));
  const xStep = Math.ceil(columns / 12);
  model.xLabels.forEach((label, x) => { if (x % xStep === 0) labels.push({ text: label, position: new THREE.Vector3(-width / 2 + cell * (x + .5), -.02, depth / 2 + .1), tone: 'axis', priority: 1 }); });
  model.yLabels.forEach((label, y) => labels.push({ text: label, position: new THREE.Vector3(width / 2 + .08, 0, -depth / 2 + cell * (y + .5)), tone: 'axis', priority: 2, align: 'start' }));
  root.add(draftingPlate(width + .06, depth + .06, resolve, Math.max(columns, 1)));
  const presets = defaultPresets();
  presets.iso = new THREE.Vector3(.45, .88, .85).normalize();
  return boxScene(root, new BoxField(boxes, resolve('--text-hi')), labels, camera({ presets, flat: 'top' }), magnitudes);
};

export const buildScatter: SceneBuilder<ScatterModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const xTicks = niceTicks(Math.max(0, ...model.points.map(point => point.x)));
  const yTicks = niceTicks(Math.max(0, ...model.points.map(point => point.y)));
  const zTicks = model.zLabel ? niceTicks(Math.max(0, ...model.points.map(point => point.z ?? 0))) : [];
  const xMax = xTicks[xTicks.length - 1], yMax = yTicks[yTicks.length - 1], zMax = zTicks[zTicks.length - 1] ?? 1;
  const width = 2.2, depth = 1.5, height = 1.1;
  const xFor = (value: number) => -width / 2 + value / xMax * width;
  const yFor = (value: number) => value / yMax * height;
  const lanes = new Map(model.groups.map((group, index) => [group.id, index]));
  const laneCount = Math.max(model.groups.length, 1);
  /** With no third measured quantity, depth only separates groups. encodings() declares this on screen. */
  const zFor = (point: ScatterModel['points'][number]) => model.zLabel ? depth / 2 - (point.z ?? 0) / zMax * depth : laneCount === 1 ? 0 : -depth / 2 + depth * ((lanes.get(point.group) ?? 0) + .5) / laneCount;
  const radius = .036;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 14), new THREE.MeshStandardMaterial({ roughness: .3, metalness: .15 }), Math.max(model.points.length, 1));
  mesh.count = model.points.length;
  const colors = model.points.map(point => cssColor(resolve, model.groups.find(group => group.id === point.group)?.color ?? '--cyan'));
  const positions = model.points.map(point => new THREE.Vector3(xFor(point.x), yFor(point.y), zFor(point)));
  const index = new Map(model.points.map((point, i) => [point.id, i]));
  const matrix = new THREE.Matrix4(), scratch = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  let progress = 1, activeId: string | null = null, selectedIds: ReadonlySet<string> = new Set();
  const place = () => {
    positions.forEach((position, i) => {
      const id = model.points[i].id;
      scratch.copy(position); scratch.y *= progress;
      const r = radius * (id === activeId || selectedIds.has(id) ? 1.7 : 1);
      mesh.setMatrixAt(i, matrix.compose(scratch, quaternion, scale.setScalar(r)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  const stemPoints: number[] = [];
  positions.forEach(position => stemPoints.push(position.x, 0, position.z, position.x, position.y, position.z));
  const stems = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stemPoints, 3)), new THREE.LineBasicMaterial({ color: cssColor(resolve, '--line-strong'), transparent: true, opacity: .3 }));
  const magnitudes = new Map<string, number>(model.points.map((point, i) => [point.id, positions[i].y]));
  const labels: SceneLabel[] = [];
  xTicks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(xFor(tick), -.02, depth / 2 + .1), tone: 'axis', priority: 1 }));
  yTicks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(width / 2 + .1, yFor(tick), -depth / 2), tone: 'axis', priority: 2, align: 'start' }));
  zTicks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(width / 2 + .1, -.02, depth / 2 - tick / zMax * depth), tone: 'axis', priority: 3, align: 'start' }));
  root.add(draftingPlate(width + .1, depth + .1, resolve), valueWall(yTicks, yFor, width + .1, -depth / 2 - .05, resolve), stems, mesh);
  const paint = () => {
    const anyActive = activeId !== null || selectedIds.size > 0;
    model.points.forEach((point, i) => mesh.setColorAt(i, shade(colors[i], point.id === activeId, anyActive, selectedIds.has(point.id))));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  paint(); place();
  return {
    root, labels, magnitudes, pickables: [mesh], camera: camera(),
    pick: hit => hit.instanceId === undefined ? null : model.points[hit.instanceId]?.id ?? null,
    anchor: id => { const i = index.get(id); return i === undefined ? null : positions[i].clone(); },
    highlight: (active, selected) => { activeId = active; selectedIds = selected; paint(); place(); },
    setProgress: value => { progress = value; place(); stems.scale.y = Math.max(value, 1e-3); },
    dispose: () => disposeTree(root),
  };
};

export const buildTimeline: SceneBuilder<TimelineModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const times = model.events.map(event => event.time);
  const min = Math.min(...times), max = Math.max(...times), range = max - min || 1;
  const ticks = niceTicks(Math.max(0, ...model.events.map(event => event.value))), top = ticks[ticks.length - 1];
  const lanes = new Map(model.lanes.map((lane, index) => [lane.id, index]));
  const depth = 1.1, xFor = (time: number) => -WIDTH / 2 + .05 + (time - min) / range * (WIDTH - .1);
  const zFor = (lane: string) => -depth / 2 + depth * ((lanes.get(lane) ?? 0) + .5) / Math.max(model.lanes.length, 1);
  const boxes: Box[] = [], labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  model.events.forEach(event => {
    const height = event.value / top * HEIGHT, lane = model.lanes.find(item => item.id === event.lane);
    boxes.push({ id: event.id, x: xFor(event.time), z: zFor(event.lane), base: 0, width: .05, depth: .05, height, color: resolve(lane?.color ?? '--cyan') });
    magnitudes.set(event.id, height);
  });
  const lanePoints: number[] = [];
  model.lanes.forEach(lane => {
    lanePoints.push(-WIDTH / 2, .002, zFor(lane.id), WIDTH / 2, .002, zFor(lane.id));
    labels.push({ text: lane.label, position: new THREE.Vector3(-WIDTH / 2 - .08, 0, zFor(lane.id)), tone: 'chip', priority: 1, align: 'end' });
  });
  niceTicks(range, 5).forEach(tick => { if (min + tick <= max) labels.push({ text: formatValue(min + tick), position: new THREE.Vector3(xFor(min + tick), -.02, depth / 2 + .1), tone: 'axis', priority: 2 }); });
  ticks.forEach(tick => labels.push({ text: formatValue(tick), position: new THREE.Vector3(WIDTH / 2 + .1, tick / top * HEIGHT, -depth / 2), tone: 'axis', priority: 3, align: 'start' }));
  const laneLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lanePoints, 3)), new THREE.LineBasicMaterial({ color: resolve('--cyan'), transparent: true, opacity: .32 }));
  root.add(draftingPlate(WIDTH + .1, depth + .05, resolve), valueWall(ticks, tick => tick / top * HEIGHT, WIDTH + .1, -depth / 2, resolve), laneLines);
  return boxScene(root, new BoxField(boxes, resolve('--text-hi')), labels, camera(), magnitudes);
};

