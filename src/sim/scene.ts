import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type RAPIER from "@dimforge/rapier3d-compat";

export type GraphicsQuality = "low" | "high";

export interface Atmosphere {
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  exposure: number;
  zenith: string;
  horizon: string;
  skyGround: string;
  /** High quality uses the HDRI as the visible sky. Warehouse keeps the interior gradient. */
  hdriBackground?: boolean;
}

export const CITY_ATMOSPHERE: Atmosphere = {
  background: "#8eabc8",
  fog: "#b9c6d4",
  fogNear: 55,
  fogFar: 190,
  hemiSky: 0xc5daf0,
  hemiGround: 0x6d8a52,
  hemiIntensity: 0.85,
  sunColor: 0xfff1d4,
  sunIntensity: 3.1,
  exposure: 1.12,
  zenith: "#5480b8",
  horizon: "#edddb8",
  skyGround: "#8c8578",
};

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
  private readonly hemi: THREE.HemisphereLight;
  private readonly sunTarget = new THREE.Object3D();
  private readonly sky: THREE.ShaderMaterial;
  private readonly skyMesh: THREE.Mesh;
  private readonly roomEnvironment: THREE.Texture;
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private hdriEnvironment: THREE.Texture | null = null;
  private quality: GraphicsQuality = "high";
  private atmosphere: Atmosphere = CITY_ATMOSPHERE;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(viewport: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = CITY_ATMOSPHERE.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    viewport.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    this.scene.background = new THREE.Color(CITY_ATMOSPHERE.background);
    this.scene.fog = new THREE.Fog(CITY_ATMOSPHERE.fog, CITY_ATMOSPHERE.fogNear, CITY_ATMOSPHERE.fogFar);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.roomEnvironment;
    this.scene.environmentIntensity = 1;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(CITY_ATMOSPHERE.hemiSky, CITY_ATMOSPHERE.hemiGround, CITY_ATMOSPHERE.hemiIntensity);
    this.scene.add(this.hemi);
    const fill = new THREE.DirectionalLight(0xc9d7ea, 0.35);
    fill.position.set(-12, 8, -8);
    this.scene.add(fill);

    this.sun = new THREE.DirectionalLight(CITY_ATMOSPHERE.sunColor, CITY_ATMOSPHERE.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.sky = createSky(CITY_ATMOSPHERE);
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 28, 16), this.sky);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);
  }

  /** Image-based lighting from a CC0 Poly Haven sky. Safe to call before the first frame. */
  loadHdri(): Promise<void> {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    return new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}assets/hdri/kloofendal_1k.hdr`).then((hdr) => {
      this.hdriEnvironment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
      this.applyEnvironment();
    });
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    const ratio = quality === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(ratio);
    const size = quality === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.radius = quality === "high" ? 3 : 1;
    if (quality === "high") this.ensureComposer();
    this.applyEnvironment();
    this.resize(this.viewportWidth, this.viewportHeight);
  }

  setAtmosphere(atmosphere: Atmosphere): void {
    this.atmosphere = atmosphere;
    this.scene.fog = new THREE.Fog(atmosphere.fog, atmosphere.fogNear, atmosphere.fogFar);
    this.hemi.color.set(atmosphere.hemiSky);
    this.hemi.groundColor.set(atmosphere.hemiGround);
    this.hemi.intensity = atmosphere.hemiIntensity;
    this.sun.color.set(atmosphere.sunColor);
    this.sun.intensity = atmosphere.sunIntensity;
    this.renderer.toneMappingExposure = atmosphere.exposure;
    this.sky.uniforms.zenith!.value.set(atmosphere.zenith);
    this.sky.uniforms.horizon!.value.set(atmosphere.horizon);
    this.sky.uniforms.below!.value.set(atmosphere.skyGround);
    this.applyEnvironment();
  }

  private applyEnvironment(): void {
    const hdri = this.quality === "high" && this.hdriEnvironment;
    this.scene.environment = hdri ? this.hdriEnvironment : this.roomEnvironment;
    this.scene.environmentIntensity = hdri ? 1.05 : 0.85;
    const showSky = Boolean(hdri) && this.atmosphere.hdriBackground !== false;
    if (showSky && this.hdriEnvironment) {
      this.scene.background = this.hdriEnvironment;
      this.skyMesh.visible = false;
    } else {
      this.scene.background = new THREE.Color(this.atmosphere.background);
      this.skyMesh.visible = true;
    }
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.gtao?.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
  }

  followSun(x: number, z: number): void {
    this.sun.position.set(x + 16, 26, z + 8);
    this.sunTarget.position.set(x, 0, z);
    this.sunTarget.updateMatrixWorld();
  }

  render(): void {
    if (this.quality === "high" && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private ensureComposer(): void {
    if (this.composer) return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const gtao = new GTAOPass(this.scene, this.camera, this.viewportWidth, this.viewportHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.42;
    composer.addPass(gtao);
    this.gtao = gtao;
    const bloom = new UnrealBloomPass(new THREE.Vector2(this.viewportWidth, this.viewportHeight), 0.1, 0.32, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(this.viewportWidth, this.viewportHeight);
    this.composer = composer;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

/** Flat physics ground. Each environment draws its own surface on top. */
export function addPhysicsGround(RAPIER: Rapier, world: InstanceType<Rapier["World"]>): void {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(110, 0.5, 110).setFriction(1.05).setRestitution(0.02),
    body,
  );
}

function createSky(atmosphere: Atmosphere): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(atmosphere.zenith) },
      horizon: { value: new THREE.Color(atmosphere.horizon) },
      below: { value: new THREE.Color(atmosphere.skyGround) },
    },
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
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 below;
      void main() {
        float h = normalize(vDir).y;
        vec3 mid = mix(horizon, zenith, 0.45);
        vec3 col = mix(mid, zenith, smoothstep(0.05, 0.75, h));
        col = mix(horizon, col, smoothstep(0.0, 0.18, abs(h)));
        col = mix(below, col, smoothstep(-0.25, 0.02, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return material;
}
