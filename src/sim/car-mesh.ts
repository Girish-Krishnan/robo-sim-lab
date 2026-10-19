import * as THREE from "three";
import { LIDAR_LOCAL } from "./sensors";

export interface WheelVisual {
  /** Steers about +Y. The knuckle, arms, and shock stay here and do not spin. */
  steer: THREE.Group;
  /** Rolls about the axle. Tire, rim, and disc only. */
  spin: THREE.Group;
}

export interface CarVisual {
  group: THREE.Group;
  wheels: WheelVisual[];
  headlight: THREE.MeshStandardMaterial;
  brakeLight: THREE.MeshStandardMaterial;
}

const orange = new THREE.MeshPhysicalMaterial({
  color: 0xe4572e,
  roughness: 0.32,
  metalness: 0.05,
  clearcoat: 0.6,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.1,
});
const carbon = new THREE.MeshPhysicalMaterial({
  map: carbonTexture(),
  color: 0x1c2024,
  roughness: 0.72,
  metalness: 0.15,
  envMapIntensity: 0.25,
});
const aluminum = new THREE.MeshPhysicalMaterial({
  color: 0x9aa3ab,
  roughness: 0.38,
  metalness: 0.82,
  envMapIntensity: 0.7,
});
const beadlock = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.42, metalness: 0.7 });
const steel = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.38, metalness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.55, metalness: 0.25 });
const rubber = new THREE.MeshStandardMaterial({
  color: 0x16181b,
  roughness: 0.94,
  metalness: 0,
  normalMap: treadNormal(),
  normalScale: new THREE.Vector2(1.1, 1.1),
});
const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xfff6e4,
  emissive: 0xffe2a8,
  emissiveIntensity: 0.55,
  roughness: 0.16,
});
const brakeMat = new THREE.MeshStandardMaterial({
  color: 0xff4a38,
  emissive: 0xff2414,
  emissiveIntensity: 0.15,
  roughness: 0.28,
});
const lens = new THREE.MeshStandardMaterial({
  color: 0x101418,
  roughness: 0.08,
  metalness: 0.4,
  emissive: 0x14332f,
  emissiveIntensity: 0.35,
});

/**
 * F1TENTH-style electronics buggy: a low carbon chassis, battery and compute
 * on the deck, and a Hokuyo puck on a front standoff. No body shell.
 * Geometry stays inside the existing chassis collider.
 */
