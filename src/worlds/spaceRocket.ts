import * as THREE from "three";
import { ALT } from "./altitude";

/**
 * Classic upright toy rocket — "BEZOS WAS HERE", money + yellow bottles.
 */
export class SpaceRocket {
  readonly group = new THREE.Group();
  private rocket = new THREE.Group();
  private bills: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private billSeeds: { ox: number; oy: number; oz: number; phase: number; spin: number }[] = [];
  private bottleSeeds: { ox: number; oy: number; oz: number; phase: number; spin: number }[] = [];
  private dummy = new THREE.Object3D();
  /** Landmark ahead in the distance */
  private offset = new THREE.Vector3(0, 2, -45);

  constructor() {
    this.buildRocket();
    this.bills = this.buildDebris(90, 0x40c060, 0.9, 0.42);
    this.bottles = this.buildBottles(36);
    this.group.add(this.rocket, this.bills, this.bottles);
    this.rocket.scale.setScalar(2.6);
  }

  private buildRocket(): void {
    const white = new THREE.MeshLambertMaterial({
      color: 0xf4f0e8,
      flatShading: true,
      emissive: 0x333328,
      emissiveIntensity: 0.35,
    });
    const red = new THREE.MeshLambertMaterial({
      color: 0xe03030,
      flatShading: true,
      emissive: 0x501010,
      emissiveIntensity: 0.4,
    });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30, flatShading: true });
    const metal = new THREE.MeshLambertMaterial({
      color: 0x9098a8,
      flatShading: true,
      emissive: 0x303040,
      emissiveIntensity: 0.25,
    });

    // Upright classic rocket (Y-up)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 12, 10), white);
    body.position.y = 2;
    this.rocket.add(body);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 1.2, 10), red);
    stripe.position.y = 2;
    this.rocket.add(stripe);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 10), red);
    nose.position.y = 9.6;
    this.rocket.add(nose);

    // Fins
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 2.4), red);
      fin.position.set(Math.cos(ang) * 1.7, -2.2, Math.sin(ang) * 1.7);
      fin.rotation.y = ang;
      fin.rotation.z = 0.15;
      this.rocket.add(fin);
    }

    // Engine bell
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 2.2, 10), dark);
    bell.position.y = -5.2;
    this.rocket.add(bell);

    // Exhaust glow
    const glow = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.55 }),
    );
    glow.position.y = -7.2;
    glow.rotation.x = Math.PI;
    this.rocket.add(glow);

    // Windows
    for (const yy of [4.5, 6.2]) {
      const w = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 8),
        new THREE.MeshLambertMaterial({
          color: 0x80d0ff,
          emissive: 0x4080c0,
          emissiveIntensity: 0.55,
        }),
      );
      w.position.set(0, yy, 1.95);
      this.rocket.add(w);
    }

    // "BEZOS WAS HERE" on the side
    const label = makeRocketLabel();
    label.position.set(1.95, 3.2, 0);
    label.rotation.y = Math.PI / 2;
    this.rocket.add(label);

    // Broken strut for "abandoned" vibe
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), metal);
    strut.position.set(-2.2, 0, 1.2);
    strut.rotation.z = 0.55;
    this.rocket.add(strut);
  }

  private buildDebris(
    count: number,
    color: number,
    w: number,
    h: number,
  ): THREE.InstancedMesh {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.billSeeds.push({
        ox: (Math.random() - 0.5) * 10,
        oy: -2 - Math.random() * 22,
        oz: (Math.random() - 0.5) * 10,
        phase: Math.random() * Math.PI * 2,
        spin: 1 + Math.random() * 3,
      });
    }
    return mesh;
  }

  private buildBottles(count: number): THREE.InstancedMesh {
    const geo = new THREE.CylinderGeometry(0.18, 0.22, 0.7, 6);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffe040,
      flatShading: true,
      emissive: 0xa08010,
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.bottleSeeds.push({
        ox: (Math.random() - 0.5) * 12,
        oy: -1 - Math.random() * 20,
        oz: (Math.random() - 0.5) * 12,
        phase: Math.random() * Math.PI * 2,
        spin: 0.8 + Math.random() * 2,
      });
    }
    return mesh;
  }

  update(dt: number, time: number, bagPos: THREE.Vector3, spaceAmt: number): void {
    this.rocket.visible = spaceAmt > 0.08;
    this.bills.visible = spaceAmt > 0.08;
    this.bottles.visible = spaceAmt > 0.08;
    if (spaceAmt < 0.08) return;

    const rx = bagPos.x + this.offset.x;
    const ry = Math.max(bagPos.y + this.offset.y, ALT.SPACE_LO + 10) + Math.sin(time * 0.35) * 1.2;
    const rz = bagPos.z + this.offset.z;

    this.rocket.position.set(rx, ry, rz);
    this.rocket.rotation.y = time * 0.08;
    this.rocket.rotation.z = 0.12 + Math.sin(time * 0.25) * 0.05;
    this.rocket.rotation.x = 0.08 + Math.sin(time * 0.18) * 0.04;

    this.updateInstances(this.bills, this.billSeeds, rx, ry, rz, time, dt, 1.6, -24, 1.15);
    this.updateInstances(this.bottles, this.bottleSeeds, rx, ry, rz, time, dt, 1.2, -22, 1.0);
  }

  private updateInstances(
    mesh: THREE.InstancedMesh,
    seeds: { ox: number; oy: number; oz: number; phase: number; spin: number }[],
    rx: number,
    ry: number,
    rz: number,
    time: number,
    dt: number,
    fall: number,
    resetY: number,
    scale: number,
  ): void {
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]!;
      s.oy -= dt * (fall + (s.phase % 1));
      s.ox += Math.sin(time + s.phase) * dt * 0.9;
      if (s.oy < resetY) {
        s.oy = -0.5 - Math.random() * 2;
        s.ox = (Math.random() - 0.5) * 4;
        s.oz = (Math.random() - 0.5) * 4;
      }
      this.dummy.position.set(
        rx + s.ox + Math.sin(time * 0.8 + s.phase) * 1.4,
        ry + s.oy - 4,
        rz + s.oz + 1.2,
      );
      this.dummy.rotation.set(time * s.spin, time * s.spin * 0.7, s.phase);
      this.dummy.scale.setScalar(scale + Math.sin(time + s.phase) * 0.08);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function makeRocketLabel(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f0e8";
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = "#1a1a20";
  ctx.font = 'bold 48px "Arial Black", Impact, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BEZOS WAS HERE", 256, 80);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 1.7),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
}
