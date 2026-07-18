import * as THREE from "three";
import type { SnagPoint } from "../game/SnagSystem";
import { terrainHeight } from "./terrain";
import { WORLD_SIZE } from "./wrap";

/** Canvas text billboards & Firework joke props — cheap, high joke density. */

const signCache = new Map<string, THREE.CanvasTexture>();

export function makeSignTexture(
  lines: string[],
  opts: {
    width?: number;
    height?: number;
    bg?: string;
    fg?: string;
    accent?: string;
  } = {},
): THREE.CanvasTexture {
  const key = JSON.stringify({ lines, opts });
  const hit = signCache.get(key);
  if (hit) return hit;

  const w = opts.width ?? 512;
  const h = opts.height ?? 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = opts.bg ?? "#1a1510";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = opts.accent ?? "#d4894a";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  const fg = opts.fg ?? "#f2e6d4";
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const n = lines.length;
  lines.forEach((raw, i) => {
    // ~~word~~ draws strikethrough (rare easter-egg cross-outs)
    const strike = raw.startsWith("~~") && raw.endsWith("~~") && raw.length > 4;
    const line = strike ? raw.slice(2, -2) : raw;
    const size = i === 0 ? (n > 2 ? 36 : 48) : 28;
    ctx.font = `600 ${size}px "Georgia", "Times New Roman", serif`;
    const y = h / 2 + (i - (n - 1) / 2) * (size + 10);
    ctx.fillStyle = fg;
    ctx.fillText(line, w / 2, y, w - 48);
    if (strike) {
      const tw = Math.min(ctx.measureText(line).width, w - 48);
      ctx.strokeStyle = fg;
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(w / 2 - tw / 2, y);
      ctx.lineTo(w / 2 + tw / 2, y);
      ctx.stroke();
    }
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signCache.set(key, tex);
  return tex;
}

export function makeBillboard(
  lines: string[],
  width: number,
  height: number,
  style?: Parameters<typeof makeSignTexture>[1],
): THREE.Mesh {
  const tex = makeSignTexture(lines, {
    ...style,
    width: 512,
    height: Math.round(512 * (height / width)),
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.65,
      metalness: 0.05,
      emissiveMap: tex,
      emissive: new THREE.Color(0x444444),
      emissiveIntensity: 0.25,
    }),
  );
  return mesh;
}

export function makeRoadSign(lines: string[]): THREE.Group {
  const g = new THREE.Group();
  const board = makeBillboard(lines, 4.5, 2.4, { bg: "#2a5a8c", fg: "#ffffff", accent: "#ffffff" });
  board.position.y = 3.2;
  g.add(board);
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.45 }),
  );
  post.position.y = 1.6;
  g.add(post);
  return g;
}

export function makeBanner(text: string, length = 14): THREE.Group {
  const g = new THREE.Group();
  const banner = makeBillboard([text], length, 1.8, {
    bg: "#c45c2a",
    fg: "#fff5e6",
    accent: "#ffd090",
  });
  banner.position.y = 5.5;
  g.add(banner);
  for (const x of [-length / 2, length / 2]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x666660 }),
    );
    pole.position.set(x, 3, 0);
    g.add(pole);
  }
  return g;
}

export function makeFireworkStand(): THREE.Group {
  const g = new THREE.Group();
  const tent = new THREE.Mesh(
    new THREE.BoxGeometry(8, 3.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.7 }),
  );
  tent.position.y = 1.6;
  tent.castShadow = true;
  g.add(tent);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.15, 5.4),
    new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.55 }),
  );
  awning.position.y = 3.3;
  g.add(awning);

  const sign = makeBillboard(["IGNITE", "THE LIGHT"], 6, 1.6, {
    bg: "#1a1020",
    fg: "#ffd060",
    accent: "#ff6040",
  });
  sign.position.set(0, 4.4, 2.6);
  g.add(sign);

  // mortar tubes
  for (let i = 0; i < 6; i++) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x333338, metalness: 0.6, roughness: 0.4 }),
    );
    tube.position.set(-2.5 + i * 1, 0.55, 3.2);
    g.add(tube);
  }
  return g;
}

