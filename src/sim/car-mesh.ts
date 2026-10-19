import * as THREE from "three";
import { LIDAR_LOCAL } from "./sensors";
import { tireTexture } from "./textures";

export interface WheelVisual {
  /** Steers about +Y. The knuckle and arms live here and do not spin. */
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

const PAINT = 0x0f6e66;
const PAINT_DARK = 0x0a3e3c;

/**
 * Compact autonomous research car inside the existing chassis collider.
 * The lidar puck is placed at `LIDAR_LOCAL` so the rays leave the visible sensor.
 */
export function createResearchCar(radius: number, width: number): CarVisual {
  const group = new THREE.Group();
  group.name = "chassis";

  const paint = new THREE.MeshPhysicalMaterial({
    color: PAINT,
    roughness: 0.24,
    metalness: 0.42,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });
  const paintDark = new THREE.MeshStandardMaterial({
    color: PAINT_DARK,
    roughness: 0.4,
    metalness: 0.35,
  });
  const aluminum = new THREE.MeshStandardMaterial({
    color: 0xb7bec6,
    roughness: 0.32,
    metalness: 0.86,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2a3036,
    roughness: 0.46,
    metalness: 0.72,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14181c,
    roughness: 0.62,
    metalness: 0.2,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x1b1d20,
    roughness: 0.92,
    metalness: 0.02,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb7e4ea,
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.38,
    transmission: 0,
  });
  const headlight = new THREE.MeshStandardMaterial({
    color: 0xfff6e4,
    emissive: 0xffe2a8,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.05,
  });
  const brakeLight = new THREE.MeshStandardMaterial({
    color: 0xff4d3a,
    emissive: 0xff2a18,
    emissiveIntensity: 0.15,
    roughness: 0.28,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffc56b,
    emissive: 0xff8e1f,
    emissiveIntensity: 0.7,
    roughness: 0.32,
  });
  const lidarGlow = new THREE.MeshStandardMaterial({
    color: 0x9dfff0,
    emissive: 0x1c8f86,
    emissiveIntensity: 1.15,
    roughness: 0.22,
  });

  const add = (mesh: THREE.Mesh) => {
    group.add(mesh);
    return mesh;
  };

  // Ladder frame and skid plate.
  add(box(1.18, 0.05, 2.16, dark)).position.set(0, -0.24, 0);
  const railL = add(box(0.06, 0.08, 2.05, steel));
  railL.position.set(-0.42, -0.2, 0);
  const railR = railL.clone();
  railR.position.x = 0.42;
  group.add(railR);

  // Body shell: tub, hood, rear deck. Kept inside the 1.28 × 0.68 × 2.28 collider.
  add(box(1.24, 0.2, 1.7, paint)).position.set(0, -0.06, -0.1);
  add(box(1.14, 0.14, 0.72, paint)).position.set(0, 0.04, 0.66);
  add(box(1.02, 0.08, 0.28, paintDark)).position.set(0, 0.0, 1.02);
  add(box(1.18, 0.12, 0.55, paintDark)).position.set(0, 0.02, -0.78);
  const splitter = add(box(1.2, 0.04, 0.18, dark));
  splitter.position.set(0, -0.14, 1.04);

  // Cabin. Glass sits on the shell faces so it stays attached.
  add(box(1.04, 0.34, 0.82, paintDark)).position.set(0, 0.2, -0.08);
  const windshield = add(box(0.9, 0.26, 0.045, glass));
  windshield.position.set(0, 0.24, 0.32);
  const sideGlassL = add(box(0.04, 0.2, 0.62, glass));
  sideGlassL.position.set(-0.5, 0.24, -0.06);
  const sideGlassR = sideGlassL.clone();
  sideGlassR.position.x = 0.5;
  group.add(sideGlassR);
  const rearGlass = add(box(0.86, 0.18, 0.04, glass));
  rearGlass.position.set(0, 0.26, -0.48);
  const roof = add(box(0.96, 0.03, 0.7, paint));
  roof.position.set(0, 0.38, -0.08);

  // Racing stripe and front plate.
  add(box(0.08, 0.015, 1.35, amber)).position.set(0, 0.135, 0.28);
  add(box(0.28, 0.08, 0.02, aluminum)).position.set(0, -0.02, 1.05);

  // Compute box and a small rear wing.
  add(box(0.48, 0.16, 0.32, dark)).position.set(0, 0.16, -0.78);
  const vent = add(box(0.34, 0.012, 0.2, aluminum));
  vent.position.set(0, 0.245, -0.78);
  const wing = add(box(1.08, 0.03, 0.2, paintDark));
  wing.position.set(0, 0.36, -0.9);
  for (const x of [-0.48, 0.48]) {
    const plate = add(box(0.03, 0.12, 0.16, paintDark));
    plate.position.set(x, 0.3, -0.9);
  }

  // Camera over the windshield header.
  const camBody = add(box(0.16, 0.07, 0.1, dark));
  camBody.position.set(0, 0.36, 0.28);
  const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 12), aluminum));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.36, 0.34);

  // Whip antenna on the rear deck, clear of the roof.
  const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.48, 6), aluminum));
  antenna.position.set(0.32, 0.48, -0.78);

  // Roll hoop and the lidar mast. The puck center is LIDAR_LOCAL.
  const hoop = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.018, 8, 18, Math.PI), steel));
  hoop.position.set(0, 0.22, -0.5);
  hoop.rotation.y = Math.PI;
  const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.22, 10), steel));
  mast.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y - 0.12, LIDAR_LOCAL.z);
  const puck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.055, 28), dark));
  puck.name = "lidar-puck";
  puck.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y, LIDAR_LOCAL.z);
  const windowBand = add(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.012, 28), lidarGlow));
  windowBand.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y, LIDAR_LOCAL.z);
  const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), aluminum));
  cap.position.set(LIDAR_LOCAL.x, LIDAR_LOCAL.y + 0.032, LIDAR_LOCAL.z);

  // Headlights and brake lights. Materials are updated from throttle and brake.
  const lampGeo = new THREE.BoxGeometry(0.22, 0.09, 0.05);
  const headL = add(new THREE.Mesh(lampGeo, headlight));
  headL.position.set(-0.36, 0.02, 1.08);
  const headR = headL.clone();
  headR.position.x = 0.36;
  group.add(headR);
  const bezel = new THREE.BoxGeometry(0.26, 0.12, 0.02);
  const bezelL = add(new THREE.Mesh(bezel, dark));
  bezelL.position.set(-0.36, 0.02, 1.055);
  const bezelR = bezelL.clone();
  bezelR.position.x = 0.36;
  group.add(bezelR);

  const tailGeo = new THREE.BoxGeometry(0.26, 0.08, 0.04);
  const tailL = add(new THREE.Mesh(tailGeo, brakeLight));
  tailL.position.set(-0.4, 0.08, -1.04);
  const tailR = tailL.clone();
  tailR.position.x = 0.4;
  group.add(tailR);
  const tailCenter = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), brakeLight));
  tailCenter.position.set(0, 0.12, -1.02);

  // Mirrors.
  for (const x of [-0.62, 0.62]) {
    const mirror = add(box(0.1, 0.05, 0.14, dark));
    mirror.position.set(x, 0.2, 0.22);
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const posts = [
    { x: -0.71, z: 0.95, steered: true },
    { x: 0.71, z: 0.95, steered: true },
    { x: -0.71, z: -0.95, steered: false },
    { x: 0.71, z: -0.95, steered: false },
  ];
  const wheels = posts.map((post) => createWheel(radius, width, post.x, post.steered, { rubber, aluminum, steel, dark }));
  for (const wheel of wheels) group.add(wheel.steer);

  return { group, wheels, headlight, brakeLight };
}

