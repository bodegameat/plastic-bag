import * as Tone from "tone";
import type { WorldId } from "./types";
import { ALT, fireworkAmount, spaceAmount } from "../worlds/altitude";

export interface StemState {
  /** Absolute bag Y */
  altitudeY: number;
  worldId: WorldId;
}

/**
 * T1 — always-on bed (streamed HTMLAudioElement via MediaElementSource so 18MB never blocks boot).
 * T2/T3/T4 — place-based stems (zone), muted in firework/space bands.
 * T5 — "baby you're a firework" — only in firework height; exclusivity with T2–T4.
 * Reverb/filter — driven by altitude, not button press.
 * Procedural SFX — zero-byte synthesized crinkle, puff-dash whoosh, boing/bump, gag fanfare, stamp chime.
 */
export class StemMixer {
  private started = false;
  private muted = false;
  private graphReady = false;
  private initPromise: Promise<void> | null = null;

  private bedEl: HTMLAudioElement | null = null;
  private bedSource: MediaElementAudioSourceNode | null = null;
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

  // Procedural SFX nodes
  private sfxGain!: Tone.Gain;
  private crinkleNoise!: Tone.NoiseSynth;
  private crinkleFilter!: Tone.Filter;
  private whooshNoise!: Tone.NoiseSynth;
  private whooshFilter!: Tone.Filter;
  private boingSynth!: Tone.MembraneSynth;
  private chimeSynth!: Tone.PolySynth;

  private lastCrinkleAt = 0;
  private lastBumpAt = 0;

  /** Start preloading stems in the background (safe before user gesture). */
  preload(): void {
    if (!this.bedEl) {
      const el = new Audio("/music/T1.mp3");
      el.loop = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      this.bedEl = el;
    }
  }

  /** Must run in a user-gesture turn (especially iOS). Safe to call often. */
  async unlock(): Promise<void> {
    this.preload();
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
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initInternal();
    return this.initPromise;
  }

  private async _initInternal(): Promise<void> {
    this.preload();

    this.master = new Tone.Gain(0.9);
    this.filter = new Tone.Filter({ frequency: 2800, type: "lowpass", Q: 0.6 });
    this.reverb = new Tone.Reverb({ decay: 2.8, wet: 0.28 });

    // Connect filter -> reverb -> master, and generate reverb non-blocking
    this.filter.connect(this.reverb);
    this.reverb.connect(this.master);
    this.master.toDestination();
    void this.reverb.generate();

    this.bedGain = new Tone.Gain(0.55);
    this.bedGain.connect(this.filter);

    // Wire HTMLAudioElement for T1 so it streams immediately without 18MB XHR decode wait
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      if (this.bedEl && !this.bedSource) {
        this.bedSource = rawCtx.createMediaElementSource(this.bedEl);
        Tone.connect(this.bedSource, this.bedGain);
      }
    } catch {
      /* fallback if already connected */
    }

    this.setupSfx();
    this.graphReady = true;

    await this.ensureRunning();
    this.kickPlayers();

    // Load T2–T5 in the background so gameplay starts immediately
    const stemDefs = [
      { id: "T2", url: "/music/T2.mp3" },
      { id: "T3", url: "/music/T3.mp3" },
      { id: "T4", url: "/music/T4.mp3" },
      { id: "T5", url: "/music/T5.mp3" },
    ];

