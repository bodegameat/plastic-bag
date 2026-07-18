import * as Tone from "tone";
import type { WorldId } from "./types";
import { ALT, fireworkAmount, spaceAmount } from "../worlds/altitude";

export interface StemState {
  /** Absolute bag Y */
  altitudeY: number;
  worldId: WorldId;
}

/**
 * T1 — always-on bed.
 * T2/T3/T4 — place-based stems (zone), muted in firework/space bands.
 * T5 — "baby you're a firework" — only in firework height; exclusivity with T2–T4.
 * Reverb/filter — driven by altitude, not button press.
 */
export class StemMixer {
  private started = false;
  private muted = false;
  private graphReady = false;

  private bed!: Tone.Player;
  private stems: {
    id: string;
    player: Tone.Player;
    gain: Tone.Gain;
    target: number;
  }[] = [];

  private master!: Tone.Gain;
  private filter!: Tone.Filter;
  private reverb!: Tone.Reverb;
  private bedGain!: Tone.Gain;

  /** Must run in a user-gesture turn (especially iOS). Safe to call often. */
  async unlock(): Promise<void> {
    await this.ensureRunning();
  }

  /** Resume AudioContext + start any loaded players that aren't running yet. */
  async resume(): Promise<void> {
    await this.ensureRunning();
    this.kickPlayers();
  }

  private async ensureRunning(): Promise<void> {
    await Tone.start();
    const raw = Tone.getContext().rawContext;
    if (raw.state === "suspended") {
      await raw.resume();
    }
  }

  async init(): Promise<void> {
    this.master = new Tone.Gain(0.9);
    this.filter = new Tone.Filter({ frequency: 2800, type: "lowpass", Q: 0.6 });
    this.reverb = new Tone.Reverb({ decay: 4.2, wet: 0.3 });
    await this.reverb.generate();

    this.filter.connect(this.reverb);
    this.reverb.connect(this.master);
    this.master.toDestination();

    this.bedGain = new Tone.Gain(0.55);
    this.bedGain.connect(this.filter);

    this.bed = new Tone.Player({ loop: true, fadeIn: 0.5, fadeOut: 0.5 });
    // Cache-bust so replaced mp3s load without a hard browser wipe
    const bust = `?v=${Date.now()}`;
    await this.bed.load(`/music/T1.mp3${bust}`);
    this.bed.connect(this.bedGain);
    this.graphReady = true;

    // Start bed as soon as T1 is ready — don't wait on T2–T5
    await this.ensureRunning();
    this.kickPlayers();

    const stemDefs = [
      { id: "T2", url: `/music/T2.mp3${bust}` },
      { id: "T3", url: `/music/T3.mp3${bust}` },
      { id: "T4", url: `/music/T4.mp3${bust}` },
      { id: "T5", url: `/music/T5.mp3${bust}` },
    ];

    const loaded = await Promise.all(
      stemDefs.map(async (def) => {
        const gain = new Tone.Gain(0);
        gain.connect(this.filter);
        const player = new Tone.Player({ loop: true, fadeIn: 1.0, fadeOut: 1.4 });
        await player.load(def.url);
        player.connect(gain);
        return { id: def.id, player, gain, target: 0 };
      }),
    );
    this.stems = loaded;
    this.kickPlayers();
  }

  async start(): Promise<void> {
    await this.ensureRunning();
    this.kickPlayers();
  }

  private kickPlayers(): void {
    if (!this.graphReady || !this.bed) return;
    const now = Tone.now();
    try {
      if (this.bed.loaded && this.bed.state !== "started") {
        this.bed.start(now);
      }
      for (const s of this.stems) {
        if (s.player.loaded && s.player.state !== "started") {
          s.player.start(now + 0.05);
        }
      }
      this.started = true;
    } catch {
      /* iOS: start while suspended — next gesture resume() retries */
    }
  }

  update(state: StemState): void {
    if (!this.started) return;

    const y = state.altitudeY;
    const fw = fireworkAmount(y);
    const sp = spaceAmount(y);
    const placeLive = y < ALT.FIREWORK_LO - 10 ? 1 - fw : 0;
    // T5 from firework band through space/rocket; place stems only below fireworks
    const t5 = Math.max(fw, sp) * 0.9;

    const place = placeStems(state.worldId);
    const t2 = place.t2 * placeLive * 0.65;
    const t3 = place.t3 * placeLive * 0.65;
    const t4 = place.t4 * placeLive * 0.7;

    const targets = [t2, t3, t4, t5];
    for (let i = 0; i < this.stems.length; i++) {
      const s = this.stems[i]!;
      s.target = targets[i] ?? 0;
      const cur = s.gain.gain.value;
      // T5 fades a bit faster so the lyric hits; others breathe slow
      const rate = s.id === "T5" ? 0.06 : 0.035;
      s.gain.gain.value = cur + (s.target - cur) * rate;
    }

    const stemSum =
      this.stems.reduce((a, s) => a + s.gain.gain.value, 0) / Math.max(1, this.stems.length);
    const bedTarget = this.muted ? 0 : 0.52 - stemSum * 0.1 + fw * 0.05;
    this.bedGain.gain.value += (Math.max(0.3, bedTarget) - this.bedGain.gain.value) * 0.03;

    // Height FX — no button coupling
    const alt01 = clamp01((y - 5) / 240);
    const filtTarget = 1100 + alt01 * 4800 + fw * 600;
    const reverbTarget = 0.2 + alt01 * 0.5 + sp * 0.2 + fw * 0.1;

    this.filter.frequency.rampTo(filtTarget, 0.15);
    this.reverb.wet.rampTo(reverbTarget, 0.25);
    this.master.gain.rampTo(this.muted ? 0 : 0.9, 0.15);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.master.gain.rampTo(this.muted ? 0 : 0.9, 0.2);
    return this.muted;
  }

  dispose(): void {
    try {
      this.bed.stop();
      this.bed.dispose();
    } catch {
      /* ignore */
    }
    for (const s of this.stems) {
      try {
        s.player.stop();
        s.player.dispose();
        s.gain.dispose();
      } catch {
        /* ignore */
      }
    }
    this.filter?.dispose();
    this.reverb?.dispose();
    this.master?.dispose();
    this.bedGain?.dispose();
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Place → stem mix. Roughly one stem leads per vibe. */
function placeStems(id: WorldId): { t2: number; t3: number; t4: number } {
  switch (id) {
    case "suburban":
    case "parking":
      return { t2: 0.85, t3: 0.25, t4: 0.15 };
    case "fields":
    case "horizon":
      return { t2: 0.2, t3: 0.9, t4: 0.2 };
    case "city":
    case "fair":
      return { t2: 0.35, t3: 0.2, t4: 0.95 };
    case "overpass":
      return { t2: 0.45, t3: 0.35, t4: 0.7 };
    default:
      return { t2: 0.4, t3: 0.4, t4: 0.4 };
  }
}
