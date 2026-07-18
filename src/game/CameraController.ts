import * as THREE from "three";
import type { Bag } from "./Bag";

export class CameraController {
  cinematic = false;
  /** Orbit yaw around the bag (radians). */
  yaw = 0;
  private camera: THREE.PerspectiveCamera;
  private follow = new THREE.Vector3(0, 5, 10);
  private look = new THREE.Vector3();
  private cinematicAngle = 0;
  private shake = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    camera.position.set(0, 6, 12);
  }

  toggleCinematic(): void {
    this.cinematic = !this.cinematic;
  }

  bump(amount = 0.15): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** Apply spin input (-1…1) each frame. */
  applySpin(spin: number, dt: number): void {
    this.yaw += spin * 2.4 * dt;
  }

  update(dt: number, bag: Bag): void {
    this.shake = Math.max(0, this.shake - dt);
    this.cinematicAngle += dt * 0.12;

    if (this.cinematic) {
      const r = 14 + Math.sin(this.cinematicAngle * 0.5) * 3;
      const h = 3 + bag.position.y * 0.35 + Math.sin(this.cinematicAngle * 0.3) * 2;
      const ang = this.cinematicAngle + this.yaw;
      const target = new THREE.Vector3(
        bag.position.x + Math.cos(ang) * r,
        bag.position.y + h,
        bag.position.z + Math.sin(ang) * r,
      );
      this.camera.position.lerp(target, 1 - Math.exp(-1.2 * dt));
      this.look.copy(bag.position).add(new THREE.Vector3(0, 0.5, 0));
      this.look.y += 1.5;
      this.camera.lookAt(this.look);
    } else {
      const back = 11;
      const sy = Math.sin(this.yaw);
      const cy = Math.cos(this.yaw);
      const desired = new THREE.Vector3(
        bag.position.x + bag.velocity.x * 0.42 + sy * back,
        bag.position.y + 4.6 + Math.min(2.4, bag.velocity.y * 0.4),
        bag.position.z + bag.velocity.z * 0.28 + cy * back,
      );
      this.follow.lerp(desired, 1 - Math.exp(-2.4 * dt));
      this.camera.position.copy(this.follow);

      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      }

      this.look.copy(bag.position);
      this.look.y += 0.3;
      this.camera.lookAt(this.look);
    }
  }
}
