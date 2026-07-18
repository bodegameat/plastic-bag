import * as THREE from "three";
import { ALT } from "./altitude";
import { wrapDelta } from "./wrap";

interface Burst {
  sparks: THREE.Points;
  trails: THREE.LineSegments;
  ring: THREE.Mesh;
  vel: Float32Array;
  age: number;
  life: number;
  origin: THREE.Vector3;
}

/**
 * Neon colorama fireworks — dense, additive, spawn ahead of the bag.
 */
export class FireworkSky {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private cooldown = 0;
  private flash = 0;
  readonly flashLight: THREE.PointLight;
  private colors = [
    0xff1490, 0xffe020, 0x20f8ff, 0xff40ff, 0x40ff60, 0xffffff, 0xff6020, 0x8060ff, 0xff80c0,
    0x00ffe0,
  ];
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();

  constructor() {
    this.flashLight = new THREE.PointLight(0xff80c0, 0, 120, 2);
    this.group.add(this.flashLight);
  }

  update(
    dt: number,
    time: number,
    bagPos: THREE.Vector3,
    intensity: number,
    camForward?: THREE.Vector3,
  ): void {
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.flashLight.intensity = this.flash * 18;
    this.flashLight.position.copy(bagPos);
    this.flashLight.position.y += 6;

    if (intensity > 0.1 && this.cooldown <= 0) {
      // Multi-burst waves for denser colorama
      const n = 1 + Math.floor(intensity * 2.5);
      for (let i = 0; i < n; i++) this.spawnNear(bagPos, intensity, camForward);
      this.cooldown = 0.18 + Math.random() * 0.35 * (1.2 - intensity);
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.age += dt;
      const t = b.age / b.life;
      const fade = Math.max(0, 1 - t);

      const sparkMat = b.sparks.material as THREE.PointsMaterial;
      sparkMat.opacity = fade;
      sparkMat.size = 2.4 * (1 - t * 0.35);

      const ringMat = b.ring.material as THREE.MeshBasicMaterial;
      const rs = 1 + t * 18;
      b.ring.scale.setScalar(rs);
      ringMat.opacity = fade * 0.75;

      const pos = b.sparks.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const trailArr = (b.trails.geometry.attributes.position as THREE.BufferAttribute)
        .array as Float32Array;

      for (let p = 0; p < b.vel.length / 3; p++) {
        const o = p * 3;
        trailArr[p * 6] = arr[o]!;
        trailArr[p * 6 + 1] = arr[o + 1]!;
        trailArr[p * 6 + 2] = arr[o + 2]!;

        arr[o]! += b.vel[o]! * dt;
        arr[o + 1]! += b.vel[o + 1]! * dt;
        arr[o + 2]! += b.vel[o + 2]! * dt;
        b.vel[o + 1]! -= 12 * dt;

        trailArr[p * 6 + 3] = arr[o]!;
        trailArr[p * 6 + 4] = arr[o + 1]!;
        trailArr[p * 6 + 5] = arr[o + 2]!;
      }
      pos.needsUpdate = true;
      (b.trails.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const trailMat = b.trails.material as THREE.LineBasicMaterial;
      trailMat.opacity = fade * 0.85;

      const dx = wrapDelta(b.origin.x, bagPos.x);
      const dz = wrapDelta(b.origin.z, bagPos.z);
      const wx = bagPos.x + dx;
      const wz = bagPos.z + dz;
      b.sparks.position.set(wx, b.origin.y, wz);
      b.trails.position.copy(b.sparks.position);
      b.ring.position.copy(b.sparks.position);

      if (b.age >= b.life) {
        this.group.remove(b.sparks, b.trails, b.ring);
        b.sparks.geometry.dispose();
        (b.sparks.material as THREE.Material).dispose();
        b.trails.geometry.dispose();
        (b.trails.material as THREE.Material).dispose();
        b.ring.geometry.dispose();
        (b.ring.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    void time;
  }

  private spawnNear(bag: THREE.Vector3, intensity: number, camForward?: THREE.Vector3): void {
    const count = 110 + Math.floor(intensity * 60);
    const positions = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const trailPos = new Float32Array(count * 6);

    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const speed = 10 + Math.random() * 22;
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * speed;
      vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * speed;
      vel[i * 3 + 2] = Math.cos(ph) * speed;
      positions[i * 3] = vel[i * 3]! * 0.02;
      positions[i * 3 + 1] = vel[i * 3 + 1]! * 0.02;
      positions[i * 3 + 2] = vel[i * 3 + 2]! * 0.02;
    }

    const color = this.colors[Math.floor(Math.random() * this.colors.length)]!;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color,
      size: 2.6,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trails = new THREE.LineSegments(trailGeo, trailMat);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI / 2;

    // Prefer ahead of camera / flight direction so bursts read in front
    let ox: number;
    let oz: number;
    let oy: number;
    if (camForward) {
      this._fwd.copy(camForward);
      this._fwd.y = 0;
      if (this._fwd.lengthSq() < 0.01) this._fwd.set(0, 0, -1);
      this._fwd.normalize();
      this._right.set(this._fwd.z, 0, -this._fwd.x);
      const ahead = 12 + Math.random() * 38;
      const side = (Math.random() - 0.5) * 36;
      ox = bag.x + this._fwd.x * ahead + this._right.x * side;
      oz = bag.z + this._fwd.z * ahead + this._right.z * side;
      // Mix: some at eye level, some above — so you're "in" them and see them ahead
      oy = bag.y + (Math.random() - 0.25) * 28 + 4;
      oy = THREE.MathUtils.clamp(oy, ALT.FIREWORK_LO + 4, ALT.FIREWORK_HI + 8);
    } else {
      ox = bag.x + (Math.random() - 0.5) * 50;
      oz = bag.z + (Math.random() - 0.5) * 50;
      oy = ALT.FIREWORK_LO + 8 + Math.random() * (ALT.FIREWORK_HI - ALT.FIREWORK_LO - 20);
    }

    sparks.position.set(ox, oy, oz);
    trails.position.copy(sparks.position);
    ring.position.copy(sparks.position);

    this.group.add(sparks, trails, ring);
    this.bursts.push({
      sparks,
      trails,
      ring,
      vel,
      age: 0,
      life: 1.5 + Math.random() * 0.7,
      origin: new THREE.Vector3(ox, oy, oz),
    });

    this.flash = Math.min(1, this.flash + 0.55);
    this.flashLight.color.setHex(color);
  }
}
