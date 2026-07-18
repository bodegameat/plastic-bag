import * as THREE from "three";
import type { WorldId } from "../audio/types";
import type { SnagPoint } from "../game/SnagSystem";
import { finalizeBagNpc, makeBagNpc, BAG_GROUND_CLEAR } from "./bagNpc";
import { makeBillboard, tagChunk } from "./landmarks";
import { terrainHeight } from "./terrain";

type Poi = { x: number; z: number };

/** Bag-pun diorama hubs — tight cluster for Bruno-level density. */
export const PUN_POI = {
  squiat: { x: 0, z: 0 },
  plasticOnly: { x: 42, z: -32 },
  bunny: { x: -40, z: 36 },
  notorious: { x: 48, z: 42 },
  baguette: { x: -48, z: -40 },
  check: { x: 18, z: 70 },
  windbag: { x: -68, z: 18 },
  pipes: { x: 72, z: -18 },
  sleeping: { x: -18, z: -72 },
  tea: { x: 32, z: -68 },
  doggy: { x: -72, z: -22 },
  tricks: { x: 68, z: 22 },
  grocery: { x: -32, z: 68 },
  mixed: { x: 10, z: -40 },
  future: { x: -58, z: 58 },
  money: { x: 58, z: -52 },
  airbag: { x: -10, z: 24 },
} as const;

/** Path links between hubs — shared by roads + nature avenues. */
export const PUN_PATHS: [keyof typeof PUN_POI, keyof typeof PUN_POI][] = [
  ["squiat", "plasticOnly"],
  ["squiat", "airbag"],
  ["squiat", "mixed"],
  ["bunny", "notorious"],
  ["baguette", "tea"],
  ["check", "grocery"],
  ["windbag", "doggy"],
  ["pipes", "tricks"],
  ["sleeping", "tea"],
  ["future", "money"],
  ["airbag", "mixed"],
  ["plasticOnly", "money"],
  ["bunny", "squiat"],
  ["notorious", "tricks"],
  ["doggy", "baguette"],
  ["grocery", "future"],
];

export type PunId = keyof typeof PUN_POI;

export const PUN_META: Record<
  PunId,
  { title: string; blurb: string; worldId: WorldId; radius: number; vibe: ZoneVibe }
> = {
  squiat: {
    title: "Bag-squiat",
    blurb: "basquiat, but make it polyethylene",
    worldId: "city",
    radius: 32,
    vibe: "neon",
  },
  plasticOnly: {
    title: "Plastic Bags Only",
    blurb: "the reusable war",
    worldId: "city",
    radius: 30,
    vibe: "hot",
  },
  bunny: {
    title: "Bag Bunny",
    blurb: "bad bunny who?",
    worldId: "fair",
    radius: 32,
    vibe: "party",
  },
  notorious: {
    title: "The Notorious B.A.G.",
    blurb: "it was all a bag",
    worldId: "overpass",
    radius: 30,
    vibe: "night",
  },
  baguette: {
    title: "Baguette",
    blurb: "non, I do not see you",
    worldId: "suburban",
    radius: 28,
    vibe: "warm",
  },
  check: {
    title: "Bag Check",
    blurb: "please remove all humans",
    worldId: "parking",
    radius: 32,
    vibe: "cool",
  },
  windbag: {
    title: "The Windbag",
    blurb: "and furthermore…",
    worldId: "fields",
    radius: 30,
    vibe: "dust",
  },
  pipes: {
    title: "Bag Pipes",
    blurb: "scotland the brave (crinkle)",
    worldId: "fields",
    radius: 28,
    vibe: "green",
  },
  sleeping: {
    title: "Sleeping Bags",
    blurb: "bag inside bag. meta.",
    worldId: "fields",
    radius: 30,
    vibe: "camp",
  },
  tea: {
    title: "Tea Bags",
    blurb: "steeping ourselves, darling",
    worldId: "suburban",
    radius: 28,
    vibe: "warm",
  },
  doggy: {
    title: "Doggy Bag",
    blurb: "walkies",
    worldId: "suburban",
    radius: 26,
    vibe: "warm",
  },
  tricks: {
    title: "Bag of Tricks",
    blurb: "nothing up my sleeve (no sleeves)",
    worldId: "fair",
    radius: 28,
    vibe: "party",
  },
  grocery: {
    title: "Grocery Run",
    blurb: "finish line is a receipt",
    worldId: "parking",
    radius: 32,
    vibe: "cool",
  },
  mixed: {
    title: "Mixed Bag",
    blurb: "hi, i'm a suspicious burlap",
    worldId: "horizon",
    radius: 28,
    vibe: "soft",
  },
  future: {
    title: "Bag to the Future",
    blurb: "where we're going, we don't need carts",
    worldId: "fair",
    radius: 30,
    vibe: "neon",
  },
  money: {
    title: "Bags of Money",
    blurb: "cha-ching in polyethylene",
    worldId: "city",
    radius: 30,
    vibe: "night",
  },
  airbag: {
    title: "Air Bag",
    blurb: "deploying personality",
    worldId: "horizon",
    radius: 28,
    vibe: "soft",
  },
};

