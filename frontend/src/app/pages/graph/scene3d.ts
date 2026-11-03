import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { qualityFor, useVizStore } from '../../../viz/store';
import { detectWebGL } from '../../../viz/capability';
import { convexHull, isVisible, labelBudget, nodeRadius, visibleEdges, type EdgeKind, type GEdge, type GNode } from './model';
import { drawMinimap, FrameStats, isSettled, resolveColors, settleLayout, type GraphColors } from './layout';
import { canvasBlob, emphasis, type GraphHighlight, type GraphSettings, type GraphStats, type GraphView, type GraphViewOptions } from './view';

const FLIGHT_MS = 620;
const DASHES: Partial<Record<EdgeKind, [number, number]>> = { inherits: [7, 4], calls: [1.6, 3.6] };
const OPACITY: Record<EdgeKind, number> = { imports: .55, inherits: .8, calls: .5, contains: .22 };
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface LabelSlot { node: HTMLSpanElement; text: string; x: number; y: number; color: string; tone: string; transform: string; shown: boolean }

/**
 * WebGL renderer. Nodes are one InstancedMesh, edges one LineSegments per kind. It shows the settled layout from the
 * shared force simulation; z separates clusters into layers and carries no other meaning. It owns its own context
 * (the chart engine's shared context renders into 2D canvases, which costs a copy per frame at this size).
 */