export function createResearchCar(radius: number, width: number): CarVisual {
  const group = new THREE.Group();
  group.name = "chassis";

  const plate = solid(
    new THREE.ExtrudeGeometry(roundedRect(1.02, 2.05, 0.06), {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 4,
    }),
    carbon,
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -0.2;
  group.add(plate);

  // Upper electronics deck. The shell and fender domes are intentionally absent.
  const deckPlate = solid(new THREE.BoxGeometry(0.72, 0.02, 1.55), carbon);
  deckPlate.position.set(0, -0.1, -0.05);
  group.add(deckPlate);
  const railGeo = new THREE.BoxGeometry(0.025, 0.04, 1.7);
  for (const x of [-0.42, 0.42]) {
    const rail = solid(railGeo, aluminum);
    rail.position.set(x, -0.14, 0);
    group.add(rail);
  }
  const bumper = solid(new THREE.BoxGeometry(0.78, 0.06, 0.05), dark);
  bumper.position.set(0, -0.12, 0.98);
  group.add(bumper);

  const battery = solid(new THREE.BoxGeometry(0.36, 0.09, 0.22), dark);
  battery.position.set(0, -0.04, -0.15);
  group.add(battery);
  const strap = solid(new THREE.BoxGeometry(0.38, 0.012, 0.03), orange);
  strap.position.set(0, 0.01, -0.15);
  group.add(strap);
  const computer = solid(new THREE.BoxGeometry(0.32, 0.08, 0.22), aluminum);
  computer.position.set(0, -0.04, -0.55);
  group.add(computer);
  for (let i = 0; i < 6; i++) {
    const fin = solid(new THREE.BoxGeometry(0.3, 0.008, 0.012), aluminum);
    fin.position.set(0, 0.012 + i * 0.01, -0.55);
    fin.castShadow = false;
    group.add(fin);
  }

  // Orange sensor tower, the usual F1TENTH printed mast.
  for (const x of [-0.08, 0.08]) {
    const post = solid(new THREE.CylinderGeometry(0.012, 0.014, 0.22, 10), orange);
    post.position.set(x, LIDAR_LOCAL.y - 0.12, LIDAR_LOCAL.z);
    group.add(post);
  }
  const deck = solid(new THREE.BoxGeometry(0.28, 0.012, 0.22), orange);
  deck.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y - 0.045, LIDAR_LOCAL.z);
  group.add(deck);

  // Hokuyo-style puck. Its center is the lidar ray origin.
  const puck = solid(new THREE.CylinderGeometry(0.17, 0.178, 0.07, 40), dark);
  puck.name = "lidar-puck";
  puck.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y, LIDAR_LOCAL.z);
  group.add(puck);
  const windowBand = solid(new THREE.CylinderGeometry(0.182, 0.182, 0.02, 40), lens);
  windowBand.position.copy(puck.position);
  group.add(windowBand);
  const cap = solid(new THREE.CylinderGeometry(0.13, 0.15, 0.014, 28), aluminum);
  cap.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y + 0.03, LIDAR_LOCAL.z);
  group.add(cap);
  const ears = solid(new THREE.BoxGeometry(0.34, 0.012, 0.06), dark);
  ears.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y - 0.03, LIDAR_LOCAL.z);
  group.add(ears);

  addCable(group, [
    new THREE.Vector3(0, -0.08, -0.55),
    new THREE.Vector3(0.12, -0.02, -0.2),
    new THREE.Vector3(0.06, LIDAR_LOCAL.y - 0.08, LIDAR_LOCAL.z - 0.05),
    new THREE.Vector3(LIDAR_LOCAL.x, LIDAR_LOCAL.y - 0.04, LIDAR_LOCAL.z),
  ]);

  const camera = solid(new THREE.BoxGeometry(0.08, 0.045, 0.06), dark);
  camera.position.set(0, 0.2, 0.42);
  const camLens = solid(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), aluminum);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 0.2, 0.46);
  group.add(camera, camLens);

  const antenna = solid(new THREE.CapsuleGeometry(0.006, 0.42, 2, 6), aluminum);
  antenna.position.set(0.22, 0.28, -0.7);
  antenna.rotation.z = -0.12;
  group.add(antenna);

  const headL = solid(new THREE.SphereGeometry(0.045, 16, 12), headlightMat);
  headL.scale.set(1.3, 0.85, 0.7);
  headL.position.set(-0.22, 0.02, 0.78);
  const headR = headL.clone();
  headR.position.x = 0.22;
  group.add(headL, headR);

  const tailL = solid(new THREE.BoxGeometry(0.12, 0.035, 0.02), brakeMat);
  tailL.position.set(-0.28, 0.04, -0.9);
  const tailR = tailL.clone();
  tailR.position.x = 0.28;
  group.add(tailL, tailR);

  const posts = [
    { x: -0.71, steered: true },
    { x: 0.71, steered: true },
    { x: -0.71, steered: false },
    { x: 0.71, steered: false },
  ];
  const wheels = posts.map((post) => createWheel(radius, width, post.x, post.steered));
  for (const wheel of wheels) group.add(wheel.steer);

  return { group, wheels, headlight: headlightMat, brakeLight: brakeMat };
}

