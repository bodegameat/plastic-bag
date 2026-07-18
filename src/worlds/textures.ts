import * as THREE from "three";

/** Canvas-based seamless textures for denser PBR look without asset downloads. */
export function makeNoiseTexture(
  size = 256,
  opts: {
    base?: [number, number, number];
    variance?: number;
    scale?: number;
  } = {},
): THREE.CanvasTexture {
  const { base = [90, 90, 90], variance = 28, scale = 1 } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        (hash2(x * scale, y * scale) +
          hash2(x * scale * 2.1, y * scale * 2.1) * 0.5 +
          hash2(x * scale * 4.3, y * scale * 4.3) * 0.25) /
        1.75;
      const v = (n - 0.5) * variance;
      const i = (y * size + x) * 4;
      img.data[i] = clamp(base[0] + v);
      img.data[i + 1] = clamp(base[1] + v * 0.95);
      img.data[i + 2] = clamp(base[2] + v * 0.9);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeRoughnessTexture(size = 256, base = 0.7, variance = 0.25): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const n = hash2(x, y);
    const v = Math.floor((base + (n - 0.5) * variance) * 255);
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(v);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v | 0));
}