    void Promise.all(
      stemDefs.map(async (def) => {
        const gain = new Tone.Gain(0);
        gain.connect(this.filter);
        const player = new Tone.Player({ loop: true, fadeIn: 0.8, fadeOut: 1.2 });
        try {
          await player.load(def.url);
          player.connect(gain);
          const entry = { id: def.id, player, gain, target: 0 };
          this.stems.push(entry);
          this.kickPlayers();
        } catch (err) {
          console.warn(`stem skip ${def.id}`, err);
        }
      }),
    );
  }

  private setupSfx(): void {
    this.sfxGain = new Tone.Gain(0.55);
    this.sfxGain.connect(this.master);

    this.crinkleFilter = new Tone.Filter({ frequency: 3600, type: "bandpass", Q: 2.2 });
    this.crinkleFilter.connect(this.sfxGain);
    this.crinkleNoise = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.004, decay: 0.055, sustain: 0, release: 0.03 },
    });
    this.crinkleNoise.volume.value = -14;
    this.crinkleNoise.connect(this.crinkleFilter);

    this.whooshFilter = new Tone.Filter({ frequency: 650, type: "bandpass", Q: 1.2 });
    this.whooshFilter.connect(this.sfxGain);
    this.whooshNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.04, decay: 0.32, sustain: 0.05, release: 0.25 },
    });
    this.whooshNoise.volume.value = -12;
    this.whooshNoise.connect(this.whooshFilter);

    this.boingSynth = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 3,
      envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.08 },
    });
    this.boingSynth.volume.value = -11;
    this.boingSynth.connect(this.sfxGain);

    this.chimeSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.008, decay: 0.28, sustain: 0.05, release: 0.4 },
    });
    this.chimeSynth.volume.value = -12;
    this.chimeSynth.connect(this.reverb);
  }

  /** Subtle plastic-bag crinkle on sharp turns, crumple, or inflate. */
  playCrinkle(intensity = 0.6): void {
    if (!this.graphReady || this.muted) return;
    const now = performance.now();
    if (now - this.lastCrinkleAt < 95) return;
    this.lastCrinkleAt = now;
    try {
      const freq = 2600 + Math.random() * 2600;
      this.crinkleFilter.frequency.value = freq;
      this.crinkleNoise.volume.value = -18 + Math.min(1, intensity) * 7;
      this.crinkleNoise.triggerAttackRelease("32n");
    } catch {
      /* ignore audio scheduling race */
    }
  }

  /** Gust / puff-dash / updraft whoosh. */
  playWhoosh(pitch = 1): void {
    if (!this.graphReady || this.muted) return;
    try {
      const t = Tone.now();
      this.whooshFilter.frequency.setValueAtTime(320 * pitch, t);
      this.whooshFilter.frequency.exponentialRampToValueAtTime(1600 * pitch, t + 0.22);
      this.whooshFilter.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.45);
      this.whooshNoise.triggerAttackRelease(0.36, t);
    } catch {
      /* ignore */
    }
  }

  /** Soft toy bump when knocking into props or NPC bags. */
  playBump(strength = 0.5): void {
    if (!this.graphReady || this.muted) return;
    const now = performance.now();
    if (now - this.lastBumpAt < 110) return;
    this.lastBumpAt = now;
    try {
      const notes = ["C3", "D3", "E3", "G3", "A3", "C4"];
      const note = notes[Math.floor(Math.random() * notes.length)]!;
      this.boingSynth.volume.value = -16 + Math.min(1, strength) * 7;
      this.boingSynth.triggerAttackRelease(note, "16n");
    } catch {
      /* ignore */
    }
  }

  /** Sparkly fanfare when triggering a scene's special gag or discovering a zone. */
  playGag(kind: "gag" | "discover" | "pickup" | "drop" = "gag"): void {
    if (!this.graphReady || this.muted) return;
    try {
      const t = Tone.now();
      if (kind === "pickup") {
        this.chimeSynth.triggerAttackRelease(["E5", "B5"], "16n", t);
      } else if (kind === "drop") {
        this.chimeSynth.triggerAttackRelease(["G4", "D4"], "16n", t);
      } else if (kind === "discover") {
        this.chimeSynth.triggerAttackRelease("C5", "16n", t);
        this.chimeSynth.triggerAttackRelease("E5", "16n", t + 0.07);
        this.chimeSynth.triggerAttackRelease("G5", "12n", t + 0.14);
        this.chimeSynth.triggerAttackRelease("C6", "8n", t + 0.22);
      } else {
        this.chimeSynth.triggerAttackRelease("G4", "16n", t);
        this.chimeSynth.triggerAttackRelease("B4", "16n", t + 0.06);
        this.chimeSynth.triggerAttackRelease("D5", "16n", t + 0.12);
        this.chimeSynth.triggerAttackRelease(["G5", "B5"], "8n", t + 0.18);
        this.playWhoosh(1.25);
      }
    } catch {
      /* ignore */
    }
  }

  async start(): Promise<void> {
    await this.ensureRunning();
    this.kickPlayers();
  }

  private kickPlayers(): void {
    if (!this.graphReady) return;
    const now = Tone.now();
    try {
      if (this.bedEl && this.bedEl.paused) {
        void this.bedEl.play().catch(() => {
          /* next gesture retries */
        });
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
    const mapTargets: Record<string, number> = {
      T2: place.t2 * placeLive * 0.65,
      T3: place.t3 * placeLive * 0.65,
      T4: place.t4 * placeLive * 0.7,
      T5: t5,
    };

    for (let i = 0; i < this.stems.length; i++) {
      const s = this.stems[i]!;
      s.target = mapTargets[s.id] ?? 0;
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

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    try {
      this.bedEl?.pause();
      this.bedSource?.disconnect();
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
    this.crinkleNoise?.dispose();
    this.crinkleFilter?.dispose();
    this.whooshNoise?.dispose();
    this.whooshFilter?.dispose();
    this.boingSynth?.dispose();
    this.chimeSynth?.dispose();
    this.sfxGain?.dispose();
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
