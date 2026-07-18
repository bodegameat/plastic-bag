import * as THREE from "three";

/**
 * Soft wake ribbon behind the player bag — speed read without HUD chrome.
 */
export class BagTrail {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private ages: Float32Array;
  private count: number;
  private head = 0;
  private spawnAcc = 0;
  private _tmp = new THREE.Color();

  constructor(count = 48) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.ages = new Float32Array(count);
    this.ages.fill(1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("age", new THREE.BufferAttribute(this.ages, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.45,
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, pos: THREE.Vector3, speed: number): void {
    const spawnRate = THREE.MathUtils.clamp(speed * 0.35, 0, 28);
    this.spawnAcc += spawnRate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const i = this.head % this.count;
      this.head++;
      this.positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.25;
      this.positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.35;
      this.positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.25;
      this.ages[i] = 0;
    }

    for (let i = 0; i < this.count; i++) {
      this.ages[i] = Math.min(1, this.ages[i] + dt * 1.35);
      // drift slightly upward/back
      this.positions[i * 3 + 1]! += dt * 0.4;
    }

    const posAttr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const ageAttr = this.points.geometry.attributes.age as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    ageAttr.needsUpdate = true;

    const mat = this.points.material as THREE.PointsMaterial;
    const glow = THREE.MathUtils.clamp(speed / 18, 0.15, 1);
    mat.opacity = 0.25 + glow * 0.5;
    mat.size = 0.28 + glow * 0.35;
    this._tmp.setHSL(0.12, 0.55, 0.65 + glow * 0.15);
    mat.color.copy(this._tmp);
  }
}
