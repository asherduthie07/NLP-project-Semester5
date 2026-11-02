import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { easeOutExpo } from '../../design/motion';
import type { CameraPreset, SceneCamera } from './scene';

export interface CameraMemory { position: THREE.Vector3; target: THREE.Vector3; zoom: number }
interface Flight { from: CameraMemory; to: CameraMemory; start: number; duration: number }

function cubicBezier(x: number): number {
  const [x1, y1, x2, y2] = easeOutExpo;
  let t = x;
  for (let i = 0; i < 5; i++) {
    const current = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
    const slope = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t ** 2 * (1 - x2);
    if (Math.abs(slope) < 1e-5) break;
    t -= (current - x) / slope;
  }
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
}

/** CameraController: orbit, zoom, presets and flights through one code path, for every chart kind. */
export class CameraController {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private flight: Flight | null = null;
  private scene: SceneCamera;
  private readonly distance: number;
  private readonly center: THREE.Vector3;
  private readonly corners: THREE.Vector3[];
  private aspect = 1;

  constructor(element: HTMLElement, scene: SceneCamera, bounds: THREE.Box3, private readonly reduced: boolean, sensitivity: number, private readonly onChange: () => void, fullscreen: boolean) {
    this.scene = scene;
    this.center = bounds.getCenter(new THREE.Vector3());
    const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), .1);
    this.distance = size * 3;
    this.corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
    this.camera = scene.projection === 'orthographic'
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, .01, this.distance * 3)
      : new THREE.PerspectiveCamera(32, 1, .01, this.distance * 3);
    this.controls = new OrbitControls(this.camera, element);
    this.controls.enableDamping = !reduced;
    this.controls.dampingFactor = .09;
    this.controls.enablePan = fullscreen;
    /** The wheel must keep scrolling the panel; zooming takes Ctrl/Cmd+wheel outside analysis mode. */
    this.controls.enableZoom = fullscreen;
    this.controls.rotateSpeed = .75 * sensitivity;
    this.controls.minPolarAngle = .001;
    this.controls.maxPolarAngle = scene.free ? Math.PI - .001 : Math.PI / 2 - .015;
    this.controls.target.copy(this.center);
    this.controls.addEventListener('change', this.onChange);
    element.style.touchAction = fullscreen ? 'none' : 'pan-y';
    this.snap(this.memoryFor(scene.initial));
  }

  private memoryFor(preset: CameraPreset): CameraMemory {
    const direction = this.scene.presets[preset];
    return { position: direction.clone().multiplyScalar(this.distance).add(this.center), target: this.center.clone(), zoom: this.halfExtent(this.scene.presets[this.scene.initial]) / this.halfExtent(direction) };
  }

  /** Half-height the view needs to contain the scene, seen along a direction: the view fits the data rather than a fixed radius. */
  private halfExtent(direction: THREE.Vector3): number {
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    let x = 0, y = 0;
    for (const corner of this.corners) {
      const offset = corner.clone().sub(this.center);
      x = Math.max(x, Math.abs(offset.dot(right)));
      y = Math.max(y, Math.abs(offset.dot(up)));
    }
    /** x keeps room for axis labels, which are measured from their anchor; a round spatial layout never reaches its box corners. */
    return Math.max(y * 1.08, x * 1.16 / this.aspect, .01) * (this.scene.projection === 'perspective' ? .8 : 1);
  }

  private snap(memory: CameraMemory) {
    this.camera.position.copy(memory.position);
    this.controls.target.copy(memory.target);
    this.camera.zoom = memory.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Fit the scene's bounding radius to the viewport for either projection. */
  resize(aspect: number) {
    this.aspect = aspect;
    const halfHeight = this.halfExtent(this.scene.presets[this.scene.initial]);
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    } else {
      this.camera.aspect = aspect;
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight * 1.12 / this.distance));
    }
    this.camera.updateProjectionMatrix();
    this.onChange();
  }

  save(): CameraMemory { return { position: this.camera.position.clone(), target: this.controls.target.clone(), zoom: this.camera.zoom }; }
  restore(memory: CameraMemory) { this.snap(memory); this.onChange(); }

  private fly(to: CameraMemory, duration = 620) {
    if (this.reduced) { this.snap(to); this.onChange(); return; }
    this.flight = { from: this.save(), to, start: performance.now(), duration };
    this.onChange();
  }

  preset(name: CameraPreset, animated = true) {
    const memory = this.memoryFor(name);
    if (animated) this.fly(memory); else { this.snap(memory); this.onChange(); }
  }
  reset() { this.preset(this.scene.initial); }
  /** Lifts from the flat 2D-aligned view; called when entering 3D from 2D. */
  liftFromFlat() { this.snap(this.memoryFor(this.scene.flat)); this.preset(this.scene.initial); }
  flatten() { this.preset(this.scene.flat); }

  zoomBy(factor: number) {
    const memory = this.save();
    memory.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .4, 8);
    this.fly(memory, 220);
  }

  orbit(azimuth: number, polar: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += azimuth;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + polar, this.controls.minPolarAngle, this.controls.maxPolarAngle);
    const memory = this.save();
    memory.position = new THREE.Vector3().setFromSpherical(spherical).add(this.controls.target);
    this.fly(memory, 220);
  }

  flyTo(point: THREE.Vector3, zoom = 1.8) {
    const memory = this.save();
    memory.position.add(point.clone().sub(memory.target));
    memory.target = point.clone();
    memory.zoom = zoom;
    this.fly(memory);
  }

  /** True while the camera still needs frames. */
  get animating() { return !!this.flight; }

  advance(now: number): boolean {
    if (this.flight) {
      const t = Math.min(1, (now - this.flight.start) / this.flight.duration);
      const e = cubicBezier(t);
      const { from, to } = this.flight;
      const a = from.position.clone().sub(from.target), b = to.position.clone().sub(to.target);
      const sa = new THREE.Spherical().setFromVector3(a), sb = new THREE.Spherical().setFromVector3(b);
      let delta = sb.theta - sa.theta;
      if (delta > Math.PI) delta -= Math.PI * 2; else if (delta < -Math.PI) delta += Math.PI * 2;
      const spherical = new THREE.Spherical(THREE.MathUtils.lerp(sa.radius, sb.radius, e), THREE.MathUtils.lerp(sa.phi, sb.phi, e), sa.theta + delta * e);
      const target = from.target.clone().lerp(to.target, e);
      this.camera.position.setFromSpherical(spherical).add(target);
      this.controls.target.copy(target);
      this.camera.zoom = THREE.MathUtils.lerp(from.zoom, to.zoom, e);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(target);
      if (t >= 1) { this.flight = null; this.controls.update(); }
      return true;
    }
    return this.controls.update();
  }

  dispose() {
    this.controls.removeEventListener('change', this.onChange);
    this.controls.dispose();
  }
}
