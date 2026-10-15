import * as THREE from "three";
import { wrapDist } from "./wrap";
import { PUN_POI, type PunId } from "./punScenes";

type Bubble = {
  bag: THREE.Object3D;
  card: THREE.Mesh;
  line: string;
  scale: number;
  vel: number;
  show: boolean;
  excitedTimer: number;
};

const REACTION_LINES = {
  bump: [
    "watch the handles!",
    "my receipt!!",
    "hey! i'm delicate!",
    "crinkle rage!",
    "double bag me!",
    "excuse your gusset!",
  ],
  dash: [
    "whoa, gusty!!",
    "slow down turbo!",
    "my groceries!",
    "static cling!!",
    "category 5 bag!",
  ],
  gag: [
    "10/10 drift!",
    "do a flip!!",
    "encore! encore!",
    "iconic behavior!",
    "plastic pride!",
    "absolute cinema!",
  ],
};

/** Casual chat — deliberately different voice from zone title cards. */
const ZONE_LINES: Record<PunId, string[]> = {
  squiat: ["paint me", "so neo", "crown?", "yellow crayon"],
  plasticOnly: ["tote threat", "no cotton", "plastic only", "rival spotted"],
  bunny: ["bad bag", "yo", "drop the beat", "earless icon"],
  notorious: ["hypnotize", "brooklyn bag", "biggie energy", "mic check"],
  baguette: ["bon jour", "crusty", "oui oui", "pas de arms"],
  check: ["shoes off", "bin it", "security?", "laptop out"],
  windbag: ["and also…", "furthermore", "listen—", "anyway"],
  pipes: ["scotland!", "skirl", "highland whoosh", "drone on"],
  sleeping: ["zzz…", "five more", "cozy", "bagception"],
  tea: ["steep me", "darling", "pour?", "earl who?"],
  doggy: ["walkies", "good bag", "woof-ish", "leftovers?"],
  tricks: ["abracadabra", "no sleeves", "pick a card", "ta-da"],
  grocery: ["aisle 7", "receipt!", "milk run", "checkout"],
  mixed: ["suspicious", "burlap mood", "who am i", "shuffle"],
  future: ["88 mph", "flux bag", "great scott", "no carts"],
  money: ["cha-ching", "loaded", "dough", "ka-ching"],
  airbag: ["deploy!", "inflate", "whoosh", "buckle up"],
};

const FALLBACK = ["hey", "crinkle?", "bag life", "float on", "whoosh"];

/**
 * Tiny speech cards above NPC bags when you drift close.
 * Voice/style is intentionally different from zone popups.
 */
export class BagBubbles {
  readonly group = new THREE.Group();
  private bubbles: Bubble[] = [];
  private _cam = new THREE.Vector3();
  private _to = new THREE.Vector3();
  private _wp = new THREE.Vector3();
  private nextLine = 0;

  /** Call after world + props settle (safe to call again). */
  collect(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o.userData.isPlayer || o.userData._bagBubble) return;
      const phys = o.userData.toyPhysics as { kind?: string } | undefined;
      const isBag = phys?.kind === "bag" || o.userData.bagBob || o.userData.say;
      if (!isBag) return;
      o.userData._bagBubble = true;

      o.getWorldPosition(this._wp);
      const zone = nearestPun(this._wp.x, this._wp.z);
      const pool = ZONE_LINES[zone] ?? FALLBACK;
      const line =
        (o.userData.say as string | undefined) ??
        pool[this.nextLine++ % pool.length]!;

