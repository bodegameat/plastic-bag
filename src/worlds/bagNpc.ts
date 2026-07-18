import * as THREE from "three";

/** Classic takeout-bag smiley — yellow ink. */
export function makeSmileTexture(): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, s, s);

  ctx.strokeStyle = "rgba(240,180,20,0.2)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, 90, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#f0c020";
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.4, 14, 0, Math.PI * 2);
  ctx.arc(s * 0.65, s * 0.4, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f0c020";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.48, 48, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const smileShared = { tex: null as THREE.CanvasTexture | null };

function smileMap(): THREE.CanvasTexture {
  if (!smileShared.tex) smileShared.tex = makeSmileTexture();
  return smileShared.tex;
}

/**
 * Soft takeout bag — pinched top, rounder belly. Bottom at y≈0.
 */
export function makeTakeoutBagGeometry(depth = 0.48): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Wider belly, pinched shoulders
  shape.moveTo(-0.42, 0);
  shape.quadraticCurveTo(-0.52, 0.15, -0.5, 0.45);
  shape.quadraticCurveTo(-0.48, 0.85, -0.36, 1.05);
  shape.lineTo(-0.28, 1.12);
  shape.lineTo(0.28, 1.12);
  shape.lineTo(0.36, 1.05);
  shape.quadraticCurveTo(0.48, 0.85, 0.5, 0.45);
  shape.quadraticCurveTo(0.52, 0.15, 0.42, 0);
  shape.lineTo(-0.42, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Default NPC lift — mesh bottom is at y=0 */
export const BAG_GROUND_CLEAR = 0.08;

const BAG_COLORS = [0xf2efe6, 0xfff8e8, 0xe8e0d0, 0xffe0e8, 0xe0f0ff, 0xf0ffe0, 0xfff0d0];

/**
 * Toy plastic-bag NPC — bob/lean via userData.bagBob.
 */
export function makeBagNpc(
  opts: {
    color?: number;
    scale?: number;
    smile?: boolean;
    sash?: string;
  } = {},
): THREE.Group {
  const g = new THREE.Group();
  const scale = opts.scale ?? 1;
  const color = opts.color ?? BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)]!;

  const bodyMat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(makeTakeoutBagGeometry(0.32), bodyMat);
  body.castShadow = true;
  g.add(body);

  const handleMat = new THREE.MeshLambertMaterial({
    color: 0xd0c8b8,
    flatShading: true,
    transparent: true,
    opacity: 0.9,
  });
  for (const x of [-0.16, 0.16]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - 0.07, 1.0, 0.02),
      new THREE.Vector3(x - 0.07, 1.28, 0.02),
      new THREE.Vector3(x, 1.4, 0.02),
      new THREE.Vector3(x + 0.07, 1.28, 0.02),
      new THREE.Vector3(x + 0.07, 1.0, 0.02),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.016, 5, false), handleMat));
  }

  if (opts.smile !== false) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({
        map: smileMap(),
        transparent: true,
        depthWrite: false,
      }),
    );
    face.position.set(0, 0.55, 0.18);
    g.add(face);
  }

  if (opts.sash) {
    const sash = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.11, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xff4060, flatShading: true }),
    );
    sash.position.set(0, 0.4, 0.2);
    sash.rotation.z = -0.25;
    g.add(sash);
  }

  g.scale.setScalar(scale);
  g.userData.bagBob = {
    phase: Math.random() * Math.PI * 2,
    speed: 1.4 + Math.random() * 1.2,
    amp: 0.06 + Math.random() * 0.08,
    lean: 0.05 + Math.random() * 0.06,
    baseY: 0,
  };
  return g;
}

export function finalizeBagNpc(bag: THREE.Group, pin = false): void {
  const bob = bag.userData.bagBob as { baseY: number } | undefined;
  if (bob) bob.baseY = bag.position.y;
  if (pin) {
    bag.userData.physicsPin = true;
    return;
  }
  const s = bag.scale.x || 1;
  bag.userData.toyPhysics = { kind: "bag" as const, radius: 0.38 * s };
}

export function updateBagNpcs(root: THREE.Object3D, time: number): void {
  root.traverse((o) => {
    if (o.userData.physicsBody) return;
    const bob = o.userData.bagBob as
      | { phase: number; speed: number; amp: number; lean: number; baseY: number }
      | undefined;
    if (!bob) return;
    o.position.y = bob.baseY + Math.sin(time * bob.speed + bob.phase) * bob.amp;
    o.rotation.z = Math.sin(time * bob.speed * 0.65 + bob.phase) * bob.lean;
    o.rotation.x = Math.sin(time * bob.speed * 0.4 + bob.phase) * bob.lean * 0.5;
  });
}

export { BAG_COLORS };
