import * as THREE from "three";

/** Camera-following starfield for space band. */
export class Starfield {
  readonly points: THREE.Points;
  private planet: THREE.Mesh;

  constructor(count = 900) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Hemisphere / sphere shell around origin (moved with camera)
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 80 + Math.random() * 200;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      c.setHSL(0.55 + Math.random() * 0.15, 0.3, 0.7 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    // Faint distant planet glow
    const pGeo = new THREE.SphereGeometry(18, 16, 12);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0x4060a0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.planet = new THREE.Mesh(pGeo, pMat);
    this.planet.position.set(-90, -20, -140);
    this.points.add(this.planet);
  }

  update(camPos: THREE.Vector3, spaceAmt: number): void {
    this.points.position.copy(camPos);
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, (spaceAmt - 0.08) * 1.2);
    const pMat = this.planet.material as THREE.MeshBasicMaterial;
    pMat.opacity = Math.max(0, (spaceAmt - 0.15) * 0.35);
    this.points.visible = spaceAmt > 0.05;
  }
}
