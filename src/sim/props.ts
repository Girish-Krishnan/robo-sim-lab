import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export interface PropTemplate {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[];
  height: number;
  radius: number;
}

export interface PropInstance {
  x: number;
  y: number;
  z: number;
  yaw?: number;
  scale: number;
}

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
  const pending = gltfLoader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${file}.glb`).then((gltf) => bake(gltf.scene));
  cache.set(file, pending);
  return pending;
}

export async function loadProps(files: readonly string[]): Promise<Record<string, PropTemplate>> {
  const entries = await Promise.all(files.map(async (file) => [file, await loadProp(file)] as const));
  return Object.fromEntries(entries);
}

function bake(root: THREE.Object3D): PropTemplate {
  root.updateMatrixWorld(true);
  const parts: PropTemplate["parts"] = [];
  const sources: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
    sources.push(obj.geometry);
    const materials = (Array.isArray(obj.material) ? obj.material : [obj.material]).map(prepareMaterial);
    parts.push({ geometry, material: materials.length === 1 ? materials[0]! : materials });
  });
  for (const geometry of sources) geometry.dispose();

  let box = new THREE.Box3();
  for (const part of parts) box.expandByObject(new THREE.Mesh(part.geometry));
  const size = box.getSize(new THREE.Vector3());
  // Photogrammetry logs lie along X. Stand trees and barrels up; turn a long
  // horizontal prop so its length follows local Z, which yaw then aims.
  if (size.x > size.y * 2 && size.x > size.z * 2) {
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (const part of parts) {
      part.geometry.applyMatrix4(turn);
      part.geometry.boundingBox = null;
      part.geometry.boundingSphere = null;
    }
    box = new THREE.Box3();
    for (const part of parts) box.expandByObject(new THREE.Mesh(part.geometry));
  }
  const center = box.getCenter(new THREE.Vector3());
  for (const part of parts) {
    part.geometry.translate(-center.x, -box.min.y, -center.z);
    part.geometry.boundingBox = null;
    part.geometry.boundingSphere = null;
    part.geometry.userData.keep = true;
  }
  const fitted = box.getSize(new THREE.Vector3());
  return {
    parts,
    height: Math.max(fitted.y, 0.01),
    radius: Math.max(fitted.x, fitted.z) * 0.5,
  };
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
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }
  if (options?.shadow !== false) {
    const blobs = items.map((item) => ({
      x: item.x,
      z: item.z,
      y: item.y + 0.03,
      radius: Math.max(0.4, template.radius * item.scale * 1.35),
    }));
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
        .map((solid) => ({
          x: solid.x,
          y: solidFoot(solid),
          z: solid.z,
          yaw: solid.yaw,
          scale: (solid.hy * 2 * heightMul) / template.height,
        })),
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