type ZoneVibe = "neon" | "hot" | "party" | "night" | "warm" | "cool" | "dust" | "green" | "camp" | "soft";

const VIBE: Record<
  ZoneVibe,
  { fog: number; skyTop: number; skyBot: number; sun: number; ambient: number; exposure?: number }
> = {
  neon: { fog: 0xd030a0, skyTop: 0x380858, skyBot: 0xff70c0, sun: 0xff40c0, ambient: 0x9020a0, exposure: 1.2 },
  hot: { fog: 0xe02080, skyTop: 0xc00840, skyBot: 0xffc0e0, sun: 0xff40a0, ambient: 0xa01860, exposure: 1.15 },
  party: { fog: 0xff60b0, skyTop: 0xff2080, skyBot: 0xffd070, sun: 0xffe040, ambient: 0xff40a0, exposure: 1.2 },
  night: { fog: 0x584868, skyTop: 0x281848, skyBot: 0xb87898, sun: 0xff80a8, ambient: 0x584060, exposure: 1.0 },
  warm: { fog: 0xff9040, skyTop: 0xff5010, skyBot: 0xffe070, sun: 0xffc020, ambient: 0xff8040, exposure: 1.15 },
  cool: { fog: 0x7088a8, skyTop: 0x385888, skyBot: 0xd0d8f0, sun: 0xc0d0e8, ambient: 0x506078, exposure: 0.95 },
  dust: { fog: 0xd0a060, skyTop: 0xa05020, skyBot: 0xffe8b0, sun: 0xffc040, ambient: 0xb07030 },
  green: { fog: 0x50c030, skyTop: 0x186820, skyBot: 0xc0f060, sun: 0xc0ff40, ambient: 0x40a030 },
  camp: { fog: 0x40d030, skyTop: 0x189028, skyBot: 0xd0ff90, sun: 0xffa040, ambient: 0x308828 },
  soft: { fog: 0x90b0e0, skyTop: 0x4068a8, skyBot: 0xe8e0ff, sun: 0xc0d0ff, ambient: 0x7088c0 },
};

function toyMat(color: number, opts?: { emissive?: number; emi?: number }): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.emi ?? 0,
  });
}

function chunkAt(parent: THREE.Group, poi: Poi, radius = 42): THREE.Group {
  const chunk = new THREE.Group();
  tagChunk(chunk, new THREE.Vector3(poi.x, 0, poi.z), radius, true);
  chunk.position.set(poi.x, terrainHeight(poi.x, poi.z), poi.z);
  parent.add(chunk);
  return chunk;
}

function sit(obj: THREE.Object3D, localX: number, localZ: number, poi: Poi, yOff = 0): void {
  const wx = poi.x + localX;
  const wz = poi.z + localZ;
  obj.position.set(localX, terrainHeight(wx, wz) - terrainHeight(poi.x, poi.z) + yOff, localZ);
}

/**
 * Thick ground disc — never a flat CircleGeometry (those z-fight the meadow).
 * `yOff` is the top clearance; cylinder is centered so the bottom sits above grass.
 */
