/** Vertical bands — absolute world Y. */
export const ALT = {
  MAX: 260,
  /** Soft cloud deck */
  CLOUD_LO: 42,
  CLOUD_HI: 100,
  /** Baby you're a firework — T1+T5 only */
  FIREWORK_LO: 95,
  FIREWORK_HI: 150,
  /** Stars / thin air */
  SPACE_LO: 160,
  /** Broken rocket float */
  ROCKET_Y: 205,
} as const;

export function fireworkAmount(y: number): number {
  // Start a bit early so T5 leads the visuals
  const enter = smoothstep(ALT.FIREWORK_LO - 18, ALT.FIREWORK_LO + 4, y);
  const exit = 1 - smoothstep(ALT.FIREWORK_HI - 8, ALT.FIREWORK_HI + 12, y);
  return enter * exit;
}

export function spaceAmount(y: number): number {
  return smoothstep(ALT.SPACE_LO - 5, ALT.SPACE_LO + 20, y);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
