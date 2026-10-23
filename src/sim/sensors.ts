import type RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, EMPTY_MAP, createOdometry, createSeededRandom, type SensorFrame } from "../api";
import {
  beamDirection,
  dot,
  gaussian,
  quatRotate,
  worldToBody,
  type Quat,
  type Vec3,
} from "../api/math";
import type { LidarDebug, LidarDebugPoint } from "../robots/types";

type Rapier = typeof RAPIER;
type RigidBody = InstanceType<typeof RAPIER.RigidBody>;
type World = InstanceType<typeof RAPIER.World>;
type Vehicle = InstanceType<typeof RAPIER.DynamicRayCastVehicleController>;

/**
 * Sensor-mast puck, chassis frame. Body center settles near y = 0.78, so the
 * scan plane is about a meter off the ground. The visible puck uses this
 * same offset.
 */
export const LIDAR_LOCAL = { x: 0, y: 0.28, z: 0.46 };

/**
 * Samples sensors from the live physics state and returns only a SensorFrame.
 * Pose is integrated from noisy wheel speed and the gyro yaw rate. The body's
 * translation is never copied into that pose. Steering bias is reported on
 * `steeringAngle` and is not integrated: a steer offset is not a heading.
 */
export class SensorSuite {
  private readonly odom = createOdometry();
  private readonly spec = ACKERMANN_BUGGY.sensors;
  private time = 0;
  private wheelRot = [0, 0, 0, 0];
  private wheelReady = false;
  private prevVel: Vec3 | null = null;
  private smoothAccel: Vec3 = { x: 0, y: 0, z: 9.81 };
  private bias = { yaw: 0, ax: 0, ay: 0, az: 0, speed: 0, steer: 0 };
  private debugPoints: LidarDebugPoint[] = [];
  private debugOrigin = { x: 0, y: 0, z: 0 };
  private lastOdomSpeed = 0;
  private random: () => number = Math.random;
  private seed: number | null = null;

  constructor(
    private readonly RAPIER: Rapier,
    private readonly world: World,
    private readonly body: RigidBody,
    private readonly vehicle: Vehicle,
    private readonly wheelRadius: number,
  ) {
    this.resampleBias();
  }

  /** The next `reset` replays noise from this seed. */
  armSeed(seed: number): void {
    this.seed = seed >>> 0;
  }

  reset(): void {
    if (this.seed != null) this.random = createSeededRandom(this.seed);
    this.odom.reset();
    this.wheelRot = [0, 0, 0, 0];
    this.wheelReady = false;
    this.prevVel = null;
    this.smoothAccel = { x: 0, y: 0, z: 9.81 };
    this.lastOdomSpeed = 0;
    this.debugPoints = [];
    this.debugOrigin = { x: 0, y: 0, z: 0 };
    this.resampleBias();
  }

  get odomSpeed(): number {
    return this.lastOdomSpeed;
  }

  lidarDebug(): LidarDebug {
    return { origin: this.debugOrigin, points: this.debugPoints };
  }

  sample(dt: number, actuatorSteering: number): SensorFrame {
    this.time += dt;
    const rotation = this.body.rotation();
    const q: Quat = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
    const speed = this.wheelSpeed(dt);
    const noisySpeed = speed * (1 + this.bias.speed) + gaussian(this.spec.odometry.speedStdDev, this.random);
    const noisySteer = actuatorSteering + this.bias.steer + gaussian(this.spec.odometry.steeringStdDev, this.random);
    this.lastOdomSpeed = noisySpeed;
    const imu = this.sampleImu(dt, q);
    // Same yaw-rate sample the student receives. Positive is a left turn.
    const pose = this.odom.integrate(noisySpeed, imu.yawRate, dt);

    return {
      time: this.time,
      dt,
      lidar: this.castLidar(q),
      odometry: {
        speed: noisySpeed,
        steeringAngle: noisySteer,
        pose,
      },
      imu,
      camera: { available: false, width: 0, height: 0 },
      task: { path: [], map: EMPTY_MAP },
    };
  }

  private resampleBias(): void {
    const imu = this.spec.imu;
    const odom = this.spec.odometry;
    this.bias = {
      yaw: gaussian(imu.yawRateBiasStdDev, this.random),
      ax: gaussian(imu.accelBiasStdDev, this.random),
      ay: gaussian(imu.accelBiasStdDev, this.random),
      az: gaussian(imu.accelBiasStdDev, this.random),
      speed: gaussian(odom.speedBiasStdDev, this.random),
      steer: gaussian(odom.steeringBiasStdDev, this.random),
    };
  }

