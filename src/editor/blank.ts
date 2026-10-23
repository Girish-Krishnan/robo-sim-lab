import { programPreamble } from "./program-header";

const SCRATCH_KEY = "robo-sim-lab.scratch";

/**
 * What Code mode opens on. A documented control() that rolls gently forward,
 * so the first Run moves the car and the comments say what the numbers mean.
 */
export const BLANK_SOURCE = `${programPreamble("default")}# A blank controller
#
# control(sensors) runs 20 times a second. sensors is everything the car
# can measure: a lidar scan, wheel odometry, and an IMU. The true pose
# stays on this side of the window.
#
# Return two numbers:
#   steering   radians, positive turns left
#   throttle   -1 to 1, positive drives forward
#
# This copy holds the wheel straight and asks for a gentle roll.
# Change the numbers, then press Run.

def control(sensors):
    return 0.0, 0.35
`;

export function loadScratch(): string {
  try {
    const saved = localStorage.getItem(SCRATCH_KEY);
    if (saved && saved.trim()) return saved;
  } catch {
    // Private mode still gets the template.
  }
  return BLANK_SOURCE;
}

export function saveScratch(source: string): void {
  try {
    localStorage.setItem(SCRATCH_KEY, source);
  } catch {
    // Ignore quota and privacy errors.
  }
}
