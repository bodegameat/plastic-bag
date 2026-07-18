import * as THREE from "three";
import { WORLD_SIZE } from "./wrap";
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

type PathSeg = { ax: number; az: number; bx: number; bz: number; len: number };

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

/** Wrap-aware min distance² to a path segment (and ±WORLD_SIZE copies). */
function distToSeg2Wrap(px: number, pz: number, s: PathSeg): number {
  let best = Infinity;
  for (let ox = -WORLD_SIZE; ox <= WORLD_SIZE; ox += WORLD_SIZE) {
    for (let oz = -WORLD_SIZE; oz <= WORLD_SIZE; oz += WORLD_SIZE) {
      const d2 = distToSeg2(px, pz, {
        ax: s.ax + ox,
        az: s.az + oz,
        bx: s.bx + ox,
        bz: s.bz + oz,
        len: s.len,
      });
      if (d2 < best) best = d2;
    }
  }
  return best;
}

/**
 * Terrain mesh with path ribbons painted into the grass (vertex colors).
 */
export function buildTerrainMesh(
  size: number,
  segments: number,
  color = 0x3ecf6a,
  pathPairs: [{ x: number; z: number }, { x: number; z: number }][] = [],
): { mesh: THREE.Mesh; refresh: (cx: number, cz: number) => void } {
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
  const tmp = new THREE.Color();

  const segs: PathSeg[] = pathPairs.map(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, len };
  });

  // Wide enough to read on coarse mobile terrain verts
  const PATH_HALF = 2.6;
  const PATH_FADE = 1.4;

  const refresh = (cx: number, cz: number): void => {
    mesh.position.x = cx;
    mesh.position.z = cz;
    const colorAttr = geo.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < pos.count; i++) {
      const wx = cx + baseX[i]!;
      const wz = cz + baseZ[i]!;
      pos.setY(i, terrainHeight(wx, wz));

      const n = Math.sin(wx * 0.08) * Math.cos(wz * 0.07);
      tmp.copy(grass).lerp(grassDeep, 0.2 + n * 0.15);

      let best = Infinity;
      for (const s of segs) {
        const d2 = distToSeg2Wrap(wx, wz, s);
        if (d2 < best) best = d2;
      }
      const d = Math.sqrt(best);
      if (d < PATH_HALF + PATH_FADE) {
        const core = 1 - Math.min(1, d / PATH_HALF);
        const soft = 1 - Math.min(1, Math.max(0, d - PATH_HALF) / PATH_FADE);
        const amt = Math.max(core * 0.98, soft * 0.65);
        tmp.lerp(d < PATH_HALF * 0.7 ? pathCol : pathEdge, amt);
      }

      colorAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };

  refresh(0, 0);
  return { mesh, refresh };
}
