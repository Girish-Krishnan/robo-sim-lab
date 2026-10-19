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

const paint = new THREE.MeshPhysicalMaterial({
  color: 0xf2f4f6,
  roughness: 0.18,
  metalness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.35,
});
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
  color: 0x9aa0a6,
  roughness: 0.42,
  metalness: 0.72,
  envMapIntensity: 1.15,
});
const aluminum = new THREE.MeshPhysicalMaterial({
  color: 0xd5dbe2,
  roughness: 0.22,
  metalness: 1,
  envMapIntensity: 1.4,
});
const steel = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.38, metalness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.55, metalness: 0.25 });
const rubber = new THREE.MeshStandardMaterial({
  color: 0x1a1c1f,
  roughness: 0.86,
  metalness: 0.02,
  normalMap: treadNormal(),
  normalScale: new THREE.Vector2(0.7, 0.7),
});
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xb9d7de,
  roughness: 0.04,
  metalness: 0,
  transparent: true,
  opacity: 0.45,
  envMapIntensity: 1.5,
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
 * Open-wheel research car in the spirit of an F1TENTH stack: molded shell,
 * carbon floor, exposed shocks, and a Hokuyo-style puck on the ray origin.
 * Geometry stays inside the existing chassis collider.
 */
export function createResearchCar(radius: number, width: number): CarVisual {
  const group = new THREE.Group();
  group.name = "chassis";

  const plate = solid(
    new THREE.ExtrudeGeometry(roundedRect(0.92, 1.85, 0.12), {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 6,
    }),
    carbon,
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -0.2;
  group.add(plate);

  const shell = solid(bodyShell(), paint);
  shell.position.y = 0.0;
  group.add(shell);

  const stripe = solid(new THREE.BoxGeometry(0.07, 0.02, 1.35), orange);
  stripe.position.set(0, 0.3, 0.02);
  group.add(stripe);
  const splitter = solid(new THREE.BoxGeometry(0.78, 0.018, 0.28), carbon);
  splitter.position.set(0, -0.16, 0.98);
  group.add(splitter);
  for (const x of [-0.42, 0.42]) {
    const pod = solid(new THREE.BoxGeometry(0.16, 0.1, 0.72), paint);
    pod.position.set(x, -0.02, -0.05);
    group.add(pod);
  }
  const wing = solid(new THREE.BoxGeometry(0.78, 0.018, 0.16), paint);
  wing.position.set(0, 0.34, -0.78);
  const wingLip = solid(new THREE.BoxGeometry(0.78, 0.012, 0.04), orange);
  wingLip.position.set(0, 0.35, -0.86);
  group.add(wing, wingLip);
  for (const x of [-0.36, 0.36]) {
    const plate = solid(new THREE.BoxGeometry(0.018, 0.16, 0.14), dark);
    plate.position.set(x, 0.24, -0.78);
    group.add(plate);
  }
  for (const [x, z] of [
    [-0.71, 0.95],
    [0.71, 0.95],
    [-0.71, -0.95],
    [0.71, -0.95],
  ] as const) {
    const arch = solid(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint);
    arch.scale.set(0.72, 0.42, 1.05);
    arch.position.set(x, -0.08, z);
    group.add(arch);
  }

  const cockpit = solid(new THREE.SphereGeometry(0.28, 24, 16), glass);
  cockpit.scale.set(1.15, 0.55, 1.6);
  cockpit.position.set(0, 0.16, -0.05);
  group.add(cockpit);

  const cowl = solid(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint);
  cowl.scale.set(1.5, 0.45, 1.1);
  cowl.position.set(0, 0.1, -0.55);
  group.add(cowl);

  // LiPo and the onboard computer, with cooling fins.
  const battery = solid(new THREE.BoxGeometry(0.34, 0.08, 0.16), dark);
  battery.position.set(0, -0.12, -0.35);
  group.add(battery);
  const computer = solid(new THREE.BoxGeometry(0.28, 0.07, 0.18), aluminum);
  computer.position.set(0, -0.08, -0.62);
  group.add(computer);
  for (let i = 0; i < 5; i++) {
    const fin = solid(new THREE.BoxGeometry(0.26, 0.012, 0.012), aluminum);
    fin.position.set(0, -0.04 + i * 0.004, -0.62);
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
  const rim = solid(rimGeo, aluminum);
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  const barrel = solid(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width * 0.2, 20), steel);
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);
  const sidewall = solid(new THREE.TorusGeometry(radius * 0.9, 0.012, 6, 24), aluminum);
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

function bodyShell(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.04, -0.92),
    new THREE.Vector2(0.22, -0.78),
    new THREE.Vector2(0.4, -0.45),
    new THREE.Vector2(0.48, -0.05),
    new THREE.Vector2(0.5, 0.28),
    new THREE.Vector2(0.42, 0.58),
    new THREE.Vector2(0.24, 0.82),
    new THREE.Vector2(0.06, 0.98),
  ];
  const geo = new THREE.LatheGeometry(pts, 36);
  // +Y along the lathe is the nose. +90° about X lays that axis onto +Z.
  geo.rotateX(Math.PI / 2);
  geo.scale(1.02, 0.62, 1.12);
  geo.computeVertexNormals();
  return geo;
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
      const groove = x % 8 < 2;
      const i = (y * w + x) * 4;
      data[i] = 128;
      data[i + 1] = groove ? 80 : 160;
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
