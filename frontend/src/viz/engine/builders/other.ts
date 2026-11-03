import * as THREE from 'three';
import { arcLayout, formatValue, hashUnit, layoutWords, networkLayout, squarify } from '../../scale';
import type { DonutModel, NetworkModel, RadialModel, TreemapModel, WordCloudModel } from '../../types';
import { BoxField, cssColor, defaultPresets, disposeTree, draftingPlate, shade, type Box, type SceneBuilder, type SceneLabel } from '../scene';

const topDown = () => { const presets = defaultPresets(); presets.iso = new THREE.Vector3(.3, 1, .95).normalize(); return presets; };

export const buildDonut: SceneBuilder<DonutModel> = (model, { resolve }) => {
  const root = new THREE.Group(), body = new THREE.Group();
  const outer = 1, inner = .62, thickness = .18;
  const arcs = arcLayout(model.segments);
  const total = model.segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  const labels: SceneLabel[] = [{ text: formatValue(total, model.unit), position: new THREE.Vector3(0, thickness, 0), tone: 'key', priority: 0 }];
  const magnitudes = new Map<string, number>(), meshes: THREE.Mesh[] = [], base = new Map<string, THREE.Color>();
  arcs.forEach(arc => {
    /** Arcs run clockwise from north, seen from above; the same convention as the 2D donut. */
    const start = Math.PI / 2 - arc.start, end = Math.PI / 2 - arc.end;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, start, end, true);
    shape.absarc(0, 0, inner, end, start, false);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .012, bevelSize: .008, bevelSegments: 2, curveSegments: Math.max(12, Math.round(arc.share * 96)) });
    geometry.rotateX(-Math.PI / 2);
    const color = cssColor(resolve, arc.item.color);
    base.set(arc.item.id, color);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .15 }));
    mesh.userData.id = arc.item.id;
    const mid = (arc.start + arc.end) / 2;
    mesh.userData.dir = new THREE.Vector3(Math.sin(mid), 0, -Math.cos(mid));
    meshes.push(mesh); body.add(mesh);
    magnitudes.set(arc.item.id, arc.end - arc.start);
    labels.push({ text: `${(arc.share * 100).toFixed(1)}%`, position: new THREE.Vector3(Math.sin(mid) * (outer + .18), thickness / 2, -Math.cos(mid) * (outer + .18)), tone: 'value', priority: 1, datumId: arc.item.id });
  });
  root.add(body);
  return {
    root, labels, magnitudes, pickables: meshes,
    camera: { projection: 'orthographic', presets: topDown(), flat: 'top', initial: 'iso' },
    pick: hit => hit.object.userData.id ?? null,
    anchor: id => {
      const mesh = meshes.find(item => item.userData.id === id);
      return mesh ? (mesh.userData.dir as THREE.Vector3).clone().multiplyScalar((outer + inner) / 2).setY(thickness) : null;
    },
    highlight: (active, selected) => {
      const anyActive = active !== null || selected.size > 0;
      meshes.forEach(mesh => {
        const id = mesh.userData.id as string, focus = id === active || selected.has(id);
        (mesh.material as THREE.MeshStandardMaterial).color.copy(shade(base.get(id)!, id === active, anyActive, selected.has(id)));
        mesh.position.copy(mesh.userData.dir as THREE.Vector3).multiplyScalar(focus ? .07 : 0);
      });
    },
    setProgress: progress => { body.scale.y = Math.max(progress, 1e-3); },
    dispose: () => disposeTree(root),
  };
};

