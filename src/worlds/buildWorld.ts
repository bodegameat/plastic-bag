import * as THREE from "three";
import type { WorldId } from "../audio/types";
import type { SnagPoint } from "../game/SnagSystem";
import type { GustZone, Updraft, WindConfig } from "../game/Wind";
import { finalizeBagNpc, makeBagNpc, updateBagNpcs, BAG_GROUND_CLEAR } from "./bagNpc";
import {
  makeBanner,
  makeBillboard,
  makeChalkBurst,
  makeDiscoBall,
  makeFireworkStand,
  makeHurricaneDebris,
  makeLyricScrap,
  makeRoadSign,
  makeRocketInTree,
  tagChunk,
  updateChunks,
} from "./landmarks";
import { NatureField, TOY } from "./nature";
import { buildTerrainMesh, terrainHeight } from "./terrain";
import { WORLD_HALF, wrapDist } from "./wrap";

export interface ZoneAtmosphere {
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
}

export interface AdventureWorld {
  group: THREE.Group;
  wind: WindConfig;
  snagPoints: SnagPoint[];
  zones: ZoneAtmosphere[];
  update: (
    dt: number,
    time: number,
    bagPos?: THREE.Vector3,
    fogFar?: number,
    spaceAmt?: number,
  ) => void;
  spawn: THREE.Vector3;
  heightAt: (x: number, z: number) => number;
}

type Poi = { x: number; z: number };

/** Dense toy joke hubs — close enough to stumble between. */
const POI = {
  suburban: { x: 0, z: 0 },
  fields: { x: 110, z: -85 },
  school: { x: -95, z: 75 },
  overpass: { x: 85, z: 115 },
  city: { x: -100, z: -105 },
  fair: { x: 125, z: 45 },
  parking: { x: -130, z: -15 },
  lookout: { x: 15, z: 155 },
  meadow: { x: 65, z: -145 },
  mailbox: { x: 45, z: 35 },
  pool: { x: -50, z: -45 },
  busstop: { x: -35, z: 130 },
  treehouse: { x: 155, z: -35 },
  bench: { x: 35, z: -60 },
  protest: { x: -145, z: 55 },
  church: { x: -175, z: -95 },
  drivein: { x: 185, z: 95 },
  therapy: { x: -70, z: 185 },
  beach: { x: -15, z: -195 },
  wedding: { x: 95, z: -50 },
  laundry: { x: -90, z: -130 },
  cafe: { x: 160, z: -110 },
  office: { x: -160, z: 120 },
  lemonade: { x: 50, z: 160 },
  balloon: { x: -120, z: -160 },
  recycle: { x: 130, z: 150 },
  employee: { x: -180, z: 20 },
  palms: { x: 200, z: -60 },
  juice: { x: -40, z: -170 },
} as const;

