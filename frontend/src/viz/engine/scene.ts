import * as THREE from 'three';
import type { ColorResolver } from '../palette';
import type { VizModel } from '../types';

export type CameraPreset = 'iso' | 'front' | 'top';
export interface SceneLabel { text: string; position: THREE.Vector3; tone: 'axis' | 'value' | 'key' | 'chip'; priority: number; datumId?: string; align?: 'start' | 'center' | 'end' }
export interface SceneCamera {
  projection: 'orthographic' | 'perspective';
  presets: Record<CameraPreset, THREE.Vector3>;
  /** The preset that lines the geometry up with the 2D view; used for mode transitions. */
  flat: CameraPreset;
  initial: CameraPreset;
  /** Allow orbiting below the drafting plate; only for free-floating spatial scenes. */
  free?: boolean;
}
export interface BuiltScene {
  root: THREE.Group;
  pickables: THREE.Object3D[];
  pick: (hit: THREE.Intersection) => string | null;
  anchor: (id: string) => THREE.Vector3 | null;
  highlight: (active: string | null, selected: ReadonlySet<string>) => void;
  /** Entry animation, 0 to 1. At 1 geometry is exactly to scale. */
  setProgress: (progress: number) => void;
  /** Ambient motion; return true while it needs another frame. */
  tick?: (seconds: number) => boolean;
  labels: SceneLabel[];
  camera: SceneCamera;
  /** Geometric magnitude per datum, in scene units. Used to prove geometry is proportional to data. */
  magnitudes: Map<string, number>;
  dispose: () => void;
}
export interface BuildContext { resolve: ColorResolver }
export type SceneBuilder<M extends VizModel> = (model: M, context: BuildContext) => BuiltScene;

export const defaultPresets = (): Record<CameraPreset, THREE.Vector3> => ({
  iso: new THREE.Vector3(.62, .58, 1).normalize(),
  front: new THREE.Vector3(0, .02, 1).normalize(),
  top: new THREE.Vector3(0, 1, .0001).normalize(),
});

const dim = new THREE.Color();
/** Every model shares this light rig's color space; design tokens stay recognizable because no tone mapping is applied. */
export function shade(color: THREE.Color, active: boolean, anyActive: boolean, selected: boolean): THREE.Color {
  dim.copy(color);
  if (selected || active) return dim.multiplyScalar(1.28);
  return anyActive ? dim.multiplyScalar(.34) : dim;
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(material) ? material : material ? [material] : []).forEach(item => {
      (item as THREE.SpriteMaterial).map?.dispose?.();
      item.dispose();
    });
    (object as THREE.InstancedMesh).dispose?.();
  });
}

const edgeBox = new THREE.BoxGeometry(1, 1, 1);
edgeBox.translate(0, .5, 0);
const edgeTemplate = new THREE.EdgesGeometry(edgeBox);

export interface Box { id: string; x: number; z: number; base: number; width: number; depth: number; height: number; color: string; axis?: 'y' | 'x' }

/** Instanced lit boxes, the shared body of bars, histograms, heatmaps, treemaps and timeline stems. Height is exactly the supplied value. */
export class BoxField {
  readonly mesh: THREE.InstancedMesh;
  readonly frame: THREE.LineSegments;
  private readonly colors: THREE.Color[];
  private readonly index = new Map<string, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly identity = new THREE.Quaternion();

