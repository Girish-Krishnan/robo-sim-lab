import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, ackermannAngles, clamp, yawFromQuaternion, type ControlCommand } from "../api";
import { quatConjugate, quatRotate } from "../api/math";
import type { ChassisFocus, SimRobot, VehicleTelemetry } from "../robots/types";
import { createResearchCar, type WheelVisual } from "./car-mesh";
import { forwardSpeed, SensorSuite } from "./sensors";

type Rapier = typeof RAPIER;

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  /** Same yaw as `focus()`. Zero points the nose along +Z. */
  yaw: number;
}

export const DEFAULT_SPAWN: SpawnPose = { x: 5.4, y: 0.84, z: 0, yaw: 0 };
const HALF = { x: 0.64, y: 0.34, z: 1.14 };
const WHEEL_RADIUS = 0.3;
const WHEEL_WIDTH = 0.2;
const CONNECTION_Y = -0.28;
const SUSPENSION_REST = 0.28;

const CHASSIS_MASS = 110;
/** Below the geometric center, so a hard turn slides before it rolls. */
const CENTER_OF_MASS = { x: 0, y: -0.34, z: 0.03 };
const INERTIA = { x: 40, y: 52, z: 26 };

const FULL_THROTTLE_FORCE = 420;
/** Small drag when the throttle is closed, so letting go of the keys coasts. */
const HOLD_BRAKE = 0.35;
const MAX_SPEED = 8;
const REVERSE_SPEED = 3.5;
const STEER_RATE = 1.15;
/** Kinematic lateral accel (v²·tanδ / L) above which the governor eases off. */
const LATERAL_ACCEL_LIMIT = 6.5;

/**
 * Brake is a per-wheel impulse cap inside Rapier, not a force in newtons.
 * Values around 40 lock the tires in one step and, with the wheels still
 * steered, flip the chassis. These stay in the range that slows the car
 * without pitching it over.
 */
export const SERVICE_BRAKE = 3.5;
export const STOP_BRAKE = 2;

/**
 * Positive steering is a left turn as the driver sees it.
 *
 * At yaw 0 the nose is +Z and the driver's left is local +X. With the chase
 * camera behind the car, that is the left side of the screen, whether the
 * car is driving away from the camera or has turned around and is driving
 * back toward where the camera used to be (the camera stays behind).
 *
 * Rapier's wheel steer, axle (−1, 0, 0) and forward +Z, uses a positive
 * angle to rotate the wheel's forward vector toward +X. The visual meshes
 * use that same angle as a rotation about +Y, so the tires and the physics
 * point the same way. No extra negation.
 */
const RAPIER_STEER_SIGN = 1;

export class AckermannBuggy implements SimRobot {
  readonly descriptor = ACKERMANN_BUGGY;