export function buildAdventureWorld(mobile = false): AdventureWorld {
  const group = new THREE.Group();
  const snagPoints: SnagPoint[] = [];
  const gustZones: GustZone[] = [];
  const updrafts: Updraft[] = [];
  const updaters: Array<(dt: number, time: number) => void> = [];

  const segs = mobile ? 48 : 72;
  const terrain = buildTerrainMesh(220, segs, TOY.grass);
  group.add(terrain.mesh);

  const paths = new THREE.Group();
  tagChunk(paths, new THREE.Vector3(0, 0, 0), WORLD_HALF + 50);
  const pathPlanks = addWindingPaths(paths);
  group.add(paths);

  placeSuburban(group, POI.suburban, snagPoints, updaters);
  placeFields(group, POI.fields, snagPoints);
  placeSchool(group, POI.school, snagPoints);
  placeOverpass(group, POI.overpass, snagPoints);
  placeCity(group, POI.city, snagPoints, updaters);
  placeFair(group, POI.fair, snagPoints);
  placeParking(group, POI.parking, snagPoints);
  placeLookout(group, POI.lookout, snagPoints);
  placeMeadow(group, POI.meadow, snagPoints);
  placeMailbox(group, POI.mailbox, snagPoints);
  placePool(group, POI.pool, snagPoints);
  placeBusStop(group, POI.busstop, snagPoints);
  placeTreehouse(group, POI.treehouse, snagPoints);
  placeBench(group, POI.bench, snagPoints);
  placeProtest(group, POI.protest, snagPoints);
  placeChurch(group, POI.church, snagPoints);
  placeDriveIn(group, POI.drivein, snagPoints);
  placeTherapy(group, POI.therapy, snagPoints);
  placeBeach(group, POI.beach, snagPoints);
  placeWedding(group, POI.wedding, snagPoints);
  placeLaundry(group, POI.laundry, snagPoints);
  placeCafe(group, POI.cafe, snagPoints);
  placeOffice(group, POI.office, snagPoints);
  placeLemonade(group, POI.lemonade, snagPoints);
  placeBalloonFuneral(group, POI.balloon, snagPoints);
  placeRecycle(group, POI.recycle, snagPoints);
  placeEmployee(group, POI.employee, snagPoints);
  placePalms(group, POI.palms, snagPoints);
  placeJuice(group, POI.juice, snagPoints);
  placeMicroJokes(group);

  const avoid = Object.values(POI).map((p) => ({ x: p.x, z: p.z, r: 18 }));
  const nature = new NatureField(mobile);
  nature.scatter(avoid);
  group.add(nature.group);

  updaters.push((dt, time) => {
    updateBagNpcs(group, time);
    group.traverse((o) => {
      if (o.userData.spin) o.rotation.y += dt * 0.8;
      if (o.userData.sway) {
        o.rotation.z = Math.sin(time * 1.3 + o.userData.sway) * 0.06;
      }
    });
    void gustZones;
    void updrafts;
  });

  const zones: ZoneAtmosphere[] = [
    mkZone("suburban", "Bag Neighborhood", POI.suburban, 70, {
      fog: 0xff9040,
      skyTop: 0xff5010,
      skyBot: 0xffe070,
      sun: 0xffc020,
      ambient: 0xff8040,
      exposure: 1.18,
    }),
    mkZone("fields", "Bag Disaster Relief", POI.fields, 70, {
      fog: 0x50c030,
      skyTop: 0x186820,
      skyBot: 0xc0f060,
      sun: 0xc0ff40,
      ambient: 0x40a030,
      exposure: 1.05,
    }),
    mkZone("suburban", "Bag Pep Rally", POI.school, 65, {
      fog: 0xff8040,
      skyTop: 0xff6010,
      skyBot: 0xffd080,
      sun: 0xffa030,
      ambient: 0xff7030,
      exposure: 1.15,
    }),
    mkZone("overpass", "Stuck on the Rail", POI.overpass, 65, {
      fog: 0x4060a8,
      skyTop: 0x183878,
      skyBot: 0x90b0e0,
      sun: 0x80a0ff,
      ambient: 0x304878,
      exposure: 0.98,
    }),
    mkZone("city", "Bag Plaza", POI.city, 75, {
      fog: 0x3848a0,
      skyTop: 0x101868,
      skyBot: 0xffc070,
      sun: 0xffa040,
      ambient: 0x283878,
      exposure: 1.12,
    }),
    mkZone("fair", "Bag Karaoke", POI.fair, 70, {
      fog: 0xd030a0,
      skyTop: 0x380858,
      skyBot: 0xff70c0,
      sun: 0xff40c0,
      ambient: 0x9020a0,
      exposure: 1.22,
    }),
    mkZone("parking", "Bag Mart Lot", POI.parking, 70, {
      fog: 0x7088a8,
      skyTop: 0x385888,
      skyBot: 0xd0d8f0,
      sun: 0xc0d0e8,
      ambient: 0x506078,
      exposure: 0.95,
    }),
    mkZone("horizon", "Bag Lookout", POI.lookout, 80, {
      fog: 0x2088ff,
      skyTop: 0x0830c0,
      skyBot: 0xffd070,
      sun: 0xffe060,
      ambient: 0x3060c0,
      exposure: 1.25,
    }),
    mkZone("fields", "Bag Campfire", POI.meadow, 65, {
      fog: 0x40d030,
      skyTop: 0x189028,
      skyBot: 0xd0ff90,
      sun: 0xffa040,
      ambient: 0x308828,
      exposure: 1.08,
    }),
    mkZone("suburban", "Empty Mailbox Lane", POI.mailbox, 50, {
      fog: 0xff8040,
      skyTop: 0xff5018,
      skyBot: 0xffe0a0,
      sun: 0xffb040,
      ambient: 0xff7030,
    }),
    mkZone("parking", "Bag Pool Party", POI.pool, 50, {
      fog: 0x20a8e8,
      skyTop: 0x0870c0,
      skyBot: 0xa0e8ff,
      sun: 0x60e0ff,
      ambient: 0x2080b0,
      exposure: 1.15,
    }),
    mkZone("overpass", "Bag Bus Stop", POI.busstop, 50, {
      fog: 0x687888,
      skyTop: 0x304050,
      skyBot: 0xc0c8d8,
      sun: 0xa0b0c0,
      ambient: 0x405060,
      exposure: 0.92,
    }),
    mkZone("fields", "Treehouse Secret", POI.treehouse, 55, {
      fog: 0x40b848,
      skyTop: 0x187030,
      skyBot: 0xb0e888,
      sun: 0x80e050,
      ambient: 0x288040,
    }),
    mkZone("suburban", "Lonely Bench", POI.bench, 45, {
      fog: 0xd0a060,
      skyTop: 0xc05018,
      skyBot: 0xffe8a0,
      sun: 0xffc050,
      ambient: 0xb07030,
    }),
    mkZone("city", "Bag Protest", POI.protest, 55, {
      fog: 0xe02080,
      skyTop: 0xc00840,
      skyBot: 0xffc0e0,
      sun: 0xff40a0,
      ambient: 0xa01860,
      exposure: 1.2,
    }),
    mkZone("suburban", "Bag Chapel", POI.church, 55, {
      fog: 0xc09070,
      skyTop: 0xff7030,
      skyBot: 0xffd8a0,
      sun: 0xff9020,
      ambient: 0xa06040,
      exposure: 1.1,
    }),
    mkZone("fair", "Bag Drive-In", POI.drivein, 60, {
      fog: 0x403858,
      skyTop: 0x201038,
      skyBot: 0xa06080,
      sun: 0xff6090,
      ambient: 0x483050,
      exposure: 0.88,
    }),
    mkZone("suburban", "Bag Session", POI.therapy, 50, {
      fog: 0x90b0e0,
      skyTop: 0x4068a8,
      skyBot: 0xe8e0ff,
      sun: 0xc0d0ff,
      ambient: 0x7088c0,
      exposure: 1.05,
    }),
    mkZone("parking", "Bag Beach", POI.beach, 55, {
      fog: 0x20a0e0,
      skyTop: 0x0868b0,
      skyBot: 0xa0d8ff,
      sun: 0x60d0ff,
      ambient: 0x2080b0,
      exposure: 1.15,
    }),
    mkZone("fields", "Bag Wedding", POI.wedding, 45, {
      fog: 0xe0c0e8,
      skyTop: 0x9060a8,
      skyBot: 0xfff0ff,
      sun: 0xffe0ff,
      ambient: 0xc090d0,
      exposure: 1.1,
    }),
    mkZone("suburban", "Bag Laundry", POI.laundry, 45, {
      fog: 0x80c0e0,
      skyTop: 0x4080b0,
      skyBot: 0xe0f0ff,
      sun: 0xa0d0ff,
      ambient: 0x6090b8,
    }),
    mkZone("city", "Bag Café", POI.cafe, 50, {
      fog: 0xd0a070,
      skyTop: 0x905028,
      skyBot: 0xffe8c0,
      sun: 0xffc060,
      ambient: 0xb07040,
      exposure: 1.12,
    }),
    mkZone("overpass", "Bag Office", POI.office, 45, {
      fog: 0x90a0b0,
      skyTop: 0x506070,
      skyBot: 0xe0e8f0,
      sun: 0xc0d0e0,
      ambient: 0x607080,
      exposure: 0.95,
    }),
    mkZone("fair", "$1 Ignite Stand", POI.lemonade, 45, {
      fog: 0xffa040,
      skyTop: 0xff6010,
      skyBot: 0xffe070,
      sun: 0xffd020,
      ambient: 0xff8030,
      exposure: 1.2,
    }),
    mkZone("fields", "Bag Funeral", POI.balloon, 45, {
      fog: 0x6088b0,
      skyTop: 0x284868,
      skyBot: 0xc0d0e8,
      sun: 0x90b0d0,
      ambient: 0x405868,
      exposure: 0.9,
    }),
    mkZone("parking", "Ancestral Homeland", POI.recycle, 45, {
      fog: 0x40a050,
      skyTop: 0x186030,
      skyBot: 0xb0e8b0,
      sun: 0x60e080,
      ambient: 0x287840,
      exposure: 1.05,
    }),
    mkZone("suburban", "Employee of the Month", POI.employee, 40, {
      fog: 0xd0a060,
      skyTop: 0xa05020,
      skyBot: 0xffe8b0,
      sun: 0xffc040,
      ambient: 0xb07030,
      exposure: 1.15,
    }),
    mkZone("fair", "Palm Strip", POI.palms, 55, {
      fog: 0xff60b0,
      skyTop: 0xff2080,
      skyBot: 0xffd070,
      sun: 0xffe040,
      ambient: 0xff40a0,
      exposure: 1.22,
    }),
    mkZone("parking", "West Coast Cups", POI.juice, 40, {
      fog: 0xff9040,
      skyTop: 0xff5010,
      skyBot: 0xffe0a0,
      sun: 0xffb030,
      ambient: 0xff7030,
      exposure: 1.12,
    }),
  ];

  const spawnY = terrainHeight(10, 20) + 7;
  return {
    group,
    snagPoints,
    zones,
    spawn: new THREE.Vector3(10, spawnY, 20),
    heightAt: terrainHeight,
    wind: {
      base: new THREE.Vector3(0.35, 0.3, -0.2),
      swirl: 2,
      turbulence: 1.5,
      gustZones,
      updrafts,
      bounds: {
        min: new THREE.Vector3(-WORLD_HALF, 0.3, -WORLD_HALF),
        max: new THREE.Vector3(WORLD_HALF, 130, WORLD_HALF),
      },
    },
    update: (dt, time, bagPos, fogFar = 175, spaceAmt = 0) => {
      for (const u of updaters) u(dt, time);
      // Hide ground world in space — only bag / stars / rocket remain elsewhere
      const showGround = spaceAmt < 0.35;
      group.visible = showGround;
      if (bagPos && showGround) {
        updateChunks(group, bagPos, 140, 175);
        terrain.refresh(bagPos.x, bagPos.z);
        nature.update(time, bagPos, fogFar);
        const cull = fogFar * 0.85;
        for (const plank of pathPlanks) {
          const d = Math.hypot(plank.position.x - bagPos.x, plank.position.z - bagPos.z);
          plank.visible = d < cull;
        }
      }
    },
  };
}

function mkZone(
  id: WorldId,
  name: string,
  poi: Poi,
  radius: number,
  extra?: {
    fog?: number;
    skyTop?: number;
    skyBot?: number;
    sun?: number;
    ambient?: number;
    exposure?: number;
  },
): ZoneAtmosphere {
  return {
    id,
    name,
    centerX: poi.x,
    centerZ: poi.z,
    radius,
    fogColor: extra?.fog ?? 0x70d0f0,
    fogNear: 26,
    fogFar: 125,
    sunColor: extra?.sun ?? 0xffe060,
    ambientColor: extra?.ambient ?? 0x5080a8,
    skyTop: extra?.skyTop ?? 0x30a0ff,
    skyBottom: extra?.skyBot ?? 0xffe090,
    exposure: extra?.exposure ?? 1.08,
    windBase: new THREE.Vector3(0.45, 0.3, -0.25),
    swirl: 2,
    turbulence: 1.2,
  };
}