function groundDisc(
  g: THREE.Group,
  poi: Poi,
  radius: number,
  color: number,
  opts: { segs?: number; thick?: number; lx?: number; lz?: number } = {},
): THREE.Mesh {
  const thick = opts.thick ?? 0.18;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, thick, opts.segs ?? 20),
    toyMat(color),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const mat = mesh.material as THREE.MeshLambertMaterial;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  // Bottom of cylinder ≈ terrain + 0.06
  sit(mesh, opts.lx ?? 0, opts.lz ?? 0, poi, thick * 0.5 + 0.06);
  g.add(mesh);
  return mesh;
}

function addBag(
  g: THREE.Group,
  poi: Poi,
  lx: number,
  lz: number,
  opts: {
    color?: number;
    scale?: number;
    smile?: boolean;
    sash?: string;
    yOff?: number;
    pin?: boolean;
    say?: string;
  } = {},
): THREE.Group {
  const bag = makeBagNpc(opts);
  if (opts.say) bag.userData.say = opts.say;
  sit(bag, lx, lz, poi, opts.yOff ?? BAG_GROUND_CLEAR);
  g.add(bag);
  finalizeBagNpc(bag, !!opts.pin || (opts.yOff ?? 0) > 1.15);
  return bag;
}

/** Traffic cone — bumpable. */
function addCone(g: THREE.Group, poi: Poi, lx: number, lz: number, scale = 1): void {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.7 * scale, 7), toyMat(0xff6020));
  sit(cone, lx, lz, poi, 0.35 * scale);
  cone.userData.toyPhysics = { kind: "prop" as const };
  g.add(cone);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.22 * scale, 0.08 * scale, 8),
    toyMat(0xfff8e0),
  );
  sit(stripe, lx, lz, poi, 0.28 * scale);
  g.add(stripe);
}

function podium(g: THREE.Group, poi: Poi, lx: number, lz: number): void {
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.0), toyMat(0x4a4038));
  sit(p, lx, lz, poi, 0.7);
  g.add(p);
}

function addHeroLight(g: THREE.Group, color: number, intensity = 2): void {
  const light = new THREE.PointLight(color, intensity, 36, 2);
  light.position.set(0, 5, 0);
  g.add(light);
}

export function placeAllPunScenes(
  parent: THREE.Group,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  placeSquiat(parent, PUN_POI.squiat, snags, updaters);
  placePlasticOnly(parent, PUN_POI.plasticOnly, snags);
  placeBunny(parent, PUN_POI.bunny, snags, updaters);
  placeNotorious(parent, PUN_POI.notorious, snags);
  placeBaguette(parent, PUN_POI.baguette, snags);
  placeCheck(parent, PUN_POI.check, snags);
  placeWindbag(parent, PUN_POI.windbag, snags, updaters);
  placePipes(parent, PUN_POI.pipes, snags);
  placeSleeping(parent, PUN_POI.sleeping, snags);
  placeTea(parent, PUN_POI.tea, snags);
  placeDoggy(parent, PUN_POI.doggy, snags, updaters);
  placeTricks(parent, PUN_POI.tricks, snags, updaters);
  placeGrocery(parent, PUN_POI.grocery, snags);
  placeMixed(parent, PUN_POI.mixed, snags);
  placeFuture(parent, PUN_POI.future, snags, updaters);
  placeMoney(parent, PUN_POI.money, snags);
  placeAirbag(parent, PUN_POI.airbag, snags, updaters);
}

