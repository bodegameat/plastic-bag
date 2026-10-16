import * as THREE from "three";
import type { Updraft } from "../game/Wind";
import { tagChunk } from "./landmarks";
import { terrainHeight } from "./terrain";

const GLITTER = [0xffffff, 0xffd6f0, 0xd6f4ff, 0xfff0b8, 0xe0ffe8, 0xffc8e8];
const CONFETTI = [0xff6a8a, 0xffd45a, 0x70d0ff, 0xff90d0, 0x6af0a0, 0xffa050, 0xb388ff];

/**
 * Soft vinyl weather: pastel glitter motes, tumbling confetti/receipt scraps,
 * and candy-colored wind ribbons — keeps the happy mood, sells the toy world.
 */
export class BreezeParticles {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private count: number;
  private confetti!: THREE.Points;
  private confPos: Float32Array;
  private confVel: Float32Array;
  private confCount: number;
  private ribbons: Array<{
    mesh: THREE.Line;
    baseX: number;
    baseY: number;
    baseZ: number;
    phase: number;
    speed: number;
  }> = [];

  constructor(count = 140) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.respawn(i, true);
      c.setHex(GLITTER[i % GLITTER.length]!);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.42,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    // Tumbling pastel confetti / receipt scraps
    this.confCount = Math.max(40, Math.floor(count * 0.55));
    this.confPos = new Float32Array(this.confCount * 3);
    this.confVel = new Float32Array(this.confCount * 3);
    const confColors = new Float32Array(this.confCount * 3);
    for (let i = 0; i < this.confCount; i++) {
      this.respawnConfetti(i, true);
      c.setHex(CONFETTI[i % CONFETTI.length]!);
      confColors[i * 3] = c.r;
      confColors[i * 3 + 1] = c.g;
      confColors[i * 3 + 2] = c.b;
    }
    const confGeo = new THREE.BufferGeometry();
    confGeo.setAttribute("position", new THREE.BufferAttribute(this.confPos, 3));
    confGeo.setAttribute("color", new THREE.BufferAttribute(confColors, 3));
    const confMat = new THREE.PointsMaterial({
      size: 0.55,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });
    this.confetti = new THREE.Points(confGeo, confMat);
    this.confetti.frustumCulled = false;
    this.points.add(this.confetti);

