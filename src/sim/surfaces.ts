import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import type { GraphicsQuality } from "./scene";

export type SurfaceName =
  | "asphalt"
  | "concrete"
  | "brick"
  | "forest"
  | "grass"
  | "bark"
  | "planks"
  | "metal";

/** Tiles per metre. The Poly Haven sweeps are about two metres across. */
export const TILES_PER_METER = 0.5;

const textures = new Map<string, THREE.Texture>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
let loader: KTX2Loader | null = null;

export function bindTextureLoader(renderer: THREE.WebGLRenderer): void {
  if (loader) return;
  loader = new KTX2Loader();
  loader.setTranscoderPath(`${import.meta.env.BASE_URL}basis/`);
  loader.detectSupport(renderer);
}

export function isKept(asset: { userData?: { keep?: boolean } }): boolean {
  return asset.userData?.keep === true;
}

function keep<T extends THREE.Texture | THREE.Material>(asset: T): T {
  asset.userData.keep = true;
  return asset;
}

async function loadMap(file: string, srgb: boolean): Promise<THREE.Texture> {
  const cached = textures.get(file);
  if (cached) return cached;
  if (!loader) throw new Error("Texture loader is not bound.");
  const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/textures/${file}.ktx2`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textures.set(file, keep(texture));
  return texture;
}

export interface PropKit {
  asphalt: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  planks: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  forest: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
}

const kits = new Map<GraphicsQuality, PropKit>();

export async function loadPropKit(quality: GraphicsQuality): Promise<PropKit> {
  const cached = kits.get(quality);
  if (cached) return cached;
  const [asphalt, concrete, brick, grass, bark, planks, metal, forest] = await Promise.all([
    surfaceMaterial("asphalt", quality, { roughness: 0.94, metalness: 0.03 }),
    surfaceMaterial("concrete", quality, { roughness: 0.9, metalness: 0.04 }),
    surfaceMaterial("brick", quality, { roughness: 0.84, metalness: 0.02 }),
    surfaceMaterial("grass", quality, { roughness: 1, metalness: 0 }),
    surfaceMaterial("bark", quality, { roughness: 0.96, metalness: 0 }),
    surfaceMaterial("planks", quality, { roughness: 0.78, metalness: 0.02, color: 0xf0ddc0 }),
    surfaceMaterial("metal", quality, { roughness: 0.32, metalness: 0.9 }),
    surfaceMaterial("forest", quality, { roughness: 1, metalness: 0 }),
  ]);
  const stone = concrete.clone();
  stone.color.set(0xc4c0b8);
  stone.roughness = 0.92;
  keep(stone);
  const kit = { asphalt, concrete, brick, grass, bark, planks, metal, forest, stone };
  kits.set(quality, kit);
  return kit;
}

async function surfaceMaterial(
  name: SurfaceName,
  quality: GraphicsQuality,
  opts: { color?: number; roughness: number; metalness: number },
): Promise<THREE.MeshStandardMaterial> {
  const key = `${name}:${quality}:${opts.color ?? 0xffffff}:${opts.roughness}:${opts.metalness}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const map = await loadMap(`${name}_diff`, true);
  let normalMap: THREE.Texture | null = null;
  let roughnessMap: THREE.Texture | null = null;
  if (quality === "high") {
    [normalMap, roughnessMap] = await Promise.all([loadMap(`${name}_nor`, false), loadMap(`${name}_rough`, false)]);
  }
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: normalMap ?? undefined,
    roughnessMap: roughnessMap ?? undefined,
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness,
    metalness: opts.metalness,
    normalScale: new THREE.Vector2(0.65, 0.65),
  });
  materials.set(key, keep(material));
  return material;
}

/** Stretch a geometry's 0–1 UVs so a shared repeat-wrapped map tiles in metres. */
export function tileUvs(geo: THREE.BufferGeometry, uScale: number, vScale: number): void {
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  uv.needsUpdate = true;
}