export function makeDiscoBall(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({
      color: 0xe8e8f0,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x334455,
      emissiveIntensity: 0.2,
    }),
  );
  ball.position.y = 3.2;
  g.add(ball);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 2, 4),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  cord.position.y = 4.4;
  g.add(cord);
  g.userData.spin = true;
  return g;
}

export function makeHurricaneDebris(count: number, oz: number): {
  group: THREE.Group;
  snags: SnagPoint[];
} {
  const group = new THREE.Group();
  const snags: SnagPoint[] = [];
  for (let i = 0; i < count; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 + Math.random(), 0.08, 2 + Math.random() * 2),
      new THREE.MeshStandardMaterial({ color: 0x8a7355, roughness: 0.9 }),
    );
    const x = (Math.random() - 0.5) * 70;
    const z = (Math.random() - 0.5) * 50;
    plank.position.set(x, 0.2, z);
    plank.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
    group.add(plank);
    if (i % 3 === 0) {
      snags.push({ position: new THREE.Vector3(x, 0.8, z + oz), radius: 1.2 });
    }
  }
  // taped window frame joke
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xc8c0b0 }),
  );
  frame.position.set(18, 1.2, -5);
  group.add(frame);
  const tape = makeBillboard(["after a", "hurricane"], 2.8, 1.6, {
    bg: "#e8e0d0",
    fg: "#333028",
    accent: "#888070",
  });
  tape.position.set(18, 1.2, -4.85);
  group.add(tape);
  return { group, snags };
}

export function makePerson(shirtColor: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }),
  );
  body.position.y = 1.0;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.7 }),
  );
  head.position.y = 1.7;
  g.add(head);
  g.userData.wander = {
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 0.8,
    radius: 4 + Math.random() * 8,
    ox: 0,
    oz: 0,
  };
  return g;
}

export function makeChalkBurst(x: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff6a9a,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.04, z);
  return mesh;
}

export function makeRocketInTree(): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }),
  );
  stick.position.set(0.8, 3.5, 0.3);
  stick.rotation.z = 0.6;
  stick.rotation.x = -0.3;
  g.add(stick);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4040, roughness: 0.5 }),
  );
  tip.position.copy(stick.position).add(new THREE.Vector3(0.55, 0.9, -0.25));
  g.add(tip);
  return g;
}

export function makeLyricScrap(text: string): THREE.Mesh {
  const scrap = makeBillboard([text], 1.4, 0.7, {
    bg: "#f5f0e4",
    fg: "#2a2520",
    accent: "#c4a882",
  });
  scrap.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  scrap.position.y = 0.05;
  return scrap;
}

/** Chunk with origin for distance show/hide (wrap-aware). */
export function tagChunk(group: THREE.Group, origin: THREE.Vector3, radius = 160, terrainAnchor = false): void {
  group.userData.chunk = {
    origin: origin.clone(),
    radius,
    logical: origin.clone(),
    terrainAnchor,
  };
}

export function updateChunks(
  root: THREE.Group,
  bagPos: THREE.Vector3,
  loadDist = 220,
  unloadDist = 300,
): void {
  root.traverse((obj) => {
    if (!obj.userData.chunk || obj === root) return;
    const chunk = obj.userData.chunk as {
      origin: THREE.Vector3;
      radius: number;
      logical: THREE.Vector3;
      terrainAnchor?: boolean;
    };
    const logical = chunk.logical ?? chunk.origin;

    // Snap chunk to nearest wrap image of its logical origin (works for infinite bag coords)
    const bestOx = Math.round((bagPos.x - logical.x) / WORLD_SIZE) * WORLD_SIZE;
    const bestOz = Math.round((bagPos.z - logical.z) / WORLD_SIZE) * WORLD_SIZE;
    const wx = logical.x + bestOx;
    const wz = logical.z + bestOz;
    const wy = chunk.terrainAnchor ? terrainHeight(wx, wz) : 0;
    obj.position.set(wx, wy, wz);

    const bestD = (wx - bagPos.x) ** 2 + (wz - bagPos.z) ** 2;
    const d = Math.sqrt(bestD);
    if (d < loadDist + chunk.radius * 0.25) obj.visible = true;
    else if (d > unloadDist + chunk.radius * 0.25) obj.visible = false;
  });
}
