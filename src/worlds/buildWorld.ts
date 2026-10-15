import * as THREE from "three";
import type { WorldId } from "../audio/types";
import type { SnagPoint } from "../game/SnagSystem";
import type { GustZone, Updraft, WindConfig } from "../game/Wind";
import { updateBagNpcs } from "./bagNpc";
import { buildUpdraftVents } from "./breeze";
import { updateChunks } from "./landmarks";
import { NatureField, TOY } from "./nature";
import { buildPunZones, placeAllPunScenes, PUN_POI, PUN_PATHS, type PunId } from "./punScenes";
import { buildTerrainMesh, terrainHeight, type HubTint } from "./terrain";
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
  blurb?: string;
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

export function buildAdventureWorld(mobile = false): AdventureWorld {
  const group = new THREE.Group();
  const snagPoints: SnagPoint[] = [];
  const gustZones: GustZone[] = [];
  const updrafts: Updraft[] = [];
  const updaters: Array<(dt: number, time: number) => void> = [];

  const pathPairs: [Poi, Poi][] = PUN_PATHS.map(([a, b]) => [PUN_POI[a], PUN_POI[b]]);

  const tintPalette: Record<PunId, number> = {
    squiat: 0xd86098,
    plasticOnly: 0xe05878,
    bunny: 0xe868b8,
    notorious: 0x6a5888,
    baguette: 0xd8a868,
    check: 0x7098c0,
    windbag: 0xc89858,
    pipes: 0x38b858,
    sleeping: 0x48a868,
    tea: 0xd0a870,
    doggy: 0x98c868,
    tricks: 0x9858d0,
    grocery: 0x7898b0,
    mixed: 0xb89870,
    future: 0x58a8e8,
    money: 0x48b878,
    airbag: 0x98b8d8,
  };
  const hubTints: HubTint[] = (Object.keys(PUN_POI) as PunId[]).map((id) => ({
    x: PUN_POI[id].x,
    z: PUN_POI[id].z,
    radius: 17,
    color: tintPalette[id],
  }));

  const segs = mobile ? 64 : 84;
  const terrain = buildTerrainMesh(140, segs, TOY.grass, pathPairs, hubTints);
  group.add(terrain.mesh);

  placeAllPunScenes(group, snagPoints, updaters);

  // Thermal updrafts at thematic hubs so players can ride air columns into the clouds & fireworks
  const updraftHubs: Array<{ poi: Poi; radius: number; strength: number }> = [
    { poi: PUN_POI.airbag, radius: 9.5, strength: 7.5 },
    { poi: PUN_POI.windbag, radius: 10.5, strength: 8.0 },
    { poi: PUN_POI.future, radius: 9.0, strength: 7.0 },
    { poi: PUN_POI.check, radius: 10.0, strength: 6.8 },
    { poi: PUN_POI.bunny, radius: 9.0, strength: 6.5 },
    { poi: PUN_POI.tricks, radius: 8.5, strength: 6.5 },
  ];
  for (const u of updraftHubs) {
    updrafts.push({
      position: new THREE.Vector3(u.poi.x, terrainHeight(u.poi.x, u.poi.z), u.poi.z),
      radius: u.radius,
      strength: u.strength,
    });
  }
  buildUpdraftVents(group, updrafts, updaters);

  // Subtle horizontal tailwind gusts along key avenues
  gustZones.push(
    {
      position: new THREE.Vector3(PUN_POI.grocery.x, 2, PUN_POI.grocery.z),
      radius: 18,
      force: new THREE.Vector3(3.2, 0.4, 0),
    },
    {
      position: new THREE.Vector3(PUN_POI.pipes.x, 2, PUN_POI.pipes.z),
      radius: 16,
      force: new THREE.Vector3(-2.4, 0.8, 1.8),
    },
  );

  const hubs = Object.values(PUN_POI);
  const nature = new NatureField(mobile);
  nature.scatter(hubs, pathPairs, 7.5);
  group.add(nature.group);

  const spinObjs: THREE.Object3D[] = [];
  const swayObjs: Array<{ obj: THREE.Object3D; phase: number }> = [];
  group.traverse((o) => {
    if (o.userData.spin) spinObjs.push(o);
    if (typeof o.userData.sway === "number") {
      swayObjs.push({ obj: o, phase: o.userData.sway });
    }
  });

  updaters.push((dt, time) => {
    updateBagNpcs(group, time);
    for (let i = 0; i < spinObjs.length; i++) {
      spinObjs[i]!.rotation.y += dt * 0.8;
    }
    for (let i = 0; i < swayObjs.length; i++) {
      const s = swayObjs[i]!;
      s.obj.rotation.z = Math.sin(time * 1.3 + s.phase) * 0.06;
    }
  });

  const zones: ZoneAtmosphere[] = buildPunZones();
  const spawnY = terrainHeight(8, 12) + 7;

  return {
    group,
    snagPoints,
    zones,
    spawn: new THREE.Vector3(8, spawnY, 12),
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
      const showGround = spaceAmt < 0.35;
      group.visible = showGround;
      if (bagPos && showGround) {
        updateChunks(group, bagPos, 240, 340);
        terrain.refresh(bagPos.x, bagPos.z);
        nature.update(time, bagPos, fogFar);
      }
    },
  };
}

export function zoneWeights(x: number, z: number, zones: ZoneAtmosphere[]): number[] {
  const raw = zones.map((zone) => {
    const d = wrapDist(x, z, zone.centerX, zone.centerZ);
    const t = d / Math.max(30, zone.radius);
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