      const card = makeBubble(line);
      card.visible = false;
      card.scale.setScalar(0.001);
      this.group.add(card);
      this.bubbles.push({ bag: o, card, line, scale: 0, vel: 0, show: false, excitedTimer: 0 });
    });
  }

  /** Make nearby NPC bags react with funny outraged or cheering speech bubbles! */
  exciteNear(
    worldPos: THREE.Vector3,
    radius = 9.5,
    reason: "bump" | "dash" | "gag" = "bump",
  ): void {
    const pool = REACTION_LINES[reason];
    for (const b of this.bubbles) {
      if (!b.bag.parent) continue;
      b.bag.getWorldPosition(this._wp);
      const d = wrapDist(worldPos.x, worldPos.z, this._wp.x, this._wp.z);
      if (d > radius) continue;
      const newLine = pool[this.nextLine++ % pool.length]!;
      updateBubbleTexture(b.card, newLine, true);
      b.excitedTimer = 2.6;
      b.show = true;
      b.vel = 13;
      b.scale = Math.max(b.scale, 0.35);
    }
  }

  update(dt: number, bagPos: THREE.Vector3, camera: THREE.Camera): void {
    this._cam.setFromMatrixPosition(camera.matrixWorld);
    const dtC = Math.min(dt, 0.05);

    for (const b of this.bubbles) {
      if (!b.bag.parent) {
        b.card.visible = false;
        continue;
      }
      if (b.excitedTimer > 0) {
        b.excitedTimer -= dtC;
        if (b.excitedTimer <= 0) {
          updateBubbleTexture(b.card, b.line, false);
        }
      }

      b.bag.getWorldPosition(this._wp);
      const dist = wrapDist(bagPos.x, bagPos.z, this._wp.x, this._wp.z);
      const want = b.excitedTimer > 0 || dist < (b.show ? 7.5 : 5.5);

      if (want && !b.show) {
        b.show = true;
        b.vel = 8;
        b.scale = Math.max(b.scale, 0.15);
      } else if (!want && b.show) {
        b.show = false;
        b.vel = -2.5;
      }

      const target = b.show ? 1 : 0;
      b.vel += (target - b.scale) * (b.show ? 90 : 130) * dtC;
      b.vel *= Math.exp(-(b.show ? 10 : 14) * dtC);
      b.scale = Math.max(0, Math.min(1.25, b.scale + b.vel * dtC));
      if (!b.show && b.scale < 0.03) b.scale = 0;

      const s = b.scale;
      b.card.visible = s > 0.04;
      if (!b.card.visible) continue;

      const stretch = 1 + Math.max(0, b.vel) * 0.02;
      b.card.scale.set(s * stretch, s / Math.sqrt(stretch), s);
      (b.card.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s) * 0.94;
      b.card.position.set(
        this._wp.x,
        this._wp.y + 1.55 + Math.sin(performance.now() * 0.003 + this._wp.x) * 0.08,
        this._wp.z,
      );
      this._to.copy(this._cam);
      this._to.y = b.card.position.y;
      b.card.lookAt(this._to);
    }
  }
}

function nearestPun(x: number, z: number): PunId {
  let best: PunId = "squiat";
  let bestD = Infinity;
  for (const [id, p] of Object.entries(PUN_POI) as [PunId, { x: number; z: number }][]) {
    const d = wrapDist(x, z, p.x, p.z);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** Soft comic bubble — rounded, warm fill, handwritten weight. */
function makeBubble(text: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.15, 1.05),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  updateBubbleTexture(mesh, text, false);
  return mesh;
}

function updateBubbleTexture(mesh: THREE.Mesh, text: string, excited: boolean): void {
  const w = 340;
  const h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const r = 36;
  ctx.beginPath();
  ctx.moveTo(r, 18);
  ctx.arcTo(w - 18, 18, w - 18, h - 36, r);
  ctx.arcTo(w - 18, h - 36, 18, h - 36, r);
  ctx.lineTo(w * 0.4, h - 36);
  ctx.lineTo(w * 0.34, h - 10);
  ctx.lineTo(w * 0.48, h - 36);
  ctx.arcTo(18, h - 36, 18, 18, r);
  ctx.arcTo(18, 18, w - 18, 18, r);
  ctx.closePath();
  ctx.fillStyle = excited ? "rgba(255, 224, 140, 0.97)" : "rgba(255, 236, 210, 0.94)";
  ctx.fill();
  ctx.strokeStyle = excited ? "rgba(180, 50, 30, 0.65)" : "rgba(90, 55, 40, 0.35)";
  ctx.lineWidth = excited ? 4.5 : 3;
  ctx.stroke();

  ctx.fillStyle = excited ? "#7a1818" : "#4a3028";
  ctx.font = `${excited ? 700 : 600} 32px "Nunito", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.4, w - 44);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
}
