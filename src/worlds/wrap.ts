/** Toroidal wrap — one tile that repeats forever (globe topology, flat surface). */

export const WORLD_SIZE = 540;
export const WORLD_HALF = WORLD_SIZE / 2;

export function wrapCoord(v: number): number {
  return ((((v + WORLD_HALF) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) - WORLD_HALF;
}

export function wrapDelta(a: number, b: number): number {
  let d = a - b;
  d = ((((d + WORLD_HALF) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) - WORLD_HALF;
  return d;
}

export function wrapDist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = wrapDelta(ax, bx);
  const dz = wrapDelta(az, bz);
  return dx * dx + dz * dz;
}

export function wrapDist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(wrapDist2(ax, az, bx, bz));
}

export function wrapPosition(pos: { x: number; z: number }): void {
  pos.x = wrapCoord(pos.x);
  pos.z = wrapCoord(pos.z);
}
