import "./style.css";
import { Game } from "./game/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const splash = document.querySelector<HTMLElement>("#splash")!;
const hud = document.querySelector<HTMLElement>("#hud")!;
const hudWorld = document.querySelector<HTMLElement>("#hud-world")!;
const hudSnag = document.querySelector<HTMLElement>("#hud-snag");

const game = new Game(canvas);

game.setCallbacks({});

if (hudSnag) hudSnag.hidden = true;
hudWorld.classList.add("hud__world--hidden");
hudWorld.setAttribute("aria-hidden", "true");

let booting = false;

const begin = async (): Promise<void> => {
  if (booting) return;
  booting = true;
  splash.querySelector(".splash__prompt")!.textContent = "inflating…";

  try {
    // Unlock AudioContext in the same tap/gesture (required on iOS)
    await game.unlockAudio();
    await game.initAudio();
    // Resume again before play — context often suspends during the long load
    game.resumeAudio();
    splash.classList.add("splash--gone");
    hud.classList.remove("hud--hidden");
    hud.setAttribute("aria-hidden", "false");
    await game.start();

    window.setTimeout(() => {
      for (const el of document.querySelectorAll(".hud__hint")) {
        el.classList.add("hud__hint--fade");
      }
    }, 10000);
  } catch (err) {
    console.error(err);
    splash.querySelector(".splash__prompt")!.textContent =
      "something snagged — tap to try again";
    booting = false;
  }
};

splash.addEventListener("click", () => void begin());
splash.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    void begin();
  },
  { passive: false },
);
