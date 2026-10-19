import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, ackermannAngles, clamp, yawFromQuaternion, type ControlCommand } from "../api";
import type { ChassisFocus, SimRobot, VehicleTelemetry } from "../robots/types";
import { forwardSpeed, SensorSuite } from "./sensors";

type Rapier = typeof RAPIER;

const SPAWN = { x: 5.4, y: 0.84, z: 0 };
const HALF = { x: 0.64, y: 0.34, z: 1.14 };
const WHEEL_RADIUS = 0.3;
const WHEEL_WIDTH = 0.2;
const CONNECTION_Y = -0.28;
const SUSPENSION_REST = 0.28;

const FULL_THROTTLE_FORCE = 560;
const HOLD_BRAKE = 12;
const MAX_SPEED = 11;
const REVERSE_SPEED = 5;
const STEER_RATE = 1.5;

/**
 * Rapier's raycast vehicle treats positive steer as a right turn when the
 * axle is −X and forward is +Z. The student API is the opposite (positive
 * is left), so wheel angles are negated at this boundary.
 */
const RAPIER_STEER_SIGN = -1;

export class AckermannBuggy implements SimRobot {
  readonly descriptor = ACKERMANN_BUGGY;

  private readonly body: InstanceType<Rapier["RigidBody"]>;
  private readonly vehicle: InstanceType<Rapier["DynamicRayCastVehicleController"]>;
  private readonly sensors: SensorSuite;
  private readonly chassis: THREE.Group;
  private readonly wheelMeshes: THREE.Group[] = [];
  private readonly steerQuat = new THREE.Quaternion();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly axle = new THREE.Vector3(-1, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);

  private command: ControlCommand = { steering: 0, throttle: 0 };
  private brake = 0;
  private steer = 0;

