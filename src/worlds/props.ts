import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { terrainHeight } from "./terrain";
import type { FunKind } from "./funShows";

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>();

/** Flat files in /public/props/*.glb */
export type GlbId =
  | "airplane"
  | "apple"
  | "baguette-loaf"
  | "banana"
  | "barrel"
  | "boombox"
  | "briefcase"
  | "burger"
  | "cafe-chair"
  | "cafe-table"
  | "campfire"
  | "can"
  | "cardboard"
  | "cash"
  | "chair"
  | "conveyor"
  | "cooler"
  | "croissant"
  | "donut"
  | "easel"
  | "extinguisher"
  | "fishbones"
  | "floorlight"
  | "fries"
  | "hotdog"
  | "icecream"
  | "laptopbag"
  | "lightcube"
  | "microphone"
  | "paintkit"
  | "pipe"
  | "pizza"
  | "pizzabox"
  | "plant"
  | "poodle"
  | "rubik"
  | "rug"
  | "skateboard"
  | "soda"
  | "tea"
  | "tent"
  | "trashbin"
  | "trashcan"
  | "trophy"
  | "vending";

async function loadGlb(id: GlbId): Promise<THREE.Group> {
  const hit = cache.get(id);
  if (hit) return hit.clone(true);

  const gltf = await loader.loadAsync(`/props/${id}.glb`);
  const root = gltf.scene;
  root.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  root.scale.setScalar(1 / maxDim);
  box.setFromObject(root);
  root.position.y -= box.min.y;

  const wrap = new THREE.Group();
  wrap.add(root);
  cache.set(id, wrap);
  return wrap.clone(true);
}

/** Seat on terrain using world bbox after scale is applied. */
export function seatProp(mesh: THREE.Object3D, x: number, z: number, yOff = 0): void {
  mesh.position.set(x, 0, z);
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const ground = terrainHeight(x, z) + yOff;
  mesh.position.y += ground - box.min.y;
  mesh.updateMatrixWorld(true);
}

export async function placeGlb(
  root: THREE.Group,
  id: GlbId,
  x: number,
  z: number,
  opts: {
    scale?: number;
    yOff?: number;
    rotY?: number;
    rotX?: number;
    physics?: boolean;
    float?: boolean;
    /** Scene's one special Enter/tap gag. */
    fun?: FunKind;
  } = {},
): Promise<THREE.Group | null> {
  try {
    const mesh = await loadGlb(id);
    mesh.scale.setScalar(opts.scale ?? 1.6);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    root.add(mesh);
    seatProp(mesh, x, z, opts.yOff ?? 0);
    seatProp(mesh, x, z, opts.yOff ?? 0);

    if (opts.float) {
      mesh.userData.propBob = {
        baseY: mesh.position.y,
        phase: Math.random() * Math.PI * 2,
        amp: 0.25,
        speed: 1.05,
      };
    } else if (opts.physics !== false) {
      mesh.userData.toyPhysics = { kind: "prop" as const };
    }

    if (opts.fun) {
      mesh.userData.funInteract = true;
      mesh.userData.funKind = opts.fun;
      mesh.userData.pokeRange = 11;
      mesh.userData.pokeStrength = 0;
    }
    return mesh;
  } catch (err) {
    console.warn(`glb skip ${id}`, err);
    return null;
  }
}

/**
 * Story-driven prop cast. One `fun` gag prop per hub.
 */
