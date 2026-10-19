export interface OdomPose {
  x: number;
  y: number;
  yaw: number;
}

/**
 * Bicycle-model dead reckoning from wheel speed and steering only.
 * There is no pose input: the integral cannot be seeded from ground truth.
 */
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
