import type { Simulation } from 'd3-force';
import { convexHull, isVisible, labelBudget, nodeRadius, visibleEdges, type EdgeKind, type GEdge, type GNode } from './model';
import { createSimulation, drawMinimap, FrameStats, isSettled, markSettled, resolveColors, type GraphColors } from './layout';
import { canvasBlob, emphasis, type GraphHighlight, type GraphSettings, type GraphStats, type GraphView, type GraphViewOptions } from './view';

const ALPHA_MIN = .02, FLIGHT_MS = 620, HULL_PAD = 22;
/** Screen-space dash patterns: imports solid, inheritance dashed, calls dotted, containment a faint solid line. */
const DASH: Record<EdgeKind, number[]> = { imports: [], inherits: [7, 4], calls: [1.5, 3.5], contains: [] };
/** At or under one screen pixel, so strokes can take the rasterizer's hairline path. Edge raster is the main 2D cost on integrated GPUs. */
const WIDTH: Record<EdgeKind, number> = { imports: 1, inherits: 1, calls: 1, contains: .7 };
const ALPHA: Record<EdgeKind, number> = { imports: .5, inherits: .7, calls: .45, contains: .2 };
const ORDER: EdgeKind[] = ['contains', 'imports', 'calls', 'inherits'];

interface Transform { k: number; x: number; y: number }
type Drag = { kind: 'node'; node: GNode; startX: number; startY: number; moved: boolean } | { kind: 'pan'; startX: number; startY: number; from: Transform; moved: boolean };

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Canvas2D renderer. One rAF loop ticks the force simulation, eases the camera and draws; it stops when nothing changes. */
export class CanvasGraphView implements GraphView {
  readonly mode = '2d' as const;
  private readonly context: CanvasRenderingContext2D;
  private readonly simulation: Simulation<GNode, GEdge>;
  private readonly frames = new FrameStats();
  private readonly resizeObserver: ResizeObserver;
  private colors: GraphColors;
  private font = '500 11px system-ui, sans-serif';
  private settings: GraphSettings | null = null;
  private highlightState: GraphHighlight = { hover: null, selected: null, focus: null, matches: new Set() };
  private emphasized: ReadonlySet<string> | null = null;
  private view: Transform = { k: 1, x: 0, y: 0 };
  private flight: { from: Transform; to: Transform; start: number } | null = null;
  private drift: { start: number; base: Transform } | null = null;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private raf = 0;
  private dirty = true;
  private userMoved = false;
  private drag: Drag | null = null;
  private pendingMove: { x: number; y: number } | null = null;
  private visible: GNode[] = [];
  private edges: GEdge[] = [];
  private byDegree: GNode[];
  private labelCount = 0;
  private lastShare = -1;
  private startAlpha = 1;
  private minimapAt = 0;
  private toWorld: ((x: number, y: number) => { x: number; y: number }) | null = null;

  constructor(private readonly options: GraphViewOptions) {
    const context = options.canvas.getContext('2d');
    if (!context) throw new Error('The 2D canvas is unavailable.');
    this.context = context;
    this.colors = resolveColors(options.host, options.data, 'module');
    this.byDegree = [...options.data.nodes].sort((a, b) => b.degree - a.degree || a.index - b.index);
    this.simulation = createSimulation(options.data, options.charge);
    if (isSettled(options.data)) this.simulation.alpha(0);
    this.startAlpha = Math.max(this.simulation.alpha(), ALPHA_MIN * 1.01);
    const { canvas } = options;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    options.minimap?.addEventListener('pointerdown', this.onMinimap);
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(canvas);
    this.refreshTheme();
    this.measure();
  }

  private measure() {
    const rect = this.options.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const first = !this.width;
    this.width = rect.width; this.height = rect.height;
    this.ratio = Math.min(window.devicePixelRatio || 1, this.settings?.performance ? 1 : 2);
    this.options.canvas.width = Math.round(this.width * this.ratio);
    this.options.canvas.height = Math.round(this.height * this.ratio);
    if (first || !this.userMoved) this.view = this.fitTransform();
    this.invalidate();
  }

