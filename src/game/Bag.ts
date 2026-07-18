import * as THREE from "three";
import { ALT } from "../worlds/altitude";
import { makeSmileTexture } from "../worlds/bagNpc";
import type { Input } from "./Input";

const RISE_SPEED = 7.2;
const DROP_SPEED = 11;
const HOVER_DAMP = 2.8;
const MAX_ALTITUDE = ALT.MAX;

/**
 * Open-film shopping bag — front + back sheets (hollow), calm billow, U-tube handles.
 */
export class Bag {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  fill = 0.55;
  snagged = false;
  windSpeed = 0;

  private mesh!: THREE.Mesh;
  private backMesh!: THREE.Mesh;
  private handles!: THREE.Group;
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
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial;
    if (q === "mobile") {
      mat.transmission = 0;
      mat.thickness = 0;
      mat.clearcoat = 0.15;
      mat.opacity = 0.82;
      mat.depthWrite = true;
      const back = this.backMesh.material as THREE.MeshPhysicalMaterial;
      back.transmission = 0;
      back.opacity = 0.28;
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

    const sail = 0.72 + this.fill * 0.55;
    const turnSnap = 5.5 + (1 - this.fill) * 6;
    const moveSpeed = 19 * gear * sail;

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
      const coastDrag = y > ALT.SPACE_LO ? 0.28 : y > 70 ? 0.7 : 1.35;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, coastDrag, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, coastDrag, dt);
      if (this.velocity.lengthSq() < 0.4) {
        this.velocity.x += Math.sin(this.time * 1.3 + this.idlePhase) * 0.45 * dt;
        this.velocity.z += Math.cos(this.time * 1.1 + this.idlePhase) * 0.45 * dt;
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
    const segs = 14;
    const geo = new THREE.PlaneGeometry(1.15, 1.5, segs, Math.round(segs * 1.3));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.basePositions = new Float32Array(pos.array.length);
    this.basePositions.set(pos.array as Float32Array);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const edge = Math.abs(x) / 0.575;
      const curl = edge * edge * 0.38;
      const wrinkle = Math.sin(x * 16 + y * 10) * 0.01 + Math.sin(y * 22) * 0.006;
      pos.setZ(i, curl + wrinkle);
      if (y > 0.55) {
        pos.setX(i, x * 0.55);
        pos.setY(i, y + 0.08);
        pos.setZ(i, 0.03 + wrinkle);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xece8de,
      transparent: true,
      opacity: 0.78,
      roughness: 0.24,
      metalness: 0,
      transmission: 0.5,
      thickness: 0.32,
      ior: 1.45,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    this.backMesh = this.mesh.clone();
    this.backMesh.position.z = -0.08;
    this.backMesh.scale.setScalar(0.97);
    const backMat = (this.backMesh.material as THREE.MeshPhysicalMaterial).clone();
    backMat.opacity = 0.32;
    backMat.transmission = 0.28;
    this.backMesh.material = backMat;
    this.group.add(this.backMesh);

    this.handles = new THREE.Group();
    const handleMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8d4c8,
      roughness: 0.35,
      clearcoat: 0.4,
      transparent: true,
      opacity: 0.88,
    });
    for (const x of [-0.19, 0.19]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x - 0.09, 0.55, 0.04),
        new THREE.Vector3(x - 0.09, 0.88, 0.04),
        new THREE.Vector3(x, 1.02, 0.04),
        new THREE.Vector3(x + 0.09, 0.88, 0.04),
        new THREE.Vector3(x + 0.09, 0.55, 0.04),
      ]);
      this.handles.add(
        new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.02, 5, false), handleMat),
      );
    }
    this.group.add(this.handles);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({
        map: makeSmileTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.94,
      }),
    );
    face.position.set(0, 0.05, 0.1);
    this.group.add(face);
  }

  private animateVisual(dt: number): void {
    const puffed = this.fill;
    const crumpled = 1 - this.fill;
    const t = this.time;
    const speed = this.windSpeed;

    // Calm scale — breeze, not melting
    const sx = 0.88 + puffed * 0.28;
    const sy = 0.82 + puffed * 0.28;
    const sz = 0.7 + puffed * 0.4;
    this.mesh.scale.set(sx, sy, sz);
    this.backMesh.scale.set(sx * 0.97, sy * 0.97, sz * 0.97);
    this.handles.scale.setScalar(0.95 + puffed * 0.06);
    this.handles.position.y = crumpled * -0.04;

    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.basePositions[i * 3]!;
      const by = this.basePositions[i * 3 + 1]!;
      const bz = this.basePositions[i * 3 + 2]!;
      const edge = Math.min(1, Math.abs(bx) / 0.575);
      const top = Math.max(0, (by - 0.4) / 0.45);

      const billow =
        Math.sin(t * (1.6 + speed * 0.08) + by * 3.5 + bx * 2) *
        (0.022 + puffed * 0.035 + crumpled * 0.03);
      const flutter =
        Math.sin(t * 3.2 + i * 0.25) * crumpled * 0.035 +
        Math.cos(t * 2.2 + bx * 5) * puffed * 0.018;
      const windRipple = Math.sin(t * 2.1 + by * 4 + speed * 0.3) * speed * 0.0025;
      const wrinkle =
        Math.sin(bx * 10 + by * 7 + t * 1.1) * (0.008 + crumpled * 0.014) +
        Math.cos(by * 11 - t * 0.8) * 0.006;
      const flap = top * top * Math.sin(t * 4 + bx * 8) * 0.03 * (0.35 + crumpled);

      pos.setXYZ(
        i,
        bx + flutter * 0.25 * (0.35 + edge) + wrinkle * 0.25,
        by + billow * 0.3 + windRipple * 0.3 + flap * 0.2,
        bz * (0.85 + puffed * 0.25) + billow * 0.55 + flutter * 0.5 + wrinkle * 0.4 + flap * 0.5,
      );
    }
    pos.needsUpdate = true;

    this.normalFrame++;
    if (this.normalFrame % (this.quality === "mobile" ? 6 : 3) === 0) {
      this.mesh.geometry.computeVertexNormals();
    }

    this.tumble.x += this.velocity.z * dt * 0.08 * crumpled;
    this.tumble.z -= this.velocity.x * dt * 0.08 * crumpled;
    const bank = 0.08 + puffed * 0.035;
    const targetX =
      THREE.MathUtils.clamp(this.velocity.z * bank, -0.45, 0.45) +
      this.tumble.x * crumpled +
      Math.sin(t * 0.8) * 0.035 * puffed;
    const targetZ =
      THREE.MathUtils.clamp(-this.velocity.x * bank, -0.45, 0.45) + this.tumble.z * crumpled;
    const targetY = Math.sin(t * 0.6) * 0.08 * puffed;

    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, targetX, 3, dt);
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, targetZ, 3, dt);
    this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, targetY, 2.2, dt);
    this.tumble.multiplyScalar(1 - dt * 0.85);

    const mat = this.mesh.material as THREE.MeshPhysicalMaterial;
    mat.opacity = 0.58 + puffed * 0.25;
    if (this.quality === "desktop") mat.transmission = 0.3 + puffed * 0.28;
  }
}
