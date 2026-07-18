import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { WORLD_SIZE, wrapCoord } from "./wrap";

/** Snap instance to nearest wrap image of its logical xz. */
function wrapNear(logicalX: number, logicalZ: number, bag: THREE.Vector3): { x: number; z: number } {
  const ox = Math.round((bag.x - logicalX) / WORLD_SIZE) * WORLD_SIZE;
  const oz = Math.round((bag.z - logicalZ) / WORLD_SIZE) * WORLD_SIZE;
  return { x: logicalX + ox, z: logicalZ + oz };
}

/** Bold toy palette — Bruno Simon energy */
export const TOY = {
  grass: 0x3ecf6a,
  grassDeep: 0x2aa85a,
  dirt: 0xe8a050,
  trunk: 0x8b5a3c,
  canopy: [0x2ecf6a, 0x4ae080, 0x1db85a, 0x7aef90] as const,
  rock: [0xd4c4b0, 0xc8b8a8, 0xb0a898] as const,
  flower: [0xff5a7a, 0xffd040, 0xff80c0, 0x60c0ff, 0xff9040] as const,
  house: [0xff6b5a, 0xffd040, 0x5ad4ff, 0xb388ff, 0xff90a8] as const,
  path: 0xf0b060,
  sun: 0xffe066,
  skyTop: 0x4eb8ff,
  skyBot: 0xffe8b0,
  fog: 0xa8d8f0,
  ambient: 0x90c8ff,
  hemiSky: 0xffe8a0,
  hemiGround: 0x4ecf70,
};

function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Layer = {
  mesh: THREE.InstancedMesh;
  count: number;
  base: Float32Array;
  scales: Float32Array;
  phases: Float32Array;
};

type Poi = { x: number; z: number };

/**
 * Instanced nature laid out like a park: groves by hubs, hedges along paths.
 */
export class NatureField {
  readonly group = new THREE.Group();
  private trees!: Layer;
  private rocks!: Layer;
  private flowers!: Layer;
  private tufts!: Layer;
  private dummy = new THREE.Object3D();

  constructor(mobile: boolean) {
    this.trees = this.makeLayer(
      mobile ? 180 : 260,
      new THREE.CapsuleGeometry(0.75, 1.5, 4, 8),
      TOY.canopy[0],
      true,
    );
    this.colorize(this.trees, TOY.canopy);
    this.rocks = this.makeLayer(
      mobile ? 160 : 240,
      new THREE.DodecahedronGeometry(0.4, 0),
      TOY.rock[0],
      true,
    );
    this.colorize(this.rocks, TOY.rock);
    this.flowers = this.makeLayer(
      mobile ? 520 : 780,
      new THREE.SphereGeometry(0.16, 5, 4),
      TOY.flower[0],
      false,
    );
    this.colorize(this.flowers, TOY.flower);
    this.tufts = this.makeLayer(
      mobile ? 640 : 960,
      new THREE.ConeGeometry(0.14, 0.42, 5),
      TOY.grassDeep,
      false,
    );

    this.group.add(this.trees.mesh, this.rocks.mesh, this.flowers.mesh, this.tufts.mesh);
  }

  private makeLayer(
    count: number,
    geo: THREE.BufferGeometry,
    color: number,
    castShadow: boolean,
  ): Layer {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    // Instances span the whole wrap — default frustum cull hides everything off-origin
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return {
      mesh,
      count,
      base: new Float32Array(count * 3),
      scales: new Float32Array(count),
      phases: new Float32Array(count),
    };
  }