  constructor(readonly boxes: Box[], accent: string) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, .5, 0);
    const positions = geometry.attributes.position;
    const vertex = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const light = .5 + .5 * positions.getY(i);
      vertex.set([light, light, light], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(vertex, 3));
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .12 });
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(boxes.length, 1));
    this.mesh.count = boxes.length;
    this.colors = boxes.map(box => new THREE.Color(box.color));
    boxes.forEach((box, i) => {
      this.index.set(box.id, i);
      this.mesh.setColorAt(i, this.colors[i]);
    });
    this.setProgress(1);
    this.frame = new THREE.LineSegments(edgeTemplate.clone(), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: .95 }));
    this.frame.visible = false;
  }

  private apply(i: number, progress: number, target = this.matrix) {
    const box = this.boxes[i];
    const grow = Math.max(box.height * progress, 1e-4);
    if (box.axis === 'x') {
      this.position.set(box.x * progress + grow / 2, box.base, box.z);
      this.scale.set(grow, box.width, box.depth);
    } else {
      this.position.set(box.x, box.base * progress, box.z);
      this.scale.set(box.width, grow, box.depth);
    }
    return target.compose(this.position, this.identity, this.scale);
  }

  setProgress(progress: number) {
    this.boxes.forEach((_, i) => this.mesh.setMatrixAt(i, this.apply(i, progress)));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  idAt(instance: number | undefined): string | null { return instance === undefined ? null : this.boxes[instance]?.id ?? null; }

  anchor(id: string): THREE.Vector3 | null {
    const i = this.index.get(id);
    if (i === undefined) return null;
    const box = this.boxes[i];
    return box.axis === 'x' ? new THREE.Vector3(box.x + box.height, box.base + box.width / 2, box.z) : new THREE.Vector3(box.x, box.base + box.height, box.z);
  }

  highlight(active: string | null, selected: ReadonlySet<string>) {
    const anyActive = active !== null || selected.size > 0;
    this.boxes.forEach((box, i) => this.mesh.setColorAt(i, shade(this.colors[i], box.id === active, anyActive, selected.has(box.id))));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    const focus = active !== null && this.index.has(active) ? active : [...selected].find(id => this.index.has(id));
    this.frame.visible = focus !== undefined;
    if (focus !== undefined) {
      const m = this.apply(this.index.get(focus)!, 1, new THREE.Matrix4());
      m.decompose(this.frame.position, this.frame.quaternion, this.frame.scale);
      this.frame.scale.multiplyScalar(1.015);
    }
  }
}

/** Engraved drafting plate: the shared floor that every measured chart stands on. */
export function draftingPlate(width: number, depth: number, resolve: ColorResolver, divisions = 8): THREE.Group {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, .012, depth), new THREE.MeshStandardMaterial({ color: resolve('--bg-2'), roughness: .85, metalness: .05 }));
  plate.position.y = -.007;
  group.add(plate);
  const points: number[] = [];
  for (let i = 0; divisions > 0 && i <= divisions; i++) {
    const x = -width / 2 + width * i / divisions, z = -depth / 2 + depth * i / divisions;
    points.push(x, .001, -depth / 2, x, .001, depth / 2, -width / 2, .001, z, width / 2, .001, z);
  }
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: resolve('--blue'), transparent: true, opacity: .16 })));
  return group;
}

/** Real value axis: horizontal rules on the back wall at the same tick values the 2D chart uses. */
export function valueWall(ticks: number[], yFor: (value: number) => number, width: number, z: number, resolve: ColorResolver): THREE.LineSegments {
  const points: number[] = [];
  ticks.forEach(tick => points.push(-width / 2, yFor(tick), z, width / 2, yFor(tick), z));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: cssColor(resolve, '--line-strong'), transparent: true, opacity: .32 }));
}

/** Line tokens carry alpha, as rgba() in source and as #rrggbbaa after CSS minification. Materials take alpha separately. */
export function cssColor(resolve: ColorResolver, value: string): THREE.Color {
  const parsed = value.startsWith('--') ? resolve(value as `--${string}`) : value;
  if (parsed.startsWith('rgba')) return new THREE.Color(parsed.replace(/rgba\((\d+),\s*(\d+),\s*(\d+).*/, 'rgb($1,$2,$3)'));
  if (/^#[\da-f]{8}$/i.test(parsed)) return new THREE.Color(parsed.slice(0, 7));
  if (/^#[\da-f]{4}$/i.test(parsed)) return new THREE.Color(parsed.slice(0, 4));
  return new THREE.Color(parsed);
}