function createWheel(radius: number, width: number, sideX: number, steered: boolean): WheelVisual {
  const steer = new THREE.Group();
  steer.name = "wheel";
  const spin = new THREE.Group();
  steer.add(spin);

  const tire = solid(tireGeometry(radius, width), rubber);
  tire.rotation.z = Math.PI / 2;
  spin.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.66, width * 0.42, 28);
  const rimMesh = solid(rimGeo, beadlock);
  rimMesh.rotation.z = Math.PI / 2;
  spin.add(rimMesh);
  const barrel = solid(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width * 0.2, 20), steel);
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);
  const sidewall = solid(new THREE.TorusGeometry(radius * 0.9, 0.014, 6, 24), rubber);
  sidewall.rotation.y = Math.PI / 2;
  spin.add(sidewall);
  for (let i = 0; i < 8; i++) {
    const spoke = solid(new THREE.BoxGeometry(radius * 0.52, 0.02, 0.032), aluminum);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 8) * Math.PI;
    spoke.castShadow = false;
    spin.add(spoke);
  }
  const hub = solid(new THREE.CylinderGeometry(radius * 0.12, radius * 0.14, width * 0.48, 16), aluminum);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  const nut = solid(new THREE.CylinderGeometry(0.02, 0.02, width * 0.55, 6), steel);
  nut.rotation.z = Math.PI / 2;
  spin.add(nut);
  const disc = solid(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.015, 20), steel);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -Math.sign(sideX || 1) * width * 0.22;
  spin.add(disc);

  const outward = Math.sign(sideX) || 1;
  const knuckle = solid(new THREE.BoxGeometry(0.07, 0.12, 0.08), aluminum);
  knuckle.position.set(-outward * 0.02, 0, 0);
  steer.add(knuckle);
  const arm = solid(new THREE.BoxGeometry(0.32, 0.018, 0.028), carbon);
  arm.position.set(-outward * 0.18, -0.03, 0);
  steer.add(arm);
  const upper = solid(new THREE.BoxGeometry(0.28, 0.014, 0.02), carbon);
  upper.position.set(-outward * 0.16, 0.06, 0);
  steer.add(upper);
  if (steered) {
    const link = solid(new THREE.CapsuleGeometry(0.01, 0.16, 2, 6), steel);
    link.rotation.x = Math.PI / 2;
    link.position.set(-outward * 0.05, -0.02, -0.12);
    steer.add(link);
  }
  const shock = new THREE.Group();
  shock.position.set(-outward * 0.1, 0.02, 0);
  shock.rotation.z = outward * 0.35;
  const body = solid(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), aluminum);
  body.position.y = 0.08;
  shock.add(body);
  const shaft = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), steel);
  shaft.position.y = 0.16;
  shock.add(shaft);
  for (let i = 0; i < 7; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0035, 6, 10), dark);
    coil.position.y = 0.04 + i * 0.016;
    coil.castShadow = false;
    shock.add(coil);
  }
  steer.add(shock);

  return { steer, spin };
}

function tireGeometry(radius: number, width: number): THREE.BufferGeometry {
  const half = width * 0.5;
  const pts = [
    new THREE.Vector2(radius * 0.62, -half),
    new THREE.Vector2(radius * 0.78, -half * 0.92),
    new THREE.Vector2(radius * 0.92, -half * 0.62),
    new THREE.Vector2(radius * 0.99, -half * 0.28),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius * 0.99, half * 0.28),
    new THREE.Vector2(radius * 0.92, half * 0.62),
    new THREE.Vector2(radius * 0.78, half * 0.92),
    new THREE.Vector2(radius * 0.62, half),
  ];
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

function addCable(group: THREE.Group, points: THREE.Vector3[]): void {
  const curve = new THREE.CatmullRomCurve3(points);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.008, 6, false), dark);
  cable.castShadow = false;
  group.add(cable);
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function carbonTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
      const thread = (x + y) % 4 === 0 ? 28 : 0;
      const shade = (cell ? 42 : 28) + thread;
      const i = (y * size + x) * 4;
      data[i] = shade;
      data[i + 1] = shade + 1;
      data[i + 2] = shade + 2;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 10);
  texture.needsUpdate = true;
  return texture;
}

function treadNormal(): THREE.DataTexture {
  const w = 64;
  const h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lug = x % 10 < 6 && y % 8 < 5;
      const i = (y * w + x) * 4;
      data[i] = 128;
      data[i + 1] = lug ? 196 : 70;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(8, 1);
  texture.needsUpdate = true;
  return texture;
}