  constructor(
    RAPIER: Rapier,
    world: InstanceType<Rapier["World"]>,
    scene: THREE.Scene,
  ) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0.14)
        .setAngularDamping(0.85),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
        .setDensity(42)
        .setFriction(0.35)
        .setRestitution(0.02),
      this.body,
    );

    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;

    const direction = { x: 0, y: -1, z: 0 };
    const axle = { x: -1, y: 0, z: 0 };
    const halfBase = ACKERMANN_BUGGY.wheelbase / 2;
    const halfTrack = ACKERMANN_BUGGY.trackWidth / 2;
    const posts = [
      { x: -halfTrack, z: halfBase },
      { x: halfTrack, z: halfBase },
      { x: -halfTrack, z: -halfBase },
      { x: halfTrack, z: -halfBase },
    ];
    for (const post of posts) {
      this.vehicle.addWheel(
        { x: post.x, y: CONNECTION_Y, z: post.z },
        direction,
        axle,
        SUSPENSION_REST,
        WHEEL_RADIUS,
      );
    }
    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, 34);
      this.vehicle.setWheelSuspensionCompression(i, 2.6);
      this.vehicle.setWheelSuspensionRelaxation(i, 4.4);
      this.vehicle.setWheelFrictionSlip(i, 16);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.5);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.2);
      this.vehicle.setWheelMaxSuspensionForce(i, 16000);
    }

    this.chassis = createChassisMesh();
    scene.add(this.chassis);
    for (let i = 0; i < 4; i++) {
      const wheel = createWheelMesh(WHEEL_RADIUS, WHEEL_WIDTH);
      this.chassis.add(wheel);
      this.wheelMeshes.push(wheel);
    }
    this.syncVisuals();

    this.sensors = new SensorSuite(RAPIER, world, this.body, this.vehicle, WHEEL_RADIUS);
  }

  reset(): void {
    this.command = { steering: 0, throttle: 0 };
    this.brake = 0;
    this.steer = 0;
    this.body.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelEngineForce(i, 0);
      this.vehicle.setWheelBrake(i, 0);
      this.vehicle.setWheelSteering(i, 0);
    }
    this.sensors.reset();
    this.syncVisuals();
  }

  setCommand(command: ControlCommand, brake: number): void {
    this.command = command;
    this.brake = brake;
  }

  preStep(dt: number): void {
    const maxStep = STEER_RATE * dt;
    this.steer += clamp(this.command.steering - this.steer, -maxStep, maxStep);

    const angles = ackermannAngles(this.steer, ACKERMANN_BUGGY.wheelbase, ACKERMANN_BUGGY.trackWidth);
    this.vehicle.setWheelSteering(0, RAPIER_STEER_SIGN * angles.left);
    this.vehicle.setWheelSteering(1, RAPIER_STEER_SIGN * angles.right);
    this.vehicle.setWheelSteering(2, 0);
    this.vehicle.setWheelSteering(3, 0);

    const speed = forwardSpeed(this.body);
    let throttle = this.command.throttle;
    if (speed > MAX_SPEED && throttle > 0) throttle = 0;
    if (speed < -REVERSE_SPEED && throttle < 0) throttle = 0;

    const force = throttle * FULL_THROTTLE_FORCE;
    this.vehicle.setWheelEngineForce(0, force * 0.16);
    this.vehicle.setWheelEngineForce(1, force * 0.16);
    this.vehicle.setWheelEngineForce(2, force * 0.34);
    this.vehicle.setWheelEngineForce(3, force * 0.34);

    let brake = this.brake > 0 ? this.brake : 0;
    if (Math.abs(throttle) < 0.02) brake = Math.max(brake, HOLD_BRAKE);
    for (let i = 0; i < 4; i++) this.vehicle.setWheelBrake(i, brake);

    const chassis = this.body.handle;
    this.vehicle.updateVehicle(
      dt,
      undefined,
      undefined,
      (collider) => collider.parent()?.handle !== chassis,
    );
    if (throttle !== 0 || Math.abs(this.steer) > 0.01) this.body.wakeUp();
  }

  syncVisuals(): void {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.chassis.position.set(translation.x, translation.y, translation.z);
    this.chassis.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    for (let i = 0; i < this.wheelMeshes.length; i++) {
      const wheel = this.wheelMeshes[i]!;
      const connection = this.vehicle.wheelChassisConnectionPointCs(i);
      const suspension = this.vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST;
      const steering = this.vehicle.wheelSteering(i) ?? 0;
      const spin = this.vehicle.wheelRotation(i) ?? 0;
      if (!connection) continue;
      wheel.position.set(connection.x, connection.y - suspension, connection.z);
      this.steerQuat.setFromAxisAngle(this.up, steering);
      this.rollQuat.setFromAxisAngle(this.axle, spin);
      wheel.quaternion.copy(this.steerQuat).multiply(this.rollQuat);
    }
  }

  sampleSensors(dt: number) {
    return this.sensors.sample(dt, this.steer);
  }

  lidarDebug() {
    return this.sensors.lidarDebug();
  }

  telemetry(): VehicleTelemetry {
    return {
      trueSpeed: forwardSpeed(this.body),
      odomSpeed: this.sensors.odomSpeed,
      commandedSteering: this.command.steering,
      actuatorSteering: this.steer,
      commandedThrottle: this.command.throttle,
    };
  }

  focus(): ChassisFocus {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    return {
      x: translation.x,
      y: translation.y,
      z: translation.z,
      yaw: yawFromQuaternion({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
    };
  }

  dispose(): void {
    this.chassis.removeFromParent();
    this.vehicle.free();
  }
}

function createChassisMesh(): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: 0x128f86,
    roughness: 0.32,
    metalness: 0.22,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x171b1f,
    roughness: 0.62,
    metalness: 0.18,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc6eef2,
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.42,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffc56b,
    emissive: 0xff8e1f,
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0xff5340,
    emissive: 0xc42016,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xe3a23a,
    roughness: 0.42,
    metalness: 0.12,
  });

  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.14, 2.2), dark);
  tray.position.y = -0.16;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 2.08), paint);
  body.position.set(0, 0.02, 0.02);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.36, 0.98), glass);
  cabin.position.set(0, 0.3, -0.08);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 1.55), stripeMat);
  stripe.position.set(0, 0.18, 0.12);

  const lamp = new THREE.BoxGeometry(0.2, 0.07, 0.05);
  const headL = new THREE.Mesh(lamp, amber);
  headL.position.set(-0.38, 0.04, 1.06);
  const headR = headL.clone();
  headR.position.x = 0.38;
  const tailGeom = new THREE.BoxGeometry(0.24, 0.07, 0.05);
  const tailL = new THREE.Mesh(tailGeom, tail);
  tailL.position.set(-0.38, 0.05, -1.02);
  const tailR = tailL.clone();
  tailR.position.x = 0.38;

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 12), dark);
  mast.position.set(0, 0.52, -0.06);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.055, 28), dark);
  puck.position.set(0, 0.62, -0.06);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.145, 0.012, 8, 28),
    new THREE.MeshStandardMaterial({
      color: 0x9dfff0,
      emissive: 0x1c8f86,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(puck.position);

  group.add(tray, body, cabin, stripe, headL, headR, tailL, tailR, mast, puck, ring);
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

function createWheelMesh(radius: number, width: number): THREE.Group {
  const group = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 22),
    new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.9, metalness: 0.02 }),
  );
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0xd7dbdf, roughness: 0.28, metalness: 0.85 }),
  );
  rim.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width + 0.045, 10),
    new THREE.MeshStandardMaterial({ color: 0x8d9399, roughness: 0.35, metalness: 0.7 }),
  );
  hub.rotation.z = Math.PI / 2;
  group.add(tire, rim, hub);
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}