function box(sx: number, sy: number, sz: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
}

function createWheel(
  radius: number,
  width: number,
  sideX: number,
  steered: boolean,
  mats: {
    rubber: THREE.MeshStandardMaterial;
    aluminum: THREE.MeshStandardMaterial;
    steel: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
  },
): WheelVisual {
  const steer = new THREE.Group();
  steer.name = "wheel";
  const spin = new THREE.Group();
  steer.add(spin);

  const tread = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width * 0.78, 28),
    new THREE.MeshStandardMaterial({ map: tireTexture(), color: 0x9a9ea3, roughness: 0.94, metalness: 0.02 }),
  );
  tread.rotation.z = Math.PI / 2;
  const sidewall = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, width, 24),
    mats.rubber,
  );
  sidewall.rotation.z = Math.PI / 2;
  spin.add(sidewall, tread);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 0.55, 20),
    mats.aluminum,
  );
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.9, 0.025, 0.03), mats.aluminum);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 6) * Math.PI;
    spin.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.14, radius * 0.14, width * 0.7, 12), mats.steel);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.02, 16), mats.steel);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -Math.sign(sideX) * width * 0.28;
  spin.add(disc);

  // Knuckle and a short control arm. They steer with the upright and stay put as the tire rolls.
  const outward = Math.sign(sideX) || 1;
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), mats.steel);
  knuckle.position.set(-outward * 0.02, 0, 0);
  steer.add(knuckle);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.04), mats.dark);
  arm.position.set(-outward * 0.2, -0.02, 0);
  steer.add(arm);
  if (steered) {
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), mats.steel);
    link.position.set(-outward * 0.06, -0.04, -0.12);
    steer.add(link);
  }
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), mats.steel);
  strut.position.set(-outward * 0.05, 0.12, 0);
  steer.add(strut);

  steer.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return { steer, spin };
}