export class SceneGraphView implements GraphView {
  readonly mode = '3d' as const;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 30000);
  private readonly controls: OrbitControls;
  private readonly frames = new FrameStats();
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly world = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly hoverRing: THREE.Mesh;
  private mesh: THREE.InstancedMesh | null = null;
  private edgeLines = new Map<EdgeKind, { lines: THREE.LineSegments; edges: GEdge[] }>();
  private hulls = new THREE.Group();
  private colors: GraphColors;
  private settings: GraphSettings | null = null;
  private highlightState: GraphHighlight = { hover: null, selected: null, focus: null, matches: new Set() };
  private emphasized: ReadonlySet<string> | null = null;
  private visible: GNode[] = [];
  private byDegree: GNode[];
  private ready = false;
  private raf = 0;
  private dirty = true;
  private width = 0;
  private height = 0;
  private fitDistance = 1000;
  private center = new THREE.Vector3();
  private flight: { fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3; start: number } | null = null;
  private drag: { node: GNode; startX: number; startY: number; moved: boolean; plane: THREE.Plane } | null = null;
  private down: { x: number; y: number } | null = null;
  private pendingMove: { x: number; y: number } | null = null;
  private labelSlots: LabelSlot[] = [];
  private labelCount = 0;
  private lost = false;
  private drifting = false;
  private readonly projected = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly background = new THREE.Color();

  constructor(private readonly options: GraphViewOptions) {
    const { canvas } = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.colors = resolveColors(options.host, options.data, 'module');
    this.byDegree = [...options.data.nodes].sort((a, b) => b.degree - a.degree || a.index - b.index);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a6, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-1, 2, 3);
    this.scene.add(key, this.world, this.hulls);
    const ringGeometry = new THREE.RingGeometry(1, 1.22, 40);
    this.ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
    this.hoverRing = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .8, depthTest: false }));
    this.ring.renderOrder = this.hoverRing.renderOrder = 10;
    this.ring.visible = this.hoverRing.visible = false;
    this.scene.add(this.ring, this.hoverRing);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !options.reduced;
    this.controls.dampingFactor = .1;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.rotateSpeed = .6 * useVizStore.getState().cameraSensitivity;
    this.controls.addEventListener('change', this.invalidate);
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    options.minimap?.addEventListener('pointerdown', this.onMinimap);
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(canvas);
    this.refreshTheme();
    this.measure();
    const start = () => { this.ready = true; this.build(); this.fit(false); this.options.onLayout(1); };
    if (isSettled(options.data)) start();
    else settleLayout(options.data, options.charge, share => options.onLayout(share), this.abort.signal).then(start, () => undefined);
  }

  private pixelRatio() {
    const quality = qualityFor(useVizStore.getState().quality, detectWebGL().tier);
    return Math.min(window.devicePixelRatio || 1, this.settings?.performance ? 1 : quality.pixelRatio);
  }

  private measure() {
    const rect = this.options.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width; this.height = rect.height;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private readonly invalidate = () => { this.dirty = true; this.schedule(); };
  private schedule() { if (!this.raf && !this.lost) this.raf = requestAnimationFrame(this.frame); }

  /** World position of a node. Layout y grows downward, so it is flipped to match the 2D view seen from the front. */
  private position(node: GNode, target = new THREE.Vector3()) { return target.set(node.x, -node.y, node.z); }

  private build() {
    if (!this.ready || !this.settings) return;
    const settings = this.settings;
    this.world.clear();
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose();
    this.edgeLines.forEach(({ lines }) => { lines.geometry.dispose(); (lines.material as THREE.Material).dispose(); });
    this.edgeLines.clear();
    const nodes = this.options.data.nodes;
    const geometry = settings.performance ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 16, 12);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), nodes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.world.add(mesh);
    this.updateNodes();
    for (const [kind, edges] of this.groupEdges()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3));
      const dash = settings.performance ? undefined : DASHES[kind];
      const material = dash
        ? new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: OPACITY[kind], dashSize: dash[0], gapSize: dash[1], depthWrite: false })
        : new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: OPACITY[kind], depthWrite: false });
      const lines = new THREE.LineSegments(geometry, material);
      lines.frustumCulled = false;
      this.edgeLines.set(kind, { lines, edges });
      this.world.add(lines);
    }
    this.updateEdges();
    this.recolor();
    this.buildHulls();
  }

  private groupEdges(): [EdgeKind, GEdge[]][] {
    const groups = new Map<EdgeKind, GEdge[]>();
    for (const edge of visibleEdges(this.options.data, this.settings!.filter)) {
      const list = groups.get(edge.kind);
      if (list) list.push(edge); else groups.set(edge.kind, [edge]);
    }
    return [...groups];
  }

  private updateNodes() {
    const mesh = this.mesh;
    if (!mesh || !this.settings) return;
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
    this.options.data.nodes.forEach((node, index) => {
      const r = isVisible(node, this.settings!.filter) ? nodeRadius(node) : 0;
      this.matrix.compose(this.position(node, position), quaternion, scale.set(r, r, r));
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateEdges() {
    for (const { lines, edges } of this.edgeLines.values()) {
      const attribute = lines.geometry.getAttribute('position') as THREE.BufferAttribute, array = attribute.array as Float32Array;
      edges.forEach((edge, index) => {
        array.set([edge.source.x, -edge.source.y, edge.source.z, edge.target.x, -edge.target.y, edge.target.z], index * 6);
      });
      attribute.needsUpdate = true;
      if (lines.material instanceof THREE.LineDashedMaterial) lines.computeLineDistances();
    }
  }

  /** Fading is done by blending toward the background, so one opaque pass draws dimmed and emphasized items alike. */
  private recolor() {
    const mesh = this.mesh;
    if (!mesh) return;
    const emphasized = this.emphasized, matches = this.highlightState.matches;
    this.background.set(this.colors.bg);
    this.options.data.nodes.forEach((node, index) => {
      this.color.set(matches.has(node.id) ? this.colors.warn : this.colors.node(node));
      if (emphasized && !emphasized.has(node.id)) this.color.lerp(this.background, .8);
      mesh.setColorAt(index, this.color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const strong = new THREE.Color();
    for (const [kind, { lines, edges }] of this.edgeLines) {
      const attribute = lines.geometry.getAttribute('color') as THREE.BufferAttribute, array = attribute.array as Float32Array;
      strong.set(this.colors.edge[kind]);
      edges.forEach((edge, index) => {
        this.color.copy(strong);
        if (emphasized && !(emphasized.has(edge.source.id) && emphasized.has(edge.target.id))) this.color.lerp(this.background, .9);
        array.set([this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b], index * 6);
      });
      attribute.needsUpdate = true;
    }
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.colors.accent);
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.set(this.colors.label);
  }

  private buildHulls() {
    this.hulls.children.forEach(child => { (child as THREE.Mesh).geometry?.dispose(); ((child as THREE.Mesh).material as THREE.Material)?.dispose(); });
    this.hulls.clear();
    if (!this.settings?.hulls) return;
    for (const cluster of this.options.data.clusters) {
      if (this.settings.filter.hiddenClusters.has(cluster.id)) continue;
      const members = this.options.data.nodes.filter(node => node.cluster === cluster.id && isVisible(node, this.settings!.filter));
      const hull = convexHull(members.map(node => [node.x, -node.y]));
      if (hull.length < 3) continue;
      const z = members.reduce((sum, node) => sum + node.z, 0) / members.length;
      const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length, cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length;
      const padded = hull.map(([px, py]) => { const d = Math.hypot(px - cx, py - cy) || 1; return new THREE.Vector2(px + (px - cx) / d * 22, py + (py - cy) / d * 22); });
      const color = new THREE.Color(this.colors.cluster(cluster.id));
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(padded)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }));
      fill.position.z = z;
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(padded.map(p => new THREE.Vector3(p.x, p.y, z))), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .45, depthWrite: false }));
      this.hulls.add(fill, outline);
    }
  }

  apply(settings: GraphSettings) {
    const previous = this.settings;
    this.settings = settings;
    this.visible = this.options.data.nodes.filter(node => isVisible(node, settings.filter));
    this.emphasized = emphasis(this.options.data, this.highlightState, settings.fade);
    if (!previous || previous.colorBy !== settings.colorBy) this.colors = resolveColors(this.options.host, this.options.data, settings.colorBy);
    if (previous && previous.performance !== settings.performance) this.measure();
    if (previous && previous.charge !== settings.charge) { this.settings = settings; this.reheat(); return; }
    this.build();
    this.invalidate();
  }

  highlight(highlight: GraphHighlight) {
    this.highlightState = highlight;
    this.emphasized = emphasis(this.options.data, highlight, this.settings?.fade ?? false);
    this.recolor();
    this.invalidate();
  }

  refreshTheme() {
    this.colors = resolveColors(this.options.host, this.options.data, this.settings?.colorBy ?? 'module');
    this.renderer.setClearColor(new THREE.Color(this.colors.bg), 1);
    this.recolor();
    this.buildHulls();
    this.invalidate();
  }

  reheat() {
    if (!this.ready || !this.settings) return;
    this.options.onLayout(0);
    settleLayout(this.options.data, this.settings.charge, share => this.options.onLayout(share), this.abort.signal, true).then(() => {
      this.options.onLayout(1);
      this.updateNodes(); this.updateEdges(); this.buildHulls(); this.invalidate();
    }, () => undefined);
  }

  /** Frames the visible nodes from the front, slightly raised, so the cluster layers read as depth. */
  private fit(animate: boolean) {
    const box = new THREE.Box3();
    (this.visible.length ? this.visible : this.options.data.nodes).forEach(node => box.expandByPoint(this.position(node, this.projected)));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.center.copy(sphere.center);
    const radius = Math.max(sphere.radius, 50), fov = THREE.MathUtils.degToRad(this.camera.fov);
    this.fitDistance = radius / Math.sin(Math.min(fov, fov * this.camera.aspect) / 2) * .92;
    const direction = new THREE.Vector3(.32, -.5, 1).normalize();
    this.camera.far = this.fitDistance * 6;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = this.fitDistance * 3;
    this.controls.minDistance = 20;
    this.flyCamera(sphere.center.clone().add(direction.multiplyScalar(this.fitDistance)), sphere.center.clone(), animate);
  }

  private flyCamera(position: THREE.Vector3, target: THREE.Vector3, animate: boolean) {
    if (!animate || this.options.reduced) {
      this.flight = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.invalidate();
      return;
    }
    this.flight = { fromPosition: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPosition: position, toTarget: target, start: performance.now() };
    this.invalidate();
  }

  flyTo(node: GNode) {
    const target = this.position(node, new THREE.Vector3());
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = Math.min(offset.length(), this.fitDistance * .3);
    this.flyCamera(target.clone().add(offset.setLength(distance)), target, true);
  }
  reset() { if (this.ready) this.fit(true); }
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = THREE.MathUtils.clamp(offset.length() / factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyCamera(this.controls.target.clone().add(offset.setLength(length)), this.controls.target.clone(), true);
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    if (this.lost) return;
    let again = false;
    if (this.flight) {
      const t = Math.min(1, (now - this.flight.start) / FLIGHT_MS), e = easeOut(t);
      this.camera.position.lerpVectors(this.flight.fromPosition, this.flight.toPosition, e);
      this.controls.target.lerpVectors(this.flight.fromTarget, this.flight.toTarget, e);
      if (t >= 1) this.flight = null;
      this.dirty = true;
      again = true;
    }
    if (this.drifting && !this.flight) {
      const offset = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), .006);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.lookAt(this.controls.target);
      this.dirty = true;
      again = true;
    }
    if (this.controls.update()) { this.dirty = true; again = true; }
    if (this.pendingMove) { this.hover(this.pendingMove.x, this.pendingMove.y); this.pendingMove = null; }
    if (this.dirty && this.ready && this.width) {
      this.placeRings();
      const start = performance.now();
      this.renderer.render(this.scene, this.camera);
      this.layoutLabels();
      this.frames.frame(now, performance.now() - start, again);
      this.dirty = false;
      this.drawMinimap();
    }
    if (again) this.schedule();
  };

  /** Selection and hover rings always face the camera. */
  private placeRings() {
    const place = (ring: THREE.Mesh, node: GNode | null, gap: number) => {
      ring.visible = !!node && !!this.settings && isVisible(node, this.settings.filter);
      if (!node || !ring.visible) return;
      this.position(node, ring.position);
      ring.quaternion.copy(this.camera.quaternion);
      const r = nodeRadius(node) + gap;
      ring.scale.set(r, r, r);
    };
    place(this.ring, this.highlightState.selected ?? this.highlightState.focus, 3);
    place(this.hoverRing, this.highlightState.hover, 2);
  }

  private screen(node: GNode): { x: number; y: number; depth: number; radius: number } | null {
    this.position(node, this.projected).project(this.camera);
    if (this.projected.z > 1 || this.projected.z < -1) return null;
    const distance = this.camera.position.distanceTo(this.position(node, new THREE.Vector3()));
    const radius = nodeRadius(node) / (distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * this.height / 2;
    return { x: (this.projected.x + 1) / 2 * this.width, y: (1 - this.projected.y) / 2 * this.height, depth: this.projected.z, radius };
  }

  /** HTML labels, projected after each render. Hubs first, more as the camera closes in; overlapping labels are skipped. */
  private layoutLabels() {
    const settings = this.settings;
    const layer = this.options.labels;
    if (!settings) return;
    const zoom = this.fitDistance / Math.max(1, this.camera.position.distanceTo(this.controls.target));
    const { hover, selected, focus, matches } = this.highlightState, emphasized = this.emphasized;
    const pinned = [hover, selected, focus, ...[...matches].slice(0, 24).map(id => this.options.data.byId.get(id) ?? null)].filter((node): node is GNode => !!node && isVisible(node, settings.filter));
    const budget = settings.labels ? Math.min(settings.performance ? 40 : 140, labelBudget(zoom, this.visible.length)) : 0;
    const candidates: { text: string; node: GNode | null; x: number; y: number; color: string; tone: string; pinned: boolean }[] = [];
    if (settings.hulls || zoom < .8) {
      for (const cluster of this.options.data.clusters) {
        if (settings.filter.hiddenClusters.has(cluster.id)) continue;
        const members = this.visible.filter(node => node.cluster === cluster.id);
        if (!members.length) continue;
        const point = new THREE.Vector3(members.reduce((s, n) => s + n.x, 0) / members.length, -Math.min(...members.map(n => n.y)) + 16, members.reduce((s, n) => s + n.z, 0) / members.length).project(this.camera);
        if (point.z < 1) candidates.push({ text: cluster.label, node: null, x: (point.x + 1) / 2 * this.width, y: (1 - point.y) / 2 * this.height, color: this.colors.cluster(cluster.id), tone: 'cluster', pinned: false });
      }
    }
    const seen = new Set<string>();
    const consider = (node: GNode, isPinned: boolean) => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      const point = this.screen(node);
      if (!point) return;
      candidates.push({ text: node.label, node, x: point.x + point.radius + 4, y: point.y, color: node === selected ? this.colors.accent : this.colors.label, tone: emphasized && !emphasized.has(node.id) && !isPinned ? 'dim' : 'node', pinned: isPinned });
    };
    if (settings.labels || pinned.length) {
      pinned.forEach(node => consider(node, true));
      if (settings.labels) {
        if (emphasized) for (const id of emphasized) { const node = this.options.data.byId.get(id); if (node && isVisible(node, settings.filter) && seen.size < budget + pinned.length + 60) consider(node, false); }
        for (const node of this.byDegree) { if (seen.size >= budget + pinned.length) break; if (isVisible(node, settings.filter)) consider(node, false); }
      }
    }
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    let used = 0;
    for (const candidate of candidates) {
      let slot = this.labelSlots[used];
      if (!slot) {
        const node = document.createElement('span');
        node.className = 'graph-label';
        layer.append(node);
        slot = { node, text: '', x: 0, y: 0, color: '', tone: '', transform: '', shown: true };
        this.labelSlots.push(slot);
      }
      /** Widths come from canvas text metrics, never from the DOM, so placing labels forces no layout. */
      const width = this.textWidth(candidate.text, candidate.tone === 'cluster'), height = candidate.tone === 'cluster' ? 16 : 14;
      const left = candidate.tone === 'cluster' ? candidate.x - width / 2 : candidate.x;
      const box = { x0: left - 2, y0: candidate.y - height / 2, x1: left + width + 2, y1: candidate.y + height / 2 };
      const outside = box.x1 < 0 || box.x0 > this.width || box.y1 < 0 || box.y0 > this.height;
      if (outside || (!candidate.pinned && placed.some(o => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0))) continue;
      placed.push(box);
      const transform = `translate(${Math.round(left)}px, ${Math.round(candidate.y - height / 2)}px)`;
      if (slot.text !== candidate.text) { slot.node.textContent = candidate.text; slot.text = candidate.text; }
      if (slot.tone !== candidate.tone) { slot.node.dataset.tone = candidate.tone; slot.tone = candidate.tone; }
      if (slot.color !== candidate.color) { slot.node.style.color = candidate.color; slot.color = candidate.color; }
      if (slot.transform !== transform) { slot.node.style.transform = transform; slot.transform = transform; }
      if (!slot.shown) { slot.node.style.display = ''; slot.shown = true; }
      slot.x = left; slot.y = candidate.y;
      used += 1;
    }
    for (let i = used; i < this.labelSlots.length; i += 1) { const slot = this.labelSlots[i]; if (slot.shown) { slot.node.style.display = 'none'; slot.shown = false; } }
    this.labelCount = used;
  }

  private readonly widths = new Map<string, number>();
  private measure2d: CanvasRenderingContext2D | null = null;
  private textWidth(text: string, cluster: boolean): number {
    const key = (cluster ? 'c:' : 'n:') + text;
    let width = this.widths.get(key);
    if (width === undefined) {
      this.measure2d ??= document.createElement('canvas').getContext('2d');
      const family = getComputedStyle(this.options.host).getPropertyValue(cluster ? '--font-display' : '--font-ui').trim() || 'sans-serif';
      if (this.measure2d) this.measure2d.font = `${cluster ? 600 : 500} ${cluster ? 12 : 11}px ${family}`;
      width = Math.ceil(this.measure2d?.measureText(text).width ?? text.length * 6.5);
      this.widths.set(key, width);
    }
    return width;
  }

  private minimapAt = 0;
  private drawMinimap() {
    if (!this.options.minimap || !this.settings) return;
    const now = performance.now();
    if (now - this.minimapAt < 120 && (this.flight || this.drifting || this.drag)) return;
    this.minimapAt = now;
    const target = this.controls.target;
    drawMinimap(this.options.minimap, this.options.data, this.settings.filter, this.colors, null, { x: target.x, y: -target.y });
  }

  private local(event: { clientX: number; clientY: number }) {
    const rect = this.options.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Screen-space picking: the nearest node centre within its drawn radius, preferring the one nearer the camera. */
  private pick(sx: number, sy: number): GNode | null {
    if (!this.ready) return null;
    let best: GNode | null = null, bestScore = Infinity;
    for (const node of this.visible) {
      const point = this.screen(node);
      if (!point) continue;
      const distance = Math.hypot(point.x - sx, point.y - sy);
      if (distance <= Math.max(point.radius, 2) + 4) { const score = distance + point.depth * 4; if (score < bestScore) { bestScore = score; best = node; } }
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
    this.down = point;
    const node = this.pick(point.x, point.y);
    if (!node) return;
    /** Grabbing a node moves it on a plane facing the camera; orbiting resumes on release. */
    this.controls.enabled = false;
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    this.drag = { node, startX: point.x, startY: point.y, moved: false, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.position(node, new THREE.Vector3())) };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const point = this.local(event), drag = this.drag;
    if (!drag) { if (!this.down) { this.pendingMove = point; this.schedule(); } return; }
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < 4) return;
    if (!drag.moved) { drag.moved = true; this.options.onHover(null, null); this.options.canvas.style.cursor = 'grabbing'; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(point.x / this.width * 2 - 1, -(point.y / this.height) * 2 + 1), this.camera);
    const hit = ray.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!hit) return;
    drag.node.x = hit.x; drag.node.y = -hit.y; drag.node.z = hit.z;
    this.updateNodes(); this.updateEdges();
    this.invalidate();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const drag = this.drag, down = this.down;
    this.drag = null; this.down = null;
    this.controls.enabled = true;
    if (drag) {
      this.options.canvas.style.cursor = 'grab';
      if (drag.moved) this.buildHulls(); else this.options.onSelect(drag.node);
      this.invalidate();
      return;
    }
    if (down && event.target === this.options.canvas) {
      const point = this.local(event);
      if (Math.hypot(point.x - down.x, point.y - down.y) < 4) this.options.onSelect(null);
    }
  };

  private readonly onPointerLeave = () => { if (!this.drag) { this.pendingMove = null; this.options.onHover(null, null); } };

  private readonly onDoubleClick = (event: MouseEvent) => {
    const point = this.local(event), node = this.pick(point.x, point.y);
    if (node) { this.options.onFocus(node); this.flyTo(node); }
  };

  private readonly onMinimap = (event: PointerEvent) => {
    const minimap = this.options.minimap;
    if (!minimap || !this.settings) return;
    const rect = minimap.getBoundingClientRect();
    const toWorld = drawMinimap(minimap, this.options.data, this.settings.filter, this.colors, null, null);
    const world = toWorld?.(event.clientX - rect.left, event.clientY - rect.top);
    if (!world) return;
    const target = new THREE.Vector3(world.x, -world.y, this.controls.target.z);
    this.flyCamera(this.camera.position.clone().add(target.clone().sub(this.controls.target)), target, true);
  };

  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.options.onFailure('The GPU context was lost. The graph switched to 2D.');
  };
  private readonly onRestored = () => { this.lost = false; this.build(); this.invalidate(); };

  /** The WebGL image plus the HTML labels, drawn into one PNG. */
  async screenshot(): Promise<Blob> {
    if (!this.ready) throw new Error('The layout is still settling.');
    this.placeRings();
    this.renderer.render(this.scene, this.camera);
    const ratio = this.renderer.getPixelRatio();
    const output = document.createElement('canvas');
    output.width = this.options.canvas.width; output.height = this.options.canvas.height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable.');
    context.drawImage(this.options.canvas, 0, 0);
    context.scale(ratio, ratio);
    context.font = `500 11px ${getComputedStyle(this.options.host).fontFamily || 'system-ui, sans-serif'}`;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    for (const slot of this.labelSlots) {
      if (!slot.shown || !slot.text) continue;
      context.lineWidth = 3; context.strokeStyle = this.colors.halo; context.strokeText(slot.text, slot.x, slot.y);
      context.fillStyle = slot.color; context.fillText(slot.text, slot.x, slot.y);
    }
    return canvasBlob(output);
  }

  locate(node: GNode) {
    if (!this.ready || !this.settings || !isVisible(node, this.settings.filter)) return null;
    const point = this.screen(node), rect = this.options.canvas.getBoundingClientRect();
    return !point || point.x < 0 || point.y < 0 || point.x > this.width || point.y > this.height ? null : { x: rect.left + point.x, y: rect.top + point.y };
  }

  stats(): GraphStats {
    const summary = this.frames.summary();
    const edges = [...this.edgeLines.values()].reduce((sum, entry) => sum + entry.edges.length, 0);
    return { fps: this.frames.fps, nodes: this.visible.length, edges, labels: this.labelCount, recentFrame: this.frames.recentFrame(), ...summary };
  }
  resetStats() { this.frames.reset(); }
  setDrift(on: boolean) { this.drifting = on; this.invalidate(); }

  dispose() {
    this.abort.abort();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const { canvas } = this.options;
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('webglcontextlost', this.onLost);
    canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.options.minimap?.removeEventListener('pointerdown', this.onMinimap);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    this.scene.traverse(object => {
      const item = object as THREE.Mesh;
      item.geometry?.dispose();
      const material = item.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach(entry => entry.dispose()); else material?.dispose();
    });
    this.labelSlots.forEach(slot => slot.node.remove());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
