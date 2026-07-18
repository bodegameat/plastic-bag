import * as THREE from "three";
import type { WorldId } from "../audio/types";
import type { SnagPoint } from "../game/SnagSystem";
import type { GustZone, Updraft, WindConfig } from "../game/Wind";
import { updateBagNpcs } from "./bagNpc";
import { updateChunks } from "./landmarks";
import { NatureField, TOY } from "./nature";
import { buildPunZones, placeAllPunScenes, PUN_POI, PUN_PATHS } from "./punScenes";
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

  const segs = mobile ? 64 : 84;
  const terrain = buildTerrainMesh(140, segs, TOY.grass, pathPairs);
  group.add(terrain.mesh);

  placeAllPunScenes(group, snagPoints, updaters);

  const hubs = Object.values(PUN_POI);
  const nature = new NatureField(mobile);
  nature.scatter(hubs, pathPairs, 7.5);
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