function addBag(
  g: THREE.Group,
  poi: Poi,
  lx: number,
  lz: number,
  opts: { color?: number; scale?: number; smile?: boolean; sash?: string; yOff?: number } = {},
): THREE.Group {
  const bag = makeBagNpc(opts);
  // Default lift keeps mesh bottom above terrain (bag origin is at soles)
  sit(bag, lx, lz, poi, opts.yOff ?? BAG_GROUND_CLEAR);
  finalizeBagNpc(bag);
  g.add(bag);
  return bag;
}

function addHeroLight(g: THREE.Group, color: number, intensity = 2.2, y = 5, range = 38): void {
  const light = new THREE.PointLight(color, intensity, range, 2);
  light.position.set(0, y, 0);
  g.add(light);
}

export function zoneWeights(x: number, z: number, zones: ZoneAtmosphere[]): number[] {
  const raw = zones.map((zone) => {
    const d = wrapDist(x, z, zone.centerX, zone.centerZ);
    const t = d / Math.max(30, zone.radius);
    // Sharper falloff → clearer lighting jumps between zones
    return 1 / (1 + t * t * t * 1.6);
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => w / sum);
}

export function dominantZone(x: number, z: number, zones: ZoneAtmosphere[]): ZoneAtmosphere {
  const w = zoneWeights(x, z, zones);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i]! > w[best]!) best = i;
  return zones[best]!;
}

function sit(obj: THREE.Object3D, localX: number, localZ: number, poi: Poi, yOff = 0): void {
  const wx = poi.x + localX;
  const wz = poi.z + localZ;
  obj.position.set(localX, terrainHeight(wx, wz) - terrainHeight(poi.x, poi.z) + yOff, localZ);
}

function chunkAt(parent: THREE.Group, poi: Poi, radius = 90): THREE.Group {
  const chunk = new THREE.Group();
  tagChunk(chunk, new THREE.Vector3(poi.x, 0, poi.z), radius, true);
  chunk.position.set(poi.x, terrainHeight(poi.x, poi.z), poi.z);
  parent.add(chunk);
  return chunk;
}

function addWindingPaths(parent: THREE.Group): THREE.Mesh[] {
  const pairs: [Poi, Poi][] = [
    [POI.suburban, POI.fields],
    [POI.suburban, POI.school],
    [POI.suburban, POI.mailbox],
    [POI.fields, POI.city],
    [POI.school, POI.overpass],
    [POI.city, POI.parking],
    [POI.fair, POI.lookout],
    [POI.parking, POI.pool],
    [POI.meadow, POI.bench],
    [POI.busstop, POI.overpass],
    [POI.treehouse, POI.fair],
    [POI.protest, POI.school],
    [POI.church, POI.parking],
    [POI.drivein, POI.fair],
    [POI.therapy, POI.busstop],
    [POI.beach, POI.meadow],
    [POI.wedding, POI.fields],
    [POI.palms, POI.treehouse],
    [POI.lemonade, POI.lookout],
    [POI.recycle, POI.drivein],
    [POI.cafe, POI.employee],
    [POI.office, POI.protest],
    [POI.laundry, POI.city],
  ];
  const mat = new THREE.MeshLambertMaterial({ color: TOY.path, flatShading: true });
  const planks: THREE.Mesh[] = [];
  for (const [a, b] of pairs) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(4, Math.floor(len / 8));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 3.2), mat);
      plank.position.set(x, terrainHeight(x, z) + 0.05, z);
      plank.rotation.y = -Math.atan2(dx, dz);
      plank.receiveShadow = true;
      parent.add(plank);
      planks.push(plank);
    }
  }
  return planks;
}

function toyMat(color: number, opts?: { emissive?: number; emi?: number }): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.emi ?? 0,
  });
}

function makeToyHouse(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 6), toyMat(color));
  body.position.y = 2.1;
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.8, 4), toyMat(0xff5a6a));
  roof.position.y = 5.5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.15), toyMat(0xffe066));
  door.position.set(0, 1, 3.05);
  g.add(door);
  g.userData.sway = Math.random() * 10;
  return g;
}

function makeToyTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6), toyMat(TOY.trunk));
  trunk.position.y = 1.1;
  g.add(trunk);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 6, 5),
    toyMat(TOY.canopy[Math.floor(Math.random() * TOY.canopy.length)]!),
  );
  canopy.position.y = 3.2;
  canopy.castShadow = true;
  g.add(canopy);
  g.userData.sway = Math.random() * 10;
  return g;
}

/* ── Places ─────────────────────────────────────────── */

function placeSuburban(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi);
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const house = makeToyHouse(TOY.house[i % TOY.house.length]!);
    sit(house, side * 12, ((i % 4) - 1.5) * 11, poi);
    house.rotation.y = side > 0 ? Math.PI : 0;
    g.add(house);
    // Porch / driveway residents
    addBag(g, poi, side * 9, ((i % 4) - 1.5) * 11 + 2, {
      color: [0xf2efe6, 0xffe8d0, 0xe0f0ff, 0xffe0e8][i % 4],
      scale: 0.85 + (i % 3) * 0.08,
    });
  }
  for (let i = 0; i < 10; i++) {
    const tree = makeToyTree();
    const x = (i % 2 === 0 ? -1 : 1) * (7 + (i % 3));
    const z = (i - 5) * 4;
    sit(tree, x, z, poi);
    g.add(tree);
    snags.push({
      position: new THREE.Vector3(poi.x + x, terrainHeight(poi.x + x, poi.z + z) + 3, poi.z + z),
      radius: 1.4,
    });
    if (i === 2) {
      const rocket = makeRocketInTree();
      sit(rocket, x, z, poi);
      g.add(rocket);
    }
  }
  const thank = makeRoadSign(["YOU GOT THIS", "IN THE BAG"]);
  sit(thank, -8, 16, poi);
  g.add(thank);
  const lyric = makeRoadSign(["do you ever", "feel…"]);
  sit(lyric, 10, -14, poi);
  g.add(lyric);
  addBag(g, poi, 6, 4, { color: 0xfff8e8, scale: 1.05 });
  void updaters;
}

function placeFields(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  const debris = makeHurricaneDebris(22, 0);
  g.add(debris.group);
  for (const s of debris.snags) {
    snags.push({
      position: new THREE.Vector3(
        s.position.x + poi.x,
        terrainHeight(poi.x, poi.z) + s.position.y,
        s.position.z + poi.z,
      ),
      radius: s.radius,
    });
  }
  const sign = makeBillboard(["wanna start", "again?"], 9, 3.5, {
    bg: "#1a5030",
    fg: "#e0ffc0",
    accent: "#80ff90",
  });
  sit(sign, -14, 0, poi, 2.5);
  g.add(sign);
  for (let i = 0; i < 8; i++) {
    const scrap = makeLyricScrap(["drifting through the wind", "wanna start again?", "oh, oh, oh"][i % 3]!);
    sit(scrap, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 35, poi, 0.05);
    g.add(scrap);
  }
  // Bags clinging to debris / helping each other
  for (let i = 0; i < 5; i++) {
    addBag(g, poi, -8 + i * 4, (i % 2) * 5 - 2, {
      color: [0xe8e0d0, 0xf2efe6, 0xffe0e8][i % 3],
      scale: 0.9,
      yOff: 0.2 + (i % 3) * 0.15,
    });
  }
}