    // Candy wind stream ribbons
    const ribbonCount = 16;
    const segs = 12;
    const ribbonPalette = [0xffffff, 0xffd6f0, 0xd6f4ff, 0xfff0b8];
    for (let r = 0; r < ribbonCount; r++) {
      const rGeo = new THREE.BufferGeometry();
      const arr = new Float32Array(segs * 3);
      rGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const rMat = new THREE.LineBasicMaterial({
        color: ribbonPalette[r % ribbonPalette.length]!,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      const line = new THREE.Line(rGeo, rMat);
      line.frustumCulled = false;
      this.points.add(line);
      this.ribbons.push({
        mesh: line,
        baseX: (Math.random() - 0.5) * 44,
        baseY: 1.5 + Math.random() * 20,
        baseZ: (Math.random() - 0.5) * 44,
        phase: Math.random() * Math.PI * 2,
        speed: 4.5 + Math.random() * 3.5,
      });
    }
  }

  private respawn(i: number, initial = false): void {
    const o = i * 3;
    this.positions[o] = (Math.random() - 0.5) * 60;
    this.positions[o + 1] = 2 + Math.random() * 28;
    this.positions[o + 2] = (Math.random() - 0.5) * 60;
    this.velocities[o] = 0.6 + Math.random() * 1.4;
    this.velocities[o + 1] = (Math.random() - 0.5) * 0.25;
    this.velocities[o + 2] = -0.3 + Math.random() * 0.6;
    if (!initial) {
      this.positions[o] = 25 + Math.random() * 10;
    }
  }

  private respawnConfetti(i: number, initial = false): void {
    const o = i * 3;
    this.confPos[o] = (Math.random() - 0.5) * 52;
    this.confPos[o + 1] = initial ? 4 + Math.random() * 26 : 22 + Math.random() * 10;
    this.confPos[o + 2] = (Math.random() - 0.5) * 52;
    this.confVel[o] = 0.35 + Math.random() * 0.9;
    this.confVel[o + 1] = -0.55 - Math.random() * 0.85;
    this.confVel[o + 2] = -0.25 + Math.random() * 0.5;
  }

  update(dt: number, bagPos: THREE.Vector3, time: number): void {
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.positions[o]! += this.velocities[o]! * dt;
      this.positions[o + 1]! +=
        this.velocities[o + 1]! * dt + Math.sin(time * 1.5 + i) * 0.01;
      this.positions[o + 2]! += this.velocities[o + 2]! * dt;

      const lx = this.positions[o]!;
      const ly = this.positions[o + 1]!;
      const lz = this.positions[o + 2]!;
      if (lx > 35 || lx < -35 || ly > 40 || ly < 0.5 || lz > 35 || lz < -35) {
        this.respawn(i);
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    for (let i = 0; i < this.confCount; i++) {
      const o = i * 3;
      const flutter = Math.sin(time * 4.2 + i * 0.7) * 0.55;
      this.confPos[o]! += (this.confVel[o]! + flutter) * dt;
      this.confPos[o + 1]! += this.confVel[o + 1]! * dt;
      this.confPos[o + 2]! +=
        (this.confVel[o + 2]! + Math.cos(time * 3.1 + i) * 0.4) * dt;
      if (
        this.confPos[o + 1]! < 0.4 ||
        this.confPos[o]! > 32 ||
        this.confPos[o]! < -32 ||
        this.confPos[o + 2]! > 32 ||
        this.confPos[o + 2]! < -32
      ) {
        this.respawnConfetti(i);
      }
    }
    (this.confetti.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    for (let r = 0; r < this.ribbons.length; r++) {
      const rib = this.ribbons[r]!;
      rib.baseX += rib.speed * dt;
      if (rib.baseX > 28) {
        rib.baseX = -28;
        rib.baseZ = (Math.random() - 0.5) * 44;
        rib.baseY = 1.5 + Math.random() * 20;
      }
      const attr = rib.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let s = 0; s < 12; s++) {
        const u = s / 11;
        const x = rib.baseX - u * 4.8;
        const wave = Math.sin(time * 3.2 + rib.phase + u * 3.6);
        arr[s * 3] = x;
        arr[s * 3 + 1] = rib.baseY + wave * 0.35;
        arr[s * 3 + 2] = rib.baseZ + Math.cos(time * 2.4 + rib.phase + u * 2.8) * 0.45;
      }
      attr.needsUpdate = true;
    }

    this.points.position.copy(bagPos);
  }
}

/** Build visible swirling thermal updraft rings in the world so players can spot and ride them. */
export function buildUpdraftVents(
  parent: THREE.Group,
  updrafts: Updraft[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const ringGeo = new THREE.TorusGeometry(1, 0.045, 6, 24);
  ringGeo.rotateX(Math.PI / 2);

  const animatedRings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number; radius: number }> = [];

  for (const u of updrafts) {
    const chunk = new THREE.Group();
    tagChunk(chunk, new THREE.Vector3(u.position.x, 0, u.position.z), 65, true);
    chunk.position.set(u.position.x, terrainHeight(u.position.x, u.position.z), u.position.z);
    parent.add(chunk);

    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xc8f4ff : 0xfff2b8,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      chunk.add(ring);
      animatedRings.push({
        mesh: ring,
        mat,
        phase: i / 3,
        radius: u.radius * 0.52,
      });
    }
  }

  updaters.push((_dt, time) => {
    for (let i = 0; i < animatedRings.length; i++) {
      const r = animatedRings[i]!;
      const cycle = (time * 0.42 + r.phase) % 1;
      r.mesh.position.y = 0.6 + cycle * 11.5;
      const scale = r.radius * (0.65 + cycle * 0.55);
      r.mesh.scale.set(scale, 1, scale);
      r.mesh.rotation.y = time * 1.4 + r.phase * Math.PI * 2;
      r.mat.opacity = Math.sin(cycle * Math.PI) * 0.38;
    }
  });
}
