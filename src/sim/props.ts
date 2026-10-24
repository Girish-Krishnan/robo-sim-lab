import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export interface PropTemplate {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[];
  height: number;
  radius: number;
  /** Fitted size. Length of a log is the long horizontal axis. */
  size: { x: number; y: number; z: number };
  /**
   * Where the wood or stone actually is, relative to the baked origin.
   * Photogrammetry trunks are not at the bounding-box center, and a yaw
   * around that center swings the trunk off the collider.
   */
  anchor: { x: number; z: number; radius: number };
}

export interface PropInstance {
  x: number;
  y: number;
  z: number;
  yaw?: number;
  scale: number;
  /** Per-axis scale. Used when a log's thickness and length need different factors. */
  scale3?: { x: number; y: number; z: number };
  /** Ground-shadow center. Defaults to the instance origin. */
  shadeX?: number;
  shadeZ?: number;
}

/**
 * Baked height and wood radius of the scanned trees. Colliders use these so
 * a trunk's radius matches the mesh after the dress scale. The prop test
 * checks them against the glTF; if a model changes, update both together.
 */
export const SCANNED_TRUNK = {
  broadleaf: { height: 3.406, radius: 0.291 },
  bushy: { height: 2.313, radius: 0.495 },
  pine: { height: 1.301, radius: 0.213 },
} as const;

/** Collider fields the prop dresser needs. Kept structural so this module does not import the world. */
export interface ScatterSolid {
  look: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}

const cache = new Map<string, Promise<PropTemplate>>();
let gltfLoader: GLTFLoader | null = null;
let shadowGeo: THREE.BufferGeometry | null = null;
let shadowMat: THREE.Material | null = null;

export function bindPropLoader(renderer: THREE.WebGLRenderer): void {
  if (gltfLoader) return;
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(`${import.meta.env.BASE_URL}basis/`);
  ktx2.detectSupport(renderer);
  gltfLoader = new GLTFLoader();
  gltfLoader.setKTX2Loader(ktx2);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
}

