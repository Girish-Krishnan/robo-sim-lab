/// <reference types="vite/client" />

interface RoboSimApi {
  ready: boolean;
  resetToSeed: (seed?: number) => void;
  setPathOverlay: (enabled: boolean) => void;
  pause: (paused: boolean) => void;
  teleport: (pose: { x: number; y: number; z: number; yaw: number }) => void;
  setWorld: (id: string) => Promise<void>;
  setExample: (id: string) => void;
  setQuality: (quality: "low" | "high") => Promise<void>;
  focus: () => { x: number; y: number; z: number; yaw: number };
  time?: () => number;
  frameCamera?: (distance: number, pitch: number) => void;
}

declare global {
  interface Window {
    roboSim?: RoboSimApi;
  }
}

export {};
