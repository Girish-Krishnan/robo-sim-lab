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
  ctx.fillStyle = "#2c3238";
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    const grit = Math.random() < 0.04 ? (Math.random() - 0.5) * 40 : 0;
    image.data[i] = clampByte((image.data[i] ?? 0) + n + grit);
    image.data[i + 1] = clampByte((image.data[i + 1] ?? 0) + n * 0.95 + grit);
    image.data[i + 2] = clampByte((image.data[i + 2] ?? 0) + n * 0.85);
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "rgba(18, 18, 18, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(90, 78, 62, 0.18)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 18 + Math.random() * 40, 8 + Math.random() * 16, Math.random(), 0, Math.PI * 2);
    ctx.fill();
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

  // The pad plane is rotated -90° on X and the canvas texture flips Y,
  // so a mark drawn toward larger canvas y lands on world +Z (north).
  // Unrotated canvas text then reads left to right for a driver heading north,
  // with the arrow tip ahead of the word.
  const spawn = worldToPx(5.4, 0);
  ctx.strokeStyle = "rgba(227, 162, 58, 0.95)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(spawn.x - 18, spawn.y - 16);
  ctx.lineTo(spawn.x, spawn.y + 14);
  ctx.lineTo(spawn.x + 18, spawn.y - 16);
  ctx.stroke();

  ctx.fillStyle = "rgba(232, 236, 230, 0.92)";
  ctx.font = "600 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("START", spawn.x, spawn.y - 36);

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

/** Tread sheet built without a canvas so the physics tests can construct the car. */
export function tireTexture(): THREE.DataTexture {
  const width = 128;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const groove = x % 16 < 4 || (y > 6 && y < 26 && (x + 8) % 16 < 2);
      const shade = groove ? 16 : 34 + ((x * 5 + y * 3) % 11);
      const index = (y * width + x) * 4;
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade + 1;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(5, 1);
  texture.needsUpdate = true;
  return texture;
}

export function dirtTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#5a4a34";
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 36;
    image.data[i] = clampByte((image.data[i] ?? 0) + n);
    image.data[i + 1] = clampByte((image.data[i + 1] ?? 0) + n * 0.85);
    image.data[i + 2] = clampByte((image.data[i + 2] ?? 0) + n * 0.55);
  }
  ctx.putImageData(image, 0, 0);
  const texture = canvasTexture(canvas, true);
  texture.repeat.set(12, 12);
  return texture;
}

export function concreteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#8d9196";
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    image.data[i] = clampByte((image.data[i] ?? 0) + n);
    image.data[i + 1] = clampByte((image.data[i + 1] ?? 0) + n);
    image.data[i + 2] = clampByte((image.data[i + 2] ?? 0) + n);
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "rgba(60,60,60,0.25)";
  ctx.strokeRect(4, 4, 248, 248);
  const texture = canvasTexture(canvas, true);
  texture.repeat.set(8, 8);
  return texture;
}

/** Canopy card. Corners stay transparent so the quad does not read as a slab. */
export function foliageTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 42; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.pow(Math.random(), 0.35) * 78;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.75;
    const g = 110 + Math.random() * 80;
    ctx.fillStyle = `rgba(${30 + Math.random() * 40}, ${g}, ${28 + Math.random() * 24}, 0.95)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 7 + Math.random() * 11, 3 + Math.random() * 5, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = canvasTexture(canvas, false);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One grass blade, transparent outside the silhouette. */
export function bladeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.clearRect(0, 0, 64, 128);
  ctx.fillStyle = "rgba(72, 130, 48, 1)";
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.quadraticCurveTo(46, 50, 38, 122);
  ctx.quadraticCurveTo(32, 126, 26, 122);
  ctx.quadraticCurveTo(18, 50, 32, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(150, 190, 80, 1)";
  ctx.fillRect(31, 10, 2, 100);
  const texture = canvasTexture(canvas, false);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