function placeSchool(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  const school = new THREE.Mesh(new THREE.BoxGeometry(28, 7, 10), toyMat(0xffe0a0));
  school.castShadow = true;
  sit(school, -18, -6, poi, 3.5);
  g.add(school);
  const banner = makeBanner("HOME OF THE BAGS", 16);
  sit(banner, 0, 5, poi);
  g.add(banner);
  g.add(makeChalkBurst(6, 8));
  const track = new THREE.Mesh(new THREE.RingGeometry(12, 15, 24), toyMat(0xff6050));
  track.rotation.x = -Math.PI / 2;
  sit(track, 24, 0, poi, 0.04);
  g.add(track);
  // Pep rally bags circling the track vibe
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    addBag(g, poi, 24 + Math.cos(ang) * 13.5, Math.sin(ang) * 13.5, {
      color: [0xffe8d0, 0x40a0ff, 0xff5050, 0xfff0d0, 0xa0ff80][i],
      scale: 0.95,
    });
  }
  // Bag pile under banner
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, -2 + i * 1.2, 6, { scale: 0.7, yOff: (i % 2) * 0.35, smile: i !== 2 });
  }
  const sign = makeRoadSign(["BAG PEP", "oh, oh, oh"]);
  sit(sign, 6, -22, poi);
  g.add(sign);
  snags.push({ position: new THREE.Vector3(poi.x + 24, terrainHeight(poi.x, poi.z) + 2, poi.z - 12), radius: 2 });
}

function placeOverpass(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(42, 1.1, 12), toyMat(0x90a0b8));
  sit(deck, 0, 0, poi, 6.5);
  g.add(deck);
  for (const x of [-14, 0, 14]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 2.2), toyMat(0x7888a0));
    sit(pillar, x, 0, poi, 3);
    g.add(pillar);
    snags.push({ position: new THREE.Vector3(poi.x + x, terrainHeight(poi.x, poi.z) + 5, poi.z), radius: 2 });
  }
  const graffiti = makeBillboard(["boom,", "boom,", "boom"], 7, 3, {
    bg: "#201030",
    fg: "#ff60a0",
    accent: "#60ffe0",
  });
  sit(graffiti, -10, 7, poi, 2.5);
  g.add(graffiti);
  // Bag stuck on railing
  const stuck = addBag(g, poi, 8, 5.2, { color: 0xf2efe6, scale: 1.1, yOff: 7.1 });
  stuck.userData.sway = 4;
  addBag(g, poi, -6, 4, { color: 0xe0f0ff, scale: 0.9, yOff: 0.1 });
  const life = makeRoadSign(["BAGS ONLY", "KEEP CLEAR"]);
  sit(life, 12, -8, poi);
  g.add(life);
}

function placeCity(
  parent: THREE.Group,
  poi: Poi,
  snags: SnagPoint[],
  updaters: Array<(dt: number, time: number) => void>,
): void {
  const g = chunkAt(parent, poi, 100);
  addHeroLight(g, 0xff60c0, 1.8, 14, 55);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.3, 16), toyMat(0x607088));
  sit(plaza, 0, 0, poi, 0.1);
  g.add(plaza);
  const slots = [
    [-16, -16],
    [-16, 16],
    [16, -16],
    [16, 16],
    [-24, 0],
    [24, 0],
  ];
  for (let i = 0; i < slots.length; i++) {
    const [bx, bz] = slots[i]!;
    const h = 10 + (i % 3) * 5;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(9, h, 9),
      toyMat(TOY.house[i % TOY.house.length]!, { emissive: 0x221808, emi: 0.15 }),
    );
    sit(building, bx!, bz!, poi, h / 2);
    building.castShadow = true;
    g.add(building);
  }
  const neon = makeBillboard(["BAG", "PLAZA"], 10, 4, {
    bg: "#180828",
    fg: "#ff40b0",
    accent: "#40f0ff",
  });
  sit(neon, 0, -26, poi, 12);
  g.add(neon);
  const taxi = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.4, 1.8), toyMat(0xffd040));
  sit(taxi, -16, 0, poi, 0.7);
  g.add(taxi);
  updaters.push((dt) => {
    taxi.position.x += 10 * dt;
    if (taxi.position.x > 22) taxi.position.x = -22;
  });
  // Plaza hangout bags
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, -4 + i * 3, 2 + (i % 2), { color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0][i], scale: 1 });
  }
  snags.push({ position: new THREE.Vector3(poi.x - 8, terrainHeight(poi.x, poi.z) + 4, poi.z - 8), radius: 1.2 });
}

function placeFair(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi);
  addHeroLight(g, 0xff40c0, 3.2, 8, 45);
  const stand = makeFireworkStand();
  sit(stand, -12, 3, poi);
  g.add(stand);
  snags.push({ position: new THREE.Vector3(poi.x - 12, terrainHeight(poi.x, poi.z) + 2, poi.z + 3), radius: 2.5 });
  const disco = makeDiscoBall();
  sit(disco, 10, -5, poi);
  g.add(disco);
  const burst = makeBillboard(["BAG FAIR", "tonight"], 8, 3, {
    bg: "#281038",
    fg: "#ff90d0",
    accent: "#80ffd0",
  });
  sit(burst, 0, -18, poi, 5);
  g.add(burst);

  // Karaoke booth — bags living it
  const booth = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 4), toyMat(0xff40a0, { emissive: 0x401020, emi: 0.3 }));
  sit(booth, 8, 8, poi, 0.2);
  g.add(booth);
  const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), toyMat(0x909090));
  sit(micStand, 8, 8, poi, 1.2);
  g.add(micStand);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), toyMat(0x303030));
  sit(mic, 8, 8, poi, 2.4);
  g.add(mic);
  // Rare cross-out easter egg
  const karaokeSign = makeBillboard(["baby you're a", "~~firework~~", "BAG"], 5, 3.2, {
    bg: "#401028",
    fg: "#ff80c0",
    accent: "#40ffe0",
  });
  sit(karaokeSign, 8, 5, poi, 3.4);
  g.add(karaokeSign);

  // Star singer + audience
  addBag(g, poi, 8, 9.2, { color: 0xffe0e8, scale: 1.15, sash: "BAG", yOff: 0.35 });
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, 4 + i * 2.2, 12, {
      color: [0xff80a0, 0x80c0ff, 0xffe080, 0xa0ff80][i],
      scale: 0.95,
    });
  }
}

function placeParking(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 100);
  const lot = new THREE.Mesh(new THREE.BoxGeometry(70, 0.25, 70), toyMat(0x687088));
  sit(lot, 0, 0, poi, 0.08);
  g.add(lot);
  const store = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 7), toyMat(0xfff0d0));
  sit(store, 0, -32, poi, 4);
  g.add(store);
  const storeSign = makeBillboard(["BAGGY", "MART"], 12, 2.5, {
    bg: "#2a6ad0",
    fg: "#ffffff",
    accent: "#ffd040",
  });
  sit(storeSign, 0, -28, poi, 7);
  g.add(storeSign);
  const homeland = makeBillboard(["BAG RETURN", "this way"], 7, 2.5, {
    bg: "#201810",
    fg: "#ff9040",
    accent: "#ffd080",
  });
  sit(homeland, 16, 14, poi, 2.5);
  g.add(homeland);
  for (const [cx, cz] of [
    [-14, 6],
    [14, 6],
    [0, 16],
  ] as [number, number][]) {
    const corral = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 3.5), toyMat(0x90a0b0));
    sit(corral, cx, cz, poi, 0.6);
    g.add(corral);
    // Bags in / around cart corrals
    addBag(g, poi, cx, cz, { scale: 0.85, yOff: 1.1 });
    addBag(g, poi, cx + 1.2, cz - 0.5, { scale: 0.75, yOff: 0.05 });
    snags.push({
      position: new THREE.Vector3(poi.x + cx, terrainHeight(poi.x, poi.z) + 1.2, poi.z + cz),
      radius: 1.8,
    });
  }
  addBag(g, poi, -5, 3, { color: 0x70a080, scale: 1 });
  addBag(g, poi, 3, 8, { color: 0xfff8e8, scale: 0.9 });
}

