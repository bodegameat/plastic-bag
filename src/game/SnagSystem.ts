/** Snag system disabled — explore mode is manual-only. */
export interface SnagPoint {
  position: { x: number; y: number; z: number; clone?: () => unknown };
  radius: number;
}

export class SnagSystem {
  points: SnagPoint[] = [];

  setPoints(_points: SnagPoint[]): void {
    this.points = [];
  }

  update(): void {
    /* no-op */
  }
}