  private readonly body: InstanceType<Rapier["RigidBody"]>;
  private readonly vehicle: InstanceType<Rapier["DynamicRayCastVehicleController"]>;
  private readonly sensors: SensorSuite;
  private readonly chassis: THREE.Group;
  private readonly wheels: WheelVisual[];
  private readonly headlight: THREE.MeshStandardMaterial;
  private readonly brakeLight: THREE.MeshStandardMaterial;
  private readonly steerQuat = new THREE.Quaternion();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly axle = new THREE.Vector3(-1, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private spawn: SpawnPose = DEFAULT_SPAWN;
  private noiseSeed: number | null = null;
  private readonly chassisCollider: InstanceType<Rapier["Collider"]>;

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
        .setTranslation(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, DEFAULT_SPAWN.z)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0.12)
        .setAngularDamping(0.4),
    );
    this.chassisCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
        .setDensity(0)
        .setFriction(0.4)
        .setRestitution(0.02)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    this.body.setAdditionalMassProperties(
      CHASSIS_MASS,
      CENTER_OF_MASS,
      INERTIA,
      { x: 0, y: 0, z: 0, w: 1 },
      true,
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
      this.vehicle.setWheelSuspensionStiffness(i, 30);
      this.vehicle.setWheelSuspensionCompression(i, 2.8);
      this.vehicle.setWheelSuspensionRelaxation(i, 4.2);
      this.vehicle.setWheelFrictionSlip(i, 1.35);
      this.vehicle.setWheelSideFrictionStiffness(i, 1);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.22);
      this.vehicle.setWheelMaxSuspensionForce(i, 18000);
    }

    const visual = createResearchCar(WHEEL_RADIUS, WHEEL_WIDTH);
    this.chassis = visual.group;
    this.wheels = visual.wheels;
    this.headlight = visual.headlight;
    this.brakeLight = visual.brakeLight;
    scene.add(this.chassis);
    this.syncVisuals();

    this.sensors = new SensorSuite(RAPIER, world, this.body, this.vehicle, WHEEL_RADIUS);
  }

  /**
   * Arm a noise seed. The next `reset` (and every reset after it) replays
   * the same lidar, odometry, and IMU noise. Evaluation and the Reset seed
   * button both use this. It does not change the sensor fields themselves.
   */
  setNoiseSeed(seed: number): void {
    this.noiseSeed = seed >>> 0;
  }

  /** Collider used to count obstacle contacts. Not part of the student API. */
  collider(): InstanceType<Rapier["Collider"]> {
    return this.chassisCollider;
  }

  /** Place the body for a chase-camera still. Physics stays in charge after unpause. */
  teleport(pose: SpawnPose): void {
    this.spawn = pose;
    this.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    const heading = new THREE.Quaternion().setFromAxisAngle(this.up, -pose.yaw);
    this.body.setRotation({ x: heading.x, y: heading.y, z: heading.z, w: heading.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncVisuals();
  }

  reset(pose?: SpawnPose): void {
    if (pose) this.spawn = pose;
    this.command = { steering: 0, throttle: 0 };
    this.brake = 0;
    this.steer = 0;
    if (this.noiseSeed != null) this.sensors.armSeed(this.noiseSeed);
    this.body.setTranslation({ x: this.spawn.x, y: this.spawn.y, z: this.spawn.z }, true);
    const heading = new THREE.Quaternion().setFromAxisAngle(this.up, -this.spawn.yaw);
    this.body.setRotation({ x: heading.x, y: heading.y, z: heading.z, w: heading.w }, true);
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
    // Wheel 0 sits at local −X (driver's right). Wheel 1 sits at local +X (driver's left).
    // The inner wheel takes the larger angle.
    this.vehicle.setWheelSteering(0, RAPIER_STEER_SIGN * angles.right);
    this.vehicle.setWheelSteering(1, RAPIER_STEER_SIGN * angles.left);
    this.vehicle.setWheelSteering(2, 0);
    this.vehicle.setWheelSteering(3, 0);

    const speed = forwardSpeed(this.body);
    let throttle = this.command.throttle;
    let brake = this.brake > 0 ? this.brake : 0;
    const lateral = (speed * speed * Math.abs(Math.tan(this.steer))) / ACKERMANN_BUGGY.wheelbase;
    if (lateral > LATERAL_ACCEL_LIMIT && Math.abs(speed) > 1) {
      if (throttle * speed > 0) throttle = 0;
      brake = Math.max(brake, 1.6);
    }
    if (speed > MAX_SPEED && throttle > 0) throttle = 0;
    if (speed < -REVERSE_SPEED && throttle < 0) throttle = 0;

    const force = throttle * FULL_THROTTLE_FORCE;
    this.vehicle.setWheelEngineForce(0, force * 0.16);
    this.vehicle.setWheelEngineForce(1, force * 0.16);
    this.vehicle.setWheelEngineForce(2, force * 0.34);
    this.vehicle.setWheelEngineForce(3, force * 0.34);

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
    this.dampRoll(dt);
  }

  /**
   * Soft roll damping. It stays out of the way in ordinary driving and only
   * pushes back once the body is clearly leaning, so a stop or a sudden
   * steer change settles instead of tripping over the outside wheels.
   */
  private dampRoll(dt: number): void {
    const rotation = this.body.rotation();
    const q = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
    const up = quatRotate(q, { x: 0, y: 1, z: 0 });
    if (up.y < 0.35) return;
    const right = quatRotate(q, { x: 1, y: 0, z: 0 });
    const roll = Math.atan2(right.y, up.y);
    const angvel = this.body.angvel();
    const localRate = quatRotate(quatConjugate(q), { x: angvel.x, y: angvel.y, z: angvel.z });
    const excess = Math.max(0, Math.abs(roll) - 0.18);
    const spring = excess === 0 ? 0 : -420 * Math.sign(roll) * excess;
    const torque = quatRotate(q, { x: 0, y: 0, z: spring - 140 * localRate.z });
    this.body.applyTorqueImpulse({ x: torque.x * dt, y: torque.y * dt, z: torque.z * dt }, true);
  }

  syncVisuals(): void {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.chassis.position.set(translation.x, translation.y, translation.z);
    this.chassis.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i]!;
      const connection = this.vehicle.wheelChassisConnectionPointCs(i);
      const suspension = this.vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST;
      const steering = this.vehicle.wheelSteering(i) ?? 0;
      const spin = this.vehicle.wheelRotation(i) ?? 0;
      if (!connection) continue;
      wheel.steer.position.set(connection.x, connection.y - suspension, connection.z);
      this.steerQuat.setFromAxisAngle(this.up, steering);
      this.rollQuat.setFromAxisAngle(this.axle, spin);
      wheel.steer.quaternion.copy(this.steerQuat);
      wheel.spin.quaternion.copy(this.rollQuat);
    }
    const throttle = this.command.throttle;
    const braking = this.brake > 0.2 || throttle < -0.05;
    this.headlight.emissiveIntensity = 0.4 + Math.max(0, throttle) * 2.6;
    this.brakeLight.emissiveIntensity = braking ? 2.6 : 0.12;
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

  /** World-up component of the chassis up axis. Below 0.5 the car has flipped. */
  upright(): number {
    const rotation = this.body.rotation();
    const up = quatRotate(
      { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      { x: 0, y: 1, z: 0 },
    );
    return up.y;
  }

  dispose(): void {
    this.chassis.removeFromParent();
    this.vehicle.free();
  }
}

