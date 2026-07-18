import * as THREE from "three";
import { ALT } from "../worlds/altitude";
import { makeSmileTexture, makeTakeoutBagGeometry } from "../worlds/bagNpc";
import type { Input } from "./Input";

const RISE_SPEED = 4.5;
const DROP_SPEED = 7.5;
const HOVER_DAMP = 2.2;
const MAX_ALTITUDE = ALT.MAX;

/**
 * Single-mesh takeout bag — punched handle cutouts, yellow smiley, billow deform.
 */
export class Bag {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  fill = 0.55;
  snagged = false;
  windSpeed = 0;

  private body!: THREE.Mesh;
  private basePositions!: Float32Array;
  private time = 0;
  private tumble = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _nudge = new THREE.Vector3();
  private _coast = new THREE.Vector3();
  private quality: "mobile" | "desktop" = "desktop";
  private normalFrame = 0;
  private groundY = 0.5;
  private idlePhase = Math.random() * Math.PI * 2;

  constructor() {
    this.buildMesh();
    this.group.position.set(0, 8, 16);
  }

  setQuality(q: "mobile" | "desktop"): void {
    this.quality = q;
    const mat = this.body.material as THREE.MeshPhysicalMaterial;
    if (q === "mobile") {
      mat.transmission = 0;
      mat.thickness = 0;
      mat.clearcoat = 0.15;
      mat.opacity = 0.82;
      mat.depthWrite = true;
    }
  }

  setGroundY(y: number): void {
    this.groundY = y;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get altitudeNorm(): number {
    return Math.max(0, Math.min(1, (this.group.position.y - this.groundY) / (MAX_ALTITUDE - 1)));
  }

  get altitudeY(): number {
    return this.group.position.y;
  }

  addImpulse(ix: number, iy: number, iz: number): void {
    this.velocity.x += ix;
    this.velocity.y += iy;
    this.velocity.z += iz;
  }

  update(dt: number, input: Input, camForward: THREE.Vector3): void {
    this.time += dt;
    input.beginFrame();

    if (input.fill && !input.crumple) {
      this.fill = Math.min(1, this.fill + 0.7 * dt);
    } else if (input.crumple) {
      this.fill = Math.max(0.12, this.fill - 1.1 * dt);
    } else {
      this.fill += (0.55 - this.fill) * 0.2 * dt;
    }

    this._forward.set(camForward.x, 0, camForward.z);
    if (this._forward.lengthSq() < 1e-6) this._forward.set(0, 0, -1);
    else this._forward.normalize();
    this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Altitude gearing: zippy ground → floaty clouds → space coast
    const y = this.group.position.y;
    let gear = 1;
    let drag = 6;
    if (y > ALT.SPACE_LO) {
      gear = 0.75;
      drag = 1.6;
    } else if (y > 70) {
      gear = 0.85;
      drag = 3.2;
    } else if (y > 40) {
      gear = 0.92;
      drag = 4.5;
    }

    // Fill = sail: puffed glides farther / faster; crumpled turns snappier + slower
    const sail = 0.65 + this.fill * 0.55;
    const turnSnap = 4 + (1 - this.fill) * 5;
    const moveSpeed = 11 * gear * sail;

    const nx = input.stickX;
    const ny = input.stickY;
    const steering = Math.hypot(nx, ny) > 0.08;

    if (steering) {
      const target = this._nudge.set(0, 0, 0);
      target.addScaledVector(this._right, nx).addScaledVector(this._forward, ny);
      const len = target.length() || 1;
      target.multiplyScalar(moveSpeed / len);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, target.x, turnSnap, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, target.z, turnSnap, dt);
      this._coast.copy(this.velocity);
    } else {
      const coastDrag = y > ALT.SPACE_LO ? 0.35 : y > 70 ? 0.9 : 1.8;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, coastDrag, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, coastDrag, dt);
      if (this.velocity.lengthSq() < 0.4) {
        this.velocity.x += Math.sin(this.time * 1.3 + this.idlePhase) * 0.35 * dt;
        this.velocity.z += Math.cos(this.time * 1.1 + this.idlePhase) * 0.35 * dt;
      }
      void drag;
    }

    let vyTarget = 0;
    if (input.fill && !input.crumple) {
      vyTarget = RISE_SPEED * (0.85 + this.fill * 0.25);
    } else if (input.crumple) {
      vyTarget = -DROP_SPEED * (1.15 - this.fill * 0.35);
    } else if (y > 70) {
      vyTarget = -0.1;
    } else {
      const hover = this.groundY + 7;
      vyTarget = THREE.MathUtils.clamp((hover - y) * 0.08, -1.2, 1.2);
    }
    this.velocity.y = THREE.MathUtils.damp(this.velocity.y, vyTarget, HOVER_DAMP, dt);