/** BoxGeometry face order is +x, −x, +y, −y, +z, −z. */
export function tileBox(geo: THREE.BufferGeometry, width: number, height: number, depth: number, tilesPerMeter = TILES_PER_METER): void {
  const uv = geo.getAttribute("uv");
  if (!uv || uv.count % 6 !== 0) return;
  const sx = width * tilesPerMeter;
  const sy = height * tilesPerMeter;
  const sz = depth * tilesPerMeter;
  const scales = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  const perFace = uv.count / 6;
  for (let face = 0; face < 6; face++) {
    const su = scales[face]?.[0] ?? 1;
    const sv = scales[face]?.[1] ?? 1;
    for (let vertex = 0; vertex < perFace; vertex++) {
      const index = face * perFace + vertex;
      uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv);
    }
  }
  uv.needsUpdate = true;
}

const forestGrounds = new Map<GraphicsQuality, THREE.MeshStandardMaterial>();

/**
 * One displaced ground: leafy grass everywhere, forest floor along the trail,
 * blended in the shader so the path has no hard edge.
 */
export async function forestGroundMaterial(quality: GraphicsQuality): Promise<THREE.MeshStandardMaterial> {
  const cached = forestGrounds.get(quality);
  if (cached) return cached;
  const material = await surfaceMaterial("forest", quality, { roughness: 1, metalness: 0 });
  const grassMap = await loadMap("grass_diff", true);
  const grassNormal = quality === "high" ? await loadMap("grass_nor", false) : null;
  const grassRough = quality === "high" ? await loadMap("grass_rough", false) : null;
  const blended = material.clone();
  blended.customProgramCacheKey = () => `forest-ground-${quality}`;
  blended.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: grassMap };
    shader.uniforms.grassNormalMap = { value: grassNormal };
    shader.uniforms.grassRoughnessMap = { value: grassRough };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>",
    );
    shader.vertexShader = `varying vec3 vWorld;\n${shader.vertexShader}`;
    const extraMaps =
      quality === "high"
        ? "uniform sampler2D grassNormalMap;\nuniform sampler2D grassRoughnessMap;"
        : "";
    shader.fragmentShader = `
      varying vec3 vWorld;
      uniform sampler2D grassMap;
      ${extraMaps}
      float forestDirt(vec3 p) {
        float along = p.x - sin(p.z * 0.09) * 1.2;
        float trail = exp(-along * along / 16.0);
        return smoothstep(0.1, 0.62, trail);
      }
      ${shader.fragmentShader}
    `;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #ifdef USE_MAP
        float dirtWeight = forestDirt(vWorld);
        vec4 floorTex = texture2D(map, vMapUv);
        vec4 grassTex = texture2D(grassMap, vMapUv * 1.17);
        vec4 sampledDiffuseColor = mix(grassTex, floorTex, dirtWeight);
        diffuseColor *= sampledDiffuseColor;
      #endif
      `,
    );
    if (quality === "high") {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `
        #ifdef USE_NORMALMAP_OBJECTSPACE
          normal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          normal = normalize(normalMatrix * normal);
        #elif defined( USE_NORMALMAP_TANGENTSPACE )
          float dirtWeightN = forestDirt(vWorld);
          vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          vec3 grassN = texture2D(grassNormalMap, vNormalMapUv * 1.17).xyz * 2.0 - 1.0;
          mapN = mix(grassN, mapN, dirtWeightN);
          mapN.xy *= normalScale;
          normal = normalize(tbn * mapN);
        #elif defined( USE_BUMPMAP )
          normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
        #endif
        `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          float dirtWeightR = forestDirt(vWorld);
          float floorR = texture2D(roughnessMap, vRoughnessMapUv).g;
          float grassR = texture2D(grassRoughnessMap, vRoughnessMapUv * 1.17).g;
          roughnessFactor *= mix(grassR, floorR, dirtWeightR);
        #endif
        `,
      );
    }
  };
  forestGrounds.set(quality, keep(blended));
  return blended;
}
