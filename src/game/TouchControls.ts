import type { Input } from "./Input";

/**
 * On-screen joystick + hold buttons for mobile / touch.
 * Interact is context-only: tap the object in-world (Game raycast).
 */
export class TouchControls {
  private root: HTMLElement;
  private stickArea: HTMLElement;
  private knob: HTMLElement;
  private fillBtn: HTMLElement;
  private crumpleBtn: HTMLElement;
  private spinLBtn: HTMLElement;
  private spinRBtn: HTMLElement;
  private interactHint: HTMLElement | null;
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
    this.spinLBtn = document.querySelector("#touch-spin-l")!;
    this.spinRBtn = document.querySelector("#touch-spin-r")!;
    this.interactHint = document.querySelector("#interact-hint");
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
    this.bindHold(this.spinLBtn, (v) => {
      this.input.touchSpin = v ? -1 : this.spinRBtn.classList.contains("is-active") ? 1 : 0;
    });
    this.bindHold(this.spinRBtn, (v) => {
      this.input.touchSpin = v ? 1 : this.spinLBtn.classList.contains("is-active") ? -1 : 0;
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

    this.root.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Show contextual interact prompt when something is in range. */
  setCanInteract(can: boolean, mobile: boolean): void {
    if (!this.interactHint) return;
    this.interactHint.hidden = !can;
    this.interactHint.textContent = mobile ? "tap it" : "enter";
    this.interactHint.classList.toggle("is-on", can);
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

    const onEnd = (): void => {
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
    const y = -dy / this.maxRadius;
    this.input.setTouchStick(x, y);
  }

  private bindHold(el: HTMLElement, set: (v: boolean) => void): void {
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-active");
      set(true);
    };
    const up = (): void => {
      el.classList.remove("is-active");
      set(false);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }
}
