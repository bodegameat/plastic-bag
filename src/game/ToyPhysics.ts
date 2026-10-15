import * as CANNON from "cannon-es";
import * as THREE from "three";
import { wrapDelta, WORLD_HALF, WORLD_SIZE } from "../worlds/wrap";
import { terrainHeight } from "../worlds/terrain";

type Tracked = {
  mesh: THREE.Object3D;
  body: CANNON.Body;
  halfH: number;
  radius: number;
  yPivot: number;
  upright: boolean;
};

const ACTIVE_RANGE = 55;
const ACTIVE_RANGE_SQ = ACTIVE_RANGE * ACTIVE_RANGE;

function specKind(o: THREE.Object3D): "bag" | "prop" {
  return (o.userData.toyPhysics as { kind: "bag" | "prop" }).kind;
}

/**
 * Toy physics — gravity, terrain snap, player bumps, spawn separation.
 */
export class ToyPhysics {
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  private tracked: Tracked[] = [];
  private player = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(0.65),
  });
  private _q = new THREE.Quaternion();
  private _euler = new THREE.Euler();
  private carried: Tracked | null = null;
  private lastBumpAt = 0;
  onBump?: (strength: number, worldPos: THREE.Vector3, isBag: boolean) => void;

  constructor() {
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.85;
    this.world.defaultContactMaterial.restitution = 0.14;
    this.world.addBody(this.player);

    this.player.addEventListener(
      "collide",
      (ev: { body?: CANNON.Body; contact?: { getImpactVelocityAlongNormal?: () => number } }) => {
        const now = performance.now();
        if (now - this.lastBumpAt < 110) return;
        const other = ev.body;
        if (!other) return;
        const t = this.tracked.find((x) => x.body === other);
        if (!t || t === this.carried) return;
        const impact = Math.abs(ev.contact?.getImpactVelocityAlongNormal?.() ?? 2.5);
        if (impact < 0.8) return;
        this.lastBumpAt = now;
        const strength = Math.min(1, impact / 9);
        this.onBump?.(
          strength,
          new THREE.Vector3(t.body.position.x, t.body.position.y, t.body.position.z),
          t.upright,
        );
      },
    );
  }

  /** Register every bagNpc / prop marked with userData.toyPhysics. */
  collect(root: THREE.Object3D): void {
    const toBind: THREE.Object3D[] = [];
    root.traverse((o) => {
      const spec = o.userData.toyPhysics as
        | { kind: "bag" | "prop"; radius?: number }
        | undefined;
      if (!spec || o.userData.physicsPin || o.userData._physicsBound) return;
      toBind.push(o);
    });

    for (const o of toBind) {
      o.userData._physicsBound = true;
      delete o.userData.bagBob;
      root.attach(o);

      const box = new THREE.Box3().setFromObject(o);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const halfH = Math.max(0.15, size.y * 0.5);

      let shape: CANNON.Shape;
      let mass = 0.8;
      let upright = false;
      let radius = Math.max(0.25, Math.max(size.x, size.z) * 0.45);

      if (specKind(o) === "bag") {
        const spec = o.userData.toyPhysics as { radius?: number };
        radius = spec.radius ?? radius;
        shape = new CANNON.Sphere(radius);
        mass = 0.5;
        upright = true;
      } else {
        shape = new CANNON.Box(
          new CANNON.Vec3(
            Math.max(0.1, size.x * 0.48),
            Math.max(0.1, size.y * 0.48),
            Math.max(0.1, size.z * 0.48),
          ),
        );
        // Cap mass so huge GLBs don't explode the sim
        mass = Math.min(6, Math.max(0.35, size.x * size.y * size.z * 0.55));
        radius = Math.max(size.x, size.z) * 0.5;
      }

      const groundCenter = terrainHeight(center.x, center.z) + halfH;
      const bodyY = Math.max(center.y, groundCenter);
      const yPivot = bodyY - o.position.y;

      const body = new CANNON.Body({
        mass,
        shape,
        position: new CANNON.Vec3(center.x, bodyY, center.z),
        linearDamping: 0.55,
        angularDamping: upright ? 0.95 : 0.7,
        allowSleep: true,
        sleepSpeedLimit: 0.08,
        sleepTimeLimit: 0.25,
      });

      this.world.addBody(body);
      this.tracked.push({ mesh: o, body, halfH, radius, yPivot, upright });
      o.userData.physicsBody = body;
    }

    this.separateOverlaps(8);
    this.syncMeshesFromBodies();
  }

  /** Quiet steps so stacks drop instead of exploding on first frame. */
  settle(steps = 16): void {
    this.separateOverlaps(6);
    for (let i = 0; i < steps; i++) {
      this.world.step(1 / 60);
      for (const t of this.tracked) {
        const ground = terrainHeight(t.body.position.x, t.body.position.z) + t.halfH;
        if (t.body.position.y < ground) {
          t.body.position.y = ground;
          t.body.velocity.set(0, 0, 0);
          t.body.angularVelocity.set(0, 0, 0);
        }
      }
      this.separateOverlaps(2);
    }
    this.syncMeshesFromBodies();
    for (const t of this.tracked) t.body.sleep();
  }

  private separateOverlaps(iterations: number): void {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < this.tracked.length; i++) {
        const a = this.tracked[i]!;
        for (let j = i + 1; j < this.tracked.length; j++) {
          const b = this.tracked[j]!;
          const dx = a.body.position.x - b.body.position.x;
          const dz = a.body.position.z - b.body.position.z;
          const dist = Math.hypot(dx, dz) || 0.0001;
          const minDist = a.radius + b.radius + 0.08;
          if (dist >= minDist) continue;
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.body.position.x += nx * push;
          a.body.position.z += nz * push;
          b.body.position.x -= nx * push;
          b.body.position.z -= nz * push;
          a.body.velocity.x *= 0.5;
          a.body.velocity.z *= 0.5;
          b.body.velocity.x *= 0.5;
          b.body.velocity.z *= 0.5;
        }
      }
    }
  }

  private syncMeshesFromBodies(): void {
    for (const t of this.tracked) {
      t.mesh.position.set(
        t.body.position.x,
        t.body.position.y - t.yPivot,
        t.body.position.z,
      );
    }
  }

  syncPlayer(pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.player.position.set(pos.x, pos.y, pos.z);
    this.player.velocity.set(vel.x, vel.y, vel.z);
  }

  /** Nearest fun-interactable only (one gag prop per scene). */
  nearestInteractable(from: THREE.Vector3): {
    mesh: THREE.Object3D;
    dist: number;
    strength: number;
  } | null {
    let best: Tracked | null = null;
    let bestD = Infinity;
    let bestStrength = 0;
    for (const t of this.tracked) {
      if (!t.mesh.userData.funInteract || t.mesh.userData.funBusy) continue;
      const dx = wrapDelta(t.body.position.x, from.x);
      const dz = wrapDelta(t.body.position.z, from.z);
      const d = Math.hypot(dx, dz);
      const range = (t.mesh.userData.pokeRange as number | undefined) ?? 11;
      if (d < range && d < bestD) {
        bestD = d;
        best = t;
        bestStrength = (t.mesh.userData.pokeStrength as number | undefined) ?? 0;
      }
    }
    if (!best) return null;
    return { mesh: best.mesh, dist: bestD, strength: bestStrength };
  }

  pokeNearest(from: THREE.Vector3, _strength?: number): boolean {
    const hit = this.nearestInteractable(from);
    if (!hit) return false;
    return true; // actual gag is handled by FunShows
  }

  pokeMesh(mesh: THREE.Object3D, from: THREE.Vector3, strength = 9): boolean {
    const t = this.tracked.find((x) => x.mesh === mesh || meshParentOf(mesh, x.mesh));
    if (!t) return false;
    t.body.wakeUp();
    const dx = wrapDelta(t.body.position.x, from.x);
    const dz = wrapDelta(t.body.position.z, from.z);
    const len = Math.hypot(dx, dz) || 1;
    const ix = (dx / len) * strength;
    const iz = (dz / len) * strength;
    t.body.applyImpulse(
      new CANNON.Vec3(ix, strength * 0.45, iz),
      t.body.position,
    );
    return true;
  }

  /** Resolve a raycast Object3D up to a tracked physics root. */
  resolveTracked(obj: THREE.Object3D | null): THREE.Object3D | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      if (this.tracked.some((t) => t.mesh === o)) return o;
      o = o.parent;
    }
    return null;
  }

  /** Puff-Dash radial wind shockwave that scatters nearby props and NPC bags. */
  dashShockwave(from: THREE.Vector3, forward: THREE.Vector3): number {
    let hitCount = 0;
    const radius = 6.8;
    for (const t of this.tracked) {
      if (t === this.carried || t.mesh.userData.funBusy || t.mesh.userData.physicsPin) continue;
      const dx = wrapDelta(t.body.position.x, from.x);
      const dz = wrapDelta(t.body.position.z, from.z);
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      t.body.wakeUp();
      const falloff = 1 - d / radius;
      const nx = d > 0.05 ? dx / d : forward.x;
      const nz = d > 0.05 ? dz / d : forward.z;
      const push = (5.5 + falloff * 7.5) * Math.min(2.2, t.body.mass);
      t.body.applyImpulse(
        new CANNON.Vec3(
          (nx * 0.65 + forward.x * 0.35) * push,
          (2.8 + falloff * 3.8) * Math.min(2.0, t.body.mass),
          (nz * 0.65 + forward.z * 0.35) * push,
        ),
        t.body.position,
      );
      t.body.angularVelocity.set(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      );
      hitCount++;
    }
    return hitCount;
  }

  /** Currently static-clung prop/bag under the player, if any. */
  get isCarrying(): boolean {
    return this.carried !== null;
  }

  /** Check if a carryable prop or NPC bag is in static-cling reach. */
  canCarryNear(from: THREE.Vector3): boolean {
    if (this.carried) return true;
    return this.findCarryTarget(from) !== null;
  }

  private findCarryTarget(from: THREE.Vector3): Tracked | null {
    let best: Tracked | null = null;
    let bestD = Infinity;
    for (const t of this.tracked) {
      if (t.mesh.userData.funBusy || t.mesh.userData.physicsPin) continue;
      if (t.radius > 2.4) continue; // skip giant airplanes / conveyors
      const dx = wrapDelta(t.body.position.x, from.x);
      const dz = wrapDelta(t.body.position.z, from.z);
      const dy = Math.abs(t.body.position.y - from.y);
      if (dy > 5.5) continue;
      const d = Math.hypot(dx, dz);
      if (d < 5.2 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Pick up nearest prop/bag with static cling, or launch currently carried item. */
  toggleCarry(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
  ): { action: "pickup" | "drop" | "none"; mesh?: THREE.Object3D } {
    if (this.carried) {
      const released = this.carried;
      this.carried = null;
      released.body.wakeUp();
      released.body.velocity.set(
        playerVel.x * 1.45,
        Math.max(2.6, playerVel.y * 1.15 + 3.2),
        playerVel.z * 1.45,
      );
      released.body.angularVelocity.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
      );
      return { action: "drop", mesh: released.mesh };
    }

    const target = this.findCarryTarget(playerPos);
    if (!target) return { action: "none" };
    this.carried = target;
    target.body.wakeUp();
    return { action: "pickup", mesh: target.mesh };
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const step = Math.min(0.05, dt);

    // Keep props near the bag across the torus (same model as hub chunks)
    for (const t of this.tracked) {
      if (t.mesh.userData.funBusy) continue;
      wrapBodyToward(t, playerPos);
    }

    for (const t of this.tracked) {
      const dx = wrapDelta(t.mesh.position.x, playerPos.x);
      const dz = wrapDelta(t.mesh.position.z, playerPos.z);
      const near = dx * dx + dz * dz < ACTIVE_RANGE_SQ;
      if (near) {
        if (t.body.sleepState === CANNON.Body.SLEEPING) t.body.wakeUp();
      } else if (t.body.velocity.lengthSquared() < 0.04) {
        t.body.sleep();
      }
    }

    this.world.step(1 / 60, step, 3);

    if (this.carried) {
      if (this.carried.mesh.userData.funBusy) {
        this.carried = null;
      } else {
        const c = this.carried;
        const targetY = playerPos.y - 0.72 - Math.min(0.65, c.halfH * 0.45);
        c.body.position.set(playerPos.x, targetY, playerPos.z);
        c.body.velocity.set(0, 0, 0);
        c.body.angularVelocity.set(0, 1.5, 0);
        c.mesh.position.set(c.body.position.x, c.body.position.y - c.yPivot, c.body.position.z);
        c.mesh.rotation.y += step * 1.8;
      }
    }

    for (const t of this.tracked) {
      if (t === this.carried) continue;
      if (t.mesh.userData.funBusy || t.mesh.userData.physicsPin) continue;
      if (t.body.sleepState === CANNON.Body.SLEEPING) continue;

      const x = t.body.position.x;
      const z = t.body.position.z;
      const ground = terrainHeight(x, z) + t.halfH;

      if (t.body.position.y < ground) {
        t.body.position.y = ground;
        if (t.body.velocity.y < 0) t.body.velocity.y = 0;
        t.body.velocity.x *= 0.72;
        t.body.velocity.z *= 0.72;
        t.body.angularVelocity.scale(0.5);
      }

      t.mesh.position.set(
        t.body.position.x,
        t.body.position.y - t.yPivot,
        t.body.position.z,
      );

      if (t.upright) {
        this._euler.setFromQuaternion(
          this._q.set(
            t.body.quaternion.x,
            t.body.quaternion.y,
            t.body.quaternion.z,
            t.body.quaternion.w,
          ),
        );
        this._euler.x *= 0.75;
        this._euler.z *= 0.75;
        t.mesh.rotation.set(this._euler.x, this._euler.y, this._euler.z);
        t.body.quaternion.setFromEuler(this._euler.x, this._euler.y, this._euler.z);
      } else {
        t.mesh.quaternion.set(
          t.body.quaternion.x,
          t.body.quaternion.y,
          t.body.quaternion.z,
          t.body.quaternion.w,
        );
      }
    }
  }

  dispose(): void {
    for (const t of this.tracked) this.world.removeBody(t.body);
    this.world.removeBody(this.player);
    this.tracked.length = 0;
  }
}

function meshParentOf(child: THREE.Object3D, root: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = child;
  while (o) {
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}

/** Teleport body+mesh by ±WORLD_SIZE so it stays in the bag's current tile. */
function wrapBodyToward(t: Tracked, bag: THREE.Vector3): void {
  let x = t.body.position.x;
  let z = t.body.position.z;
  let shifted = false;
  while (x - bag.x > WORLD_HALF) {
    x -= WORLD_SIZE;
    shifted = true;
  }
  while (x - bag.x < -WORLD_HALF) {
    x += WORLD_SIZE;
    shifted = true;
  }
  while (z - bag.z > WORLD_HALF) {
    z -= WORLD_SIZE;
    shifted = true;
  }
  while (z - bag.z < -WORLD_HALF) {
    z += WORLD_SIZE;
    shifted = true;
  }
  if (!shifted) return;
  const dx = x - t.body.position.x;
  const dz = z - t.body.position.z;
  t.body.position.x = x;
  t.body.position.z = z;
  t.mesh.position.x += dx;
  t.mesh.position.z += dz;
}