function placeLookout(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 110);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(28, 0.35, 0.35), toyMat(0xc0a070));
  sit(rail, 0, -6, poi, 1.2);
  g.add(rail);
  const sign = makeBillboard(["BAG LOOKOUT", "hold my bag"], 10, 3.2, {
    bg: "#1040a0",
    fg: "#ffe080",
    accent: "#80c0ff",
  });
  sit(sign, 0, -14, poi, 5);
  g.add(sign);
  // Bags lined up looking at the view
  for (let i = 0; i < 6; i++) {
    addBag(g, poi, -10 + i * 4, -4, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0, 0xe8ffe0, 0xfff8e8][i],
      scale: 0.95,
      yOff: 0.1,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z - 6), radius: 2 });
}

function placeMeadow(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 85);
  addHeroLight(g, 0xff8030, 2.8, 3.5, 28);
  const sign = makeBillboard(["BAG CAMP", "hold my bag"], 10, 3.5, {
    bg: "#206030",
    fg: "#e8ffc0",
    accent: "#ff80c0",
  });
  sit(sign, 0, -8, poi, 3);
  g.add(sign);
  // Campfire ring
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.35, 10), toyMat(0x403020));
  sit(pit, 0, 0, poi, 0.2);
  g.add(pit);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.8, 6),
    toyMat(0xff6020, { emissive: 0xff4010, emi: 0.85 }),
  );
  sit(flame, 0, 0, poi, 1.2);
  flame.userData.sway = 1;
  g.add(flame);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 6, 5),
    toyMat(0xffe040, { emissive: 0xffc020, emi: 0.7 }),
  );
  sit(glow, 0, 0, poi, 0.7);
  g.add(glow);
  // Bags around the fire
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    addBag(g, poi, Math.cos(ang) * 3.2, Math.sin(ang) * 3.2, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0, 0xe8ffe0][i],
      scale: 0.95,
    });
  }
  for (let i = 0; i < 8; i++) {
    const scrap = makeLyricScrap(["s'mores", "oh, oh", "camp"][i % 3]!);
    sit(scrap, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, poi, 0.05);
    g.add(scrap);
  }
  for (let i = 0; i < 8; i++) {
    const tree = makeToyTree();
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 40;
    if (Math.hypot(x, z) < 8) continue;
    sit(tree, x, z, poi);
    g.add(tree);
    if (i % 2 === 0) {
      snags.push({
        position: new THREE.Vector3(poi.x + x, terrainHeight(poi.x + x, poi.z + z) + 3, poi.z + z),
        radius: 1.3,
      });
    }
  }
}

function placeMailbox(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 55);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6), toyMat(0x607080));
  sit(post, 0, 0, poi, 0.8);
  g.add(post);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.7), toyMat(0xff5040));
  sit(box, 0, 0, poi, 1.9);
  g.add(box);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.08), toyMat(0xffe040));
  sit(flag, 0.7, 0, poi, 2.1);
  g.add(flag);
  const sign = makeBillboard(["wish you", "were here"], 5, 2, {
    bg: "#204060",
    fg: "#ffffff",
    accent: "#ffd040",
  });
  sit(sign, -4, 3, poi, 2);
  g.add(sign);
  addBag(g, poi, 1.5, 1, { color: 0xfff8e8, scale: 0.95 });
  addBag(g, poi, -2, -1, { color: 0xe0f0ff, scale: 0.8 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.8, poi.z), radius: 1 });
}

function placePool(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 55);
  addHeroLight(g, 0x40d0ff, 1.6, 4, 30);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 16), toyMat(0x40c0ff, { emissive: 0x2080c0, emi: 0.2 }));
  sit(water, 0, 0, poi, 0.15);
  g.add(water);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.35, 6, 20), toyMat(0xffffff));
  rim.rotation.x = Math.PI / 2;
  sit(rim, 0, 0, poi, 0.35);
  g.add(rim);
  const floatie = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.4, 6, 12), toyMat(0xff6080));
  sit(floatie, 2, 1, poi, 0.5);
  floatie.rotation.x = Math.PI / 2;
  g.add(floatie);
  const sign = makeRoadSign(["BAGS", "POOLSIDE"]);
  sit(sign, -10, 6, poi);
  g.add(sign);
  // Bags floating in the pool
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    addBag(g, poi, Math.cos(ang) * 4, Math.sin(ang) * 4, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0][i],
      scale: 0.9,
      yOff: 0.35,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 0.5, poi.z), radius: 7 });
}

function placeBusStop(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 55);
  const shelter = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 3), toyMat(0xffd040));
  sit(shelter, 0, 0, poi, 2.8);
  g.add(shelter);
  for (const x of [-2.8, 2.8]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 5), toyMat(0x808890));
    sit(leg, x, 1.2, poi, 1.4);
    g.add(leg);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 1.2), toyMat(0x8b5a3c));
  sit(bench, 0, 0.5, poi, 0.5);
  g.add(bench);
  const sign = makeBillboard(["late again", "oh, oh, oh"], 4.5, 2, {
    bg: "#305080",
    fg: "#ffffff",
    accent: "#ffd040",
  });
  sit(sign, 4, -1, poi, 2.5);
  g.add(sign);
  // Bags waiting on the bench
  for (let i = 0; i < 3; i++) {
    addBag(g, poi, -1.5 + i * 1.5, 0.6, {
      color: [0xffa060, 0xf2efe6, 0xe0f0ff][i],
      scale: 0.9,
      yOff: 0.55,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

function placeTreehouse(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 60);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 10, 8), toyMat(TOY.trunk));
  sit(trunk, 0, 0, poi, 5);
  g.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(5, 7, 6), toyMat(0x2ecf6a));
  sit(canopy, 0, 0, poi, 12);
  canopy.castShadow = true;
  g.add(canopy);
  const house = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), toyMat(0xffb060));
  sit(house, 0, 0, poi, 8);
  g.add(house);
  const scrap = makeLyricScrap("bag fort");
  sit(scrap, 3, 4, poi, 0.05);
  g.add(scrap);
  const sign = makeRoadSign(["BAG FORT", "no humans"]);
  sit(sign, -8, 5, poi);
  g.add(sign);
  addBag(g, poi, 0.8, 0.5, { color: 0xfff8e8, scale: 0.85, yOff: 8.2 });
  addBag(g, poi, -5, 3, { color: 0xe8ffe0, scale: 0.9 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 8, poi.z), radius: 3 });
}

function placeBench(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 45);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.25, 1.1), toyMat(0xc48a50));
  sit(seat, 0, 0, poi, 0.55);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.2), toyMat(0xc48a50));
  sit(back, 0, -0.45, poi, 1.1);
  g.add(back);
  const sign = makeBillboard(["HAVE A", "SEAT"], 5, 2.5, {
    bg: "#284828",
    fg: "#e8ffc0",
    accent: "#ffd040",
  });
  sit(sign, 0, -4, poi, 2.5);
  g.add(sign);
  addBag(g, poi, -0.8, 0.1, { color: 0xf2efe6, scale: 0.95, yOff: 0.7 });
  addBag(g, poi, 0.9, 0.1, { color: 0xffe0e8, scale: 0.85, yOff: 0.7 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 0.8, poi.z), radius: 1.5 });
}

