import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { WORLD_SIZE, wrapDist } from "./wrap";

type ZoneInfo = {
  name: string;
  blurb?: string;
  centerX: number;
  centerZ: number;
  radius: number;
};

type Marker = {
  root: THREE.Group;
  card: THREE.Mesh;
  diamond: THREE.Mesh;
  cx: number;
  cz: number;
  radius: number;
  scale: number;
  vel: number;
  visible: boolean;
};

/**
 * World-space zone titles — diamond beacon always, card springs in when near.
 * Snaps to nearest wrap image so titles work across the torus.
 */
export class ZonePopups {
  readonly group = new THREE.Group();
  private markers: Marker[] = [];
  private _cam = new THREE.Vector3();
  private _to = new THREE.Vector3();

  constructor(zones: ZoneInfo[]) {
    for (const z of zones) {
      const root = new THREE.Group();
      root.position.set(z.centerX, terrainHeight(z.centerX, z.centerZ) + 4.2, z.centerZ);
      root.frustumCulled = false;

      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.48, 0),
        new THREE.MeshStandardMaterial({
          color: 0xfff8e0,
          emissive: 0xffe8a0,
          emissiveIntensity: 0.95,
          roughness: 0.35,
          metalness: 0.1,
        }),
      );
      diamond.position.y = 1.5;
      diamond.castShadow = true;
      diamond.frustumCulled = false;
      root.add(diamond);

      const card = makePopupCard(z.name, z.blurb ?? "");
      card.position.y = 0.1;
      card.scale.setScalar(0.001);
      card.visible = false;
      card.frustumCulled = false;
      root.add(card);

      this.group.add(root);
      this.markers.push({
        root,
        card,
        diamond,
        cx: z.centerX,
        cz: z.centerZ,
        radius: Math.max(22, z.radius * 1.25),
        scale: 0,
        vel: 0,
        visible: false,
      });
    }
  }

  update(
    dt: number,
    bag: THREE.Vector3,
    camera: THREE.Camera,
    time: number,
    _altitude?: { fw: number; sp: number },
  ): void {
    this._cam.setFromMatrixPosition(camera.matrixWorld);
    const dtClamped = Math.min(dt, 0.05);

    for (const m of this.markers) {
      const ox = Math.round((bag.x - m.cx) / WORLD_SIZE) * WORLD_SIZE;
      const oz = Math.round((bag.z - m.cz) / WORLD_SIZE) * WORLD_SIZE;
      const wx = m.cx + ox;
      const wz = m.cz + oz;
      m.root.position.set(wx, terrainHeight(wx, wz) + 4.2, wz);

      const dist = wrapDist(bag.x, bag.z, m.cx, m.cz);
      const enterR = m.radius * 0.9;
      const exitR = m.radius * 1.15;
      const want = m.visible ? dist < exitR : dist < enterR;

      if (want && !m.visible) {
        m.visible = true;
        m.vel = 12;
        m.scale = Math.max(m.scale, 0.25);
      } else if (!want && m.visible) {
        m.visible = false;
        m.vel = -3.5;
      }

      const target = m.visible ? 1 : 0;
      const stiffness = m.visible ? 120 : 170;
      const damping = m.visible ? 9 : 14;
      m.vel += (target - m.scale) * stiffness * dtClamped;
      m.vel *= Math.exp(-damping * dtClamped);
      m.scale += m.vel * dtClamped;
      if (!m.visible && m.scale < 0.02) {
        m.scale = 0;
        m.vel = 0;
      }
      m.scale = Math.max(0, Math.min(1.4, m.scale));

      const s = m.scale;
      m.card.visible = s > 0.04;
      const stretch = 1 + Math.max(0, m.vel) * 0.018;
      const squash = 1 / Math.sqrt(stretch);
      m.card.scale.set(Math.max(0.001, s * stretch), Math.max(0.001, s * squash), Math.max(0.001, s));
      (m.card.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s) * 0.96;

      m.diamond.rotation.y += dtClamped * 1.7;
      m.diamond.position.y = 1.5 + Math.sin(time * 2.5 + m.cx) * 0.2;
      const beacon = THREE.MathUtils.clamp(1.2 - dist / (m.radius * 2.8), 0.35, 1);
      m.diamond.scale.setScalar(0.5 + beacon * 0.45 + Math.min(1, s) * 0.25);
      m.diamond.visible = true;

      if (m.card.visible) {
        this._to.copy(this._cam);
        this._to.y = m.root.position.y + m.card.position.y;
        m.card.lookAt(this._to);
      }
    }
  }
}

function makePopupCard(title: string, blurb: string): THREE.Mesh {
  const w = 512;
  const h = 280;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  roundRect(ctx, 16, 16, w - 32, h - 32, 12);
  ctx.fillStyle = "rgba(12, 16, 28, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 232, 160, 0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 248, 224, 0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  ctx.fillStyle = "#ffe8a0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 44px "Fredoka", system-ui, sans-serif`;
  ctx.fillText(title, w / 2, blurb ? h * 0.4 : h / 2, w - 80);

  if (blurb) {
    ctx.fillStyle = "rgba(242, 236, 220, 0.78)";
    ctx.font = `500 22px "Nunito", system-ui, sans-serif`;
    ctx.fillText(blurb, w / 2, h * 0.68, w - 90);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  return new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 3.35),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