export const buildRadial: SceneBuilder<RadialModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const count = Math.max(model.metrics.length, 1);
  const tube = Math.min(.06, .34 / count), gap = tube * 2.7;
  const arcs: { id: string; mesh: THREE.Mesh; cap: THREE.Mesh; color: THREE.Color; indexCount: number; tip: THREE.Vector3 }[] = [];
  const labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  const orient = (geometry: THREE.BufferGeometry) => { geometry.rotateX(Math.PI / 2); geometry.rotateY(Math.PI / 2); return geometry; };
  const trackMaterial = new THREE.MeshStandardMaterial({ color: resolve('--bg-3'), roughness: .7 });
  model.metrics.forEach((metric, i) => {
    const radius = 1 - i * gap, share = Math.min(1, metric.value / metric.max), sweep = share * Math.PI * 2;
    const color = cssColor(resolve, metric.color);
    root.add(new THREE.Mesh(orient(new THREE.TorusGeometry(radius, tube * .55, 10, 96)), trackMaterial));
    const geometry = orient(new THREE.TorusGeometry(radius, tube, 14, Math.max(8, Math.round(share * 128)), Math.max(sweep, 1e-3)));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .28, metalness: .2 }));
    mesh.userData.id = metric.id;
    const tip = new THREE.Vector3(Math.sin(sweep) * radius, 0, -Math.cos(sweep) * radius);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(tube, 14, 10), mesh.material);
    cap.position.copy(tip); cap.userData.id = metric.id;
    root.add(mesh, cap);
    arcs.push({ id: metric.id, mesh, cap, color, indexCount: geometry.index?.count ?? 0, tip });
    magnitudes.set(metric.id, sweep);
    });
  const lead = model.metrics[0];
  if (lead) labels.push({ text: `${(lead.value / lead.max * 100).toFixed(lead.value % 1 ? 1 : 0)}%`, position: new THREE.Vector3(0, 0, 0), tone: 'key', priority: 0 });
  return {
    root, labels, magnitudes, pickables: arcs.flatMap(arc => [arc.mesh, arc.cap]),
    camera: { projection: 'orthographic', presets: topDown(), flat: 'top', initial: 'iso' },
    pick: hit => hit.object.userData.id ?? null,
    anchor: id => arcs.find(arc => arc.id === id)?.tip.clone() ?? null,
    highlight: (active, selected) => {
      const anyActive = active !== null || selected.size > 0;
      arcs.forEach(arc => { (arc.mesh.material as THREE.MeshStandardMaterial).color.copy(shade(arc.color, arc.id === active, anyActive, selected.has(arc.id))); });
    },
    setProgress: progress => arcs.forEach(arc => { arc.mesh.geometry.setDrawRange(0, Math.floor(arc.indexCount * progress / 6) * 6); arc.cap.visible = progress >= 1; }),
    dispose: () => disposeTree(root),
  };
};

export const buildTreemap: SceneBuilder<TreemapModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const width = 2.8, depth = 1.7, gap = .012;
  const tiles = squarify(model.nodes, width, depth);
  const maxHeight = Math.max(1e-9, ...model.nodes.map(node => node.heightValue ?? 0));
  const boxes: Box[] = [], labels: SceneLabel[] = [], magnitudes = new Map<string, number>();
  tiles.forEach((tile, i) => {
    const group = model.groups.find(item => item.id === tile.item.group);
    const height = model.heightLabel && tile.item.heightValue !== undefined ? .04 + tile.item.heightValue / maxHeight * .55 : .1;
    const x = -width / 2 + tile.x + tile.w / 2, z = -depth / 2 + tile.y + tile.h / 2;
    boxes.push({ id: tile.item.id, x, z, base: 0, width: Math.max(tile.w - gap, .002), depth: Math.max(tile.h - gap, .002), height, color: resolve(group?.color ?? '--cyan') });
    magnitudes.set(tile.item.id, tile.w * tile.h);
    if (i < 8) labels.push({ text: tile.item.label, position: new THREE.Vector3(x, height, z), tone: 'chip', priority: i, datumId: tile.item.id });
  });
  root.add(draftingPlate(width + .04, depth + .04, resolve, 0));
  const field = new BoxField(boxes, resolve('--text-hi'));
  root.add(field.mesh, field.frame);
  return {
    root, labels, magnitudes, pickables: [field.mesh],
    camera: { projection: 'orthographic', presets: topDown(), flat: 'top', initial: 'iso' },
    pick: hit => field.idAt(hit.instanceId),
    anchor: id => field.anchor(id),
    highlight: (active, selected) => field.highlight(active, selected),
    setProgress: progress => field.setProgress(progress),
    dispose: () => disposeTree(root),
  };
};

