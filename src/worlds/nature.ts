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

/**
 * Instanced toy nature — dense near-field, aggressive fog cull on all layers.
 */
export class NatureField {
  readonly group = new THREE.Group();
  private trees!: Layer;
  private rocks!: Layer;
  private flowers!: Layer;
  private tufts!: Layer;
  private dummy = new THREE.Object3D();

  constructor(mobile: boolean) {
    // Bias toward near clutter: more flowers/tufts, moderate trees
    this.trees = this.makeLayer(
      mobile ? 160 : 260,
      new THREE.CapsuleGeometry(0.9, 1.8, 4, 8),
      TOY.canopy[0],
      true,
    );
    this.colorize(this.trees, TOY.canopy);
    this.rocks = this.makeLayer(
      mobile ? 90 : 140,
      new THREE.DodecahedronGeometry(0.55, 0),
      TOY.rock[0],
      true,
    );
    this.colorize(this.rocks, TOY.rock);
    this.flowers = this.makeLayer(
      mobile ? 360 : 560,
      new THREE.SphereGeometry(0.22, 5, 4),
      TOY.flower[0],
      false,
    );
    this.colorize(this.flowers, TOY.flower);
    this.tufts = this.makeLayer(
      mobile ? 400 : 620,
      new THREE.ConeGeometry(0.18, 0.55, 5),
      TOY.grassDeep,
      false,
    );

    this.scatter();
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

  scatter(avoidCenters: { x: number; z: number; r: number }[] = []): void {
    const place = (
      i: number,
      nearBias: number,
    ): { x: number; z: number; y: number } | null => {
      for (let attempt = 0; attempt < 10; attempt++) {
        // nearBias: fraction forced into ~80m of origin for dense near-field
        let x: number;
        let z: number;
        if (hash(i * 11 + attempt) < nearBias) {
          const ang = hash(i * 3 + attempt) * Math.PI * 2;
          const r = 8 + hash(i * 5 + attempt) * 72;
          x = Math.cos(ang) * r;
          z = Math.sin(ang) * r;
        } else {
          x = wrapCoord((hash(i * 3 + attempt) - 0.5) * WORLD_SIZE * 0.92);
          z = wrapCoord((hash(i * 7 + attempt + 2) - 0.5) * WORLD_SIZE * 0.92);
        }
        let ok = true;
        for (const a of avoidCenters) {
          const dx = x - a.x;
          const dz = z - a.z;
          if (dx * dx + dz * dz < a.r * a.r) {
            ok = false;
            break;
          }
        }
        if (ok) return { x, z, y: terrainHeight(x, z) };
      }
      return null;
    };

    const fill = (
      layer: Layer,
      seed: number,
      nearBias: number,
      yOff: (s: number) => number,
      scaleFn: (i: number) => number,
      xzScale?: (s: number) => [number, number, number],
    ): void => {
      for (let i = 0; i < layer.count; i++) {
        const p = place(seed + i, nearBias);
        if (!p) {
          layer.scales[i] = 0;
          continue;
        }
        const s = scaleFn(i);
        layer.scales[i] = s;
        layer.phases[i] = hash(seed + i) * Math.PI * 2;
        layer.base[i * 3] = p.x;
        layer.base[i * 3 + 1] = p.y + yOff(s);
        layer.base[i * 3 + 2] = p.z;
        const sc = xzScale ? xzScale(s) : ([s, s, s] as [number, number, number]);
        this.dummy.position.set(p.x, p.y + yOff(s), p.z);
        this.dummy.scale.set(sc[0], sc[1], sc[2]);
        this.dummy.rotation.set(0, layer.phases[i]!, 0);
        this.dummy.updateMatrix();
        layer.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
    };

    fill(this.trees, 100, 0.35, (s) => s * 1.4, (i) => 0.7 + hash(i) * 1.1, (s) => [s * 0.7, s, s * 0.7]);
    fill(this.rocks, 500, 0.4, (s) => 0.25 * s, (i) => 0.5 + hash(i + 20) * 1.4);
    fill(this.flowers, 900, 0.7, () => 0.25, (i) => 0.7 + hash(i) * 0.8);
    fill(this.tufts, 1400, 0.75, () => 0.2, (i) => 0.8 + hash(i) * 1.2);
  }

  /** Cull at fogFar * 0.85; wrap + sway. */
  update(time: number, bagPos: THREE.Vector3, fogFar: number): void {
    const cull = fogFar * 0.85;
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