function placeSquiat(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xff9060, 2.4);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 0.4), toyMat(0xe8e0d0));
  sit(wall, 0, -4, poi, 4);
  g.add(wall);
  // Abstract mural only — title lives in the zone popup
  const splash = new THREE.Mesh(new THREE.BoxGeometry(9, 5.2, 0.12), toyMat(0x201018));
  sit(splash, 0, -3.75, poi, 4.2);
  g.add(splash);
  const accent = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 0.14), toyMat(0xffe060));
  sit(accent, -2.2, -3.6, poi, 5.1);
  accent.rotation.z = -0.18;
  g.add(accent);
  const accent2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.14), toyMat(0xff4060));
  sit(accent2, 2.4, -3.6, poi, 3.8);
  accent2.rotation.z = 0.22;
  g.add(accent2);
  const artist = addBag(g, poi, -2.5, 1, {
    color: 0xfff8e8,
    scale: 1.15,
    sash: "BAG",
    yOff: 0.1,
  });
  updaters.push((_dt, time) => {
    artist.rotation.z = Math.sin(time * 2.2) * 0.12;
  });
  addBag(g, poi, 3.5, 3, { color: 0xffe0e8, scale: 0.9 });
  addBag(g, poi, 5, 1.5, { color: 0xe0f0ff, scale: 0.85 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placePlasticOnly(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xff4060, 2.2);
  // Enemy: reusable tote
  const reusable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.3), toyMat(0x40a060));
  sit(reusable, 0, -4.5, poi, 0.9);
  g.add(reusable);
  // Protest arc
  for (let i = 0; i < 5; i++) {
    const ang = -0.85 + (i / 4) * 1.7;
    addBag(g, poi, Math.sin(ang) * 5.2, Math.cos(ang) * 3.2, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0, 0xe8e0d0][i],
      scale: 1,
      sash: i % 2 === 0 ? "BAG" : undefined,
    });
  }
  const placard = makeBillboard(["PLASTIC", "ONLY"], 2.2, 1.4, {
    bg: "#fff0e0",
    fg: "#c02040",
    accent: "#ff8060",
  });
  sit(placard, -2.8, 1.2, poi, 1.7);
  g.add(placard);
  const placard2 = makeBillboard(["TOTE?", "NOPE"], 1.8, 1.2, {
    bg: "#201018",
    fg: "#ffe060",
    accent: "#ff4060",
  });
  sit(placard2, 2.8, 1.5, poi, 1.6);
  g.add(placard2);
  addCone(g, poi, -4, -5.5, 0.95);
  addCone(g, poi, 4, -5.5, 0.95);
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeBunny(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xff40c0, 2.5);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(8, 0.55, 5), toyMat(0x302038));
  sit(stage, 0, -1, poi, 0.35);
  g.add(stage);
  const star = addBag(g, poi, 0, -1.5, { color: 0xffe0f0, scale: 1.3, sash: "BAG", yOff: 0.85, pin: true });
  updaters.push((_dt, time) => {
    star.rotation.z = Math.sin(time * 4) * 0.12;
  });
  // Crowd of 5 with spacing
  for (let i = 0; i < 5; i++) {
    addBag(g, poi, -6 + i * 3, 5.5, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0, 0xe8e0d0][i],
      scale: 0.9,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeNotorious(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffd040, 2.8);
  // Street corner
  const corner = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 7), toyMat(0x3a4048));
  sit(corner, 0, 0, poi, 0.24);
  g.add(corner);
  // Neon strip on the curb
  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.08, 0.18),
    toyMat(0xff60a0, { emissive: 0xff2080, emi: 0.85 }),
  );
  sit(neon, 0, -3.2, poi, 0.22);
  g.add(neon);
  // Streetlight
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), toyMat(0x303038));
  sit(pole, -3.6, -2.8, poi, 2.1);
  g.add(pole);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 6, 5),
    toyMat(0xffe8a0, { emissive: 0xffd060, emi: 0.9 }),
  );
  sit(lamp, -3.6, -2.8, poi, 4.3);
  g.add(lamp);
  const lampLight = new THREE.PointLight(0xffd080, 1.6, 18, 2);
  lampLight.position.set(-3.6, 4.2, -2.8);
  g.add(lampLight);
  // Graffiti wall
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 0.35), toyMat(0x2a2830));
  sit(wall, 0, 4.2, poi, 1.6);
  g.add(wall);
  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.1, 0.12),
    toyMat(0xffe060, { emissive: 0xffa000, emi: 0.35 }),
  );
  sit(tag, -0.6, 4.0, poi, 2.1);
  tag.rotation.z = -0.12;
  g.add(tag);
  // King of the corner
  const king = addBag(g, poi, 0, 0.3, { color: 0xfff8e8, scale: 1.35, sash: "BAG" });
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.42, 5),
    toyMat(0xffd020, { emissive: 0xffa000, emi: 0.45 }),
  );
  crown.position.set(0, 1.4, 0);
  king.add(crown);
  for (let i = 0; i < 3; i++) {
    addBag(g, poi, -3.2 + i * 3.2, 3.5, { color: 0xe8e0d0, scale: 0.9 });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeBaguette(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffc060, 2);
  groundDisc(g, poi, 5.5, 0xd8c8a0);
  // awning — café read from distance (table/chairs/loaf from GLBs)
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 2.2), toyMat(0xe04040));
  sit(awning, 0, -2.2, poi, 2.6);
  g.add(awning);
  const french = addBag(g, poi, 0, -1.5, { color: 0xfff8e8, scale: 1.1, pin: true, yOff: 0.55 });
  const beret = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    toyMat(0x202830),
  );
  beret.position.set(0.05, 1.25, 0);
  beret.scale.set(1, 0.55, 1);
  french.add(beret);
  addBag(g, poi, 3.5, 2.0, { color: 0xe0f0ff, scale: 0.85 });
  addBag(g, poi, -3.5, 2.2, { color: 0xffe0e8, scale: 0.8 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeCheck(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 80);
  addHeroLight(g, 0x80c0ff, 2);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.4), toyMat(0x808890));
  sit(arch, 0, 0, poi, 2.2);
  g.add(arch);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.5), toyMat(0x40e080, { emissive: 0x20a050, emi: 0.5 }));
  sit(beam, 0, 0, poi, 4.3);
  g.add(beam);
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, -5.5 + i * 2.2, 5, { color: 0xf2efe6, scale: 0.9 });
  }
  const human = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.5), toyMat(0xffc0a0));
  sit(human, 0, -2.5, poi, 1.2);
  g.add(human);
  addBag(g, poi, -2.2, -2.5, { color: 0xffe0e8, scale: 1, sash: "BAG", yOff: 1.5, pin: true });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeWindbag(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffd080, 2.0);
  groundDisc(g, poi, 5, 0x6a5040);
  podium(g, poi, 0, 0);
  const speaker = addBag(g, poi, 0, 0.2, {
    color: 0xfff8e8,
    scale: 1.2,
    sash: "BAG",
    yOff: 1.5,
    pin: true,
    say: "mic check",
  });
  updaters.push((_dt, time) => {
    speaker.scale.y = 1 + Math.sin(time * 6) * 0.06;
  });
  for (let i = 0; i < 4; i++) {
    const asleep = addBag(g, poi, -4.5 + i * 3, 5.5, {
      color: 0xe8e0d0,
      scale: 0.9,
      pin: true,
      say: "zzz…",
    });
    asleep.rotation.x = 0.85;
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placePipes(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0x60e080, 2.2);
  groundDisc(g, poi, 6, 0x2a7040);
  for (let i = 0; i < 4; i++) {
    const piper = addBag(g, poi, -4.5 + i * 3, 0, { color: 0xf2efe6, scale: 1.05 });
    const kilt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.15), toyMat(0x206040));
    kilt.position.set(0, 0.35, 0.2);
    piper.add(kilt);
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

