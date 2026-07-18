import * as THREE from "three";

/** Soft drifting breeze motes — lightweight Points. */
export class BreezeParticles {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private count: number;

  constructor(count = 140) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.respawn(i, true);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private respawn(i: number, initial = false): void {
    const o = i * 3;
    this.positions[o] = (Math.random() - 0.5) * 60;
    this.positions[o + 1] = 2 + Math.random() * 28;
    this.positions[o + 2] = (Math.random() - 0.5) * 60;
    this.velocities[o] = 0.6 + Math.random() * 1.4;
    this.velocities[o + 1] = (Math.random() - 0.5) * 0.25;
    this.velocities[o + 2] = -0.3 + Math.random() * 0.6;
    if (!initial) {
      this.positions[o] = 25 + Math.random() * 10;
    }
  }

  update(dt: number, bagPos: THREE.Vector3, time: number): void {
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.positions[o]! += this.velocities[o]! * dt;
      this.positions[o + 1]! +=
        this.velocities[o + 1]! * dt + Math.sin(time * 1.5 + i) * 0.01;
      this.positions[o + 2]! += this.velocities[o + 2]! * dt;

      const lx = this.positions[o]!;
      const ly = this.positions[o + 1]!;
      const lz = this.positions[o + 2]!;
      if (lx > 35 || lx < -35 || ly > 40 || ly < 0.5 || lz > 35 || lz < -35) {
        this.respawn(i);
      }
      // store as local offset; world pos set on points group
      void ly;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.points.position.copy(bagPos);
  }
}