  private colorize(layer: Layer, palette: readonly number[]): void {
    const colors = new Float32Array(layer.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < layer.count; i++) {
      c.setHex(palette[i % palette.length]!);
      c.offsetHSL((hash(i) - 0.5) * 0.08, (hash(i + 3) - 0.5) * 0.1, (hash(i + 7) - 0.5) * 0.08);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    layer.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }

  private clearLayer(layer: Layer): void {
    layer.scales.fill(0);
    for (let i = 0; i < layer.count; i++) {
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      layer.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeInstance(
    layer: Layer,
    i: number,
    x: number,
    z: number,
    s: number,
    yOff: number,
    xz?: [number, number, number],
  ): void {
    if (i >= layer.count) return;
    const y = terrainHeight(x, z) + yOff;
    layer.scales[i] = s;
    layer.phases[i] = hash(i * 17 + 3) * Math.PI * 2;
    layer.base[i * 3] = x;
    layer.base[i * 3 + 1] = y;
    layer.base[i * 3 + 2] = z;
    const sc = xz ?? ([s, s, s] as [number, number, number]);
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sc[0], sc[1], sc[2]);
    this.dummy.rotation.set(0, layer.phases[i]!, 0);
    this.dummy.updateMatrix();
    layer.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  /**
   * Intentional layout:
   * - Dense tree groves beside hubs (not sparse scatter)
   * - Tight flower beds + rock piles
   * - Light avenue lining; leftover slots go into a few meadow clumps
   */
  scatter(
    hubs: Poi[],
    paths: [Poi, Poi][],
    clearRadius = 7,
  ): void {
    this.clearLayer(this.trees);
    this.clearLayer(this.rocks);
    this.clearLayer(this.flowers);
    this.clearLayer(this.tufts);

    let ti = 0;
    let ri = 0;
    let fi = 0;
    let gi = 0;

    const tooCloseToHub = (x: number, z: number): boolean => {
      for (const h of hubs) {
        const dx = x - h.x;
        const dz = z - h.z;
        if (dx * dx + dz * dz < clearRadius * clearRadius) return true;
      }
      return false;
    };

    // Dense grove (8–11 trees) beside each hub
    for (let h = 0; h < hubs.length; h++) {
      const hub = hubs[h]!;
      const groveAng = hash(h * 9) * Math.PI * 2;
      const groveR = clearRadius + 4.5 + hash(h * 5) * 2;
      const n = 8 + Math.floor(hash(h * 3) * 4);
      for (let k = 0; k < n && ti < this.trees.count; k++) {
        const ang = groveAng + (k / n) * Math.PI * 1.15 + (hash(h * 11 + k) - 0.5) * 0.35;
        const r = groveR + (hash(h * 17 + k) - 0.5) * 2.8;
        const x = hub.x + Math.cos(ang) * r;
        const z = hub.z + Math.sin(ang) * r;
        if (tooCloseToHub(x, z)) continue;
        const s = 0.9 + hash(ti + 40) * 1.0;
        this.writeInstance(this.trees, ti++, x, z, s, s * 1.35, [s * 0.7, s, s * 0.7]);
      }

      // Rock pile near grove
      for (let k = 0; k < 5 && ri < this.rocks.count; k++) {
        const ang = groveAng + Math.PI + k * 0.4;
        const r = groveR - 1.5 + hash(h * 20 + k) * 2;
        const x = hub.x + Math.cos(ang) * r;
        const z = hub.z + Math.sin(ang) * r;
        if (tooCloseToHub(x, z)) continue;
        const sc = 0.6 + hash(ri) * 1.0;
        this.writeInstance(this.rocks, ri++, x, z, sc, 0.22 * sc);
      }

      // Flower bed patch (tight cluster, not a ring)
      const bedAng = groveAng + 1.8;
      const bedR = clearRadius + 2.2;
      const bx = hub.x + Math.cos(bedAng) * bedR;
      const bz = hub.z + Math.sin(bedAng) * bedR;
      for (let k = 0; k < 18; k++) {
        const ox = (hash(h * 30 + k) - 0.5) * 3.2;
        const oz = (hash(h * 31 + k) - 0.5) * 3.2;
        const x = bx + ox;
        const z = bz + oz;
        if (tooCloseToHub(x, z)) continue;
        if (fi < this.flowers.count) {
          this.writeInstance(this.flowers, fi++, x, z, 0.75 + hash(fi) * 0.5, 0.22);
        }
        if (gi < this.tufts.count && k % 2 === 0) {
          this.writeInstance(this.tufts, gi++, x + 0.2, z - 0.15, 0.9 + hash(gi) * 0.5, 0.18);
        }
      }
    }

    // Sparse avenue trees along paths (every ~10u, one side)
    for (let p = 0; p < paths.length; p++) {
      const [a, b] = paths[p]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const steps = Math.max(2, Math.floor(len / 10));

      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const side = s % 2 === 0 ? 1 : -1;
        const off = 4.0 + hash(p * 20 + s) * 1.2;
        const x = px + nx * side * off;
        const z = pz + nz * side * off;
        if (tooCloseToHub(x, z)) continue;

        if (ti < this.trees.count && s % 2 === 0) {
          const sc = 0.7 + hash(ti) * 0.65;
          this.writeInstance(this.trees, ti++, x, z, sc, sc * 1.35, [sc * 0.7, sc, sc * 0.7]);
        }
        // Soft hedge tufts along path edge
        for (let j = 0; j < 2; j++) {
          const hx = px + nx * side * (1.4 + j * 0.5) + (hash(p + s + j) - 0.5) * 0.8;
          const hz = pz + nz * side * (1.4 + j * 0.5) + (hash(p + s + j + 3) - 0.5) * 0.8;
          if (tooCloseToHub(hx, hz)) continue;
          if (gi < this.tufts.count) {
            this.writeInstance(this.tufts, gi++, hx, hz, 0.85 + hash(gi) * 0.5, 0.18);
          }
          if (fi < this.flowers.count && j === 0) {
            this.writeInstance(this.flowers, fi++, hx + 0.3, hz, 0.7 + hash(fi) * 0.4, 0.22);
          }
        }
      }
    }

    // Leftover → a few meadow clumps (not uniform noise)
    let clump = 0;
    while (
      (ti < this.trees.count || fi < this.flowers.count || gi < this.tufts.count || ri < this.rocks.count) &&
      clump < 12
    ) {
      clump++;
      const cx = wrapCoord((hash(clump * 11) - 0.5) * WORLD_SIZE * 0.85);
      const cz = wrapCoord((hash(clump * 17) - 0.5) * WORLD_SIZE * 0.85);
      if (tooCloseToHub(cx, cz)) continue;

      const treesHere = 3 + Math.floor(hash(clump) * 4);
      for (let k = 0; k < treesHere && ti < this.trees.count; k++) {
        const x = cx + (hash(clump * 40 + k) - 0.5) * 6;
        const z = cz + (hash(clump * 41 + k) - 0.5) * 6;
        if (tooCloseToHub(x, z)) continue;
        const s = 0.75 + hash(ti) * 0.85;
        this.writeInstance(this.trees, ti++, x, z, s, s * 1.35, [s * 0.7, s, s * 0.7]);
      }
      for (let k = 0; k < 10 && fi < this.flowers.count; k++) {
        const x = cx + (hash(clump * 50 + k) - 0.5) * 5;
        const z = cz + (hash(clump * 51 + k) - 0.5) * 5;
        this.writeInstance(this.flowers, fi++, x, z, 0.7 + hash(fi) * 0.45, 0.22);
      }
      for (let k = 0; k < 8 && gi < this.tufts.count; k++) {
        const x = cx + (hash(clump * 60 + k) - 0.5) * 5;
        const z = cz + (hash(clump * 61 + k) - 0.5) * 5;
        this.writeInstance(this.tufts, gi++, x, z, 0.85 + hash(gi) * 0.5, 0.18);
      }
      for (let k = 0; k < 3 && ri < this.rocks.count; k++) {
        const x = cx + (hash(clump * 70 + k) - 0.5) * 4;
        const z = cz + (hash(clump * 71 + k) - 0.5) * 4;
        const s = 0.55 + hash(ri) * 0.9;
        this.writeInstance(this.rocks, ri++, x, z, s, 0.22 * s);
      }
    }

    this.trees.mesh.instanceMatrix.needsUpdate = true;
    this.rocks.mesh.instanceMatrix.needsUpdate = true;
    this.flowers.mesh.instanceMatrix.needsUpdate = true;
    this.tufts.mesh.instanceMatrix.needsUpdate = true;
  }

  update(time: number, bagPos: THREE.Vector3, fogFar: number): void {
    // Floor so near-field never goes barren when fog pulls in
    const cull = Math.max(140, fogFar * 1.15);
    this.updateLayer(this.trees, time, bagPos, cull, true, (s) => [s * 0.7, s, s * 0.7]);
    this.updateLayer(this.rocks, time, bagPos, cull, false);
    this.updateLayer(this.flowers, time, bagPos, cull, false);
    this.updateLayer(this.tufts, time, bagPos, cull * 0.95, true, (s) => [s, s, s], 2.2, 0.12);
  }

  private updateLayer(
    layer: Layer,
    time: number,
    bagPos: THREE.Vector3,
    cull: number,
    sway: boolean,
    xzScale?: (s: number) => [number, number, number],
    swaySpeed = 1.1,
    swayAmt = 0.04,
  ): void {
    for (let i = 0; i < layer.count; i++) {
      const s0 = layer.scales[i]!;
      if (s0 <= 0) {
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        layer.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const lx = layer.base[i * 3]!;
      const y = layer.base[i * 3 + 1]!;
      const lz = layer.base[i * 3 + 2]!;
      const { x, z } = wrapNear(lx, lz, bagPos);
      const dist = Math.hypot(x - bagPos.x, z - bagPos.z);
      if (dist > cull) {
        this.dummy.scale.setScalar(0);
      } else {
        const phase = layer.phases[i]!;
        const sw = sway ? Math.sin(time * swaySpeed + phase) * swayAmt : 0;
        const sc = xzScale ? xzScale(s0) : ([s0, s0, s0] as [number, number, number]);
        this.dummy.position.set(x, y, z);
        this.dummy.scale.set(sc[0], sc[1] * (1 + sw * 0.3), sc[2]);
        this.dummy.rotation.set(sw, phase, sw * 0.5);
      }
      this.dummy.updateMatrix();
      layer.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
  }
}
