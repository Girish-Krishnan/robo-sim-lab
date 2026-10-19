import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type RAPIER from "@dimforge/rapier3d-compat";
import { asphaltTexture, padTexture } from "./textures";

type Rapier = typeof RAPIER;

/**
 * WebGL2 renderer (Three.js WebGLRenderer), not WebGPURenderer.
 * Shadow maps and MeshStandardMaterial are predictable here, and the
 * verification browser does not depend on a WebGPU adapter. Swap this
 * file for `WebGPURenderer` later; physics and the student API do not
 * import it.
 */
export class SimView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunTarget = new THREE.Object3D();

  constructor(viewport: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    viewport.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    this.scene.background = new THREE.Color("#8eabc8");
    this.scene.fog = new THREE.Fog("#b9c6d4", 60, 200);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xc5daf0, 0x6d8a52, 0.85));
    const fill = new THREE.DirectionalLight(0xc9d7ea, 0.35);
    fill.position.set(-12, 8, -8);
    this.scene.add(fill);

    this.sun = new THREE.DirectionalLight(0xfff1d4, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.scene.add(createSky());
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  followSun(x: number, z: number): void {
    this.sun.position.set(x + 16, 26, z + 8);
    this.sunTarget.position.set(x, 0, z);
    this.sunTarget.updateMatrixWorld();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function addGround(RAPIER: Rapier, world: InstanceType<Rapier["World"]>, scene: THREE.Scene): void {
  const asphalt = asphaltTexture();
  asphalt.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(220, 1, 220),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.94, metalness: 0.02, color: 0xffffff }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshStandardMaterial({
      map: padTexture(),
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  scene.add(pad);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(110, 0.5, 110).setFriction(1.05).setRestitution(0.02),
    body,
  );
}

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 zenith = vec3(0.33, 0.50, 0.72);
        vec3 mid = vec3(0.55, 0.69, 0.84);
        vec3 horizon = vec3(0.93, 0.84, 0.72);
        vec3 below = vec3(0.55, 0.52, 0.47);
        vec3 col = mix(mid, zenith, smoothstep(0.05, 0.75, h));
        col = mix(horizon, col, smoothstep(0.0, 0.16, abs(h)));
        col = mix(below, col, smoothstep(-0.2, 0.02, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 28, 16), material);
  sky.frustumCulled = false;
  return sky;
}