function placeSleeping(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffa040, 1.6);
  for (let i = 0; i < 4; i++) {
    const lx = -4.5 + i * 3;
    const lz = (i % 2) * 2.5;
    const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.2, 4, 8), toyMat(0x4060a0));
    sit(outer, lx, lz, poi, 0.4);
    outer.rotation.z = Math.PI / 2;
    g.add(outer);
    const inner = addBag(g, poi, lx, lz, {
      color: 0xfff8e8,
      scale: 0.55,
      yOff: 0.35,
      pin: true,
      smile: i !== 1,
    });
    inner.rotation.z = 0.15;
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 3 });
}

function placeTea(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xe8d0a0, 2);
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.4, 10), toyMat(0xf0f0f8));
    sit(cup, -3 + i * 2.2, 0, poi, 0.7);
    g.add(cup);
    addBag(g, poi, -3 + i * 2.2, 0, { color: 0xd0b080, scale: 0.7, yOff: 1.1, pin: true });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

function placeDoggy(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffc080, 1.6);
  groundDisc(g, poi, 5.5, 0xb0c890);
  // fire hydrant
  const hydrant = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), toyMat(0xe02030));
  post.position.y = 0.45;
  hydrant.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toyMat(0xc01828));
  cap.position.y = 0.95;
  hydrant.add(cap);
  sit(hydrant, -3.2, -2.2, poi, 0);
  g.add(hydrant);
  const walker = addBag(g, poi, -1.4, 0.2, { color: 0xfff8e8, scale: 1.1 });
  const pup = addBag(g, poi, 1.8, 0.5, { color: 0xffe0e8, scale: 0.45, yOff: 0.05 });
  const leash = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5), toyMat(0x403020));
  sit(leash, 0.2, 0.35, poi, 0.65);
  leash.rotation.z = Math.PI / 2.4;
  g.add(leash);
  // one bystander
  addBag(g, poi, -4.2, 2.8, { color: 0xe0f0ff, scale: 0.85 });
  updaters.push((_dt, time) => {
    pup.position.x = 1.8 + Math.sin(time * 1.5) * 0.12;
  });
  void walker;
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 2 });
}