  private invalidate() { this.dirty = true; this.schedule(); }
  private schedule() { if (!this.raf) this.raf = requestAnimationFrame(this.frame); }

  apply(settings: GraphSettings) {
    const previous = this.settings;
    this.settings = settings;
    this.visible = this.options.data.nodes.filter(node => isVisible(node, settings.filter));
    this.edges = visibleEdges(this.options.data, settings.filter);
    if (!previous || previous.colorBy !== settings.colorBy) this.colors = resolveColors(this.options.host, this.options.data, settings.colorBy);
    if (!previous || previous.charge !== settings.charge) {
      (this.simulation.force('charge') as unknown as { strength: (value: number) => void }).strength(-settings.charge);
      if (previous) this.reheat();
    }
    if (previous && previous.performance !== settings.performance) this.measure();
    this.emphasized = emphasis(this.options.data, this.highlightState, settings.fade);
    this.invalidate();
  }

  highlight(highlight: GraphHighlight) {
    this.highlightState = highlight;
    this.emphasized = emphasis(this.options.data, highlight, this.settings?.fade ?? false);
    this.invalidate();
  }

  reheat() {
    this.simulation.alpha(.6);
    this.startAlpha = .6;
    this.lastShare = -1;
    this.invalidate();
  }

  refreshTheme() {
    this.colors = resolveColors(this.options.host, this.options.data, this.settings?.colorBy ?? 'module');
    this.font = `500 11px ${getComputedStyle(this.options.host).fontFamily || 'system-ui, sans-serif'}`;
    this.invalidate();
  }

