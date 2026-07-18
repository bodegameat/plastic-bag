import type { Input } from "./Input";

/**
 * On-screen joystick + hold buttons for mobile / touch.
 * Visible whenever the device has coarse pointer or is narrow.
 */
export class TouchControls {
  private root: HTMLElement;
  private stickArea: HTMLElement;
  private knob: HTMLElement;
  private fillBtn: HTMLElement;
  private crumpleBtn: HTMLElement;
  private wiggleHint: HTMLElement;
  private activeId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly maxRadius: number;
  private input: Input;
  private hooks: {
    onMute?: () => void;
    onCamera?: () => void;
  };

  constructor(
    input: Input,
    hooks: {
      onMute?: () => void;
      onCamera?: () => void;
    } = {},
  ) {
    this.input = input;
    this.hooks = hooks;
    this.root = document.querySelector("#touch-ui")!;
    this.stickArea = document.querySelector("#touch-stick")!;
    this.knob = document.querySelector("#touch-knob")!;
    this.fillBtn = document.querySelector("#touch-fill")!;
    this.crumpleBtn = document.querySelector("#touch-crumple")!;
    this.wiggleHint = document.querySelector("#touch-wiggle")!;

    const isTouch =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 900px)").matches ||
      "ontouchstart" in window;

    if (isTouch) {
      this.root.classList.remove("touch-ui--hidden");
      this.root.setAttribute("aria-hidden", "false");
    }

    this.maxRadius = Math.min(56, window.innerWidth * 0.12);

    this.bindStick();
    this.bindHold(this.fillBtn, (v) => {
      this.input.touchFill = v;
    });
    this.bindHold(this.crumpleBtn, (v) => {
      this.input.touchCrumple = v;
    });

    document.querySelector("#touch-mute")?.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        this.hooks.onMute?.();
      },
      { passive: false },
    );
    document.querySelector("#touch-cam")?.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        this.hooks.onCamera?.();
      },
      { passive: false },
    );

    // Prevent page scroll / pinch while playing
    this.root.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
      },
      { passive: false },
    );
  }

  setSnagged(snagged: boolean): void {
    this.wiggleHint.hidden = !snagged;
    this.root.classList.toggle("touch-ui--snagged", snagged);
  }

  show(): void {
    const isTouch =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 900px)").matches ||
      "ontouchstart" in window;
    if (isTouch) {
      this.root.classList.remove("touch-ui--hidden");
    }
  }

  private bindStick(): void {
    const onStart = (e: PointerEvent): void => {
      if (this.activeId !== null) return;
      e.preventDefault();
      this.stickArea.setPointerCapture(e.pointerId);
      this.activeId = e.pointerId;
      const rect = this.stickArea.getBoundingClientRect();
      this.originX = rect.left + rect.width / 2;
      this.originY = rect.top + rect.height / 2;
      this.moveStick(e.clientX, e.clientY);
    };

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== this.activeId) return;
      e.preventDefault();
      this.moveStick(e.clientX, e.clientY);
    };

    const onEnd = (e: PointerEvent): void => {
      if (e.pointerId !== this.activeId) return;
      this.activeId = null;
      this.knob.style.transform = "translate(-50%, -50%)";
      this.input.clearTouchStick();
    };

    this.stickArea.addEventListener("pointerdown", onStart);
    this.stickArea.addEventListener("pointermove", onMove);
    this.stickArea.addEventListener("pointerup", onEnd);
    this.stickArea.addEventListener("pointercancel", onEnd);
  }

  private moveStick(clientX: number, clientY: number): void {
    let dx = clientX - this.originX;
    let dy = clientY - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.maxRadius) {
      dx = (dx / dist) * this.maxRadius;
      dy = (dy / dist) * this.maxRadius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const x = dx / this.maxRadius;
    const y = -dy / this.maxRadius; // screen up → stickY+
    this.input.setTouchStick(x, y);
  }

  private bindHold(el: HTMLElement, set: (v: boolean) => void): void {
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-active");
      set(true);
    };
    const up = (e: PointerEvent): void => {
      el.classList.remove("is-active");
      set(false);
      void e;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }
}
