import * as THREE from "three";
import { WORLD_SIZE } from "./wrap";

/**
 * Seamless rolling hills — height is periodic over WORLD_SIZE so the wrap tile matches.
 */
export function terrainHeight(x: number, z: number): number {
  const u = (x / WORLD_SIZE) * Math.PI * 2;
  const v = (z / WORLD_SIZE) * Math.PI * 2;

  let h = 0;
  h += Math.sin(u * 2.0) * Math.cos(v * 3.0) * 5.5;
  h += Math.sin(u * 5.0 + 0.7) * Math.cos(v * 2.0 + 1.1) * 3.2;
  h += Math.sin(u * 9.0 + 2.0) * Math.sin(v * 7.0) * 1.4;
  h += Math.cos(u * 3.0 - v * 4.0) * 2.0;

  return 1.2 + h;
}

export function buildTerrainMesh(
  size: number,
  segments: number,
  color = 0x3ecf6a,
): { mesh: THREE.Mesh; refresh: (cx: number, cz: number) => void } {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
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

  const refresh = (cx: number, cz: number): void => {
    mesh.position.x = cx;
    mesh.position.z = cz;
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + baseX[i]!;
      const wz = cz + baseZ[i]!;
      pos.setY(i, terrainHeight(wx, wz));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };

  refresh(0, 0);
  return { mesh, refresh };
}