  private fitTransform(nodes: GNode[] = this.visible.length ? this.visible : this.options.data.nodes): Transform {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => { minX = Math.min(minX, node.x); minY = Math.min(minY, node.y); maxX = Math.max(maxX, node.x); maxY = Math.max(maxY, node.y); });
    if (!Number.isFinite(minX) || !this.width) return this.view;
    const pad = 48, k = Math.max(.08, Math.min(3, Math.min((this.width - pad * 2) / Math.max(1, maxX - minX), (this.height - pad * 2) / Math.max(1, maxY - minY))));
    return { k, x: this.width / 2 - (minX + maxX) / 2 * k, y: this.height / 2 - (minY + maxY) / 2 * k };
  }

  private flyTransform(to: Transform) {
    if (this.options.reduced) { this.view = to; this.flight = null; } else this.flight = { from: { ...this.view }, to, start: performance.now() };
    this.invalidate();
  }

  flyTo(node: GNode) {
    this.userMoved = true;
    const k = Math.max(this.view.k, 1.6);
    this.flyTransform({ k, x: this.width / 2 - node.x * k, y: this.height / 2 - node.y * k });
  }
  reset() { this.userMoved = false; this.flyTransform(this.fitTransform()); }
  zoom(factor: number) { this.zoomAround(this.width / 2, this.height / 2, factor, true); }

  private zoomAround(sx: number, sy: number, factor: number, animate: boolean) {
    this.userMoved = true;
    const base = this.flight?.to ?? this.view;
    const k = Math.max(.08, Math.min(8, base.k * factor));
    const wx = (sx - base.x) / base.k, wy = (sy - base.y) / base.k;
    const to = { k, x: sx - wx * k, y: sy - wy * k };
    if (animate) this.flyTransform(to); else { this.flight = null; this.view = to; this.invalidate(); }
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    let again = false;
    const simulation = this.simulation;
    if (simulation.alpha() > ALPHA_MIN || simulation.alphaTarget() > 0) {
      const dragging = this.drag?.kind === 'node';
      if (this.options.reduced && !dragging) {
        /** Reduced motion: settle off screen in short slices, then draw the result once. */
        const until = performance.now() + 12;
        while (simulation.alpha() > ALPHA_MIN && performance.now() < until) simulation.tick();
      } else {
        simulation.tick(this.visible.length > 1400 ? 1 : 2);
        this.dirty = true;
      }
      if (!this.userMoved && !this.flight && (!this.options.reduced || simulation.alpha() <= ALPHA_MIN)) this.view = this.fitTransform();
      this.reportLayout();
      again = true;
      if (simulation.alpha() <= ALPHA_MIN && simulation.alphaTarget() === 0) { markSettled(this.options.data); this.dirty = true; }
    }
    if (this.drift) {
      const t = (now - this.drift.start) / 1000, base = this.drift.base, k = base.k * (1 + .2 * Math.sin(t * .9));
      const cx = this.width / 2 + Math.cos(t * .6) * 60, cy = this.height / 2 + Math.sin(t * .6) * 40;
      const wx = (this.width / 2 - base.x) / base.k, wy = (this.height / 2 - base.y) / base.k;
      this.view = { k, x: cx - wx * k, y: cy - wy * k };
      this.dirty = true;
      again = true;
    }
    if (this.flight) {
      const t = Math.min(1, (now - this.flight.start) / FLIGHT_MS), e = easeOut(t), { from, to } = this.flight;
      this.view = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      if (t >= 1) this.flight = null;
      this.dirty = true;
      again = true;
    }
    if (this.pendingMove) { this.hover(this.pendingMove.x, this.pendingMove.y); this.pendingMove = null; }
    const hidden = this.options.reduced && simulation.alpha() > ALPHA_MIN && !isSettled(this.options.data);
    if (this.dirty && !hidden) {
      const start = performance.now();
      this.draw();
      this.frames.frame(now, performance.now() - start, again);
      this.dirty = false;
      if (now - this.minimapAt > 120 || !again) { this.drawMinimap(); this.minimapAt = now; }
    }
    if (again) this.schedule();
  };

  private reportLayout() {
    const alpha = Math.max(this.simulation.alpha(), ALPHA_MIN);
    const share = Math.min(1, Math.log(this.startAlpha / alpha) / Math.log(this.startAlpha / ALPHA_MIN));
    const done = this.simulation.alpha() <= ALPHA_MIN;
    if (done || share - this.lastShare >= .05) { this.lastShare = done ? -1 : share; this.options.onLayout(done ? 1 : share); }
  }

  private draw() {
    const context = this.context, settings = this.settings, colors = this.colors;
    if (!settings || !this.width) return;
    const { k, x, y } = this.view, ratio = this.ratio, emphasized = this.emphasized;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, this.width, this.height);
    context.setTransform(ratio * k, 0, 0, ratio * k, ratio * x, ratio * y);

    if (settings.hulls) this.drawHulls(settings);

    /** Edges: one batched path per kind and emphasis state. */
    context.lineCap = 'butt';
    for (const kind of ORDER) {
      if (!settings.filter.edgeKinds.has(kind)) continue;
      context.strokeStyle = colors.edge[kind];
      context.lineWidth = WIDTH[kind] / k;
      context.setLineDash(settings.performance ? [] : DASH[kind].map(value => value / k));
      for (const pass of emphasized ? ['dim', 'strong'] as const : ['normal'] as const) {
        context.globalAlpha = pass === 'dim' ? .05 : pass === 'strong' ? Math.min(1, ALPHA[kind] + .4) : ALPHA[kind];
        /** One path per edge: a two-point path keeps the rasterizer's fast line case, which one huge path loses. */
        for (const edge of this.edges) {
          if (edge.kind !== kind) continue;
          const strong = emphasized ? emphasized.has(edge.source.id) && emphasized.has(edge.target.id) : true;
          if ((pass === 'dim') === strong) continue;
          context.beginPath();
          context.moveTo(edge.source.x, edge.source.y);
          context.lineTo(edge.target.x, edge.target.y);
          context.stroke();
        }
      }
    }
    context.setLineDash([]);

    /** Nodes, batched by fill color. Dimmed nodes first, so emphasized ones sit on top. */
    const minRadius = 1.4 / k;
    const groups = new Map<string, { dim: GNode[]; strong: GNode[] }>();
    for (const node of this.visible) {
      const color = colors.node(node);
      let group = groups.get(color);
      if (!group) { group = { dim: [], strong: [] }; groups.set(color, group); }
      (emphasized && !emphasized.has(node.id) ? group.dim : group.strong).push(node);
    }
    for (const pass of ['dim', 'strong'] as const) {
      context.globalAlpha = pass === 'dim' ? .16 : 1;
      for (const [color, group] of groups) {
        const list = group[pass];
        if (!list.length) continue;
        context.fillStyle = color;
        for (const node of list) {
          const r = Math.max(minRadius, nodeRadius(node));
          if (settings.performance && r * k < 3) { context.fillRect(node.x - r, node.y - r, r * 2, r * 2); continue; }
          context.beginPath();
          context.arc(node.x, node.y, r, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.globalAlpha = 1;
    /** Module nodes carry an outer ring, so files read apart from the symbols they contain. */
    context.strokeStyle = colors.bg;
    context.lineWidth = 1.2 / k;
    for (const node of this.visible) if (node.kind === 'module') { const r = Math.max(minRadius, nodeRadius(node)); context.beginPath(); context.arc(node.x, node.y, r, 0, Math.PI * 2); context.stroke(); }

    const ring = (node: GNode | null, color: string, width: number, gap: number) => {
      if (!node || !isVisible(node, settings.filter)) return;
      context.strokeStyle = color;
      context.lineWidth = width / k;
      context.beginPath();
      context.arc(node.x, node.y, Math.max(minRadius, nodeRadius(node)) + gap / k, 0, Math.PI * 2);
      context.stroke();
    };
    const { hover, selected, focus, matches } = this.highlightState;
    if (matches.size) for (const id of matches) ring(this.options.data.byId.get(id) ?? null, colors.warn, 1.5, 3);
    ring(hover, colors.label, 1.5, 2.5);
    ring(selected, colors.accent, 2.2, 3.5);
    ring(focus && focus !== selected ? focus : null, colors.accent, 1.5, 6);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (settings.hulls || k < .7) this.drawClusterLabels(settings);
    this.labelCount = settings.labels ? this.drawLabels(settings) : 0;
  }

  private hullPoints(members: GNode[]): [number, number][] {
    const hull = convexHull(members.map(node => [node.x, node.y]));
    if (hull.length < 3) return hull;
    const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length, cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length;
    return hull.map(([px, py]) => { const d = Math.hypot(px - cx, py - cy) || 1; return [px + (px - cx) / d * HULL_PAD, py + (py - cy) / d * HULL_PAD]; });
  }

  private drawHulls(settings: GraphSettings) {
    const context = this.context;
    for (const cluster of this.options.data.clusters) {
      if (settings.filter.hiddenClusters.has(cluster.id)) continue;
      const points = this.hullPoints(this.visible.filter(node => node.cluster === cluster.id));
      if (points.length < 3) continue;
      context.beginPath();
      points.forEach(([px, py], index) => index ? context.lineTo(px, py) : context.moveTo(px, py));
      context.closePath();
      context.fillStyle = this.colors.cluster(cluster.id);
      context.globalAlpha = .07;
      context.fill();
      context.strokeStyle = this.colors.cluster(cluster.id);
      context.globalAlpha = .4;
      context.lineWidth = 1 / this.view.k;
      context.lineJoin = 'round';
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  private drawClusterLabels(settings: GraphSettings) {
    const context = this.context, { k, x, y } = this.view;
    context.font = this.font.replace('500 11px', '600 12px');
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const cluster of this.options.data.clusters) {
      if (settings.filter.hiddenClusters.has(cluster.id)) continue;
      const members = this.visible.filter(node => node.cluster === cluster.id);
      if (!members.length) continue;
      let top = Infinity, sum = 0;
      members.forEach(node => { top = Math.min(top, node.y); sum += node.x; });
      const sx = sum / members.length * k + x, sy = top * k + y - 14;
      context.lineWidth = 4;
      context.strokeStyle = this.colors.halo;
      context.strokeText(cluster.label, sx, sy);
      context.fillStyle = this.colors.cluster(cluster.id);
      context.fillText(cluster.label, sx, sy);
    }
  }

  /** Level-of-detail labels: hubs first, more as the view zooms in, skipping any that would overlap. */
  private drawLabels(settings: GraphSettings): number {
    const context = this.context, { k, x, y } = this.view, emphasized = this.emphasized;
    const { hover, selected, focus, matches } = this.highlightState;
    const pinned = [hover, selected, focus, ...[...matches].slice(0, 24).map(id => this.options.data.byId.get(id) ?? null)].filter((node): node is GNode => !!node && isVisible(node, settings.filter));
    let budget = labelBudget(k, this.visible.length);
    if (settings.performance) budget = Math.floor(budget / 2);
    const candidates = [...pinned];
    if (emphasized) for (const id of emphasized) { const node = this.options.data.byId.get(id); if (node && isVisible(node, settings.filter)) candidates.push(node); }
    for (const node of this.byDegree) { if (candidates.length >= budget + pinned.length + (emphasized?.size ?? 0)) break; if (isVisible(node, settings.filter)) candidates.push(node); }
    context.font = this.font;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    const cell = 48, grid = new Map<string, { x0: number; y0: number; x1: number; y1: number }[]>();
    const seen = new Set<string>();
    let drawn = 0;
    for (const node of candidates) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const r = Math.max(1.4, nodeRadius(node) * k), sx = node.x * k + x + r + 4, sy = node.y * k + y;
      if (sx > this.width || sy < 0 || sy > this.height || sx < -200) continue;
      const width = context.measureText(node.label).width, box = { x0: sx - 2, y0: sy - 7, x1: sx + width + 2, y1: sy + 7 };
      const cells: string[] = [];
      for (let gx = Math.floor(box.x0 / cell); gx <= Math.floor(box.x1 / cell); gx += 1) for (let gy = Math.floor(box.y0 / cell); gy <= Math.floor(box.y1 / cell); gy += 1) cells.push(`${gx}:${gy}`);
      const isPinned = pinned.includes(node);
      if (!isPinned && cells.some(key => grid.get(key)?.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0))) continue;
      cells.forEach(key => { const list = grid.get(key); if (list) list.push(box); else grid.set(key, [box]); });
      context.globalAlpha = emphasized && !emphasized.has(node.id) && !isPinned ? .35 : 1;
      context.lineWidth = 3;
      context.strokeStyle = this.colors.halo;
      context.strokeText(node.label, sx, sy);
      context.fillStyle = node === selected ? this.colors.accent : this.colors.label;
      context.fillText(node.label, sx, sy);
      drawn += 1;
    }
    context.globalAlpha = 1;
    return drawn;
  }

  private drawMinimap() {
    const { minimap } = this.options;
    if (!minimap || !this.settings) return;
    const { k, x, y } = this.view;
    const focus = this.highlightState.selected ?? this.highlightState.focus;
    this.toWorld = drawMinimap(minimap, this.options.data, this.settings.filter, this.colors, { x: -x / k, y: -y / k, width: this.width / k, height: this.height / k }, focus);
  }

  private local(event: { clientX: number; clientY: number }) {
    const rect = this.options.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Nearest visible node under the pointer. A linear scan is under a millisecond at the sizes this page shows. */
  private pick(sx: number, sy: number): GNode | null {
    const { k, x, y } = this.view, wx = (sx - x) / k, wy = (sy - y) / k;
    let best: GNode | null = null, bestDistance = Infinity;
    for (const node of this.visible) {
      const distance = Math.hypot(node.x - wx, node.y - wy), reach = Math.max(nodeRadius(node), 1.4 / k) + 4 / k;
      if (distance <= reach && distance < bestDistance) { best = node; bestDistance = distance; }
    }
    return best;
  }

  private hover(sx: number, sy: number) {
    const node = this.pick(sx, sy);
    this.options.canvas.style.cursor = node ? 'pointer' : 'grab';
    const rect = this.options.canvas.getBoundingClientRect();
    if (node !== this.highlightState.hover) this.options.onHover(node, node ? { x: rect.left + sx, y: rect.top + sy } : null);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const point = this.local(event);
    const node = this.pick(point.x, point.y);
    this.options.canvas.setPointerCapture?.(event.pointerId);
    this.drag = node ? { kind: 'node', node, startX: point.x, startY: point.y, moved: false } : { kind: 'pan', startX: point.x, startY: point.y, from: { ...this.view }, moved: false };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const point = this.local(event), drag = this.drag;
    if (!drag) { this.pendingMove = point; this.schedule(); return; }
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < 4) return;
    if (!drag.moved) { drag.moved = true; this.options.onHover(null, null); this.options.canvas.style.cursor = 'grabbing'; }
    this.userMoved = true;
    if (drag.kind === 'pan') {
      this.flight = null;
      this.view = { k: drag.from.k, x: drag.from.x + point.x - drag.startX, y: drag.from.y + point.y - drag.startY };
    } else {
      const { k, x, y } = this.view, node = drag.node;
      node.fx = node.x = (point.x - x) / k;
      node.fy = node.y = (point.y - y) / k;
      if (!this.options.reduced) { this.simulation.alphaTarget(.18); if (this.simulation.alpha() < .2) this.simulation.alpha(.2); }
    }
    this.invalidate();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    this.options.canvas.style.cursor = 'grab';
    if (drag.kind === 'node') {
      drag.node.fx = drag.node.fy = null;
      this.simulation.alphaTarget(0);
      if (!drag.moved && event.type === 'pointerup') this.options.onSelect(drag.node);
    } else if (!drag.moved && event.type === 'pointerup') this.options.onSelect(null);
    this.invalidate();
  };

  private readonly onPointerLeave = () => { if (!this.drag) { this.pendingMove = null; this.options.onHover(null, null); } };

  private readonly onDoubleClick = (event: MouseEvent) => {
    const point = this.local(event), node = this.pick(point.x, point.y);
    if (node) { this.options.onFocus(node); this.flyTo(node); }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const point = this.local(event);
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.zoomAround(point.x, point.y, Math.exp(-delta * .0015), false);
  };

  private readonly onMinimap = (event: PointerEvent) => {
    const minimap = this.options.minimap;
    if (!minimap) return;
    const move = (e: PointerEvent) => {
      const rect = minimap.getBoundingClientRect(), world = this.toWorld?.(e.clientX - rect.left, e.clientY - rect.top);
      if (!world) return;
      this.userMoved = true;
      this.flight = null;
      this.view = { k: this.view.k, x: this.width / 2 - world.x * this.view.k, y: this.height / 2 - world.y * this.view.k };
      this.invalidate();
    };
    move(event);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  async screenshot(): Promise<Blob> {
    this.draw();
    return canvasBlob(this.options.canvas);
  }

  locate(node: GNode) {
    if (!this.settings || !isVisible(node, this.settings.filter)) return null;
    const rect = this.options.canvas.getBoundingClientRect(), sx = node.x * this.view.k + this.view.x, sy = node.y * this.view.k + this.view.y;
    return sx < 0 || sy < 0 || sx > this.width || sy > this.height ? null : { x: rect.left + sx, y: rect.top + sy };
  }

  stats(): GraphStats {
    const summary = this.frames.summary();
    return { fps: this.frames.fps, nodes: this.visible.length, edges: this.edges.length, labels: this.labelCount, recentFrame: this.frames.recentFrame(), ...summary };
  }
  resetStats() { this.frames.reset(); }
  setDrift(on: boolean) {
    this.drift = on ? { start: performance.now(), base: { ...this.view } } : null;
    if (!on) this.view = this.flight?.to ?? this.view;
    this.invalidate();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.simulation.stop();
    this.simulation.alphaTarget(0);
    const { canvas } = this.options;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('wheel', this.onWheel);
    this.options.minimap?.removeEventListener('pointerdown', this.onMinimap);
    this.resizeObserver.disconnect();
    this.options.data.nodes.forEach(node => { node.fx = node.fy = null; });
  }
}