export function loadProp(file: string): Promise<PropTemplate> {
  const hit = cache.get(file);
  if (hit) return hit;
  if (!gltfLoader) throw new Error("Prop loader is not bound.");
  const pending = gltfLoader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${file}.glb`).then((gltf) => bakeObject(gltf.scene));
  cache.set(file, pending);
  return pending;
}

export async function loadProps(files: readonly string[]): Promise<Record<string, PropTemplate>> {
  const entries = await Promise.all(files.map(async (file) => [file, await loadProp(file)] as const));
  return Object.fromEntries(entries);
}

/** Bake one glTF into a ground-fitted template. Exported so tests can check the bounds. */
export function bakeObject(root: THREE.Object3D): PropTemplate {
  root.updateMatrixWorld(true);
  let parts: PropTemplate["parts"] = [];
  const sources: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry.clone();
    // Meshopt leaves positions as normalized int16. applyMatrix4 writes back
    // through that normalization, and any coordinate outside [-1, 1] wraps.
    // That turned every plant into a scrambled slab. Expand to float32 first.
    expandQuantized(geometry);
    geometry.applyMatrix4(obj.matrixWorld);
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
    sources.push(obj.geometry);
    const materials = (Array.isArray(obj.material) ? obj.material : [obj.material]).map(prepareMaterial);
    parts.push({ geometry, material: materials.length === 1 ? materials[0]! : materials });
  });
  for (const geometry of sources) geometry.dispose();

  // Poly Haven ships ferns, grasses, pines, and shrubs as a row of plants.
  // Keeping the row made one "tree" a wall. Attachments (crate lid, manhole
  // cover) stay, because their centers sit inside the main piece.
  const kept = keepHeroPlant(parts);
  if (kept.length !== parts.length) {
    const stay = new Set(kept);
    for (const part of parts) if (!stay.has(part)) part.geometry.dispose();
    parts = kept;
  }

  let box = boundsOf(parts);
  const size = box.getSize(new THREE.Vector3());
  // Photogrammetry logs lie along X. Turn only a prop that is much longer
  // than it is tall, so its length follows local Z and yaw can aim it.
  if (size.x > size.y * 2 && size.x > size.z * 2) {
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (const part of parts) {
      part.geometry.applyMatrix4(turn);
      part.geometry.boundingBox = null;
      part.geometry.boundingSphere = null;
    }
    box = boundsOf(parts);
  }
  const center = box.getCenter(new THREE.Vector3());
  for (const part of parts) {
    part.geometry.translate(-center.x, -box.min.y, -center.z);
    part.geometry.boundingBox = null;
    part.geometry.boundingSphere = null;
    part.geometry.computeBoundingSphere();
    part.geometry.userData.keep = true;
  }
  const fitted = box.getSize(new THREE.Vector3());
  return {
    parts,
    height: Math.max(fitted.y, 0.01),
    radius: Math.max(fitted.x, fitted.z) * 0.5,
    size: { x: Math.max(fitted.x, 0.01), y: Math.max(fitted.y, 0.01), z: Math.max(fitted.z, 0.01) },
    anchor: measureAnchor(parts),
  };
}

/**
 * Centroid and radius of the solid base: the narrow lower band of a trunk,
 * or the whole stone when it never narrows. Radius is the 60th percentile,
 * so foliage around the bark does not inflate the collider.
 */
function measureAnchor(parts: PropTemplate["parts"]): PropTemplate["anchor"] {
  const points: { x: number; y: number; z: number }[] = [];
  for (const part of parts) {
    const pos = part.geometry.getAttribute("position");
    if (!pos) continue;
    const stride = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += stride) points.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  }
  if (points.length < 8) return { x: 0, z: 0, radius: 0.2 };
  let height = 0;
  for (const point of points) height = Math.max(height, point.y);
  const slices = 8;
  const bands: { y: number; n: number; cx: number; cz: number; p90: number }[] = [];
  for (let i = 0; i < slices; i++) {
    const y0 = (height * i) / slices;
    const y1 = (height * (i + 1)) / slices;
    const slice = points.filter((point) => point.y >= y0 && point.y < y1 + (i === slices - 1 ? 1e-4 : 0));
    if (slice.length < 8) continue;
    const center = centroid(slice);
    const dists = slice.map((point) => Math.hypot(point.x - center.x, point.z - center.z)).sort((a, b) => a - b);
    bands.push({
      y: y0,
      n: slice.length,
      cx: center.x,
      cz: center.z,
      p90: dists[Math.floor(dists.length * 0.9)] ?? 0,
    });
  }
  const base = bands[0];
  if (!base) return { x: 0, z: 0, radius: 0.2 };
  const limit = Math.max(base.p90 * 1.8, 0.05);
  const trunk = [];
  for (const band of bands) {
    if (band.y > height * 0.5) break;
    if (trunk.length > 0 && band.p90 > limit) break;
    trunk.push(band);
  }
  const yMax = (trunk.length ? trunk[trunk.length - 1]! : base).y + height / slices;
  const used = points.filter((point) => point.y <= yMax);
  const center = centroid(used.length ? used : points);
  const dists = (used.length ? used : points).map((point) => Math.hypot(point.x - center.x, point.z - center.z)).sort((a, b) => a - b);
  const radius = dists[Math.floor(dists.length * 0.6)] ?? base.p90;
  return { x: center.x, z: center.z, radius: Math.max(radius, 0.04) };
}

function centroid(points: readonly { x: number; z: number }[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    z += point.z;
  }
  return { x: x / points.length, z: z / points.length };
}

/**
 * World offset of the anchor after yaw and scale. Subtract it from the
 * instance position so the trunk lands on the collider.
 * Matches THREE.Object3D rotation.y (x' = x cos θ + z sin θ, z' = -x sin θ + z cos θ).
 */
export function worldAnchorShift(
  anchor: { x: number; z: number },
  yaw: number,
  scaleX: number,
  scaleZ: number,
): { x: number; z: number } {
  const ox = anchor.x * scaleX;
  const oz = anchor.z * scaleZ;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: ox * cos + oz * sin, z: -ox * sin + oz * cos };
}

/** Instance whose anchor sits on (x, z), on the ground at y. */
export function anchoredInstance(
  template: PropTemplate,
  x: number,
  z: number,
  y: number,
  yaw: number,
  scale: number | { x: number; y: number; z: number },
): PropInstance {
  const scaleX = typeof scale === "number" ? scale : scale.x;
  const scaleZ = typeof scale === "number" ? scale : scale.z;
  const scale3 = typeof scale === "number" ? undefined : scale;
  const shift = worldAnchorShift(template.anchor, yaw, scaleX, scaleZ);
  return {
    x: x - shift.x,
    y,
    z: z - shift.z,
    yaw,
    scale: typeof scale === "number" ? scale : 1,
    scale3,
    shadeX: x,
    shadeZ: z,
  };
}

function boundsOf(parts: PropTemplate["parts"]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const local = part.geometry.boundingBox;
    if (local) box.union(local);
  }
  return box;
}

function expandQuantized(geometry: THREE.BufferGeometry): void {
  for (const name of ["position", "normal", "tangent"] as const) {
    const attr = geometry.getAttribute(name);
    if (!attr) continue;
    // InterleavedBufferAttribute is not a BufferAttribute. Meshopt files use it,
    // and skipping it left the normalized int16 positions in place.
    const floatsAlready = attr.array instanceof Float32Array && !attr.normalized;
    if (floatsAlready) continue;
    const itemSize = attr.itemSize;
    const floats = new Float32Array(attr.count * itemSize);
    for (let i = 0; i < attr.count; i++) {
      const offset = i * itemSize;
      floats[offset] = attr.getX(i);
      if (itemSize > 1) floats[offset + 1] = attr.getY(i);
      if (itemSize > 2) floats[offset + 2] = attr.getZ(i);
      if (itemSize > 3) floats[offset + 3] = attr.getW(i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(floats, itemSize));
  }
}

function keepHeroPlant(parts: PropTemplate["parts"]): PropTemplate["parts"] {
  if (parts.length < 2) return parts;
  const boxes = parts.map((part) => {
    part.geometry.computeBoundingBox();
    return part.geometry.boundingBox?.clone() ?? new THREE.Box3();
  });
  let hero = 0;
  let heroHeight = -1;
  boxes.forEach((box, index) => {
    const height = box.max.y - box.min.y;
    if (height > heroHeight) {
      heroHeight = height;
      hero = index;
    }
  });
  const core = boxes[hero]!.clone();
  const padX = Math.max(0.05, (core.max.x - core.min.x) * 0.08);
  const padZ = Math.max(0.05, (core.max.z - core.min.z) * 0.08);
  core.min.x -= padX;
  core.max.x += padX;
  core.min.z -= padZ;
  core.max.z += padZ;
  const kept = parts.filter((_, index) => {
    const center = boxes[index]!.getCenter(new THREE.Vector3());
    return center.x >= core.min.x && center.x <= core.max.x && center.z >= core.min.z && center.z <= core.max.z;
  });
  return kept.length > 0 ? kept : [parts[hero]!];
}

function prepareMaterial(material: THREE.Material): THREE.Material {
  material.userData.keep = true;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.envMapIntensity = Math.max(material.envMapIntensity, 0.85);
    if (material.transparent || material.alphaTest > 0) {
      material.alphaTest = Math.max(material.alphaTest, 0.35);
      material.transparent = false;
      material.depthWrite = true;
      material.side = THREE.DoubleSide;
    }
    for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]) {
      if (tex) tex.userData.keep = true;
    }
  }
  return material;
}

export function scatter(
  parent: THREE.Object3D,
  template: PropTemplate,
  items: readonly PropInstance[],
  options?: { shadow?: boolean; cast?: boolean },
): void {
  if (items.length === 0) return;
  const dummy = new THREE.Object3D();
  const cast = options?.cast !== false;
  for (const part of template.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
    const alpha =
      part.material instanceof THREE.MeshStandardMaterial
        ? part.material.alphaTest > 0
        : Array.isArray(part.material) && part.material.some((m) => m instanceof THREE.MeshStandardMaterial && m.alphaTest > 0);
    mesh.castShadow = cast && !alpha;
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.yaw ?? 0, 0);
      if (item.scale3) dummy.scale.set(item.scale3.x, item.scale3.y, item.scale3.z);
      else dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }
  if (options?.shadow !== false) {
    const blobs = items.map((item) => {
      const span = item.scale3
        ? Math.max(template.size.x * item.scale3.x, template.size.z * item.scale3.z) * 0.55
        : template.radius * item.scale * 1.35;
      return {
        x: item.shadeX ?? item.x,
        z: item.shadeZ ?? item.z,
        y: item.y + 0.03,
        radius: Math.max(0.4, span),
      };
    });
    addBlobShadows(parent, blobs);
  }
}

export function addBlobShadows(
  parent: THREE.Object3D,
  blobs: readonly { x: number; y?: number; z: number; radius: number }[],
): void {
  if (blobs.length === 0) return;
  const geo = shadowGeometry();
  const mat = shadowMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, blobs.length);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  blobs.forEach((blob, index) => {
    dummy.position.set(blob.x, blob.y ?? 0.03, blob.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(blob.radius * 2, 1, blob.radius * 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

/** Crates, barrels, and pallet loads share one placement rule across yards. */
export function placeCargo(
  parent: THREE.Object3D,
  solids: readonly ScatterSolid[],
  props: Record<string, PropTemplate>,
): void {
  const place = (look: string, template: PropTemplate | undefined, heightMul = 1) => {
    if (!template) return;
    scatter(
      parent,
      template,
      solids
        .filter((solid) => solid.look === look)
        .map((solid) =>
          anchoredInstance(template, solid.x, solid.z, solidFoot(solid), solid.yaw, (solid.hy * 2 * heightMul) / template.height),
        ),
    );
  };
  place("crate", props.crate);
  place("barrel", props.barrel);
  place("pallet", props.crate, 0.72);
}

/** Stable yaw so reloads do not reshuffle the forest. */
export function hashYaw(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * Math.PI * 2;
}

export function solidFoot(solid: ScatterSolid): number {
  return Math.max(0, solid.y - solid.hy);
}

function shadowGeometry(): THREE.BufferGeometry {
  if (shadowGeo) return shadowGeo;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.userData.keep = true;
  shadowGeo = geo;
  return geo;
}

function shadowMaterial(): THREE.Material {
  if (shadowMat) return shadowMat;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const alpha = falloff * falloff * 150;
      const i = (y * size + x) * 4;
      data[i] = 12;
      data[i + 1] = 14;
      data[i + 2] = 10;
      data[i + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  texture.userData.keep = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  material.userData.keep = true;
  shadowMat = material;
  return material;
}
