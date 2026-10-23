export interface OdomPose {
  x: number;
  y: number;
  yaw: number;
}

/**
 * Place a dead-reckoned pose into the world.
 * Odometry starts at the origin when the car is reset: +x is the initial
 * forward axis and +y is the initial left axis. Spawn yaw uses the same
 * convention as the chase camera (0 means the nose points along world +Z).
 */
export function odomToWorld(
  spawn: { x: number; z: number; yaw: number },
  pose: { x: number; y: number },
): { x: number; z: number } {
  const forwardX = -Math.sin(spawn.yaw);
  const forwardZ = Math.cos(spawn.yaw);
  const leftX = Math.cos(spawn.yaw);
  const leftZ = Math.sin(spawn.yaw);
  return {
    x: spawn.x + forwardX * pose.x + leftX * pose.y,
    z: spawn.z + forwardZ * pose.x + leftZ * pose.y,
  };
}

export function worldToOdom(
  spawn: { x: number; z: number; yaw: number },
  point: { x: number; z: number },
): { x: number; y: number } {
  const dx = point.x - spawn.x;
  const dz = point.z - spawn.z;
  const forwardX = -Math.sin(spawn.yaw);
  const forwardZ = Math.cos(spawn.yaw);
  const leftX = Math.cos(spawn.yaw);
  const leftZ = Math.sin(spawn.yaw);
  return {
    x: forwardX * dx + forwardZ * dz,
    y: leftX * dx + leftZ * dz,
  };
}

/**
 * Dead reckoning from wheel speed and gyro yaw rate.
 * Heading used to come from the bicycle model, `(speed / wheelbase) * tan(steer)`.
 * A constant steering bias then became a curvature bias, and one oval lap
 * walked the amber trail tens of meters off the car. A gyro bias integrates
 * to a few degrees over a minute instead, which is what a calibrated MEMS
 * unit actually does. Wheel-speed bias only scales the distance.
 * There is no pose input: the integral cannot be seeded from ground truth.
 */
export function createOdometry() {
  let pose: OdomPose = { x: 0, y: 0, yaw: 0 };

  return {
    reset(): void {
      pose = { x: 0, y: 0, yaw: 0 };
    },
    pose(): OdomPose {
      return { x: pose.x, y: pose.y, yaw: pose.yaw };
    },
    integrate(speed: number, yawRate: number, dt: number): OdomPose {
      pose = {
        x: pose.x + speed * Math.cos(pose.yaw) * dt,
        y: pose.y + speed * Math.sin(pose.yaw) * dt,
        yaw: pose.yaw + yawRate * dt,
      };
      return { x: pose.x, y: pose.y, yaw: pose.yaw };
    },
  };
}