function placeProtest(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 55);
  addHeroLight(g, 0xff2080, 2.4, 6, 35);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.6), toyMat(0x303040));
  sit(wall, 0, 0, poi, 4);
  g.add(wall);
  const mural = makeBillboard(["THANK YOU", "BAG"], 14, 6, {
    bg: "#ff2080",
    fg: "#ffffff",
    accent: "#40ffe0",
  });
  sit(mural, 0, 0.4, poi, 4);
  g.add(mural);
  // Protest bags with little signs
  for (let i = 0; i < 5; i++) {
    addBag(g, poi, -6 + i * 3, 4, {
      color: [0xffe0e8, 0xf2efe6, 0xe0f0ff, 0xfff0d0, 0xff80a0][i],
      scale: 1,
      sash: i === 2 ? "BAG" : undefined,
    });
    const placard = makeBillboard([["BAGS", "RIGHTS"], ["HOLD", "MY BAG"], ["FREE", "BAGS"]][i % 3]!, 1.6, 1.1, {
      bg: "#fff8e0",
      fg: "#301010",
      accent: "#ff4060",
    });
    sit(placard, -6 + i * 3, 5.2, poi, 2.2);
    g.add(placard);
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 4, poi.z), radius: 2 });
}

function placeChurch(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 60);
  addHeroLight(g, 0xffe080, 3.2, 6, 40);
  const lot = new THREE.Mesh(new THREE.BoxGeometry(36, 0.2, 28), toyMat(0x687078));
  sit(lot, 0, 0, poi, 0.08);
  g.add(lot);
  const chapel = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), toyMat(0xf0e8d8));
  sit(chapel, -10, -4, poi, 4);
  g.add(chapel);
  const steeple = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 4), toyMat(0xff6b5a));
  sit(steeple, -10, -4, poi, 10.5);
  g.add(steeple);

  // Altar + Bag Jesus (glowing bag on a pedestal / cross)
  const altar = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 1.8), toyMat(0x8b5a3c));
  sit(altar, 6, 0, poi, 0.4);
  g.add(altar);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), toyMat(0xd0c0a0));
  sit(crossV, 6, -0.6, poi, 2.4);
  g.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.25), toyMat(0xd0c0a0));
  sit(crossH, 6, -0.6, poi, 3.3);
  g.add(crossH);
  const jesus = addBag(g, poi, 6, -0.5, {
    color: 0xfff8e8,
    scale: 1.35,
    sash: "BAG",
    yOff: 1.6,
  });
  jesus.userData.sway = 0.5;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 6, 16),
    toyMat(0xffe040, { emissive: 0xffd020, emi: 0.9 }),
  );
  sit(halo, 6, -0.5, poi, 3.1);
  halo.rotation.x = Math.PI / 2;
  g.add(halo);

  for (let i = 0; i < 8; i++) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), toyMat(0xc48a50));
    const row = Math.floor(i / 4);
    const col = i % 4;
    sit(chair, 2 + col * 2.2, 4 + row * 2.5, poi, 0.35);
    g.add(chair);
    if (i % 2 === 0) {
      addBag(g, poi, 2 + col * 2.2, 4 + row * 2.5, {
        color: [0xf2efe6, 0xffe0e8, 0xe8e0d0, 0xfff0d0][col],
        scale: 0.8,
        yOff: 0.75,
      });
    }
  }
  const sign = makeBillboard(["BAG CHAPEL", "our bag"], 6, 2.5, {
    bg: "#403020",
    fg: "#ffe0a0",
    accent: "#ff9040",
  });
  sit(sign, 6, -8, poi, 2.5);
  g.add(sign);
  const life = makeRoadSign(["BAGS", "WELCOME"]);
  sit(life, -6, 8, poi);
  g.add(life);
  snags.push({ position: new THREE.Vector3(poi.x - 10, terrainHeight(poi.x, poi.z) + 4, poi.z - 4), radius: 3 });
}

function placeDriveIn(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 70);
  addHeroLight(g, 0xff60a0, 2.5, 10, 50);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(28, 14, 0.5), toyMat(0x1a1520));
  sit(screen, 0, -12, poi, 8);
  g.add(screen);
  const burnIn = makeBillboard(["", "✦"], 22, 10, {
    bg: "#120818",
    fg: "#ff60a0",
    accent: "#40e0ff",
  });
  sit(burnIn, 0, -11.6, poi, 8);
  g.add(burnIn);
  const frame = makeBillboard(["BAGS FREE", "NOW SHOWING"], 10, 3, {
    bg: "#000000",
    fg: "#ff40a0",
    accent: "#40ffe0",
  });
  sit(frame, 0, -11.5, poi, 8);
  g.add(frame);
  for (let i = 0; i < 6; i++) {
    const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), toyMat(0x505058));
    sit(speaker, -10 + i * 4, 4, poi, 0.7);
    g.add(speaker);
    addBag(g, poi, -10 + i * 4, 5.5, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff][i % 3],
      scale: 0.85,
      yOff: 0.1,
    });
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 10, 6), toyMat(0x707880));
  sit(pole, -14, -12, poi, 5);
  g.add(pole);
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 8, poi.z - 12), radius: 4 });
}

function placeTherapy(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 50);
  addHeroLight(g, 0xc0d0ff, 1.8, 3.5, 22);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 8), toyMat(0xe8d8c0));
  sit(floor, 0, 0, poi, 0.2);
  g.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.3), toyMat(0xf5efe0));
  sit(back, 0, -3.8, poi, 2.7);
  g.add(back);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 8), toyMat(0xf0e8d8));
  sit(sideL, -4.9, 0, poi, 2.7);
  g.add(sideL);
  const sideR = sideL.clone();
  sit(sideR, 4.9, 0, poi, 2.7);
  g.add(sideR);
  const couch = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.8), toyMat(0x6a90c0));
  sit(couch, -1.5, 1.5, poi, 0.8);
  g.add(couch);
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), toyMat(0x3ecf6a));
  sit(plant, 3, -2, poi, 1.2);
  g.add(plant);
  const poster1 = makeBillboard(["do you ever", "feel…"], 2.8, 1.8, {
    bg: "#e8f0ff",
    fg: "#304060",
    accent: "#80a0ff",
  });
  sit(poster1, -2, -3.6, poi, 3.5);
  g.add(poster1);
  const poster2 = makeBillboard(["feeling", "paper thin?"], 2.8, 1.8, {
    bg: "#fff0e0",
    fg: "#603020",
    accent: "#ff9040",
  });
  sit(poster2, 2, -3.6, poi, 3.5);
  g.add(poster2);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.15, 1.2, 8), toyMat(0xffe080, { emissive: 0xffd060, emi: 0.4 }));
  sit(lamp, 3, 2, poi, 1.5);
  g.add(lamp);
  // Patient + therapist bags
  addBag(g, poi, -1.5, 1.5, { color: 0xf2efe6, scale: 0.95, yOff: 1.15 });
  addBag(g, poi, 2.2, -0.5, { color: 0xe0f0ff, scale: 1.0, yOff: 0.1 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 4 });
}

function placeBeach(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 65);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 0.35, 20), toyMat(0xe8d090));
  sit(sand, 0, 0, poi, 0.1);
  g.add(sand);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(22, 22, 0.2, 20),
    toyMat(0x40b0e0, { emissive: 0x2080c0, emi: 0.15 }),
  );
  sit(water, 0, -14, poi, 0.05);
  g.add(water);
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 8), toyMat(0xff4060));
  sit(umbrella, -4, 2, poi, 2.8);
  g.add(umbrella);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), toyMat(0xffffff));
  sit(pole, -4, 2, poi, 1.2);
  g.add(pole);
  const sign = makeBillboard(["BAGS", "BEACH"], 5, 2.2, {
    bg: "#102040",
    fg: "#ffe080",
    accent: "#40c0ff",
  });
  sit(sign, 8, 4, poi, 2.5);
  g.add(sign);
  // Sunbathing bags
  for (let i = 0; i < 5; i++) {
    const bag = addBag(g, poi, -6 + i * 3, 1 + (i % 2), {
      color: [0xf2efe6, 0xffe0e8, 0xfff8e8, 0xe0f0ff, 0xfff0d0][i],
      scale: 0.95,
      yOff: 0.15,
    });
    bag.rotation.x = -0.55;
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 4 });
}

