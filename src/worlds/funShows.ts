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
  originRot: THREE.Euler;
  baseScale: number;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  trail: THREE.Points | null;
  trailPos: Float32Array | null;
  trailI: number;
  popCard: THREE.Mesh;
  popOrigin: THREE.Vector3;
  done: boolean;
};

const POP_WORDS: Record<FunKind, string[]> = {
  takeoff: ["BON VOYAGE!", "88 MPH!", "CLEARED FOR TAKEOFF!"],
  spinout: ["SPIN CYCLE!", "AVANT-GARDE!", "WHIRLWIND!"],
  hop: ["BOING!", "ENCORE!", "CROWD SURF!"],
  micdrop: ["MIC DROP!", "BARS!", "IT WAS ALL A BAG!"],
  fling: ["SACRE BLEU!", "YEET!", "SLIP HAZARD!"],
  scramble: ["ABRACADABRA!", "SOLVED IT!", "NO SLEEVES!"],
  zoom: ["ZOOMIES!", "GOOD BOY!", "WALKIES!"],
  blast: ["DEPLOYED!", "PSSSHHH!", "SAFETY FIRST!"],
  jackpot: ["CHA-CHING!", "LOADS OF DOUGH!", "JACKPOT!"],
};

/**
 * Repeatable gags when you Enter / tap a scene's special prop, with 3D comic pop-cards.
 */
export class FunShows {
  readonly group = new THREE.Group();
  private shows: Show[] = [];
  private popSeq = 0;
  private _camPos = new THREE.Vector3();

  /** Start a gag if this mesh is a funInteractable. */
  trigger(mesh: THREE.Object3D): boolean {
    if (!mesh.userData.funInteract || mesh.userData.funBusy) return false;
    const kind = (mesh.userData.funKind as FunKind | undefined) ?? "hop";
    mesh.userData.funBusy = true;

    // Detach from physics while animating
    const body = mesh.userData.physicsBody as
      | {
          sleep?: () => void;
          position?: { set: (x: number, y: number, z: number) => void };
          velocity?: { set: (x: number, y: number, z: number) => void };
          angularVelocity?: { set: (x: number, y: number, z: number) => void };
        }
      | undefined;
    body?.velocity?.set(0, 0, 0);
    body?.angularVelocity?.set(0, 0, 0);
    body?.sleep?.();
    mesh.userData.physicsPin = true;

    const origin = (mesh.userData._funOrigin as THREE.Vector3 | undefined)?.clone() ?? mesh.position.clone();
    const originRot =
      (mesh.userData._funOriginRot as THREE.Euler | undefined)?.clone() ?? mesh.rotation.clone();
    mesh.userData._funOrigin = origin.clone();
    mesh.userData._funOriginRot = originRot.clone();

    const baseScale = (mesh.userData._funBaseScale as number | undefined) ?? (mesh.scale.x || 1);
    mesh.userData._funBaseScale = baseScale;

    const vel = new THREE.Vector3();
    const angVel = new THREE.Vector3();
    let dur = 2.8;
    let trail: THREE.Points | null = null;
    let trailPos: Float32Array | null = null;

    switch (kind) {
      case "takeoff":
        vel.set(18, 14, -8);
        angVel.set(0.2, 1.5, 0.1);
        dur = 3.8;
        ({ trail, trailPos } = makeStreak());
        this.group.add(trail);
        break;
      case "spinout":
        vel.set(5, 9, 3.5);
        angVel.set(8, 12, 4);
        dur = 3.0;
        ({ trail, trailPos } = makeStreak(0xff90d0));
        this.group.add(trail);
        break;
      case "hop":
        vel.set(0, 16, 0);
        angVel.set(0, 6, 0);
        dur = 2.4;
        break;
      case "micdrop":
        vel.set(0.5, 5.5, 0);
        angVel.set(7, 2, 0);
        dur = 2.2;
        break;
      case "fling":
        vel.set(11, 10, -4);
        angVel.set(10, 2, 8);
        dur = 2.9;
        ({ trail, trailPos } = makeStreak(0xffe080));
        this.group.add(trail);
        break;
      case "scramble":
        vel.set(0, 9.5, 0);
        angVel.set(14, 18, 10);
        dur = 3.1;
        ({ trail, trailPos } = makeStreak(0xd080ff));
        this.group.add(trail);
        break;
      case "zoom":
        vel.set(18, 5, 5);
        angVel.set(0, 6, 0);
        dur = 2.8;
        ({ trail, trailPos } = makeStreak(0xffe080));
        this.group.add(trail);
        break;
      case "blast":
        vel.set(0, 19, 0);
        angVel.set(2, 8, 2);
        dur = 3.2;
        ({ trail, trailPos } = makeStreak(0xa0e0ff));
        this.group.add(trail);
        break;
      case "jackpot":
        vel.set(0, 13, 0);
        angVel.set(0, 11, 0);
        dur = 3.0;
        ({ trail, trailPos } = makeStreak(0x40e080));
        this.group.add(trail);
        break;
    }

    const words = POP_WORDS[kind];
    const word = words[this.popSeq++ % words.length]!;
    const popCard = makeComicPopCard(word);
    const popOrigin = new THREE.Vector3();
    mesh.getWorldPosition(popOrigin);
    popOrigin.y += 2.2;
    popCard.position.copy(popOrigin);
    this.group.add(popCard);

    this.shows.push({
      mesh,
      kind,
      t: 0,
      dur,
      origin,
      originRot,
      baseScale,
      vel,
      angVel,
      trail,
      trailPos,
      trailI: 0,
      popCard,
      popOrigin,
      done: false,
    });
    return true;
  }