  private wheelSpeed(dt: number): number {
    let sum = 0;
    for (const index of [2, 3]) {
      const rotation = this.vehicle.wheelRotation(index) ?? 0;
      if (this.wheelReady && dt > 1e-4) {
        sum += ((rotation - (this.wheelRot[index] ?? 0)) / dt) * this.wheelRadius;
      }
      this.wheelRot[index] = rotation;
    }
    this.wheelReady = true;
    return sum / 2;
  }

  private sampleImu(dt: number, q: Quat): SensorFrame["imu"] {
    const velocity = this.body.linvel();
    const current = { x: velocity.x, y: velocity.y, z: velocity.z };
    let specific = { x: 0, y: 9.81, z: 0 };
    if (this.prevVel && dt > 1e-4) {
      specific = {
        x: (current.x - this.prevVel.x) / dt,
        y: (current.y - this.prevVel.y) / dt + 9.81,
        z: (current.z - this.prevVel.z) / dt,
      };
    }
    this.prevVel = current;
    const bodyAccel = worldToBody(q, specific);
    this.smoothAccel = {
      x: this.smoothAccel.x + 0.45 * (bodyAccel.x - this.smoothAccel.x),
      y: this.smoothAccel.y + 0.45 * (bodyAccel.y - this.smoothAccel.y),
      z: this.smoothAccel.z + 0.45 * (bodyAccel.z - this.smoothAccel.z),
    };
    const angular = this.body.angvel();
    const bodyRate = worldToBody(q, { x: angular.x, y: angular.y, z: angular.z });
    const imu = this.spec.imu;
    return {
      yawRate: bodyRate.z + this.bias.yaw + gaussian(imu.yawRateStdDev, this.random),
      accel: {
        x: this.smoothAccel.x + this.bias.ax + gaussian(imu.accelStdDev, this.random),
        y: this.smoothAccel.y + this.bias.ay + gaussian(imu.accelStdDev, this.random),
        z: this.smoothAccel.z + this.bias.az + gaussian(imu.accelStdDev, this.random),
      },
    };
  }

  private castLidar(q: Quat): SensorFrame["lidar"] {
    const { beams, fov, maxRange, rangeStdDev } = this.spec.lidar;
    const origin = this.lidarOrigin(q);
    this.debugOrigin = origin;
    const angles: number[] = [];
    const ranges: number[] = [];
    const debug: LidarDebugPoint[] = [];
    const span = fov > 0 ? fov : Math.PI * 2;

    for (let i = 0; i < beams; i++) {
      const angle = beams === 1 ? 0 : -span / 2 + (i / (beams - 1)) * span;
      const dir = beamDirection(q, angle);
      const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const hit = this.world.castRay(
        new this.RAPIER.Ray(origin, { x: dir.x / length, y: dir.y / length, z: dir.z / length }),
        maxRange,
        true,
        undefined,
        undefined,
        undefined,
        this.body,
      );
      let range = maxRange;
      let returned = false;
      if (hit && hit.timeOfImpact < maxRange) {
        const noisy = hit.timeOfImpact + gaussian(rangeStdDev, this.random);
        range = Math.min(maxRange, Math.max(0.05, noisy));
        returned = range < maxRange - 1e-3;
      }
      angles.push(angle);
      ranges.push(range);
      const draw = returned ? range : maxRange;
      debug.push({
        x: origin.x + (dir.x / length) * draw,
        y: origin.y + (dir.y / length) * draw,
        z: origin.z + (dir.z / length) * draw,
        range,
        hit: returned,
      });
    }

    this.debugPoints = debug;
    return { angles, ranges, maxRange };
  }

  private lidarOrigin(q: Quat): Vec3 {
    const translation = this.body.translation();
    const offset = quatRotate(q, LIDAR_LOCAL);
    return {
      x: translation.x + offset.x,
      y: translation.y + offset.y,
      z: translation.z + offset.z,
    };
  }
}

/** Ground-truth forward speed for the on-screen HUD. Not a sensor output. */
export function forwardSpeed(body: RigidBody): number {
  const velocity = body.linvel();
  const rotation = body.rotation();
  const forward = quatRotate(
    { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    { x: 0, y: 0, z: 1 },
  );
  return dot(forward, { x: velocity.x, y: velocity.y, z: velocity.z });
}