function placeWedding(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 45);
  addHeroLight(g, 0xffe0ff, 2.0, 4, 28);
  const aisle = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 12), toyMat(0xfff0f8));
  sit(aisle, 0, 0, poi, 0.06);
  g.add(aisle);
  const archL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.5, 6), toyMat(0xffffff));
  sit(archL, -2, -5, poi, 1.8);
  g.add(archL);
  const archR = archL.clone();
  sit(archR, 2, -5, poi, 1.8);
  g.add(archR);
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 0.25), toyMat(0xff80c0));
  sit(archTop, 0, -5, poi, 3.6);
  g.add(archTop);
  const sign = makeBillboard(["it's in", "the bag"], 5, 2.2, {
    bg: "#602040",
    fg: "#ffe0f0",
    accent: "#ff80c0",
  });
  sit(sign, 5, -3, poi, 2);
  g.add(sign);
  // Bride + groom bags under the arch
  addBag(g, poi, -0.7, -4.5, { color: 0xffffff, scale: 1.05, yOff: 0.1 });
  addBag(g, poi, 0.7, -4.5, { color: 0xf2efe6, scale: 1.05, sash: "BAG", yOff: 0.1 });
  // Guests
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    addBag(g, poi, side * (2.5 + (i % 3) * 1.2), 1 + Math.floor((i % 3) / 2), {
      color: [0xffe0e8, 0xe0f0ff, 0xfff0d0][i % 3],
      scale: 0.85,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z - 5), radius: 2 });
}

function placeLaundry(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 45);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 10), toyMat(0xe0e8f0));
  sit(floor, 0, 0, poi, 0.1);
  g.add(floor);
  const sign = makeBillboard(["BAG", "WASH"], 5, 2, {
    bg: "#2060a0",
    fg: "#ffffff",
    accent: "#80d0ff",
  });
  sit(sign, 0, -6, poi, 3);
  g.add(sign);
  for (let i = 0; i < 4; i++) {
    const machine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2), toyMat(0xd0d8e0));
    sit(machine, -5 + i * 3.2, -2, poi, 1.3);
    g.add(machine);
    const door = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 12),
      toyMat(0x80c0e8, { emissive: 0x4080c0, emi: 0.25 }),
    );
    sit(door, -5 + i * 3.2, -1.05, poi, 1.4);
    g.add(door);
    // Bag in / on machine
    addBag(g, poi, -5 + i * 3.2, -1.5, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0][i],
      scale: 0.7,
      yOff: i % 2 === 0 ? 2.4 : 0.9,
    });
  }
  addBag(g, poi, 4, 2, { color: 0xfff8e8, scale: 0.95 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.5, poi.z), radius: 2 });
}

function placeCafe(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 50);
  addHeroLight(g, 0xffc060, 2.2, 4, 30);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 12), toyMat(0xc48a50));
  sit(floor, 0, 0, poi, 0.1);
  g.add(floor);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 2), toyMat(0x6a4030));
  sit(counter, 0, -4, poi, 0.8);
  g.add(counter);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 3), toyMat(0xff6040));
  sit(awning, 0, -4, poi, 2.8);
  g.add(awning);
  const sign = makeBillboard(["BAG", "CAFÉ"], 5, 2.2, {
    bg: "#402010",
    fg: "#ffe0a0",
    accent: "#ff8040",
  });
  sit(sign, 0, -5.5, poi, 3.5);
  g.add(sign);
  // Barista bag
  addBag(g, poi, 0, -4.8, { color: 0xfff8e8, scale: 1, sash: "BAG", yOff: 1.5 });
  // Tables with sitting bags + empty cups
  for (let i = 0; i < 3; i++) {
    const tx = -4 + i * 4;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 10), toyMat(0xe8d8c0));
    sit(table, tx, 2, poi, 0.85);
    g.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 5), toyMat(0x605040));
    sit(leg, tx, 2, poi, 0.4);
    g.add(leg);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.35, 6), toyMat(0xffffff));
    sit(cup, tx + 0.3, 2.2, poi, 1.1);
    g.add(cup);
    addBag(g, poi, tx - 0.8, 2.5, { color: [0xf2efe6, 0xffe0e8, 0xe0f0ff][i], scale: 0.85, yOff: 0.1 });
    addBag(g, poi, tx + 0.9, 1.4, { color: [0xfff0d0, 0xe8ffe0, 0xffe0e8][i], scale: 0.8, yOff: 0.1 });
  }
  const menu = makeRoadSign(["IN THE", "BAG"]);
  sit(menu, 6, 0, poi);
  g.add(menu);
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.5, poi.z), radius: 3 });
}

function placeOffice(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 50);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 14), toyMat(0xb0b8c0));
  sit(floor, 0, 0, poi, 0.08);
  g.add(floor);
  const sign = makeBillboard(["BAG", "CORP"], 6, 2.2, {
    bg: "#303840",
    fg: "#e0e8f0",
    accent: "#80c0ff",
  });
  sit(sign, 0, -8, poi, 3);
  g.add(sign);
  // Cubicle farm — bags at work
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = -5 + col * 5;
    const cz = -2 + row * 5;
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 1.6), toyMat(0xd0d4d8));
    sit(desk, cx, cz, poi, 0.9);
    g.add(desk);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.12), toyMat(0x808890));
    sit(wall, cx, cz - 0.85, poi, 1.5);
    g.add(wall);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), toyMat(0x203040, { emissive: 0x204060, emi: 0.3 }));
    sit(monitor, cx, cz - 0.3, poi, 1.5);
    g.add(monitor);
    addBag(g, poi, cx, cz + 0.5, {
      color: [0xf2efe6, 0xffe0e8, 0xe0f0ff, 0xfff0d0, 0xe8e0d0, 0xfff8e8][i],
      scale: 0.85,
      yOff: 0.95,
    });
  }
  const watercooler = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.8, 8), toyMat(0x80c0e8));
  sit(watercooler, 7, 4, poi, 1);
  g.add(watercooler);
  addBag(g, poi, 6, 4.5, { color: 0xffe0e8, scale: 0.9 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.5, poi.z), radius: 3 });
}

function placeLemonade(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 40);
  addHeroLight(g, 0xffd040, 2.0, 4, 25);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2.5), toyMat(0xffe080));
  sit(stand, 0, 0, poi, 1.2);
  g.add(stand);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 3.2), toyMat(0xff6040));
  sit(roof, 0, 0, poi, 2.6);
  g.add(roof);
  const sign = makeBillboard(["AIR $1", "fill up"], 5, 2, {
    bg: "#ff4020",
    fg: "#fff8e0",
    accent: "#ffe040",
  });
  sit(sign, 0, -2, poi, 3.2);
  g.add(sign);
  for (let i = 0; i < 5; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.45, 6), toyMat(0xffffff));
    sit(cup, -1.2 + i * 0.6, 0.8, poi, 2.4);
    g.add(cup);
  }
  addBag(g, poi, 0, 1.2, { color: 0xfff8e8, scale: 0.95, sash: "BAG", yOff: 2.3 });
  addBag(g, poi, -3, 2, { color: 0xffe0e8, scale: 0.85 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.5, poi.z), radius: 2 });
}

