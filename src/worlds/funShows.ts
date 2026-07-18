import * as THREE from "three";

export type FunKind =
  | "takeoff"
  | "spinout"
  | "hop"
  | "micdrop"
  | "fling"
  | "scramble"
  | "zoom"
  | "blast"
  | "jackpot";

type Show = {
  mesh: THREE.Object3D;
  kind: FunKind;
  t: number;
  dur: number;
  origin: THREE.Vector3;
  baseScale: number;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  trail: THREE.Points | null;
  trailPos: Float32Array | null;
  trailI: number;
  done: boolean;
};

/**
 * One-shot gags when you Enter / tap a scene's special prop.
 */
export class FunShows {
  readonly group = new THREE.Group();
  private shows: Show[] = [];

  /** Start a gag if this mesh is a funInteractable. */
  trigger(mesh: THREE.Object3D): boolean {
    if (!mesh.userData.funInteract || mesh.userData.funBusy) return false;
    const kind = (mesh.userData.funKind as FunKind | undefined) ?? "hop";
    mesh.userData.funBusy = true;

    // Detach from physics while animating
    const body = mesh.userData.physicsBody as { sleep?: () => void; velocity?: { set: (x: number, y: number, z: number) => void } } | undefined;
    body?.velocity?.set(0, 0, 0);
    body?.sleep?.();
    mesh.userData.physicsPin = true;

    const origin = mesh.position.clone();
    const baseScale = mesh.scale.x || 1;
    const vel = new THREE.Vector3();
    const angVel = new THREE.Vector3();
    let dur = 2.8;
    let trail: THREE.Points | null = null;
    let trailPos: Float32Array | null = null;

    switch (kind) {
      case "takeoff":
        vel.set(18, 14, -8);
        angVel.set(0.2, 1.5, 0.1);
        dur = 4.5;
        ({ trail, trailPos } = makeStreak());
        this.group.add(trail);
        break;
      case "spinout":
        vel.set(6, 10, 4);
        angVel.set(8, 12, 4);
        dur = 3.2;
        break;
      case "hop":
        vel.set(0, 16, 0);
        angVel.set(0, 6, 0);
        dur = 2.4;
        break;
      case "micdrop":
        vel.set(0.5, 2, 0);
        angVel.set(4, 0, 0);
        dur = 2.0;
        break;
      case "fling":
        vel.set(12, 9, -4);
        angVel.set(10, 2, 8);
        dur = 3.0;
        break;
      case "scramble":
        vel.set(0, 8, 0);
        angVel.set(14, 18, 10);
        dur = 3.5;
        break;
      case "zoom":
        vel.set(22, 4, 6);
        angVel.set(0, 4, 0);
        dur = 3.0;
        ({ trail, trailPos } = makeStreak(0xffe080));
        this.group.add(trail);
        break;
      case "blast":
        vel.set(0, 22, 0);
        angVel.set(2, 8, 2);
        dur = 3.5;
        ({ trail, trailPos } = makeStreak(0xa0e0ff));
        this.group.add(trail);
        break;
      case "jackpot":
        vel.set(0, 12, 0);
        angVel.set(0, 10, 0);
        dur = 3.2;
        ({ trail, trailPos } = makeStreak(0x40e080));
        this.group.add(trail);
        break;
    }

    this.shows.push({
      mesh,
      kind,
      t: 0,
      dur,
      origin,
      baseScale,
      vel,
      angVel,
      trail,
      trailPos,
      trailI: 0,
      done: false,
    });
    return true;
  }

  update(dt: number): void {
    for (const s of this.shows) {
      if (s.done) continue;
      s.t += dt;
      const u = s.t / s.dur;

      if (s.kind === "micdrop") {
        s.mesh.rotation.x += s.angVel.x * dt;
        s.mesh.position.y = s.origin.y + Math.max(0, 1.2 - s.t * 2.2);
        if (s.t > s.dur) s.done = true;
        continue;
      }

      if (s.kind === "hop") {
        const bounce = Math.abs(Math.sin(s.t * 5)) * Math.exp(-s.t * 0.9) * 2.4;
        s.mesh.position.y = s.origin.y + bounce;
        s.mesh.rotation.y += s.angVel.y * dt;
        const pulse = 1 + Math.sin(s.t * 10) * 0.08 * Math.exp(-s.t);
        s.mesh.scale.setScalar(s.baseScale * pulse);
        if (s.t > s.dur) {
          s.mesh.position.copy(s.origin);
          s.mesh.scale.setScalar(s.baseScale);
          s.done = true;
          s.mesh.userData.funBusy = false;
          delete s.mesh.userData.physicsPin;
        }
        continue;
      }

      // Free flight / spin
      s.vel.y -= 6 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      s.mesh.rotation.x += s.angVel.x * dt;
      s.mesh.rotation.y += s.angVel.y * dt;
      s.mesh.rotation.z += s.angVel.z * dt;

      if (s.trail && s.trailPos) {
        const i = (s.trailI % 48) * 3;
        s.trailPos[i] = s.mesh.position.x;
        s.trailPos[i + 1] = s.mesh.position.y;
        s.trailPos[i + 2] = s.mesh.position.z;
        s.trailI++;
        (s.trail.geometry as THREE.BufferGeometry).attributes.position!.needsUpdate = true;
      }

      if (u >= 1) {
        s.done = true;
        s.mesh.visible = false;
        if (s.trail) s.trail.visible = false;
      }
    }
  }
}

function makeStreak(color = 0xfff0c0): { trail: THREE.Points; trailPos: Float32Array } {
  const n = 48;
  const trailPos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color,
      size: 0.55,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  trail.frustumCulled = false;
  return { trail, trailPos };
}
