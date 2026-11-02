import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { detectWebGL } from '../capability';
import { qualityFor, qualityProfiles, useVizStore, type QualityProfile } from '../store';
import { CameraController, type CameraMemory } from './camera';
import type { BuiltScene, CameraPreset } from './scene';

export interface EngineDiagnostics { stages: number; visibleStages: number; contexts: number; frames: number; lastFrameMs: number; averageFrameMs: number; quality: QualityProfile['name']; renderer: string | null; contextLosses: number; status: EngineStatus }
export type EngineStatus = 'ready' | 'lost' | 'failed';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  reduced: boolean;
  sensitivity: number;
  fullscreen: boolean;
  onHover: (id: string | null, point?: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
}

const MAX_CONTEXT_LOSSES = 3, RESTORE_TIMEOUT = 5000, SLOW_FRAME_MS = 34, SLOW_FRAME_STREAK = 45, RELEASE_DELAY = 1500, AMBIENT_INTERVAL_MS = 33;
const memory = new Map<string, CameraMemory>();

/**
 * One WebGLRenderer serves every chart. Each stage renders into a shared offscreen context and is blitted into its own
 * 2D canvas, which keeps the app within the browser's context limit (about 16), and needs no scissor tracking across scrolling panels.
 */
class VizEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private environment: THREE.Texture | null = null;
  private readonly stages = new Set<Stage>();
  private rafId = 0;
  private bufferWidth = 0;
  private bufferHeight = 0;
  private restoreTimer = 0;
  private releaseTimer = 0;
  private slowStreak = 0;
  private contexts = 0;
  ambientDue = true;
  private lastAmbient = 0;
  private frames = 0;
  private frameTotal = 0;
  private lastFrame = 0;
  private contextLosses = 0;
  status: EngineStatus = 'ready';
  private readonly listeners = new Set<(status: EngineStatus) => void>();
  private qualityCap: QualityProfile['name'] | null = null;

  get quality(): QualityProfile {
    const preference = qualityFor(useVizStore.getState().quality, detectWebGL().tier);
    if (!this.qualityCap) return preference;
    const order: QualityProfile['name'][] = ['low', 'medium', 'high'];
    return qualityProfiles[order[Math.min(order.indexOf(preference.name), order.indexOf(this.qualityCap))]];
  }

  subscribe(listener: (status: EngineStatus) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private setStatus(status: EngineStatus) {
    this.status = status;
    this.listeners.forEach(listener => listener(status));
    if (status === 'failed') useVizStore.getState().setWebglFailed(true);
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.contexts += 1;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    const canvas = renderer.domElement;
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
    this.renderer = renderer;
    this.buildEnvironment();
    return renderer;
  }

  private buildEnvironment() {
    /** Prefiltering blocks the main thread for seconds on software GL, and at low quality the reflections are not worth it. */
    if (!this.renderer || this.quality.name === 'low') return;
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = generator.fromScene(room, .04).texture;
    room.traverse(object => { (object as THREE.Mesh).geometry?.dispose?.(); });
    generator.dispose();
    this.stages.forEach(stage => { stage.scene.environment = this.environment; });
  }

  private readonly handleLost = (event: Event) => {
    event.preventDefault();
    this.contextLosses += 1;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.contextLosses >= MAX_CONTEXT_LOSSES) { this.setStatus('failed'); return; }
    this.setStatus('lost');
    window.clearTimeout(this.restoreTimer);
    this.restoreTimer = window.setTimeout(() => this.setStatus('failed'), RESTORE_TIMEOUT);
  };

  private readonly handleRestored = () => {
    window.clearTimeout(this.restoreTimer);
    this.buildEnvironment();
    this.setStatus('ready');
    this.stages.forEach(stage => stage.invalidate());
  };

  environmentMap(): THREE.Texture | null { this.ensureRenderer(); return this.environment; }

  add(stage: Stage) { window.clearTimeout(this.releaseTimer); this.ensureRenderer(); this.stages.add(stage); this.schedule(); }
  remove(stage: Stage) {
    this.stages.delete(stage);
    window.clearTimeout(this.releaseTimer);
    /** Deferred, so moving between pages does not churn GPU contexts. */
    if (this.stages.size === 0) this.releaseTimer = window.setTimeout(() => this.release(), RELEASE_DELAY);
  }

  /** Nothing is on screen: free the GPU context until a chart needs it. */
  private release() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    window.clearTimeout(this.restoreTimer);
    if (!this.renderer) return;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleRestored);
    this.environment?.dispose();
    this.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.contexts = Math.max(0, this.contexts - 1);
    this.bufferWidth = this.bufferHeight = 0;
    this.qualityCap = null;
    this.slowStreak = 0;
  }

  /** The application's single WebGL rAF loop. It stops itself when nothing is dirty or animating. */
  schedule() {
    if (this.rafId || this.status !== 'ready' || document.hidden) return;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    this.rafId = 0;
    if (!this.renderer || this.status !== 'ready') return;
    const start = performance.now();
    let rendered = 0, again = false;
    /** Idle motion yields to interaction and never needs full frame rate, so a chart being orbited keeps the GPU. */
    const interacting = [...this.stages].some(stage => stage.interacting);
    this.ambientDue = !interacting && now - this.lastAmbient >= AMBIENT_INTERVAL_MS;
    if (this.ambientDue) this.lastAmbient = now;
    for (const stage of this.stages) {
      if (!stage.visible) continue;
      const active = stage.advance(now);
      if (active) again = true;
      if (stage.dirty) { this.renderStage(stage); rendered += 1; }
    }
    if (rendered) {
      const cost = performance.now() - start;
      this.frames += 1; this.frameTotal += cost; this.lastFrame = cost;
      this.adapt(cost);
    }
    if (again || [...this.stages].some(stage => stage.visible && stage.dirty)) this.schedule();
  };

  /** Adaptive quality: sustained slow frames step resolution down, never up within a session. */
  private adapt(cost: number) {
    if (useVizStore.getState().quality !== 'auto') return;
    this.slowStreak = cost > SLOW_FRAME_MS ? this.slowStreak + 1 : 0;
    if (this.slowStreak < SLOW_FRAME_STREAK) return;
    this.slowStreak = 0;
    const next = this.quality.name === 'high' ? 'medium' : 'low';
    if (next === this.quality.name) return;
    this.qualityCap = next;
    this.stages.forEach(stage => stage.applyQuality());
  }

  private renderStage(stage: Stage) {
    const renderer = this.renderer!;
    const { width, height } = stage.pixelSize;
    if (width === 0 || height === 0) { stage.dirty = false; return; }
    if (width > this.bufferWidth || height > this.bufferHeight) {
      this.bufferWidth = Math.max(this.bufferWidth, width);
      this.bufferHeight = Math.max(this.bufferHeight, height);
      renderer.setSize(this.bufferWidth, this.bufferHeight, false);
    }
    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.render(stage.scene, stage.controller!.camera);
    /** A viewport at the GL origin is the bottom-left of the canvas image, so the source rect is offset. */
    stage.context.clearRect(0, 0, width, height);
    stage.context.drawImage(renderer.domElement, 0, this.bufferHeight - height, width, height, 0, 0, width, height);
    stage.dirty = false;
    stage.layoutLabels();
  }

  diagnostics(): EngineDiagnostics {
    return { stages: this.stages.size, visibleStages: [...this.stages].filter(stage => stage.visible).length, contexts: this.contexts, frames: this.frames, lastFrameMs: this.lastFrame, averageFrameMs: this.frames ? this.frameTotal / this.frames : 0, quality: this.quality.name, renderer: detectWebGL().renderer, contextLosses: this.contextLosses, status: this.status };
  }
  /** Test and diagnostics hook. */
  debugContext(): WebGLRenderingContext | WebGL2RenderingContext | null { return this.renderer?.getContext() ?? null; }
}

