import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

(globalThis as { self?: typeof globalThis }).self ??= globalThis;
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { bakeObject } from "../src/sim/props";

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.setKTX2Loader({
  load(_url: string, onLoad: (texture: THREE.Texture) => void) {
    const texture = new THREE.DataTexture(new Uint8Array([180, 160, 120, 255]), 1, 1);
    texture.needsUpdate = true;
    onLoad(texture);
  },
} as unknown as THREE.Loader);

async function loadTemplate(file: string) {
  const buf = readFileSync(`public/assets/models/${file}`);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await loader.parseAsync(bytes, "");
  return bakeObject(gltf.scene);
}

/** Meters, after bake. Radius is half the longer horizontal side. */
const EXPECTED: Record<string, { height: [number, number]; radius: [number, number]; upright?: boolean }> = {
  broadleaf: { height: [2.6, 4.2], radius: [1.4, 2.5], upright: true },
  pine: { height: [1.0, 1.8], radius: [0.2, 0.75], upright: true },
  bushy: { height: [1.6, 2.8], radius: [0.5, 1.4], upright: true },
  shrub: { height: [1.2, 2.2], radius: [0.4, 1.3], upright: true },
  fern: { height: [0.25, 0.7], radius: [0.25, 0.8] },
  grass: { height: [0.2, 0.6], radius: [0.05, 0.4] },
  boulder: { height: [0.6, 1.4], radius: [0.5, 1.3] },
  rock: { height: [0.08, 0.3], radius: [0.05, 0.3] },
  log: { height: [0.15, 0.5], radius: [1.1, 1.9] },
  barrel: { height: [0.6, 1.15], radius: [0.15, 0.45], upright: true },
  crate: { height: [0.25, 0.6], radius: [0.2, 0.6] },
  bench: { height: [0.6, 1.2], radius: [0.3, 0.8] },
  lamp: { height: [3.2, 4.6], radius: [0.15, 0.6], upright: true },
  manhole: { height: [0.02, 0.2], radius: [0.25, 0.5] },
};

describe("scanned props", () => {
  it("keeps a scaled normalized mesh in meters instead of wrapping it", () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const position = box.geometry.getAttribute("position");
    const ints = new Int16Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      ints[i * 3] = Math.round(position.getX(i) * 32767);
      ints[i * 3 + 1] = Math.round(position.getY(i) * 32767);
      ints[i * 3 + 2] = Math.round(position.getZ(i) * 32767);
    }
    box.geometry.setAttribute("position", new THREE.Int16BufferAttribute(ints, 3, true));
    box.scale.set(0.4, 3, 0.4);
    const template = bakeObject(box);
    expect(template.height).toBeGreaterThan(5.5);
    expect(template.height).toBeLessThan(6.5);
    expect(template.radius).toBeGreaterThan(0.3);
    expect(template.radius).toBeLessThan(0.55);
  });

  const files = readdirSync("public/assets/models").filter((name) => name.endsWith(".glb"));

  it("loads every shipped model", () => {
    expect(files.map((name) => name.replace(".glb", "")).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const file of Object.keys(EXPECTED)) {
    it(`${file} is upright and within its real dimensions`, async () => {
      const spec = EXPECTED[file]!;
      const template = await loadTemplate(`${file}.glb`);
      expect(template.parts.length).toBeGreaterThan(0);
      expect(template.height).toBeGreaterThan(spec.height[0]);
      expect(template.height).toBeLessThan(spec.height[1]);
      expect(template.radius).toBeGreaterThan(spec.radius[0]);
      expect(template.radius).toBeLessThan(spec.radius[1]);
      expect(template.height).toBeLessThan(8);
      expect(template.radius).toBeLessThan(4);
      if (spec.upright) expect(template.height).toBeGreaterThan(template.radius);
      for (const part of template.parts) {
        const position = part.geometry.getAttribute("position");
        expect(position.array).toBeInstanceOf(Float32Array);
        expect(position.normalized).toBe(false);
      }
    });
  }
});