function textSprite(text: string, family: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const size = 72;
  let aspect = 3;
  if (context) {
    context.font = `500 ${size}px ${family}`;
    const width = Math.ceil(context.measureText(text).width) + 12;
    canvas.width = width; canvas.height = Math.ceil(size * 1.3);
    context.font = `500 ${size}px ${family}`;
    context.textBaseline = 'middle';
    context.fillStyle = 'white';
    context.fillText(text, 6, canvas.height / 2);
    aspect = width / canvas.height;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.userData.aspect = aspect;
  return sprite;
}

export const buildWordCloud: SceneBuilder<WordCloudModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
  const magnitudes = new Map<string, number>();
  /** Same placement and size as the 2D cloud, so the front view lines up with it. Depth alone is added, and it carries no data. */
  const unit = 1.9 / 320;
  const sprites = layoutWords(model.words, 640, 320).map(word => {
    const sprite = textSprite(word.text, family);
    const height = word.size * 1.3 * unit;
    sprite.scale.set(height * sprite.userData.aspect, height, 1);
    const depth = (hashUnit(word.id) - .5) * .36;
    sprite.position.set(word.x * unit, -word.y * unit, depth);
    sprite.userData.id = word.id;
    sprite.userData.rest = .82 + .18 * (depth + .18) / .36;
    sprite.userData.color = cssColor(resolve, model.categories.find(category => category.id === word.word.category)?.color ?? '--cyan');
    (sprite.material as THREE.SpriteMaterial).color.copy(sprite.userData.color);
    root.add(sprite);
    magnitudes.set(word.id, word.size);
    return sprite;
  });
  const opacityAt = (sprite: THREE.Sprite, factor: number) => { (sprite.material as THREE.SpriteMaterial).opacity = sprite.userData.rest * factor; };
  return {
    root, labels: [], magnitudes, pickables: sprites,
    /** Orthographic, so depth cannot change a word's apparent size, which is what encodes its count. */
    camera: { projection: 'orthographic', presets: { ...defaultPresets(), iso: new THREE.Vector3(.12, .08, 1).normalize() }, flat: 'front', initial: 'iso', free: true },
    pick: hit => hit.object.userData.id ?? null,
    anchor: id => { const sprite = sprites.find(item => item.userData.id === id); return sprite ? sprite.position.clone().applyMatrix4(root.matrixWorld) : null; },
    highlight: (active, selected) => {
      const anyActive = active !== null || selected.size > 0;
      sprites.forEach(sprite => {
        const id = sprite.userData.id as string;
        if (!anyActive) opacityAt(sprite, 1);
        else (sprite.material as THREE.SpriteMaterial).opacity = id === active || selected.has(id) ? 1 : .18;
      });
    },
    setProgress: progress => { root.scale.setScalar(.86 + .14 * progress); sprites.forEach(sprite => opacityAt(sprite, progress)); },
    tick: seconds => { root.rotation.y = Math.sin(seconds * .22) * .05; return true; },
    dispose: () => disposeTree(root),
  };
};