function placeBalloonFuneral(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 40);
  const plot = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 4), toyMat(0x4a6040));
  sit(plot, 0, 0, poi, 0.1);
  g.add(plot);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.4), toyMat(0x909898));
  sit(stone, 0, -1, poi, 1);
  g.add(stone);
  const epitaph = makeBillboard(["he went", "too high"], 2.5, 1.5, {
    bg: "#606870",
    fg: "#f0f0f0",
    accent: "#ff80c0",
  });
  sit(epitaph, 0, -0.9, poi, 1.1);
  g.add(epitaph);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), toyMat(0xe0e0e0));
  sit(string, 1.5, 0.5, poi, 3);
  g.add(string);
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), toyMat(0xff4060, { emissive: 0x401020, emi: 0.3 }));
  sit(balloon, 1.5, 0.5, poi, 5.2);
  balloon.userData.sway = 3;
  g.add(balloon);
  // Mourning bags
  for (let i = 0; i < 4; i++) {
    addBag(g, poi, -3 + i * 1.8, 2.5, {
      color: [0xe8e0d0, 0xf2efe6, 0xd0d0d8, 0xffe0e8][i],
      scale: 0.9,
    });
  }
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z), radius: 2 });
}

function placeRecycle(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 45);
  const bin = new THREE.Mesh(new THREE.BoxGeometry(4, 3.5, 3), toyMat(0x40a060));
  sit(bin, 0, 0, poi, 1.8);
  g.add(bin);
  for (let i = 0; i < 6; i++) {
    addBag(g, poi, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.8, {
      scale: 0.65 + Math.random() * 0.2,
      yOff: 3.0 + Math.random() * 1.2,
      smile: i % 2 === 0,
    });
  }
  const sign = makeBillboard(["the ancestral", "homeland"], 6, 2.5, {
    bg: "#1a3020",
    fg: "#80ffc0",
    accent: "#ffe080",
  });
  sit(sign, 0, -4, poi, 3);
  g.add(sign);
  addBag(g, poi, 4, -1, { color: 0xe8ffe0, scale: 1 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2.5 });
}

function placeEmployee(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 40);
  addHeroLight(g, 0xffc040, 2.4, 4, 28);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 0.4), toyMat(0xd8d0c0));
  sit(wall, 0, 0, poi, 2.8);
  g.add(wall);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 0.15), toyMat(0x8b5a3c));
  sit(frame, 0, 0.2, poi, 3);
  g.add(frame);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.5), new THREE.MeshBasicMaterial({ color: 0xf0ebe0 }));
  sit(mat, 0, 0.25, poi, 3);
  g.add(mat);
  // Peak joke: framed bag is Employee of the Month
  addBag(g, poi, 0, 0.25, { color: 0xfff8e8, scale: 1.15, sash: "BAG", yOff: 2.55 });
  const plaque = makeBillboard(["EMPLOYEE OF", "THE MONTH"], 4, 1.5, {
    bg: "#403020",
    fg: "#ffe080",
    accent: "#ff9040",
  });
  sit(plaque, 0, -2.5, poi, 1.5);
  g.add(plaque);
  const life = makeRoadSign(["IT'S IN", "THE BAG"]);
  sit(life, 5, 2, poi);
  g.add(life);
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 2, poi.z), radius: 2 });
}

function placePalms(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 60);
  addHeroLight(g, 0xff60b0, 2.2, 6, 40);
  for (let i = 0; i < 8; i++) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), toyMat(0xc48a50));
    trunk.position.y = 3.5;
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.15, 3.5, 4), toyMat(0x2ecf6a));
      frond.position.set(Math.cos((f / 5) * Math.PI * 2) * 0.8, 7, Math.sin((f / 5) * Math.PI * 2) * 0.8);
      frond.rotation.z = Math.cos((f / 5) * Math.PI * 2) * 0.9;
      frond.rotation.x = Math.sin((f / 5) * Math.PI * 2) * 0.9;
      palm.add(frond);
    }
    sit(palm, -12 + i * 3.5, (i % 2) * 4 - 2, poi);
    palm.userData.sway = i;
    g.add(palm);
  }
  const car = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 2.2), toyMat(0xff40a0, { emissive: 0x401020, emi: 0.25 }));
  sit(car, 0, 6, poi, 0.9);
  g.add(car);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 2), toyMat(0xff80c0));
  sit(cabin, -0.5, 6, poi, 1.9);
  g.add(cabin);
  // Rare California cross-out
  const tag = makeBillboard(["CALIFORNIA", "~~girls~~", "BAGS"], 8, 3.2, {
    bg: "#201028",
    fg: "#ff80c0",
    accent: "#40ffe0",
  });
  sit(tag, 0, -8, poi, 4.2);
  g.add(tag);
  // Bags in the convertible
  addBag(g, poi, 0.5, 6, { color: 0xffe0e8, scale: 0.9, yOff: 1.6 });
  addBag(g, poi, -1.2, 6.2, { color: 0xf2efe6, scale: 0.85, yOff: 1.6 });
  addBag(g, poi, 4, 3, { color: 0xfff0d0, scale: 0.95 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1, poi.z + 6), radius: 2 });
}

function placeJuice(parent: THREE.Group, poi: Poi, snags: SnagPoint[]): void {
  const g = chunkAt(parent, poi, 40);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 3), toyMat(0xff9040));
  sit(stand, 0, 0, poi, 1.4);
  g.add(stand);
  const sign = makeBillboard(["BAG", "JUICE"], 5.5, 2, {
    bg: "#ff6020",
    fg: "#ffffff",
    accent: "#ffe040",
  });
  sit(sign, 0, -2.2, poi, 3.2);
  g.add(sign);
  const empty = makeRoadSign(["empty cups", "only"]);
  sit(empty, 4, 2, poi);
  g.add(empty);
  for (let i = 0; i < 9; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 6), toyMat(0xffffff));
    sit(cup, -1.5 + (i % 3) * 1.2, -0.5 + Math.floor(i / 3) * 0.8, poi, 2.6);
    g.add(cup);
  }
  addBag(g, poi, 0, 1.5, { color: 0xfff8e8, scale: 0.95, yOff: 2.5 });
  addBag(g, poi, -3, 2, { color: 0xffe0e8, scale: 0.85 });
  snags.push({ position: new THREE.Vector3(poi.x, terrainHeight(poi.x, poi.z) + 1.5, poi.z), radius: 2 });
}

/** Breadcrumb jokes between hubs so travel never feels empty. */
function placeMicroJokes(parent: THREE.Group): void {
  const crumbs: { x: number; z: number; lines: string[] }[] = [
    { x: 55, z: -40, lines: ["thank you", "bag"] },
    { x: -70, z: 20, lines: ["bags only"] },
    { x: 20, z: 90, lines: ["hold my", "bag"] },
    { x: -20, z: -80, lines: ["bag fort"] },
    { x: 90, z: -10, lines: ["bag pep", "oh, oh, oh"] },
    { x: -80, z: -70, lines: ["bag", "plaza"] },
    { x: 70, z: 80, lines: ["it's in", "the bag"] },
    { x: -110, z: 100, lines: ["like a", "plastic bag"] },
    { x: 140, z: 100, lines: ["feeling", "paper thin"] },
    { x: -40, z: 40, lines: ["empty cups", "only"] },
    { x: 100, z: -120, lines: ["bag camp"] },
    { x: -120, z: -40, lines: ["no humans"] },
    { x: 10, z: -100, lines: ["in the", "bag"] },
    { x: -100, z: 80, lines: ["employee of", "the month"] },
    { x: 110, z: 20, lines: ["he went", "too high"] },
    { x: -25, z: 100, lines: ["bags", "welcome"] },
    { x: 75, z: -155, lines: ["empty cups", "only"] },
  ];

  for (const c of crumbs) {
    const g = chunkAt(parent, c, 35);
    const scrap = makeLyricScrap(c.lines.join(" "));
    sit(scrap, 0, 0, c, 0.05);
    g.add(scrap);
    if (Math.abs(c.x + c.z) % 3 < 1) {
      const sign = makeRoadSign(c.lines);
      sit(sign, 3, -2, c);
      g.add(sign);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), toyMat(0xd0c0b0));
      sit(rock, -2, 2, c, 0.4);
      g.add(rock);
    }
  }
}