    if (y > MAX_ALTITUDE - 20 && this.velocity.y > 0) {
      this.velocity.y *= 0.9;
    }

    this.group.position.addScaledVector(this.velocity, dt);
    const minY = this.groundY + 0.6;
    this.group.position.y = THREE.MathUtils.clamp(this.group.position.y, minY, MAX_ALTITUDE);
    if (this.group.position.y <= minY + 0.05) {
      this.velocity.y = Math.max(0, this.velocity.y);
      this.group.position.y = minY;
    }

    this.windSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.animateVisual(dt);
  }

  private buildMesh(): void {
    const geo = makeTakeoutBagGeometry(0.52);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const yn = Math.max(0, Math.min(1, y / 1.6));
      const pinch = 1 - Math.max(0, yn - 0.55) * 0.12;
      const belly = 1 + Math.sin(yn * Math.PI) * 0.1;
      const wrinkle = Math.sin(x * 14 + y * 9) * 0.012 + Math.cos(z * 11 + y * 7) * 0.01;
      pos.setXYZ(i, x * pinch * belly + wrinkle, y, z * belly + wrinkle * 0.5);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    this.basePositions = new Float32Array(pos.array.length);
    this.basePositions.set(pos.array as Float32Array);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf2efe6,
      transparent: true,
      opacity: 0.72,
      roughness: 0.28,
      metalness: 0,
      transmission: 0.55,
      thickness: 0.4,
      ior: 1.4,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.body = new THREE.Mesh(geo, mat);
    this.body.castShadow = true;
    this.group.add(this.body);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({
        map: makeSmileTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.92,
      }),
    );
    face.position.set(0, 0.55, 0.28);
    this.body.add(face);
  }

  private animateVisual(dt: number): void {
    const puffed = this.fill;
    const crumpled = 1 - this.fill;
    const t = this.time;
    const speed = this.windSpeed;

    this.body.scale.set(0.85 + puffed * 0.35, 0.78 + puffed * 0.4, 0.75 + puffed * 0.45);

    const pos = this.body.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.basePositions[i * 3]!;
      const by = this.basePositions[i * 3 + 1]!;
      const bz = this.basePositions[i * 3 + 2]!;
      const yn = Math.max(0, Math.min(1, by / 1.6));
      const handleZone = yn > 0.72 ? 0.35 : 1;
      const belly = 1 + Math.sin(yn * Math.PI) * 0.14 * puffed;
      const billow =
        Math.sin(t * (2.4 + speed * 0.15) + by * 5 + bx * 3) *
        (0.028 + puffed * 0.05 + crumpled * 0.04) *
        handleZone;
      const flutter =
        (Math.sin(t * 5.5 + i * 0.35) * crumpled * 0.05 +
          Math.cos(t * 3.8 + bx * 8) * puffed * 0.025) *
        handleZone;
      const windRipple = Math.sin(t * 3 + by * 6 + speed) * speed * 0.003 * handleZone;
      const wrinkle =
        (Math.sin(bx * 14 + by * 9 + t * 1.2) * 0.015 * (0.5 + crumpled) +
          Math.cos(bz * 11 + by * 7 - t) * 0.012) *
        handleZone;
      pos.setXYZ(
        i,
        bx * belly + flutter * 0.35 + wrinkle,
        by + billow * 0.35 + windRipple,
        bz * belly + billow + flutter + wrinkle * 0.5,
      );
    }
    pos.needsUpdate = true;

    this.normalFrame++;
    if (this.normalFrame % (this.quality === "mobile" ? 6 : 2) === 0) {
      this.body.geometry.computeVertexNormals();
    }

    this.tumble.x += this.velocity.z * dt * 0.1 * crumpled;
    this.tumble.z -= this.velocity.x * dt * 0.1 * crumpled;
    const bank = 0.08 + puffed * 0.04;
    const targetX =
      THREE.MathUtils.clamp(this.velocity.z * bank, -0.55, 0.55) +
      this.tumble.x * crumpled +
      Math.sin(t * 0.9) * 0.04;
    const targetZ =
      THREE.MathUtils.clamp(-this.velocity.x * bank, -0.55, 0.55) + this.tumble.z * crumpled;
    const targetY = Math.sin(t * 0.7) * 0.1 * puffed;

    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, targetX, 3, dt);
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, targetZ, 3, dt);
    this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, targetY, 2, dt);
    this.tumble.multiplyScalar(1 - dt * 0.8);

    const mat = this.body.material as THREE.MeshPhysicalMaterial;
    mat.opacity = 0.55 + puffed * 0.28;
    if (this.quality === "desktop") mat.transmission = 0.35 + puffed * 0.35;
  }
}
