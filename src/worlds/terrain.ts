import * as THREE from "three";
import { WORLD_SIZE, wrapDist2 } from "./wrap";
import { TOY } from "./nature";

/**
 * Soft rolling meadow — almost flat so toys stay put.
 * Still wraps seamlessly over WORLD_SIZE.
 */
export function terrainHeight(x: number, z: number): number {
  const u = (x / WORLD_SIZE) * Math.PI * 2;
  const v = (z / WORLD_SIZE) * Math.PI * 2;

  let h = 0;
  h += Math.sin(u * 1.5) * Math.cos(v * 1.8) * 0.55;
  h += Math.sin(u * 3.2 + 0.4) * Math.cos(v * 2.1 + 0.9) * 0.28;
  h += Math.sin(u * 6.0 + v * 4.0) * 0.12;

  return 0.6 + h;
}

type PathSeg = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type HubTint = { x: number; z: number; color: number; radius?: number };

/** Squared distance from point to segment AB on XZ. */
function distToSeg2(px: number, pz: number, s: PathSeg): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = s.len * s.len || 1;
  let t = ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = s.ax + dx * t - px;
  const qz = s.az + dz * t - pz;
  return qx * qx + qz * qz;
}

/**
 * Precomputed lookup grid over one canonical WORLD_SIZE tile [-WORLD_HALF, WORLD_HALF].
 * Eliminates ~1.1M segment distance evaluations per frame down to a fast bilinear lookup,
 * and only updates vertex buffers when the player moves across a step threshold.
 */
export function buildTerrainMesh(
  size: number,
  segments: number,
  color = 0x3ecf6a,
  pathPairs: [{ x: number; z: number }, { x: number; z: number }][] = [],
  hubTints: HubTint[] = [],
): { mesh: THREE.Mesh; refresh: (cx: number, cz: number, force?: boolean) => void } {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.followTerrain = true;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const baseX = new Float32Array(pos.count);
  const baseZ = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    baseX[i] = pos.getX(i);
    baseZ[i] = pos.getZ(i);
  }

  const colors = new Float32Array(pos.count * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const grass = new THREE.Color(color);
  const grassDeep = new THREE.Color(TOY.grassDeep);
  const pathCol = new THREE.Color(TOY.path);
  const pathEdge = new THREE.Color(0xd49850);
  const stoneCol = new THREE.Color(0xf6dfba);
  const tmp = new THREE.Color();
  const hubCol = new THREE.Color();

  // Build wrapped segment copies once at startup
  const segs: PathSeg[] = [];
  for (const [a, b] of pathPairs) {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (let ox = -WORLD_SIZE; ox <= WORLD_SIZE; ox += WORLD_SIZE) {
      for (let oz = -WORLD_SIZE; oz <= WORLD_SIZE; oz += WORLD_SIZE) {
        const ax = a.x + ox;
        const az = a.z + oz;
        const bx = b.x + ox;
        const bz = b.z + oz;
        segs.push({
          ax,
          az,
          bx,
          bz,
          len,
          minX: Math.min(ax, bx) - 5,
          maxX: Math.max(ax, bx) + 5,
          minZ: Math.min(az, bz) - 5,
          maxZ: Math.max(az, bz) + 5,
        });
      }
    }
  }

  const PATH_HALF = 2.6;
  const PATH_FADE = 1.4;
  const MAX_PATH_D = PATH_HALF + PATH_FADE;
  const MAX_PATH_D2 = MAX_PATH_D * MAX_PATH_D;

  // Bake a seamless tile LUT (256x256 RGB + height) once at boot
  const LUT_N = 256;
  const lutR = new Float32Array(LUT_N * LUT_N);
  const lutG = new Float32Array(LUT_N * LUT_N);
  const lutB = new Float32Array(LUT_N * LUT_N);

  for (let iz = 0; iz < LUT_N; iz++) {
    const wz = ((iz / LUT_N) - 0.5) * WORLD_SIZE;
    for (let ix = 0; ix < LUT_N; ix++) {
      const wx = ((ix / LUT_N) - 0.5) * WORLD_SIZE;
      const n = Math.sin(wx * 0.08) * Math.cos(wz * 0.07);
      const meadowPatch = Math.sin(wx * 0.035 + wz * 0.025) * 0.5 + 0.5;
      tmp.copy(grass).lerp(grassDeep, 0.16 + n * 0.14 + meadowPatch * 0.1);

      // Subtle theme-park ground tint around each pun hub
      for (let h = 0; h < hubTints.length; h++) {
        const ht = hubTints[h]!;
        const r = ht.radius ?? 20;
        const d2 = wrapDist2(wx, wz, ht.x, ht.z);
        if (d2 < r * r) {
          const w = 1 - Math.sqrt(d2) / r;
          hubCol.setHex(ht.color);
          tmp.lerp(hubCol, w * w * 0.32);
        }
      }

      let best = MAX_PATH_D2 + 1;
      for (let sIdx = 0; sIdx < segs.length; sIdx++) {
        const s = segs[sIdx]!;
        if (wx < s.minX || wx > s.maxX || wz < s.minZ || wz > s.maxZ) continue;
        const d2 = distToSeg2(wx, wz, s);
        if (d2 < best) best = d2;
      }

      if (best <= MAX_PATH_D2) {
        const d = Math.sqrt(best);
        const core = 1 - Math.min(1, d / PATH_HALF);
        const soft = 1 - Math.min(1, Math.max(0, d - PATH_HALF) / PATH_FADE);
        const amt = Math.max(core * 0.98, soft * 0.65);
        tmp.lerp(d < PATH_HALF * 0.72 ? pathCol : pathEdge, amt);
        // Subtle cobblestone speckle in the center of paths
        if (d < PATH_HALF * 0.48) {
          const cobble = Math.sin(wx * 1.4) * Math.cos(wz * 1.4);
          if (cobble > 0.55) tmp.lerp(stoneCol, (cobble - 0.55) * 0.55);
        }
      }

      const idx = iz * LUT_N + ix;
      lutR[idx] = tmp.r;
      lutG[idx] = tmp.g;
      lutB[idx] = tmp.b;
    }
  }

  let lastCx = Number.NaN;
  let lastCz = Number.NaN;
  const cellStep = size / segments;

  const refresh = (cx: number, cz: number, force = false): void => {
    // Snap terrain grid to vertex step so vertices don't swim/shimmer as you move
    const snapX = Math.round(cx / cellStep) * cellStep;
    const snapZ = Math.round(cz / cellStep) * cellStep;
    if (!force && Math.abs(snapX - lastCx) < cellStep * 0.5 && Math.abs(snapZ - lastCz) < cellStep * 0.5) {
      return;
    }
    lastCx = snapX;
    lastCz = snapZ;

    mesh.position.x = snapX;
    mesh.position.z = snapZ;
    const colorAttr = geo.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < pos.count; i++) {
      const wx = snapX + baseX[i]!;
      const wz = snapZ + baseZ[i]!;
      pos.setY(i, terrainHeight(wx, wz));

      const u = ((((wx / WORLD_SIZE) + 0.5) % 1) + 1) % 1;
      const v = ((((wz / WORLD_SIZE) + 0.5) % 1) + 1) % 1;
      const ix = Math.min(LUT_N - 1, (u * LUT_N) | 0);
      const iz = Math.min(LUT_N - 1, (v * LUT_N) | 0);
      const idx = iz * LUT_N + ix;

      colorAttr.setXYZ(i, lutR[idx]!, lutG[idx]!, lutB[idx]!);
    }
    pos.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };

  refresh(0, 0, true);
  return { mesh, refresh };
}
