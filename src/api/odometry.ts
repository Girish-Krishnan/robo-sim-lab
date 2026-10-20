export interface OdomPose {
  x: number;
  y: number;
  yaw: number;
}

/**
 * Bicycle-model dead reckoning from wheel speed and steering only.
 * There is no pose input: the integral cannot be seeded from ground truth.
 */
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

export function createOdometry(wheelbase: number) {
  let pose: OdomPose = { x: 0, y: 0, yaw: 0 };

  return {
    reset(): void {
      pose = { x: 0, y: 0, yaw: 0 };
    },
    pose(): OdomPose {
      return { x: pose.x, y: pose.y, yaw: pose.yaw };
    },
    integrate(speed: number, steering: number, dt: number): OdomPose {
      const yawRate = wheelbase === 0 ? 0 : (speed / wheelbase) * Math.tan(steering);
      pose = {
        x: pose.x + speed * Math.cos(pose.yaw) * dt,
        y: pose.y + speed * Math.sin(pose.yaw) * dt,
        yaw: pose.yaw + yawRate * dt,
      };
      return { x: pose.x, y: pose.y, yaw: pose.yaw };
    },
  };
}
