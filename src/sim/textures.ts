import * as THREE from "three";

function canvasTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

export function asphaltTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#3a4046";
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    image.data[i] = clampByte((image.data[i] ?? 0) + n);
    image.data[i + 1] = clampByte((image.data[i + 1] ?? 0) + n);
    image.data[i + 2] = clampByte((image.data[i + 2] ?? 0) + n * 0.9);
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  const texture = canvasTexture(canvas, true);
  texture.repeat.set(48, 48);
  return texture;
}

/** Painted markings for the central 48 m pad. +X is canvas +x, +Z is canvas up. */
export function padTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.clearRect(0, 0, size, size);

  const worldToPx = (x: number, z: number) => ({
    x: ((x + 24) / 48) * size,
    y: ((24 - z) / 48) * size,
  });

  ctx.strokeStyle = "rgba(232, 236, 230, 0.55)";
  ctx.lineWidth = 5;
  const center = worldToPx(0, 0);
  ctx.beginPath();
  ctx.arc(center.x, center.y, (8 / 48) * size, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(232, 236, 230, 0.28)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 16]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, (5.4 / 48) * size, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Start chevron at the spawn point, pointing +Z (up the canvas).
  const spawn = worldToPx(5.4, 0);
  ctx.strokeStyle = "rgba(227, 162, 58, 0.95)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(spawn.x - 18, spawn.y + 16);
  ctx.lineTo(spawn.x, spawn.y - 14);
  ctx.lineTo(spawn.x + 18, spawn.y + 16);
  ctx.stroke();

  ctx.fillStyle = "rgba(232, 236, 230, 0.7)";
  ctx.font = "600 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("START", spawn.x, spawn.y + 42);

  return canvasTexture(canvas);
}

export function bollardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#e36a2c";
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(0, 46, 64, 16);
  ctx.fillRect(0, 78, 64, 12);
  return canvasTexture(canvas);
}

export function crateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#a97445";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#6e4a2c";
  ctx.lineWidth = 6;
  for (let y = 16; y < 128; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 4);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c89260";
  ctx.strokeRect(8, 8, 112, 112);
  return canvasTexture(canvas);
}

export function buildingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#3d4c5c";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#d7e4ea";
  for (let y = 28; y < 220; y += 48) {
    for (let x = 22; x < 240; x += 46) {
      ctx.fillRect(x, y, 26, 28);
      ctx.fillStyle = "rgba(180, 220, 230, 0.35)";
      ctx.fillRect(x, y, 26, 8);
      ctx.fillStyle = "#d7e4ea";
    }
  }
  ctx.fillStyle = "#2a3540";
  ctx.fillRect(0, 230, 256, 26);
  return canvasTexture(canvas);
}

export function rampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#8b949c";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }
  return canvasTexture(canvas, true);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