function placeTricks(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xc040ff, 2.6);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.45, 12), toyMat(0x401060));
  sit(stage, 0, 0, poi, 0.3);
  g.add(stage);
  // Spotlight cone cue
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 3.5, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe8ff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  sit(spot, 0, 0, poi, 3.2);
  spot.rotation.x = Math.PI;
  g.add(spot);
  const curtain = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.2), toyMat(0x601040));
  sit(curtain, 0, 3.8, poi, 1.9);
  g.add(curtain);
  const mag = addBag(g, poi, 0, 0, { color: 0x202028, scale: 1.2, smile: false, yOff: 0.5, pin: true });
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 10), toyMat(0x101018));
  hat.position.set(0, 1.3, 0);
  mag.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), toyMat(0x101018));
  brim.position.set(0, 1.1, 0);
  mag.add(brim);
  const rabbit = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), toyMat(0xf0e8e0));
  rabbit.position.set(0, 1.7, 0);
  mag.add(rabbit);
  updaters.push((_dt, time) => {
    rabbit.position.y = 1.55 + Math.abs(Math.sin(time * 2)) * 0.45;
  });
  for (let i = 0; i < 4; i++) addBag(g, poi, -4.5 + i * 3, 5.2, { scale: 0.85 });
  const cards: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const card = makeBillboard(["★", "ACE"], 0.9, 1.2, {
      bg: "#fff8f0",
      fg: "#c02040",
      accent: "#c02040",
    });
    sit(card, -3 + i * 3, -3.5, poi, 1.8 + i * 0.3);
    cards.push(card);
    g.add(card);
  }
  updaters.push((_dt, time) => {
    cards.forEach((c, i) => {
      c.position.y = 1.8 + i * 0.3 + Math.sin(time * 1.4 + i) * 0.25;
      c.rotation.y = time * 0.6 + i;
    });
  });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

function placeGrocery(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 75);
  const track = new THREE.Mesh(new THREE.BoxGeometry(22, 0.22, 3), toyMat(0x687088));
  sit(track, 0, 0, poi, 0.16);
  g.add(track);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 3.2), toyMat(0xfff8e0));
  sit(tape, 8.5, 0, poi, 1.0);
  g.add(tape);
  const receipt = makeBillboard(["TOTAL", "$0.00"], 2.5, 1.5, {
    bg: "#fff8e0",
    fg: "#303030",
    accent: "#808080",
  });
  sit(receipt, 8.5, -0.2, poi, 2.2);
  g.add(receipt);
  // racers on the lane
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, -7 + i * 3.5, (i % 2) * 0.9 - 0.4, { scale: 0.95, color: 0xfff8e8 });
  }
  // one shelf row of spilled cans (food GLBs land nearby via scatter)
  for (let i = 0; i < 2; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.45), toyMat(0xa0a8b0));
    sit(shelf, -4 + i * 5, -4.2, poi, 0.8);
    g.add(shelf);
  }
  addCone(g, poi, 7, 2.2, 0.9);
  addCone(g, poi, 7, -2.2, 0.9);
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 3 });
}

function placeMixed(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xa0c0ff, 2.0);
  const pile = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), toyMat(0x8a7060));
  sit(pile, 0, 0, poi, 0.7);
  g.add(pile);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), toyMat(0xc4a882));
  sit(lid, 0, 0, poi, 1.5);
  g.add(lid);
  const kinds: { color: number }[] = [
    { color: 0xc4a882 },
    { color: 0xa0e8ff },
    { color: 0xff80b0 },
    { color: 0x8a7060 },
    { color: 0xf2efe6 },
    { color: 0xe0f0ff },
  ];
  for (let i = 0; i < kinds.length; i++) {
    const ang = (i / kinds.length) * Math.PI * 2;
    addBag(g, poi, Math.cos(ang) * 3.6, Math.sin(ang) * 3.6, {
      color: kinds[i]!.color,
      scale: 1,
      sash: i === 3 ? "BAG" : undefined,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 2 });
}