export const vizEngine = new VizEngine();

document.addEventListener('visibilitychange', () => { if (!document.hidden) vizEngine.schedule(); });

export class Stage {
  readonly scene = new THREE.Scene();
  readonly context: CanvasRenderingContext2D;
  controller: CameraController | null = null;
  dirty = true;
  visible = false;
  pixelSize = { width: 0, height: 0 };
  private built: BuiltScene | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private progress = 1;
  private entryStart = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private labelNodes: { node: HTMLElement; width: number; height: number; position: THREE.Vector3; align: 'start' | 'center' | 'end'; datumId?: string }[] = [];
  private pendingMove: PointerEvent | null = null;
  private dragging = false;
  private pointerDown: { x: number; y: number } | null = null;
  private hoverId: string | null = null;
  private active: string | null = null;
  private selected: ReadonlySet<string> = new Set();
  private readonly observer: IntersectionObserver;
  private readonly resizeObserver: ResizeObserver;
  private readonly lights: THREE.Light[];
  private ambientStart = performance.now();
  private ambientLive = true;

  constructor(private readonly options: StageOptions) {
    const context = options.canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    this.context = context;
    const hemisphere = new THREE.HemisphereLight(0xdfeaff, 0x18244a, 1.35);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-2.4, 4, 3);
    const rim = new THREE.DirectionalLight(0x22d3ee, .55);
    rim.position.set(3.2, 1.2, -2.6);
    this.lights = [hemisphere, key, rim];
    this.scene.add(...this.lights);
    this.scene.environmentIntensity = .18;
    vizEngine.add(this);
    this.scene.environment = vizEngine.environmentMap();
    const { canvas } = options;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries[entries.length - 1].isIntersecting;
      if (this.visible) { this.dirty = true; vizEngine.schedule(); }
    });
    this.observer.observe(canvas);
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(canvas);
  }

  private measure() {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.cssWidth = rect.width; this.cssHeight = rect.height;
    this.applyQuality();
  }

  applyQuality() {
    if (this.cssWidth === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, vizEngine.quality.pixelRatio);
    const width = Math.round(this.cssWidth * ratio), height = Math.round(this.cssHeight * ratio);
    if (width !== this.pixelSize.width || height !== this.pixelSize.height) {
      this.pixelSize = { width, height };
      this.options.canvas.width = width;
      this.options.canvas.height = height;
    }
    this.controller?.resize(this.cssWidth / this.cssHeight);
    this.invalidate();
  }

  invalidate = () => { this.dirty = true; vizEngine.schedule(); };

  setScene(built: BuiltScene, chartId: string, entry: 'none' | 'grow' | 'lift', keepCamera = false) {
    const previous = this.built;
    const savedCamera = keepCamera ? this.controller?.save() : memory.get(chartId);
    if (previous) { this.scene.remove(previous.root); previous.dispose(); }
    this.controller?.dispose();
    this.built = built;
    this.scene.add(built.root);
    built.setProgress(1);
    built.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(built.root);
    built.labels.forEach(label => bounds.expandByPoint(label.position));
    this.controller = new CameraController(this.options.canvas, built.camera, bounds, this.options.reduced, this.options.sensitivity, this.invalidate, this.options.fullscreen);
    if (this.cssWidth === 0) this.measure(); else this.controller.resize(this.cssWidth / this.cssHeight);
    if (savedCamera) this.controller.restore(savedCamera);
    else if (entry === 'lift' && !this.options.reduced) this.controller.liftFromFlat();
    this.progress = entry === 'none' || this.options.reduced ? 1 : 0;
    this.entryStart = performance.now();
    built.setProgress(this.progress);
    built.highlight(this.active, this.selected);
    this.rebuildLabels();
    this.ambientStart = performance.now();
    this.invalidate();
  }

  /** Called on unmount so returning to 3D restores the user's camera. */
  rememberCamera(chartId: string) { if (this.controller) memory.set(chartId, this.controller.save()); }

  setInteraction(active: string | null, selected: ReadonlySet<string>) {
    this.active = active; this.selected = selected;
    this.built?.highlight(active, selected);
    this.labelNodes.forEach(label => { if (label.datumId) label.node.dataset.active = String(label.datumId === active || selected.has(label.datumId)); });
    this.invalidate();
  }

  camera(action: { type: 'preset'; preset: CameraPreset } | { type: 'reset' } | { type: 'zoom'; factor: number } | { type: 'orbit'; azimuth: number; polar: number } | { type: 'flatten' } | { type: 'focus'; id: string }) {
    const controller = this.controller;
    if (!controller) return;
    if (action.type === 'preset') controller.preset(action.preset);
    else if (action.type === 'reset') controller.reset();
    else if (action.type === 'zoom') controller.zoomBy(action.factor);
    else if (action.type === 'orbit') controller.orbit(action.azimuth, action.polar);
    else if (action.type === 'flatten') controller.flatten();
    else { const point = this.built?.anchor(action.id); if (point) controller.flyTo(point); }
  }

  get interacting() { return this.dragging || !!this.controller?.animating; }

  advance(now: number): boolean {
    let active = false;
    if (this.progress < 1) {
      const t = Math.min(1, (now - this.entryStart) / 900);
      this.progress = 1 - (1 - t) ** 3;
      this.built?.setProgress(this.progress);
      this.dirty = true;
      active = this.progress < 1;
    }
    if (this.controller?.advance(now)) { this.dirty = true; active = true; }
    const { built } = this;
    if (built?.tick && vizEngine.quality.ambient && !this.options.reduced && useVizStore.getState().chartAnimation && !this.hoverId && !this.dragging) {
      if (vizEngine.ambientDue) { this.ambientLive = built.tick((now - this.ambientStart) / 1000); if (this.ambientLive) this.dirty = true; }
      if (this.ambientLive) active = true;
    }
    if (this.pendingMove) { this.processMove(this.pendingMove); this.pendingMove = null; }
    return active;
  }

  private rebuildLabels() {
    const { overlay } = this.options;
    overlay.replaceChildren();
    const density = useVizStore.getState().labels;
    const labels = density === 'none' ? [] : this.built?.labels ?? [];
    const limited = [...labels].sort((a, b) => a.priority - b.priority).slice(0, vizEngine.quality.maxLabels);
    this.labelNodes = limited.map(label => {
      const node = document.createElement('span');
      node.className = `viz-label viz-label-${label.tone}`;
      node.textContent = label.text;
      overlay.append(node);
      return { node, width: node.offsetWidth, height: node.offsetHeight, position: label.position, align: label.align ?? 'center', datumId: label.datumId };
    });
  }

  private readonly projected = new THREE.Vector3();
  /** Projects labels into DOM space after each render, dropping lower-priority labels on collision. */
  layoutLabels() {
    const camera = this.controller?.camera;
    if (!camera || !this.labelNodes.length) return;
    camera.updateMatrixWorld();
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const label of this.labelNodes) {
      this.projected.copy(label.position).project(camera);
      const x = (this.projected.x + 1) / 2 * this.cssWidth, y = (1 - this.projected.y) / 2 * this.cssHeight;
      const left = label.align === 'center' ? x - label.width / 2 : label.align === 'end' ? x - label.width : x;
      const box = { x0: left - 2, y0: y - label.height / 2 - 1, x1: left + label.width + 2, y1: y + label.height / 2 + 1 };
      const outside = box.x0 < 0 || box.y0 < 0 || box.x1 > this.cssWidth || box.y1 > this.cssHeight;
      const hit = outside || placed.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0);
      label.node.style.visibility = hit ? 'hidden' : 'visible';
      if (!hit) { placed.push(box); label.node.style.transform = `translate(${left}px, ${y - label.height / 2}px)`; }
    }
  }

  private pickAt(clientX: number, clientY: number): string | null {
    if (!this.built || !this.controller) return null;
    const rect = this.options.canvas.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.controller.camera);
    const hits = this.raycaster.intersectObjects(this.built.pickables, false);
    for (const hit of hits) { const id = this.built.pick(hit); if (id) return id; }
    return null;
  }

  private processMove(event: PointerEvent) {
    if (this.dragging) return;
    const id = this.pickAt(event.clientX, event.clientY);
    this.hoverId = id;
    this.options.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.options.onHover(id, { x: event.clientX, y: event.clientY });
    if (!id) vizEngine.schedule();
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.pointerDown && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 4) {
      this.dragging = true;
      this.options.canvas.style.cursor = 'grabbing';
      this.options.onHover(null);
    }
    this.pendingMove = event;
    vizEngine.schedule();
  };
  private readonly onPointerLeave = () => { this.pendingMove = null; this.hoverId = null; this.options.onHover(null); vizEngine.schedule(); };
  private readonly onPointerDown = (event: PointerEvent) => { this.pointerDown = { x: event.clientX, y: event.clientY }; };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.pointerDown && !this.dragging && event.target === this.options.canvas) {
      const id = this.pickAt(event.clientX, event.clientY);
      if (id) this.options.onSelect(id);
    }
    this.pointerDown = null;
    if (this.dragging) { this.dragging = false; this.options.canvas.style.cursor = 'grab'; }
  };
  private readonly onWheel = (event: WheelEvent) => {
    if (this.options.fullscreen || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    this.controller?.zoomBy(event.deltaY > 0 ? .9 : 1.1);
  };

  dispose() {
    const { canvas } = this.options;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    this.observer.disconnect();
    this.resizeObserver.disconnect();
    this.controller?.dispose();
    if (this.built) { this.scene.remove(this.built.root); this.built.dispose(); this.built = null; }
    this.lights.forEach(light => light.dispose());
    this.options.overlay.replaceChildren();
    vizEngine.remove(this);
  }
}
