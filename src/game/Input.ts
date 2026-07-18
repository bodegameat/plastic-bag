/**
 * Unified input: keyboard + virtual joystick / touch buttons.
 * Stick Y+: forward (into the world). Stick X+: strafe right.
 */
export class Input {
  readonly keys = new Set<string>();
  private prevKeys = new Set<string>();

  /** -1…1 from keys and/or touch joystick */
  stickX = 0;
  stickY = 0;

  touchFill = false;
  touchCrumple = false;

  private touchStickX = 0;
  private touchStickY = 0;
  private wiggleAcc = 0;
  private lastStickX = 0;
  private aEdge = false;
  private dEdge = false;

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  setTouchStick(x: number, y: number): void {
    // Detect left/right wiggles for snag free
    if (Math.sign(x) !== 0 && Math.sign(x) !== Math.sign(this.lastStickX) && Math.abs(x) > 0.45) {
      this.wiggleAcc += 1;
    }
    if (Math.abs(x - this.lastStickX) > 0.55) {
      this.wiggleAcc += 0.5;
    }
    this.lastStickX = x;
    this.touchStickX = x;
    this.touchStickY = y;
  }

  clearTouchStick(): void {
    this.touchStickX = 0;
    this.touchStickY = 0;
    this.lastStickX = 0;
  }

  /** Call once per frame after game logic reads edges. */
  endFrame(): void {
    this.prevKeys = new Set(this.keys);
    this.aEdge = false;
    this.dEdge = false;
    this.composeStick();
  }

  /** Recompute combined stick before reading (call at start of frame too). */
  beginFrame(): void {
    this.composeStick();
  }

  get nudgeX(): number {
    return this.stickX;
  }

  get nudgeZ(): number {
    // Legacy bag API: negative Z is "forward" in world when camera is behind.
    // stickY+ means forward → return -stickY for world Z axis convention.
    return -this.stickY;
  }

  get fill(): boolean {
    return this.keys.has("Space") || this.touchFill;
  }

  get crumple(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchCrumple;
  }

  /** Rising edges / touch wiggles for snag. */
  consumeWiggle(): number {
    let n = 0;
    if (this.aEdge) n++;
    if (this.dEdge) n++;
    n += Math.min(3, Math.floor(this.wiggleAcc));
    this.wiggleAcc = 0;
    return n;
  }

  justPressed(code: string): boolean {
    return this.keys.has(code) && !this.prevKeys.has(code);
  }

  private composeStick(): void {
    let x = this.touchStickX;
    let y = this.touchStickY;

    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.stickX = x;
    this.stickY = y;
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    const was = this.keys.has(e.code);
    this.keys.add(e.code);
    if (!was && e.code === "KeyA") this.aEdge = true;
    if (!was && e.code === "KeyD") this.dEdge = true;
  };

  private onUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.clearTouchStick();
    this.touchFill = false;
    this.touchCrumple = false;
  };
}