function placeFuture(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0x40c0ff, 2.4);
  const cart = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 1.8), toyMat(0x3050a0));
  sit(cart, 0, 0, poi, 0.8);
  g.add(cart);
  const driver = addBag(g, poi, 0, 0, { color: 0xfff8e8, scale: 0.95, yOff: 1.4, pin: true });
  const flameL = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 1.2, 5),
    toyMat(0xff6020, { emissive: 0xff4000, emi: 0.8 }),
  );
  sit(flameL, -1.2, 1.2, poi, 0.5);
  flameL.rotation.z = Math.PI / 2;
  g.add(flameL);
  const flameR = flameL.clone();
  sit(flameR, -1.2, -1.2, poi, 0.5);
  flameR.rotation.z = Math.PI / 2;
  g.add(flameR);
  updaters.push((_dt, time) => {
    const s = 0.85 + Math.sin(time * 12) * 0.2;
    flameL.scale.set(s, 1, s);
    flameR.scale.set(s, 1, s);
    driver.rotation.z = Math.sin(time * 8) * 0.05;
  });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeMoney(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0x40e080, 2);
  groundDisc(g, poi, 7, 0x1a3028);
  for (let i = 0; i < 3; i++) {
    addBag(g, poi, -3 + i * 3, 3.2, { color: 0x40a060, scale: 1.0, sash: "BAG" });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 3 });
}

function placeAirbag(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xffffff, 2);
  groundDisc(g, poi, 4.5, 0xb8c4d0);
  const dash = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.14, 6, 20), toyMat(0x405060));
  dash.rotation.x = Math.PI / 2;
  sit(dash, 0, 0, poi, 0.28);
  g.add(dash);
  const falling = addBag(g, poi, 1.8, 0.3, { color: 0xffe0e8, scale: 0.85, yOff: 3.5, pin: true });
  const hero = addBag(g, poi, 0, 0, { color: 0xfff8e8, scale: 1, yOff: 0.1, pin: true });
  addBag(g, poi, -2.6, 1.8, { color: 0xe0f0ff, scale: 0.8 });
  addBag(g, poi, 2.6, -1.4, { color: 0xfff0d0, scale: 0.75 });
  addCone(g, poi, -3.6, -2.8, 0.85);
  addCone(g, poi, 3.6, -2.8, 0.85);
  addCone(g, poi, 0, 3.6, 0.85);
  updaters.push((_dt, time) => {
    const puff = 1 + Math.abs(Math.sin(time * 1.8)) * 0.7;
    hero.scale.set(puff, puff * 0.9, puff);
    falling.position.y = 3.0 + Math.sin(time * 0.7) * 0.35;
  });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

/** Zone list for atmosphere + proximity titles. */
export function buildPunZones(): {
  id: WorldId;
  name: string;
  centerX: number;
  centerZ: number;
  radius: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  ambientColor: number;
  skyTop: number;
  skyBottom: number;
  exposure: number;
  windBase: THREE.Vector3;
  swirl: number;
  turbulence: number;
  blurb: string;
}[] {
  return (Object.keys(PUN_POI) as PunId[]).map((key) => {
    const poi = PUN_POI[key];
    const meta = PUN_META[key];
    const v = VIBE[meta.vibe];
    return {
      id: meta.worldId,
      name: meta.title,
      centerX: poi.x,
      centerZ: poi.z,
      radius: meta.radius,
      fogColor: v.fog,
      fogNear: 10,
      fogFar: 160,
      sunColor: v.sun,
      ambientColor: v.ambient,
      skyTop: v.skyTop,
      skyBottom: v.skyBot,
      exposure: v.exposure ?? 1.08,
      windBase: new THREE.Vector3(0.45, 0.3, -0.25),
      swirl: 2,
      turbulence: 1.2,
      blurb: meta.blurb,
    };
  });
}