export async function scatterPunProps(
  root: THREE.Group,
  poi: Record<string, { x: number; z: number }>,
): Promise<void> {
  const jobs: Promise<unknown>[] = [
    placeGlb(root, "easel", poi.squiat.x + 2.8, poi.squiat.z - 1.2, {
      scale: 3.2, fun: "spinout",
    }),
    placeGlb(root, "paintkit", poi.squiat.x - 1.8, poi.squiat.z + 1.8, { scale: 2.2 }),
    placeGlb(root, "paintkit", poi.squiat.x + 1.2, poi.squiat.z + 2.4, { scale: 1.8 }),
    placeGlb(root, "plant", poi.squiat.x - 4, poi.squiat.z - 2, { scale: 2.0 }),

    placeGlb(root, "trashcan", poi.plasticOnly.x + 3.5, poi.plasticOnly.z - 2.5, {
      scale: 2.4, fun: "spinout",
    }),
    placeGlb(root, "trashbin", poi.plasticOnly.x - 3.8, poi.plasticOnly.z - 2.2, { scale: 2.0 }),
    placeGlb(root, "cardboard", poi.plasticOnly.x + 2, poi.plasticOnly.z + 3, { scale: 2.2 }),

    placeGlb(root, "boombox", poi.bunny.x - 2.4, poi.bunny.z - 1.5, {
      scale: 2.8, rotY: 0.4, fun: "hop",
    }),
    placeGlb(root, "microphone", poi.bunny.x + 1.2, poi.bunny.z - 0.8, { scale: 3.6 }),
    placeGlb(root, "floorlight", poi.bunny.x - 2.8, poi.bunny.z - 2.2, { scale: 2.0, rotY: 0.5 }),
    placeGlb(root, "floorlight", poi.bunny.x + 2.8, poi.bunny.z - 2.2, { scale: 2.0, rotY: -0.5 }),

    placeGlb(root, "microphone", poi.notorious.x + 1.6, poi.notorious.z - 1.3, {
      scale: 5.0, rotY: -0.4, yOff: 0.2, fun: "micdrop",
    }),
    placeGlb(root, "boombox", poi.notorious.x - 1.8, poi.notorious.z - 1.5, {
      scale: 4.0, rotY: 0.55, yOff: 0.2,
    }),
    placeGlb(root, "trophy", poi.notorious.x - 2.2, poi.notorious.z + 1.4, { scale: 2.4 }),
    placeGlb(root, "skateboard", poi.notorious.x + 2.6, poi.notorious.z + 1.8, {
      scale: 2.6, rotY: 1.1,
    }),

    placeGlb(root, "baguette-loaf", poi.baguette.x + 0.3, poi.baguette.z + 0.1, {
      scale: 1.6, yOff: 0.95, fun: "fling",
    }),
    placeGlb(root, "cafe-table", poi.baguette.x, poi.baguette.z, { scale: 2.0 }),
    placeGlb(root, "cafe-chair", poi.baguette.x, poi.baguette.z - 1.5, {
      scale: 1.5, rotY: Math.PI,
    }),
    placeGlb(root, "croissant", poi.baguette.x - 0.4, poi.baguette.z + 0.2, {
      scale: 1.2, yOff: 0.95,
    }),

    placeGlb(root, "airplane", poi.check.x - 9, poi.check.z - 5, {
      scale: 5.5, rotY: 0.35, fun: "takeoff",
    }),
    placeGlb(root, "conveyor", poi.check.x, poi.check.z + 2.8, { scale: 3.6 }),
    placeGlb(root, "laptopbag", poi.check.x + 1.8, poi.check.z + 1.2, { scale: 1.8 }),
    placeGlb(root, "briefcase", poi.check.x - 1.6, poi.check.z + 1.5, { scale: 1.6 }),

    placeGlb(root, "microphone", poi.windbag.x, poi.windbag.z - 1.0, {
      scale: 3.2, fun: "hop",
    }),
    placeGlb(root, "briefcase", poi.windbag.x + 1.5, poi.windbag.z + 0.5, { scale: 1.5 }),

    placeGlb(root, "pipe", poi.pipes.x - 1.4, poi.pipes.z + 0.2, {
      scale: 3.8, rotX: -Math.PI / 2, rotY: 0.15, fun: "spinout",
    }),
    placeGlb(root, "pipe", poi.pipes.x + 1.4, poi.pipes.z - 0.15, {
      scale: 3.4, rotX: -Math.PI / 2, rotY: -0.25,
    }),
    placeGlb(root, "barrel", poi.pipes.x + 3.0, poi.pipes.z + 1.8, { scale: 2.2 }),

    placeGlb(root, "tent", poi.sleeping.x - 3.5, poi.sleeping.z - 0.8, {
      scale: 3.2, fun: "hop",
    }),
    placeGlb(root, "campfire", poi.sleeping.x + 2.6, poi.sleeping.z + 2.0, { scale: 2.0 }),
    placeGlb(root, "rug", poi.sleeping.x, poi.sleeping.z + 0.5, { scale: 4.5 }),

    placeGlb(root, "tea", poi.tea.x - 1.8, poi.tea.z + 1.0, {
      scale: 2.8, fun: "spinout",
    }),
    placeGlb(root, "tea", poi.tea.x + 2.0, poi.tea.z - 0.6, { scale: 2.4 }),
    placeGlb(root, "plant", poi.tea.x + 3.5, poi.tea.z + 1.8, { scale: 2.0 }),
    placeGlb(root, "chair", poi.tea.x - 3.2, poi.tea.z - 1.5, { scale: 1.6 }),

    placeGlb(root, "poodle", poi.doggy.x + 1.8, poi.doggy.z + 0.5, {
      scale: 1.8, fun: "zoom",
    }),
    placeGlb(root, "fishbones", poi.doggy.x + 2.8, poi.doggy.z - 1.0, { scale: 1.8 }),
    placeGlb(root, "trashcan", poi.doggy.x - 3.0, poi.doggy.z + 1.5, { scale: 2.0 }),

    placeGlb(root, "rubik", poi.tricks.x + 2.0, poi.tricks.z + 1.2, {
      scale: 3.2, fun: "scramble",
    }),
    placeGlb(root, "trophy", poi.tricks.x - 2.2, poi.tricks.z + 1.5, { scale: 2.2 }),
    placeGlb(root, "lightcube", poi.tricks.x - 1.5, poi.tricks.z - 2.0, { scale: 1.2 }),

    placeGlb(root, "banana", poi.grocery.x - 3.3, poi.grocery.z - 2.5, {
      scale: 8, fun: "fling",
    }),
    placeGlb(root, "apple", poi.grocery.x - 4, poi.grocery.z - 2.8, { scale: 1.4 }),
    placeGlb(root, "soda", poi.grocery.x + 0.4, poi.grocery.z - 2.8, { scale: 1.3 }),
    placeGlb(root, "cardboard", poi.grocery.x - 7, poi.grocery.z + 2, { scale: 2.2 }),

    placeGlb(root, "cardboard", poi.mixed.x, poi.mixed.z, {
      scale: 2.4, fun: "spinout",
    }),
    placeGlb(root, "barrel", poi.mixed.x + 2.5, poi.mixed.z + 1.5, { scale: 1.8 }),

    placeGlb(root, "airplane", poi.future.x + 4.5, poi.future.z - 2.8, {
      scale: 5.0, rotY: 0.5, fun: "takeoff",
    }),
    placeGlb(root, "cooler", poi.future.x - 2.5, poi.future.z + 1.5, { scale: 2.2 }),

    placeGlb(root, "cash", poi.money.x + 3.5, poi.money.z + 2.0, {
      scale: 3.2, fun: "jackpot",
    }),
    placeGlb(root, "cash", poi.money.x - 1.5, poi.money.z + 2.5, { scale: 2.6 }),
    placeGlb(root, "briefcase", poi.money.x - 2.8, poi.money.z - 1.5, { scale: 2.4 }),
    placeGlb(root, "trophy", poi.money.x - 3.5, poi.money.z + 1.0, { scale: 2.4 }),
    placeGlb(root, "cardboard", poi.money.x - 4.5, poi.money.z - 2.5, { scale: 2.6 }),

    placeGlb(root, "extinguisher", poi.airbag.x + 3.5, poi.airbag.z - 2.5, {
      scale: 2.4, fun: "blast",
    }),
    placeGlb(root, "airplane", poi.airbag.x - 7, poi.airbag.z + 2.5, { scale: 3.6, rotY: -0.55 }),
    placeGlb(root, "briefcase", poi.airbag.x + 2.5, poi.airbag.z + 2.0, { scale: 1.5 }),
  ];

  await Promise.all(jobs);

  const bobbers: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.propBob) bobbers.push(o);
  });
  if (bobbers.length) {
    root.userData.updateProps = (time: number) => {
      for (const o of bobbers) {
        const bob = o.userData.propBob as {
          baseY: number;
          phase: number;
          amp: number;
          speed: number;
        };
        o.position.y = bob.baseY + Math.sin(time * bob.speed + bob.phase) * bob.amp;
      }
    };
  }
}
