import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { StemMixer } from "../audio/StemMixer";
import type { WorldId } from "../audio/types";
import { fireworkAmount, spaceAmount } from "../worlds/altitude";
import { BreezeParticles } from "../worlds/breeze";
import {
  buildAdventureWorld,
  dominantZone,
  zoneWeights,
  type AdventureWorld,
  type ZoneAtmosphere,
} from "../worlds/buildWorld";
import { CloudField } from "../worlds/clouds";
import { FireworkSky } from "../worlds/fireworks";
import { TOY } from "../worlds/nature";
import { SpaceRocket } from "../worlds/spaceRocket";
import { Starfield } from "../worlds/starfield";
import { scatterPunProps } from "../worlds/props";
import { PUN_POI } from "../worlds/punScenes";
import { ZonePopups } from "../worlds/zonePopups";
import { BagBubbles } from "../worlds/bagBubbles";
import { FunShows } from "../worlds/funShows";
import { wrapDist } from "../worlds/wrap";
import { Bag } from "./Bag";
import { BagTrail } from "./BagTrail";
import { CameraController } from "./CameraController";
import { Input } from "./Input";
import { TouchControls } from "./TouchControls";
import { ToyPhysics } from "./ToyPhysics";

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private useBloom = false;
  private input = new Input();
  private touch!: TouchControls;
  private bag = new Bag();
  private physics = new ToyPhysics();
  private clouds!: CloudField;
  private breeze!: BreezeParticles;
  private fireworks!: FireworkSky;
  private rocket!: SpaceRocket;
  private stars!: Starfield;
  private bloomPass: UnrealBloomPass | null = null;
  private cam: CameraController;
  private stems = new StemMixer();
  private adventure!: AdventureWorld;
  private clock = new THREE.Timer();
  private running = false;
  private skyMesh!: THREE.Mesh;
  private sun!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private currentZoneId: WorldId = "suburban";
  private muted = false;
  private camDir = new THREE.Vector3();
  private fogColor = new THREE.Color();
  private tmpColorA = new THREE.Color();
  private zonePopups: ZonePopups | null = null;
  private bagBubbles: BagBubbles | null = null;
  private funShows = new FunShows();
  private propsReady = false;
  private bagTrail = new BagTrail(56);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private isMobile =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.isMobile,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(
      this.isMobile ? 62 : 55,
      window.innerWidth / window.innerHeight,
      0.1,
      700,
    );
    this.cam = new CameraController(this.camera);

    // Colorful fill — shadows stay warm, never black
    this.ambient = new THREE.AmbientLight(TOY.ambient, this.isMobile ? 0.75 : 0.55);
    this.hemi = new THREE.HemisphereLight(TOY.hemiSky, TOY.hemiGround, 0.85);
    this.sun = new THREE.DirectionalLight(TOY.sun, this.isMobile ? 1.4 : 1.9);
    this.sun.position.set(40, 55, 25);
    this.sun.castShadow = !this.isMobile;
    if (!this.isMobile) {
      this.sun.shadow.mapSize.set(1536, 1536);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 160;
      this.sun.shadow.camera.left = -40;
      this.sun.shadow.camera.right = 40;
      this.sun.shadow.camera.top = 40;
      this.sun.shadow.camera.bottom = -40;
      this.sun.shadow.bias = -0.0002;
      this.sun.shadow.radius = 3;
    }
    this.scene.add(this.ambient, this.hemi, this.sun);
    this.scene.add(this.sun.target);

    this.skyMesh = this.makeSky();
    this.scene.add(this.skyMesh);

    this.useBloom = !this.isMobile;
    this.setupComposer();

    this.bag.setQuality(this.isMobile ? "mobile" : "desktop");

    this.clouds = new CloudField(this.isMobile ? 28 : 48);
    this.breeze = new BreezeParticles(this.isMobile ? 80 : 140);
    this.fireworks = new FireworkSky();
    this.rocket = new SpaceRocket();
    this.stars = new Starfield(this.isMobile ? 500 : 900);
    this.scene.add(this.clouds.group);
    this.scene.add(this.breeze.points);
    this.scene.add(this.fireworks.group);
    this.scene.add(this.rocket.group);
    this.scene.add(this.stars.points);
    this.scene.add(this.bag.group);
    this.scene.add(this.bagTrail.points);
    this.clock.connect(document);
    this.loadAdventure();

    this.touch = new TouchControls(this.input, {
      onMute: () => this.toggleMute(),
      onCamera: () => this.cam.toggleCinematic(),
    });

    this.canvas.addEventListener("pointerdown", this.onCanvasPointer);
    window.addEventListener("resize", this.onResize);
  }

  setCallbacks(_cb: { onWorldName?: (name: string) => void }): void {
    // Zone titles live in world space now (ZonePopups)
  }

  async unlockAudio(): Promise<void> {
    await this.stems.unlock();
  }

  async initAudio(): Promise<void> {
    await this.stems.init();
  }

  /** Call from any user gesture — resumes iOS AudioContext if it suspended. */
  resumeAudio(): void {
    void this.stems.resume();
  }

  async start(): Promise<void> {
    await this.stems.start();
    this.running = true;
    this.armAudioResumeGestures();
    this.touch.show();
    this.clock.reset();
    this.loop();
  }

  private armAudioResumeGestures(): void {
    const kick = (): void => {
      this.resumeAudio();
    };
    window.addEventListener("pointerdown", kick, { passive: true });
    window.addEventListener("touchstart", kick, { passive: true });
    window.addEventListener("keydown", kick);
  }

    private toggleMute(): void {
    this.muted = !this.muted;
    this.stems.toggleMute();
  }

  getWorldId(): WorldId {
    return this.currentZoneId;
  }

  dispose(): void {
    this.running = false;
    this.input.dispose();
    this.stems.dispose();
    this.physics.dispose();
    this.clock.dispose();
    this.canvas.removeEventListener("pointerdown", this.onCanvasPointer);
    window.removeEventListener("resize", this.onResize);
    this.composer?.dispose();
    this.renderer.dispose();
  }

  /** Mobile: tap the special prop. Desktop uses Enter when in range. */
  private onCanvasPointer = (e: PointerEvent): void => {
    if (!this.running || !this.isMobile || !this.propsReady) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("#touch-ui")) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.adventure.group, true);
    for (const hit of hits) {
      const root = this.physics.resolveTracked(hit.object);
      if (!root?.userData.funInteract || root.userData.funBusy) continue;
      const range = (root.userData.pokeRange as number | undefined) ?? 11;
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const d = wrapDist(wp.x, wp.z, this.bag.position.x, this.bag.position.z);
      if (d > range) continue;
      if (this.funShows.trigger(root)) this.cam.bump(0.28);
      return;
    }
  };

  private loadAdventure(): void {
    this.adventure = buildAdventureWorld(this.isMobile);
    this.scene.add(this.adventure.group);

    this.zonePopups = new ZonePopups(this.adventure.zones);
    this.scene.add(this.zonePopups.group);

    this.bagBubbles = new BagBubbles();
    this.scene.add(this.bagBubbles.group);
    this.scene.add(this.funShows.group);

    this.bag.group.position.copy(this.adventure.spawn);
    this.bag.group.userData.isPlayer = true;
    this.bag.velocity.set(0, 0, 0);
    this.applyZone(this.adventure.zones[0]!, true);
    this.adventure.update(0, 0, this.bag.position, 160, 0);
    this.physics.collect(this.adventure.group);
    this.physics.settle(12);
    this.bagBubbles.collect(this.adventure.group);
    void scatterPunProps(this.adventure.group, PUN_POI).then(() => {
      this.physics.collect(this.adventure.group);
      this.physics.settle(28);
      this.bagBubbles?.collect(this.adventure.group);
      this.propsReady = true;
    });
  }

  private setupComposer(): void {
    if (!this.useBloom) {
      this.composer = null;
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.14,
      0.45,
      0.92,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.getElapsed();

    this.input.beginFrame();
    if (this.input.justPressed("KeyC")) this.cam.toggleCinematic();
    if (this.input.justPressed("KeyM")) this.toggleMute();

    const fogFar = (this.scene.fog as THREE.Fog | null)?.far ?? 175;
    const fw = fireworkAmount(this.bag.altitudeY);
    const sp = spaceAmount(this.bag.altitudeY);

    this.adventure.update(dt, time, this.bag.position, fogFar, sp);
    const updateProps = this.adventure.group.userData.updateProps as
      | ((t: number) => void)
      | undefined;
    updateProps?.(time);
    this.blendAtmosphere(dt);

    this.bag.setGroundY(this.adventure.heightAt(this.bag.position.x, this.bag.position.z));

    this.camera.getWorldDirection(this.camDir);
    this.bag.update(dt, this.input, this.camDir);
    this.bagTrail.update(dt, this.bag.position, this.bag.windSpeed);
    this.physics.syncPlayer(this.bag.position, this.bag.velocity);
    this.physics.update(dt, this.bag.position);

    if (this.propsReady && this.input.consumeInteract()) {
      const near = this.physics.nearestInteractable(this.bag.position);
      if (near && this.funShows.trigger(near.mesh)) {
        this.cam.bump(0.28);
      }
    }
    this.cam.applySpin(this.input.spin, dt);

    const canInteract =
      this.propsReady && !!this.physics.nearestInteractable(this.bag.position);
    this.touch.setCanInteract(canInteract, this.isMobile);

    this.funShows.update(dt);

    const showSkyStuff = sp < 0.4;
    this.clouds.group.visible = showSkyStuff;
    this.breeze.points.visible = showSkyStuff && fw < 0.7;
    if (showSkyStuff) {
      this.clouds.update(dt, time, this.bag.position, this.camera);
      this.breeze.update(dt, this.bag.position, time);
    }

    this.fireworks.group.visible = fw > 0.08 && sp < 0.5;
    if (fw > 0.08) this.fireworks.update(dt, time, this.bag.position, fw, this.camDir);
    this.rocket.update(dt, time, this.bag.position, sp);
    this.stars.update(this.camera.position, sp);

    // Soft bloom so neon fireworks pop without white mush
    if (this.bloomPass) {
      this.bloomPass.strength = THREE.MathUtils.damp(
        this.bloomPass.strength,
        fw > 0.2 ? 0.12 : 0.14,
        3,
        dt,
      );
    }

    this.sun.position.set(
      this.bag.position.x + 35,
      55 + sp * 40,
      this.bag.position.z + 20,
    );
    this.sun.target.position.copy(this.bag.position);
    this.sun.target.updateMatrixWorld();

    this.cam.update(dt, this.bag);

    const zone = dominantZone(this.bag.position.x, this.bag.position.z, this.adventure.zones);
    if (zone.id !== this.currentZoneId) {
      this.currentZoneId = zone.id;
    }

    this.zonePopups?.update(dt, this.bag.position, this.camera, time, { fw, sp });
    this.bagBubbles?.update(dt, this.bag.position, this.camera);

    this.stems.update({
      altitudeY: this.bag.altitudeY,
      worldId: this.currentZoneId,
    });

    this.skyMesh.position.copy(this.camera.position);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private blendAtmosphere(dt: number): void {
    const weights = zoneWeights(this.bag.position.x, this.bag.position.z, this.adventure.zones);
    this.fogColor.setRGB(0, 0, 0);
    this.sun.color.setRGB(0, 0, 0);
    this.ambient.color.setRGB(0, 0, 0);
    const skyTop = new THREE.Color(0, 0, 0);
    const skyBot = new THREE.Color(0, 0, 0);
    let fogNear = 0;
    let fogFar = 0;
    let exposure = 0;

    for (let i = 0; i < this.adventure.zones.length; i++) {
      const zone = this.adventure.zones[i]!;
      const w = weights[i]!;
      this.tmpColorA.setHex(zone.fogColor);
      this.fogColor.r += this.tmpColorA.r * w;
      this.fogColor.g += this.tmpColorA.g * w;
      this.fogColor.b += this.tmpColorA.b * w;

      this.tmpColorA.setHex(zone.sunColor);
      this.sun.color.r += this.tmpColorA.r * w;
      this.sun.color.g += this.tmpColorA.g * w;
      this.sun.color.b += this.tmpColorA.b * w;

      this.tmpColorA.setHex(zone.ambientColor);
      this.ambient.color.r += this.tmpColorA.r * w;
      this.ambient.color.g += this.tmpColorA.g * w;
      this.ambient.color.b += this.tmpColorA.b * w;

      this.tmpColorA.setHex(zone.skyTop);
      skyTop.r += this.tmpColorA.r * w;
      skyTop.g += this.tmpColorA.g * w;
      skyTop.b += this.tmpColorA.b * w;

      this.tmpColorA.setHex(zone.skyBottom);
      skyBot.r += this.tmpColorA.r * w;
      skyBot.g += this.tmpColorA.g * w;
      skyBot.b += this.tmpColorA.b * w;

      fogNear += zone.fogNear * w;
      fogFar += zone.fogFar * w;
      exposure += zone.exposure * w;
    }

    exposure = Math.max(0.9, exposure || 1.05);
    fogNear = Math.max(12, fogNear || 24);
    fogFar = Math.max(fogNear + 50, fogFar || 160);
    if (this.fogColor.r + this.fogColor.g + this.fogColor.b < 0.15) {
      this.fogColor.setHex(TOY.fog);
    }
    if (this.sun.color.r + this.sun.color.g + this.sun.color.b < 0.15) {
      this.sun.color.setHex(TOY.sun);
    }
    if (this.ambient.color.r + this.ambient.color.g + this.ambient.color.b < 0.1) {
      this.ambient.color.setHex(TOY.ambient);
    }
    if (skyTop.r + skyTop.g + skyTop.b < 0.15) skyTop.setHex(TOY.skyTop);
    if (skyBot.r + skyBot.g + skyBot.b < 0.15) skyBot.setHex(TOY.skyBot);

    // Vertical atmosphere: fireworks glow → deep space
    const y = this.bag.altitudeY;
    const fw = fireworkAmount(y);
    const sp = spaceAmount(y);
    if (fw > 0.05) {
      const glow = new THREE.Color(0xff60a0);
      this.fogColor.lerp(glow, fw * 0.35);
      skyTop.lerp(new THREE.Color(0x201040), fw * 0.5);
      skyBot.lerp(new THREE.Color(0xff80c0), fw * 0.4);
      this.sun.color.lerp(new THREE.Color(0xff90c0), fw * 0.45);
      fogFar = THREE.MathUtils.lerp(fogFar, 280, fw);
    }
    if (sp > 0.05) {
      const voidCol = new THREE.Color(0x06061a);
      this.fogColor.lerp(voidCol, sp * 0.9);
      skyTop.lerp(new THREE.Color(0x030312), sp);
      skyBot.lerp(new THREE.Color(0x0a1030), sp);
      this.sun.color.lerp(new THREE.Color(0xa0b8ff), sp * 0.6);
      this.ambient.color.lerp(new THREE.Color(0x283858), sp * 0.75);
      fogNear = THREE.MathUtils.lerp(fogNear, 15, sp);
      fogFar = THREE.MathUtils.lerp(fogFar, 380, sp);
      exposure = THREE.MathUtils.lerp(exposure, 0.7, sp);
    }

    this.hemi.color.lerp(skyTop, 1 - Math.exp(-2.2 * dt));
    this.hemi.groundColor.lerp(new THREE.Color(TOY.hemiGround), 1 - Math.exp(-2.2 * dt));

    if (!this.scene.fog) {
      this.scene.fog = new THREE.Fog(this.fogColor.clone(), fogNear, fogFar);
    } else {
      const fog = this.scene.fog as THREE.Fog;
      fog.color.lerp(this.fogColor, 1 - Math.exp(-6 * dt));
      fog.near = THREE.MathUtils.damp(fog.near, fogNear, 5, dt);
      fog.far = THREE.MathUtils.damp(fog.far, fogFar, 5, dt);
    }
    this.renderer.setClearColor((this.scene.fog as THREE.Fog).color);
    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      exposure,
      2.4,
      dt,
    );
    this.updateSkyColors(skyTop, skyBot);
  }

  private applyZone(zone: ZoneAtmosphere, instant = false): void {
    this.currentZoneId = zone.id;
    this.fogColor.setHex(zone.fogColor);
    this.scene.fog = new THREE.Fog(zone.fogColor, zone.fogNear, zone.fogFar);
    this.renderer.setClearColor(zone.fogColor);
    this.sun.color.setHex(zone.sunColor);
    this.ambient.color.setHex(zone.ambientColor);
    this.renderer.toneMappingExposure = zone.exposure;
    this.updateSkyColors(new THREE.Color(zone.skyTop), new THREE.Color(zone.skyBottom));
    void instant;
  }

  private makeSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(650, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(TOY.skyTop) },
        bottomColor: { value: new THREE.Color(TOY.skyBot) },
        offset: { value: 8 },
        exponent: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          vec3 col = mix(bottomColor, topColor, t);
          col = mix(col, bottomColor * 1.05, pow(1.0 - abs(h), 4.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    return new THREE.Mesh(geo, mat);
  }

  private updateSkyColors(top: THREE.Color, bottom: THREE.Color): void {
    const mat = this.skyMesh.material as THREE.ShaderMaterial;
    (mat.uniforms.topColor!.value as THREE.Color).copy(top);
    (mat.uniforms.bottomColor!.value as THREE.Color).copy(bottom);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
  };
}
