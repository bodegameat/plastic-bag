import * as THREE from "three";
import { WORLD_SIZE, wrapCoord, wrapDelta } from "./wrap";

/**
 * Soft cloud puffs — billboards scattered high above the wrapping tile.
 * Bag can float up into / through them.
 */
export class CloudField {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private seeds: { x: number; y: number; z: number; s: number; phase: number; drift: number }[] = [];

  constructor(count = 55) {
    const tex = makeCloudTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < count; i++) {
      const s = 18 + Math.random() * 42;
      const geo = new THREE.PlaneGeometry(s, s * (0.45 + Math.random() * 0.25));
      const mesh = new THREE.Mesh(geo, mat);
      const x = (Math.random() - 0.5) * WORLD_SIZE;
      const z = (Math.random() - 0.5) * WORLD_SIZE;
      const y = 42 + Math.random() * 70;
      mesh.position.set(x, y, z);
      mesh.renderOrder = -1;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.seeds.push({
        x,
        y,
        z,
        s,
        phase: Math.random() * Math.PI * 2,
        drift: 1.5 + Math.random() * 3,
      });
    }
  }

  update(dt: number, time: number, bagPos: THREE.Vector3, cam: THREE.Camera): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const seed = this.seeds[i]!;
      const mesh = this.meshes[i]!;
      // Slow drift; wrap on tile
      seed.x = wrapCoord(seed.x + seed.drift * dt * 0.35);
      seed.z = wrapCoord(seed.z + Math.sin(time * 0.05 + seed.phase) * dt * 0.8);
      seed.y = seed.y + Math.sin(time * 0.2 + seed.phase) * dt * 0.15;

      // Place cloud at nearest wrap image relative to bag (seamless for infinite coords)
      const dx = wrapDelta(seed.x, bagPos.x);
      const dz = wrapDelta(seed.z, bagPos.z);

      mesh.position.set(bagPos.x + dx, seed.y, bagPos.z + dz);
      mesh.quaternion.copy(cam.quaternion);

      // Fade when very close (flying through)
      const dist = mesh.position.distanceTo(bagPos);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = dist < 12 ? 0.25 : dist < 25 ? 0.45 : 0.72;
    }
  }
}

function makeCloudTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,252,248,0.65)");
  g.addColorStop(0.7, "rgba(240,245,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Extra soft blobs
  for (const [ox, oy, r] of [
    [0.35, 0.45, 0.28],
    [0.62, 0.48, 0.3],
    [0.48, 0.38, 0.22],
  ] as [number, number, number][]) {
    const gg = ctx.createRadialGradient(ox * size, oy * size, 2, ox * size, oy * size, r * size);
    gg.addColorStop(0, "rgba(255,255,255,0.7)");
    gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
