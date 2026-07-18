import * as THREE from "three";
import type { Bag } from "./Bag";
import { terrainHeight } from "../worlds/terrain";
import { WORLD_SIZE, wrapCoord } from "../worlds/wrap";

interface Debris {
  mesh: THREE.Mesh;
  offset: THREE.Vector3;
  phase: number;
  joined: boolean;
  label?: string;
}

const SCRAP_COLORS = [0xffe8a0, 0xff80c0, 0x80ffd0, 0xffd040, 0xe8e0d0, 0x40c060, 0xff6040];

/**
 * Clingy flock — lyric scraps, receipts, money, leaves stick when you brush them.
 */
export class TrashFriends {
  readonly group = new THREE.Group();
  private items: Debris[] = [];
  private pool: Debris[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 48; i++) {
      const geo =
        i % 4 === 0
          ? new THREE.PlaneGeometry(0.55, 0.28)
          : i % 4 === 1
            ? new THREE.PlaneGeometry(0.2, 0.55)
            : i % 4 === 2
              ? new THREE.CircleGeometry(0.14, 5)
              : new THREE.PlaneGeometry(0.45, 0.22);

      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({
          color: SCRAP_COLORS[i % SCRAP_COLORS.length],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          flatShading: true,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        offset: new THREE.Vector3(),
        phase: Math.random() * Math.PI * 2,
        joined: false,
      });
    }
    this.scatter();
    scene.add(this.group);
  }

  scatter(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const item = this.pool[i]!;
      item.joined = false;
      item.mesh.visible = true;
      // Bias scraps near origin cluster + tile
      const near = Math.random() < 0.55;
      const x = near
        ? (Math.random() - 0.5) * 160
        : wrapCoord((Math.random() - 0.5) * WORLD_SIZE * 0.9);
      const z = near
        ? (Math.random() - 0.5) * 160
        : wrapCoord((Math.random() - 0.5) * WORLD_SIZE * 0.9);
      item.mesh.position.set(x, terrainHeight(x, z) + 0.8 + Math.random() * 5, z);
    }
    this.items = [];
  }

  /** Seed extra clingables at world joke spots. */
  seedAt(points: { x: number; z: number; y?: number }[]): void {
    for (let i = 0; i < Math.min(points.length, 12); i++) {
      const p = points[i]!;
      const item = this.pool[i];
      if (!item || item.joined) continue;
      item.mesh.position.set(p.x, p.y ?? terrainHeight(p.x, p.z) + 1.5, p.z);
      item.mesh.visible = true;
    }
  }

  update(dt: number, bag: Bag, time: number): void {
    for (const item of this.pool) {
      if (item.joined) continue;
      if (item.mesh.position.distanceTo(bag.position) < 2.8) {
        item.joined = true;
        item.offset.set(
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.0,
          1.0 + this.items.length * 0.32 + Math.random() * 0.35,
        );
        this.items.push(item);
      }
    }

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const trail = bag.velocity.clone().normalize().multiplyScalar(-1);
      if (trail.lengthSq() < 0.01) trail.set(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(trail, new THREE.Vector3(0, 1, 0)).normalize();
      const target = bag.position
        .clone()
        .addScaledVector(trail, item.offset.z)
        .addScaledVector(side, item.offset.x)
        .add(new THREE.Vector3(0, item.offset.y + Math.sin(time * 2 + item.phase) * 0.25, 0));
      item.mesh.position.lerp(target, 1 - Math.exp(-3.5 * dt));
      item.mesh.rotation.set(time * 1.5 + item.phase, time * 0.8 + item.phase, Math.sin(time + item.phase));
    }
  }
}
