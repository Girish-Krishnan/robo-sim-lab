import type { Solid, SolidLook } from "../course";

export function cuboid(
  x: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  look: SolidLook,
  yaw = 0,
  color = 0xffffff,
  friction = 0.8,
): Solid {
  return {
    shape: "cuboid",
    look,
    x,
    y: sy / 2,
    z,
    hx: sx / 2,
    hy: sy / 2,
    hz: sz / 2,
    yaw,
    pitch: 0,
    color,
    friction,
  };
}

export function pillar(
  x: number,
  z: number,
  radius: number,
  height: number,
  look: SolidLook,
  color = 0xffffff,
  bottom = 0,
): Solid {
  return {
    shape: "cylinder",
    look,
    x,
    y: bottom + height / 2,
    z,
    hx: radius,
    hy: height / 2,
    hz: radius,
    yaw: 0,
    pitch: 0,
    color,
    friction: 0.7,
  };
}

export function coneSolid(x: number, z: number, radius: number, height: number, color: number): Solid {
  return {
    shape: "cone",
    look: "cone",
    x,
    y: height / 2,
    z,
    hx: radius,
    hy: height / 2,
    hz: radius,
    yaw: 0,
    pitch: 0,
    color,
    friction: 0.6,
  };
}

export function ballSolid(x: number, z: number, radius: number, look: SolidLook, color: number): Solid {
  return {
    shape: "ball",
    look,
    x,
    y: radius * 0.72,
    z,
    hx: radius,
    hy: radius,
    hz: radius,
    yaw: 0,
    pitch: 0,
    color,
    friction: 0.7,
  };
}

/** Horizontal log. Pitch lays the cylinder along Z; radius is the lidar height. */
export function logSolid(x: number, z: number, radius: number, length: number, yaw = 0): Solid {
  return {
    shape: "cylinder",
    look: "log",
    x,
    y: radius,
    z,
    hx: radius,
    hy: length / 2,
    hz: radius,
    yaw,
    pitch: Math.PI / 2,
    color: 0x6a4a30,
    friction: 0.85,
  };
}
