import * as THREE from "three";
import { wrapDelta, wrapDist } from "../worlds/wrap";

export interface WindSample {
  force: THREE.Vector3;
  speed: number;
}

export interface GustZone {
  position: THREE.Vector3;
  radius: number;
  force: THREE.Vector3;
}

export interface Updraft {
  position: THREE.Vector3;
  radius: number;
  strength: number;
}

export interface WakeSource {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  strength: number;
}

export interface WindConfig {
  base: THREE.Vector3;
  swirl: number;
  turbulence: number;
  gustZones: GustZone[];
  updrafts: Updraft[];
  /** Vertical clamp — XZ wraps forever on the globe tile. */
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
}

export class WindSystem {
  config: WindConfig;
  wakes: WakeSource[] = [];
  private time = 0;
  private _tmp = new THREE.Vector3();
  private _force = new THREE.Vector3();

  constructor(config: WindConfig) {
    this.config = config;
  }

  setConfig(config: WindConfig): void {
    this.config = config;
    this.wakes = [];
  }

  update(dt: number): void {
    this.time += dt;
  }

  sample(position: THREE.Vector3): WindSample {
    const { base, swirl, turbulence, gustZones, updrafts } = this.config;
    const t = this.time;

    this._force.copy(base);

    const swirlX = Math.sin(position.x * 0.15 + t * 0.7) * Math.cos(position.z * 0.12 + t * 0.5);
    const swirlZ = Math.cos(position.x * 0.1 + t * 0.6) * Math.sin(position.z * 0.14 + t * 0.55);
    this._force.x += swirlX * swirl;
    this._force.z += swirlZ * swirl;
    this._force.y += Math.sin(t * 0.4 + position.x * 0.08) * swirl * 0.15;

    if (position.y > 35) {
      const cloud = Math.min(1, (position.y - 35) / 50);
      this._force.y += cloud * 1.2;
      this._force.x += Math.sin(t * 0.15) * cloud * 1.5;
      this._force.z += Math.cos(t * 0.12) * cloud * 1.2;
    }

    this._force.x += (noise3(position.x, t, position.z) - 0.5) * turbulence;
    this._force.y += (noise3(t, position.y, position.x) - 0.5) * turbulence * 0.4;
    this._force.z += (noise3(position.z, position.x, t) - 0.5) * turbulence;

    for (const g of gustZones) {
      const d = wrapDist(position.x, position.z, g.position.x, g.position.z);
      if (d < g.radius) {
        const w = 1 - d / g.radius;
        this._force.addScaledVector(g.force, w * w);
      }
    }

    for (const u of updrafts) {
      const d = wrapDist(position.x, position.z, u.position.x, u.position.z);
      if (d < u.radius) {
        const w = 1 - d / u.radius;
        this._force.y += u.strength * w * w;
      }
    }

    for (const wake of this.wakes) {
      const dx = wrapDelta(position.x, wake.position.x);
      const dz = wrapDelta(position.z, wake.position.z);
      this._tmp.set(dx, position.y - wake.position.y, dz);
      const behind = this._tmp.dot(wake.velocity);
      if (behind < 0 && behind > -12) {
        const lateral = this._tmp
          .clone()
          .sub(wake.velocity.clone().normalize().multiplyScalar(behind))
          .length();
        if (lateral < 4) {
          const w = (1 + behind / 12) * (1 - lateral / 4);
          this._force.addScaledVector(wake.velocity, wake.strength * w * 0.15);
          this._force.y += wake.strength * w * 0.3;
        }
      }
    }

    return { force: this._force.clone(), speed: this._force.length() };
  }
}

function noise3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 1.7 + y * 2.3 + z * 1.1) * 43758.5453;
  return n - Math.floor(n);
}
