import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

type Rapier = typeof RAPIER;
type World = InstanceType<Rapier["World"]>;

/**
 * Translucent copies of the physics colliders, so a trunk with no body
 * shows up as a hole in the shade. The ground slab and the car are skipped.
 */
export class BlockedAreas {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  readonly root: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.group.name = "blocked-areas";
    this.material = new THREE.MeshBasicMaterial({
      color: 0xff4d3a,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.root = this.group;
    scene.add(this.group);
    this.group.visible = false;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  rebuild(RAPIER: Rapier, world: World): void {
    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      child.removeFromParent();
    }
    world.forEachCollider((collider) => {
      const parent = collider.parent();
      if (parent && parent.bodyType() === RAPIER.RigidBodyType.Dynamic) return;
      const mesh = meshFor(RAPIER, collider);
      if (!mesh) return;
      mesh.material = this.material;
      const translation = collider.translation();
      const rotation = collider.rotation();
      mesh.position.set(translation.x, translation.y, translation.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      this.group.add(mesh);
    });
  }

  dispose(): void {
    this.rebuildPlaceholder();
    this.material.dispose();
    this.group.removeFromParent();
  }

  private rebuildPlaceholder(): void {
    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      child.removeFromParent();
    }
  }
}

function meshFor(RAPIER: Rapier, collider: InstanceType<Rapier["Collider"]>): THREE.Mesh | null {
  const kind = collider.shapeType();
  if (kind === RAPIER.ShapeType.Cuboid) {
    const half = collider.halfExtents();
    if (half.x > 40 || half.y > 40 || half.z > 40) return null;
    // Building bodies are this tall, and the visible roof and parapet sit
    // just above the physics box. Grow the shade so the roof reads as blocked.
    const roof = half.y > 1.5;
    const hx = roof ? half.x + 0.45 : half.x;
    const hy = roof ? half.y + 0.55 : half.y;
    const hz = roof ? half.z + 0.45 : half.z;
    const geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
    if (roof) geometry.translate(0, 0.55, 0);
    return new THREE.Mesh(geometry);
  }
  if (kind === RAPIER.ShapeType.Ball) {
    return new THREE.Mesh(new THREE.SphereGeometry(collider.radius(), 16, 12));
  }
  if (kind === RAPIER.ShapeType.Cylinder) {
    const height = collider.halfHeight() * 2;
    return new THREE.Mesh(new THREE.CylinderGeometry(collider.radius(), collider.radius(), height, 16));
  }
  if (kind === RAPIER.ShapeType.Cone) {
    const height = collider.halfHeight() * 2;
    return new THREE.Mesh(new THREE.ConeGeometry(collider.radius(), height, 16));
  }
  return null;
}