  update(dt: number, camera?: THREE.Camera): void {
    if (camera) {
      this._camPos.setFromMatrixPosition(camera.matrixWorld);
    }

    for (const s of this.shows) {
      if (s.done) continue;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);

      // Update comic pop card
      const popU = Math.min(1, s.t / 1.65);
      if (popU < 1) {
        const popScale = Math.sin(Math.min(1, s.t * 4.5) * (Math.PI * 0.5)) * (1 - Math.pow(popU, 3));
        s.popCard.scale.setScalar(Math.max(0.001, popScale * 1.15));
        s.popCard.position.set(
          s.popOrigin.x,
          s.popOrigin.y + popU * 2.4,
          s.popOrigin.z,
        );
        if (camera) {
          s.popCard.lookAt(this._camPos.x, s.popCard.position.y, this._camPos.z);
        }
      } else {
        s.popCard.visible = false;
      }

      if (s.kind === "hop") {
        const bounce = Math.abs(Math.sin(s.t * 5.2)) * Math.exp(-s.t * 0.85) * 2.6;
        s.mesh.position.y = s.origin.y + bounce;
        s.mesh.rotation.y = s.originRot.y + s.t * s.angVel.y;
        const pulse = 1 + Math.sin(s.t * 10) * 0.12 * Math.exp(-s.t);
        s.mesh.scale.setScalar(s.baseScale * pulse);
        if (u >= 1) {
          this.finishShow(s);
        }
        continue;
      }

      // Flight phase (first 76%), then springy parachute return to origin (76%..100%)
      if (u < 0.76) {
        s.vel.y -= 6.5 * dt;
        s.mesh.position.x += s.vel.x * dt;
        s.mesh.position.y = Math.max(s.origin.y, s.mesh.position.y + s.vel.y * dt);
        s.mesh.position.z += s.vel.z * dt;
        s.mesh.rotation.x += s.angVel.x * dt;
        s.mesh.rotation.y += s.angVel.y * dt;
        s.mesh.rotation.z += s.angVel.z * dt;
      } else {
        const r = (u - 0.76) / 0.24;
        const ease = 1 - Math.pow(1 - r, 3);
        s.mesh.position.lerpVectors(s.mesh.position, s.origin, ease);
        s.mesh.position.y += Math.sin(r * Math.PI) * 1.4;
        s.mesh.rotation.x = THREE.MathUtils.lerp(s.mesh.rotation.x, s.originRot.x, ease);
        s.mesh.rotation.y = THREE.MathUtils.lerp(s.mesh.rotation.y, s.originRot.y, ease);
        s.mesh.rotation.z = THREE.MathUtils.lerp(s.mesh.rotation.z, s.originRot.z, ease);
        const popBack = 1 + Math.sin(r * Math.PI) * 0.18;
        s.mesh.scale.setScalar(s.baseScale * popBack);
      }

      if (s.trail && s.trailPos) {
        const i = (s.trailI % 48) * 3;
        s.trailPos[i] = s.mesh.position.x;
        s.trailPos[i + 1] = s.mesh.position.y;
        s.trailPos[i + 2] = s.mesh.position.z;
        s.trailI++;
        (s.trail.geometry as THREE.BufferGeometry).attributes.position!.needsUpdate = true;
      }

      if (u >= 1) {
        this.finishShow(s);
      }
    }

    if (this.shows.length > 24) {
      this.shows = this.shows.filter((s) => !s.done);
    }
  }

  private finishShow(s: Show): void {
    s.done = true;
    s.mesh.position.copy(s.origin);
    s.mesh.rotation.copy(s.originRot);
    s.mesh.scale.setScalar(s.baseScale);
    s.mesh.visible = true;
    s.mesh.userData.funBusy = false;
    delete s.mesh.userData.physicsPin;

    const body = s.mesh.userData.physicsBody as
      | {
          position?: { set: (x: number, y: number, z: number) => void };
          velocity?: { set: (x: number, y: number, z: number) => void };
          angularVelocity?: { set: (x: number, y: number, z: number) => void };
        }
      | undefined;
    body?.position?.set(s.origin.x, s.origin.y + 0.5, s.origin.z);
    body?.velocity?.set(0, 0, 0);
    body?.angularVelocity?.set(0, 0, 0);

    if (s.trail) {
      this.group.remove(s.trail);
      s.trail.geometry.dispose();
    }
    this.group.remove(s.popCard);
    s.popCard.geometry.dispose();
  }
}

function makeComicPopCard(text: string): THREE.Mesh {
  const w = 384;
  const h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffe840";
  ctx.strokeStyle = "#1a1020";
  ctx.lineWidth = 8;

  // Starburst / comic badge polygon
  const cx = w / 2;
  const cy = h / 2;
  const spikes = 14;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2;
    const radX = i % 2 === 0 ? w * 0.46 : w * 0.38;
    const radY = i % 2 === 0 ? h * 0.44 : h * 0.34;
    const px = cx + Math.cos(ang) * radX;
    const py = cy + Math.sin(ang) * radY;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a1020";
  ctx.font = `700 36px "Fredoka", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy, w - 76);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.42),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
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