export const buildNetwork: SceneBuilder<NetworkModel> = (model, { resolve }) => {
  const root = new THREE.Group();
  const laid = networkLayout(model);
  const visibleIds = new Set(model.nodes.map(node => node.id));
  const nodes = laid.filter(node => visibleIds.has(node.id));
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const spread = 1.25;
  const positions = nodes.map(node => new THREE.Vector3(node.x * spread * 1.4, node.y * spread, node.z * spread));
  const radii = nodes.map(node => .016 + .011 * Math.sqrt(node.degree));
  const colors = nodes.map(node => cssColor(resolve, model.clusters.find(cluster => cluster.id === node.cluster)?.color ?? '--cyan'));
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ roughness: .3, metalness: .1 }), Math.max(nodes.length, 1));
  mesh.count = nodes.length;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), scratch = new THREE.Vector3();
  const adjacency = new Map<string, Set<string>>();
  const edgesByKind = new Map<string, number[]>();
  model.edges.forEach(edge => {
    const a = index.get(edge.source), b = index.get(edge.target);
    if (a === undefined || b === undefined) return;
    const list = edgesByKind.get(edge.kind) ?? [];
    list.push(...positions[a].toArray(), ...positions[b].toArray());
    edgesByKind.set(edge.kind, list);
    (adjacency.get(edge.source) ?? adjacency.set(edge.source, new Set()).get(edge.source)!).add(edge.target);
    (adjacency.get(edge.target) ?? adjacency.set(edge.target, new Set()).get(edge.target)!).add(edge.source);
  });
  const edgeMaterials: THREE.Material[] = [];
  edgesByKind.forEach((list, kind) => {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    const color = cssColor(resolve, kind === 'imports' ? '--blue' : kind === 'inherits' ? '--violet' : kind === 'calls' ? '--cyan' : '--line-strong');
    const opacity = kind === 'contains' ? .12 : .3;
    /** Same encoding as the 2D canvas: imports solid, inheritance dashed, calls dotted. */
    const material = kind === 'inherits' ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .05, gapSize: .03, depthWrite: false }) : kind === 'calls' ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .012, gapSize: .022, depthWrite: false }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    material.userData.opacity = opacity;
    edgeMaterials.push(material);
    const lines = new THREE.LineSegments(geometry, material);
    if (material instanceof THREE.LineDashedMaterial) lines.computeLineDistances();
    root.add(lines);
  });
  const focusGeometry = new THREE.BufferGeometry();
  const focusLines = new THREE.LineSegments(focusGeometry, new THREE.LineBasicMaterial({ color: resolve('--text-hi'), transparent: true, opacity: .85 }));
  focusLines.visible = false;
  root.add(mesh, focusLines);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  if (glowContext) {
    const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.8)');
    gradient.addColorStop(.35, 'rgba(255,255,255,.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 64, 64);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const hubThreshold = [...nodes].map(node => node.degree).sort((a, b) => b - a)[Math.min(7, nodes.length - 1)] ?? 0;
  const labels: SceneLabel[] = [];
  const magnitudes = new Map<string, number>();
  nodes.forEach((node, i) => {
    magnitudes.set(node.id, radii[i]);
    if (node.degree >= hubThreshold && node.degree > 1) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: colors[i], transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.copy(positions[i]);
      glow.scale.setScalar(radii[i] * 7);
      root.add(glow);
      labels.push({ text: node.label, position: positions[i].clone().add(new THREE.Vector3(0, radii[i] + .05, 0)), tone: 'chip', priority: 1 / (node.degree + 1), datumId: node.id });
    }
  });
  let progress = 1, activeId: string | null = null, selectedIds: ReadonlySet<string> = new Set();
  const place = () => {
    nodes.forEach((node, i) => {
      scratch.copy(positions[i]).multiplyScalar(.7 + .3 * progress);
      const focused = node.id === activeId || selectedIds.has(node.id);
      mesh.setMatrixAt(i, matrix.compose(scratch, quaternion, scale.setScalar(radii[i] * (focused ? 1.5 : 1) * progress)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  const paint = () => {
    const focus = activeId ?? [...selectedIds][selectedIds.size - 1] ?? null;
    const neighbors = focus ? adjacency.get(focus) : undefined;
    nodes.forEach((node, i) => {
      const inFocus = focus === null || node.id === focus || neighbors?.has(node.id) === true;
      mesh.setColorAt(i, shade(colors[i], node.id === focus, focus !== null && !inFocus, selectedIds.has(node.id)));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    edgeMaterials.forEach(material => { material.opacity = (material.userData.opacity as number) * (focus ? .3 : 1); });
    const focusIndex = focus ? index.get(focus) : undefined;
    focusLines.visible = focusIndex !== undefined && !!neighbors?.size;
    if (focusIndex !== undefined && neighbors) {
      const points: number[] = [];
      neighbors.forEach(id => { const i = index.get(id); if (i !== undefined) points.push(...positions[focusIndex].toArray(), ...positions[i].toArray()); });
      focusGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    }
  };
  paint(); place();
  return {
    root, labels, magnitudes, pickables: [mesh],
    camera: { projection: 'perspective', presets: { ...defaultPresets(), iso: new THREE.Vector3(.32, .3, 1).normalize() }, flat: 'front', initial: 'iso', free: true },
    pick: hit => hit.instanceId === undefined ? null : nodes[hit.instanceId]?.id ?? null,
    anchor: id => { const i = index.get(id); return i === undefined ? null : positions[i].clone(); },
    highlight: (active, selected) => { activeId = active; selectedIds = selected; paint(); place(); },
    setProgress: value => { progress = value; place(); },
    dispose: () => { glowTexture.dispose(); disposeTree(root); },
  };
};

