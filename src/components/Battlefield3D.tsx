import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Volume2, VolumeX, Eye, EyeOff, Camera } from 'lucide-react';
import { ActiveBattle, CameraPreset, SoldierModelType } from '../types/battle';
import { battleAudio } from '../services/battleAudio';
import {
  buildInstancedSoldierGeometries,
  createFlagTexture,
  createTerrainTexture,
  createWallTexture,
  InstancedSoldierGeometrySet,
} from '../three/battleSceneBuilder';

interface Battlefield3DProps {
  battle: ActiveBattle;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onLocalSimulationStep?: (
    homeRemaining: number,
    opponentRemaining: number,
    winnerSide: 'none' | 'home' | 'opponent' | 'draw'
  ) => void;
}

const MAX_RENDERED_PER_SIDE = 15000;

const _vec3 = new THREE.Vector3();
const _targetVec = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

interface Projectile {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface InstancedArmy {
  count: number;
  side: 'red' | 'blue';
  model: SoldierModelType;
  geos: InstancedSoldierGeometrySet;
  armorMesh: THREE.InstancedMesh;
  gearMesh: THREE.InstancedMesh;
  visorMesh: THREE.InstancedMesh;
  armorMat: THREE.MeshStandardMaterial;
  gearMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  baseX: Float32Array;
  baseZ: Float32Array;
  phase: Float32Array;
  alive: Uint8Array;
  fallProgress: Float32Array;
  scaleFactor: number;
}

export const Battlefield3D: React.FC<Battlefield3DProps> = ({
  battle,
  cameraPreset,
  onCameraPresetChange,
  onCanvasReady,
  onLocalSimulationStep,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const battleRef = useRef<ActiveBattle>(battle);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const simStepCbRef = useRef(onLocalSimulationStep);

  const [webglError, setWebglError] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  battleRef.current = battle;
  cameraPresetRef.current = cameraPreset;
  simStepCbRef.current = onLocalSimulationStep;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);
    onCanvasReady?.(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    const handleContextRestored = () => {
      setWebglError(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const bgHex =
      battle.arenaTheme === 'desert' ? 0x261d17 : battle.arenaTheme === 'alpine' ? 0x16202e : 0x09111e;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.0055);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const initialAspect = (container.clientWidth || 1280) / (container.clientHeight || 720);
    const initialAspectBoost = initialAspect < 1 ? Math.min(1.85, 1.05 / Math.max(0.45, initialAspect)) : 1;

    const camera = new THREE.PerspectiveCamera(
      46,
      initialAspect,
      0.2,
      450
    );
    camera.position.set(0, 36 * initialAspectBoost, 68 * initialAspectBoost);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 8;
    controls.maxDistance = 190;
    controls.target.set(0, 1.5, 0);

    let userInteracting = false;
    controls.addEventListener('start', () => {
      userInteracting = true;
    });
    controls.addEventListener('end', () => {
      userInteracting = false;
    });

    // Studio & Outdoor 3-Point Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.8);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(36, 56, 32);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 160;
    keyLight.shadow.camera.left = -64;
    keyLight.shadow.camera.right = 64;
    keyLight.shadow.camera.top = 52;
    keyLight.shadow.camera.bottom = -52;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.9);
    rimLight.position.set(-40, 28, -36);
    scene.add(rimLight);

    // Expanded Natural Terrain for 1-to-1 Mass Formations
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    let terrainTex = createTerrainTexture(battle.arenaTheme, maxAnisotropy);
    const groundGeo = new THREE.PlaneGeometry(360, 360, 56, 56);
    groundGeo.rotateX(-Math.PI / 2);
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const gx = posAttr.getX(i);
      const gz = posAttr.getZ(i);
      const dist = Math.hypot(gx, gz);
      if (dist > 84) {
        const hill = Math.sin(gx * 0.06) * Math.cos(gz * 0.06) * 4.5 + (dist - 84) * 0.14;
        posAttr.setY(i, Math.max(0, hill));
      }
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      map: terrainTex,
      roughness: 0.88,
      metalness: 0.06,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Subtle territory zone markers on ground (offset +0.02Y to prevent Z-fighting)
    const redZoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(battle.opponentColor),
      transparent: true,
      opacity: 0.16,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const redZone = new THREE.Mesh(new THREE.PlaneGeometry(54, 68), redZoneMat);
    redZone.rotation.x = -Math.PI / 2;
    redZone.position.set(-30, 0.02, 0);
    scene.add(redZone);

    const blueZoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(battle.homeColor),
      transparent: true,
      opacity: 0.16,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const blueZone = new THREE.Mesh(new THREE.PlaneGeometry(54, 68), blueZoneMat);
    blueZone.rotation.x = -Math.PI / 2;
    blueZone.position.set(30, 0.02, 0);
    scene.add(blueZone);

    // Natural perimeter boulders via InstancedMesh
    const rockGeo = new THREE.DodecahedronGeometry(1.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.92,
      metalness: 0.05,
    });
    const rockCount = 64;
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2;
      const radius = 86 + (i % 5) * 9;
      dummy.position.set(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius);
      const s = 0.9 + ((i * 7) % 10) * 0.22;
      dummy.scale.set(s * 1.2, s * 0.85, s);
      dummy.rotation.set(i * 0.4, i * 0.8, 0);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    }
    rockMesh.computeBoundingSphere();
    scene.add(rockMesh);

    // Great Central Separation Wall (spanning full 74-unit battle front)
    const wallGroup = new THREE.Group();
    const wallTex = createWallTexture(maxAnisotropy);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.55,
      metalness: 0.35,
    });
    const wallBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 14, 74), wallMat);
    wallBody.position.set(0, 7, 0);
    wallBody.castShadow = true;
    wallBody.receiveShadow = true;
    wallGroup.add(wallBody);

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.3,
      metalness: 0.85,
    });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    for (let z = -34; z <= 34; z += 11.3) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 14.6, 1.0), pillarMat);
      pillar.position.set(0, 7.3, z);
      pillar.castShadow = true;
      wallGroup.add(pillar);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 10), beaconMat);
      beacon.position.set(0, 14.9, z);
      wallGroup.add(beacon);
    }
    scene.add(wallGroup);

    // 3D Flag Banners (1 towering HQ flag + 2 tactical flank flags per country)
    interface FlagRig {
      mesh: THREE.Mesh;
      side: 'red' | 'blue';
      baseZCoords: Float32Array;
      width: number;
    }

    const createBannerRig = (
      xPos: number,
      zPos: number,
      poleHeight: number,
      flagW: number,
      flagH: number,
      side: 'red' | 'blue'
    ): FlagRig => {
      const rig = new THREE.Group();
      rig.position.set(xPos, 0, zPos);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.2, poleHeight, 10),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.2 })
      );
      pole.position.y = poleHeight / 2;
      pole.castShadow = true;
      rig.add(pole);

      const finial = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 })
      );
      finial.position.y = poleHeight + 0.18;
      rig.add(finial);

      const geo = new THREE.PlaneGeometry(flagW, flagH, 14, 8);
      const pAttr = geo.attributes.position;
      const baseZCoords = new Float32Array(pAttr.count);
      for (let i = 0; i < pAttr.count; i++) {
        baseZCoords[i] = pAttr.getZ(i);
      }

      const flagMesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.48, metalness: 0.05 })
      );
      flagMesh.position.set(
        side === 'red' ? flagW / 2 + 0.15 : -(flagW / 2 + 0.15),
        poleHeight - flagH / 2 - 0.2,
        0
      );
      flagMesh.castShadow = true;
      rig.add(flagMesh);
      scene.add(rig);
      return { mesh: flagMesh, side, baseZCoords, width: flagW };
    };

    const redFlagRigs: FlagRig[] = [
      createBannerRig(-26, -24, 17, 8.2, 5.0, 'red'),
      createBannerRig(-14, 24, 11.5, 5.4, 3.4, 'red'),
      createBannerRig(-30, 4, 13.5, 6.2, 3.8, 'red'),
    ];
    const blueFlagRigs: FlagRig[] = [
      createBannerRig(48, -34, 18, 8.6, 5.2, 'blue'),
      createBannerRig(20, 35, 12.5, 5.8, 3.6, 'blue'),
      createBannerRig(52, 4, 14.5, 6.6, 4.0, 'blue'),
    ];

    let lastFlagSignature = '';
    let currentRedFlagTex: THREE.CanvasTexture | null = null;
    let currentBlueFlagTex: THREE.CanvasTexture | null = null;

    const updateFlagsAndTheme = (b: ActiveBattle) => {
      const sig = `${b.opponentCountryCode}|${b.opponentFlag}|${b.opponentColor}|${b.homeCountryCode}|${b.homeFlag}|${b.homeColor}|${b.arenaTheme}`;
      if (sig === lastFlagSignature) return;
      lastFlagSignature = sig;

      const rTex = createFlagTexture(
        b.opponentCountryCode,
        b.opponentFlag,
        b.opponentCountryName,
        b.opponentColor
      );
      redFlagRigs.forEach((r) => {
        const mat = r.mesh.material as THREE.MeshStandardMaterial;
        mat.map = rTex;
        mat.needsUpdate = true;
      });
      currentRedFlagTex?.dispose();
      currentRedFlagTex = rTex;

      const bTex = createFlagTexture(b.homeCountryCode, b.homeFlag, b.homeCountryName, b.homeColor);
      blueFlagRigs.forEach((r) => {
        const mat = r.mesh.material as THREE.MeshStandardMaterial;
        mat.map = bTex;
        mat.needsUpdate = true;
      });
      currentBlueFlagTex?.dispose();
      currentBlueFlagTex = bTex;

      redZoneMat.color.set(b.opponentColor);
      blueZoneMat.color.set(b.homeColor);

      const nextBg =
        b.arenaTheme === 'desert' ? 0x261d17 : b.arenaTheme === 'alpine' ? 0x16202e : 0x09111e;
      (scene.background as THREE.Color).setHex(nextBg);
      (scene.fog as THREE.FogExp2).color.setHex(nextBg);
      terrainTex.dispose();
      terrainTex = createTerrainTexture(b.arenaTheme, maxAnisotropy);
      groundMat.map = terrainTex;
      groundMat.needsUpdate = true;
    };

    // 1-to-1 Instanced Army Containers
    const armyGroup = new THREE.Group();
    scene.add(armyGroup);
    let redArmy: InstancedArmy | null = null;
    let blueArmy: InstancedArmy | null = null;
    let lastArmySig = '';

    const disposeArmy = (army: InstancedArmy | null) => {
      if (!army) return;
      armyGroup.remove(army.armorMesh, army.gearMesh, army.visorMesh);
      army.geos.armorGeo.dispose();
      army.geos.gearGeo.dispose();
      army.geos.visorGeo.dispose();
      army.armorMat.dispose();
      army.gearMat.dispose();
      army.visorMat.dispose();
    };

    const createInstancedArmy = (
      requestedCount: number,
      side: 'red' | 'blue',
      colorHex: string,
      model: SoldierModelType,
      scaleFactor: number
    ): InstancedArmy | null => {
      const count = Math.max(0, Math.min(MAX_RENDERED_PER_SIDE, Math.round(requestedCount)));
      if (count <= 0) return null;

      const geos = buildInstancedSoldierGeometries(model);
      const armorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.42,
      });
      const gearMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.48,
        metalness: 0.55,
      });
      const visorMat = new THREE.MeshStandardMaterial({
        color: side === 'blue' ? 0x38bdf8 : 0xfb7185,
        emissive: side === 'blue' ? 0x0284c7 : 0xe11d48,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.8,
      });

      const armorMesh = new THREE.InstancedMesh(geos.armorGeo, armorMat, count);
      const gearMesh = new THREE.InstancedMesh(geos.gearGeo, gearMat, count);
      const visorMesh = new THREE.InstancedMesh(geos.visorGeo, visorMat, count);

      armorMesh.frustumCulled = false;
      gearMesh.frustumCulled = false;
      visorMesh.frustumCulled = false;
      armorMesh.castShadow = !isSoftwareGl;
      gearMesh.castShadow = !isSoftwareGl;
      armorMesh.receiveShadow = true;

      const baseX = new Float32Array(count);
      const baseZ = new Float32Array(count);
      const phase = new Float32Array(count);
      const alive = new Uint8Array(count);
      const fallProgress = new Float32Array(count);

      // Dynamic rectangular phalanx; back ranks stored first (0..count-1) so front ranks fall first!
      const spacing = 0.92 * Math.max(0.75, scaleFactor * 0.92);
      const rows = Math.max(8, Math.min(72, Math.round(Math.sqrt(count * 1.6))));
      const cols = Math.ceil(count / rows);

      const baseColColor = new THREE.Color(colorHex);
      const yaw = side === 'red' ? Math.PI / 2 : -Math.PI / 2;

      for (let idx = 0; idx < count; idx++) {
        // Fill from rear rank (col = cols - 1) forward toward front rank (col = 0)
        const revIdx = count - 1 - idx;
        const col = Math.floor(revIdx / rows);
        const row = revIdx % rows;
        const rowCountInCol = col === cols - 1 ? count - col * rows : rows;

        const x = side === 'red' ? -4.2 - col * spacing : 4.2 + col * spacing;
        const z = (row - (rowCountInCol - 1) / 2) * spacing;

        baseX[idx] = x;
        baseZ[idx] = z;
        phase[idx] = ((idx * 1.6180339) % 1) * Math.PI * 2;
        alive[idx] = 1;
        fallProgress[idx] = 0;

        // Subtle ±8% organic uniform brightness variation per soldier
        const shade = 0.92 + ((idx * 37) % 17) * 0.01;
        _color.copy(baseColColor).multiplyScalar(shade);
        armorMesh.setColorAt(idx, _color);

        _pos.set(x, 0, z);
        _euler.set(0, yaw, 0);
        _quat.setFromEuler(_euler);
        _scale.setScalar(scaleFactor);
        _mat4.compose(_pos, _quat, _scale);
        armorMesh.setMatrixAt(idx, _mat4);
        gearMesh.setMatrixAt(idx, _mat4);
        visorMesh.setMatrixAt(idx, _mat4);
      }

      if (armorMesh.instanceColor) armorMesh.instanceColor.needsUpdate = true;
      armorMesh.instanceMatrix.needsUpdate = true;
      gearMesh.instanceMatrix.needsUpdate = true;
      visorMesh.instanceMatrix.needsUpdate = true;

      armyGroup.add(armorMesh, gearMesh, visorMesh);

      return {
        count,
        side,
        model,
        geos,
        armorMesh,
        gearMesh,
        visorMesh,
        armorMat,
        gearMat,
        visorMat,
        baseX,
        baseZ,
        phase,
        alive,
        fallProgress,
        scaleFactor,
      };
    };

    const rebuildArmies = (b: ActiveBattle) => {
      const redCount = Math.max(0, Math.min(MAX_RENDERED_PER_SIDE, Math.round(b.opponentSoldiers)));
      const blueCount = Math.max(0, Math.min(MAX_RENDERED_PER_SIDE, Math.round(b.homeSoldiers)));
      const scaleFactor = b.soldierScale ?? 1;

      const sig = `${b.opponentColor}|${b.opponentModel}|${redCount}|${b.homeColor}|${b.homeModel}|${blueCount}|${scaleFactor}`;
      if (sig === lastArmySig) return;
      lastArmySig = sig;

      disposeArmy(redArmy);
      disposeArmy(blueArmy);

      redArmy = createInstancedArmy(redCount, 'red', b.opponentColor, b.opponentModel, scaleFactor);
      blueArmy = createInstancedArmy(blueCount, 'blue', b.homeColor, b.homeModel, scaleFactor);
    };

    // Pooled tracer projectiles & victory sparks
    const projectiles: Projectile[] = [];
    const projGeo = new THREE.SphereGeometry(0.18, 6, 6);
    const redProjMat = new THREE.MeshBasicMaterial({ color: 0xf87171 });
    const blueProjMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(projGeo, i % 2 === 0 ? redProjMat : blueProjMat);
      mesh.visible = false;
      scene.add(mesh);
      projectiles.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const sparks: SparkParticle[] = [];
    const sparkGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
      mesh.visible = false;
      scene.add(mesh);
      sparks.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const spawnBurst = (x: number, y: number, z: number, hexColor: string, count = 8) => {
      let spawned = 0;
      for (const sp of sparks) {
        if (sp.active) continue;
        sp.active = true;
        sp.life = 0.8 + Math.random() * 0.5;
        sp.mesh.visible = true;
        (sp.mesh.material as THREE.MeshBasicMaterial).color.set(hexColor);
        sp.mesh.position.set(x, y, z);
        sp.vx = (Math.random() - 0.5) * 10;
        sp.vy = 3.5 + Math.random() * 6.5;
        sp.vz = (Math.random() - 0.5) * 10;
        spawned++;
        if (spawned >= count) break;
      }
    };

    const spawnFrontProjectile = (army: InstancedArmy | null, aliveCount: number) => {
      if (!army || aliveCount <= 0) return;
      const slot = projectiles.find((p) => !p.active);
      if (!slot) return;
      // Pick from near the front edge of currently alive soldiers
      const frontSpan = Math.min(aliveCount, 64);
      const idx = Math.max(0, aliveCount - 1 - Math.floor(Math.random() * frontSpan));
      const x = army.baseX[idx];
      const z = army.baseZ[idx];
      slot.active = true;
      slot.life = 0.7;
      slot.mesh.visible = true;
      slot.mesh.material = army.side === 'red' ? redProjMat : blueProjMat;
      slot.mesh.position.set(x + (army.side === 'red' ? 1.5 : -1.5), 1.15, z);
      slot.vx = (army.side === 'red' ? 1 : -1) * 34;
      slot.vy = (Math.random() - 0.5) * 1.6;
      slot.vz = (Math.random() - 0.5) * 5.0;
    };

    updateFlagsAndTheme(battle);
    rebuildArmies(battle);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let lastStatus = battle.status;
    let simRedRem = battle.opponentRemaining;
    let simBlueRem = battle.homeRemaining;
    let simReportTimer = 0;
    let fireBurstTimer = 0;
    let victoryTriggered = false;
    let disposed = false;
    let combatAdvanceTime = 0;

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const updateArmyInstances = (
      army: InstancedArmy | null,
      aliveTarget: number,
      status: ActiveBattle['status'],
      winnerSide: ActiveBattle['winnerSide'],
      elapsed: number,
      delta: number,
      speed: number,
      advanceDist: number,
      teamColor: string
    ) => {
      if (!army) return;
      const count = army.count;
      const yaw = army.side === 'red' ? Math.PI / 2 : -Math.PI / 2;
      const isWinner =
        status === 'finished' &&
        ((army.side === 'blue' && winnerSide === 'home') ||
          (army.side === 'red' && winnerSide === 'opponent'));

      const isFighting = status === 'fighting';
      const dir = army.side === 'red' ? 1 : -1;

      // Update matrices when fighting, celebrating, or animating fallen troops
      let anyChanged = isFighting || isWinner;

      for (let i = 0; i < count; i++) {
        const shouldBeAlive = i < aliveTarget;
        if (!shouldBeAlive && army.alive[i] === 1) {
          army.alive[i] = 0;
          anyChanged = true;
          if (i % 14 === 0) {
            spawnBurst(army.baseX[i] + dir * advanceDist, 1.1, army.baseZ[i], teamColor, 3);
          }
        } else if (shouldBeAlive && army.alive[i] === 0) {
          army.alive[i] = 1;
          army.fallProgress[i] = 0;
          anyChanged = true;
        }

        if (army.alive[i] === 0 && army.fallProgress[i] < 1) {
          army.fallProgress[i] = Math.min(1, army.fallProgress[i] + delta * 3.4);
          anyChanged = true;
        }
      }

      if (!anyChanged && status !== 'idle' && status !== 'countdown') return;

      _scale.setScalar(army.scaleFactor);

      for (let i = 0; i < count; i++) {
        const ph = army.phase[i];
        let x = army.baseX[i];
        let y = 0;
        const z = army.baseZ[i];
        let roll = 0;
        let sway = 0;

        if (army.alive[i] === 0) {
          const fp = army.fallProgress[i];
          roll = dir * fp * (Math.PI / 2);
          y = fp * 0.16;
          x += dir * advanceDist;
        } else if (isFighting) {
          x += dir * Math.min(2.8, advanceDist);
          const stride = Math.sin(elapsed * 8.5 * speed + ph);
          y = Math.abs(stride) * 0.12;
          sway = stride * 0.06;
        } else if (isWinner) {
          y = Math.abs(Math.sin(elapsed * 5.2 + ph)) * 0.34;
        } else {
          // Subtle breathing sway in idle/countdown
          y = Math.sin(elapsed * 1.6 + ph) * 0.02;
        }

        _pos.set(x, y, z);
        _euler.set(sway, yaw, roll);
        _quat.setFromEuler(_euler);
        _mat4.compose(_pos, _quat, _scale);

        army.armorMesh.setMatrixAt(i, _mat4);
        army.gearMesh.setMatrixAt(i, _mat4);
        army.visorMesh.setMatrixAt(i, _mat4);
      }

      army.armorMesh.instanceMatrix.needsUpdate = true;
      army.gearMesh.instanceMatrix.needsUpdate = true;
      army.visorMesh.instanceMatrix.needsUpdate = true;
    };

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.getElapsedTime();
      const b = battleRef.current;

      updateFlagsAndTheme(b);
      rebuildArmies(b);

      if (b.status !== lastStatus) {
        if (b.status === 'wall_lowering') {
          battleAudio.playWallRumble();
          victoryTriggered = false;
          combatAdvanceTime = 0;
        }
        if (b.status === 'idle' || b.status === 'countdown') {
          simRedRem = b.opponentSoldiers;
          simBlueRem = b.homeSoldiers;
          combatAdvanceTime = 0;
          victoryTriggered = false;
        }
        if (b.status === 'finished' && !victoryTriggered) {
          victoryTriggered = true;
          battleAudio.playVictoryFanfare();
          const winColor = b.winnerSide === 'home' ? b.homeColor : b.opponentColor;
          spawnBurst(b.winnerSide === 'home' ? 14 : -14, 5, 0, winColor, 24);
        }
        lastStatus = b.status;
      }

      const targetWallY =
        b.status === 'idle' || b.status === 'countdown' ? 0 : -(b.wallHeight + 2.2);
      wallGroup.position.y = THREE.MathUtils.damp(wallGroup.position.y, targetWallY, 2.1, delta);

      // 3D cloth wave animation on all country flags
      const animateFlags = (rigs: FlagRig[], phaseShift: number) => {
        for (let r = 0; r < rigs.length; r++) {
          const rig = rigs[r];
          const pAttr = rig.mesh.geometry.attributes.position;
          const halfW = rig.width / 2;
          for (let i = 0; i < pAttr.count; i++) {
            const vx = pAttr.getX(i);
            const vy = pAttr.getY(i);
            const u = rig.side === 'red' ? (vx + halfW) / rig.width : (halfW - vx) / rig.width;
            const wave =
              Math.sin(u * 5.5 - elapsed * 4.2 + phaseShift + r * 0.7) * 0.42 * u +
              Math.cos(vy * 2.0 + elapsed * 3.1) * 0.1 * u;
            pAttr.setZ(i, rig.baseZCoords[i] + wave);
          }
          pAttr.needsUpdate = true;
        }
      };
      animateFlags(redFlagRigs, 0);
      animateFlags(blueFlagRigs, 1.4);

      // Combat progression & front-line gunfire
      const speed = b.battleSpeed || 1;
      if (b.status === 'fighting') {
        simReportTimer += delta;
        fireBurstTimer += delta * speed;
        combatAdvanceTime = Math.min(2.8, combatAdvanceTime + delta * 0.8 * speed);

        const bluePower = Math.max(1, simBlueRem);
        const redPower = Math.max(1, simRedRem);
        const rate = Math.max(12, (b.homeSoldiers + b.opponentSoldiers) * 0.045) * speed;
        const redLoss = (bluePower / (bluePower + redPower)) * rate * delta;
        const blueLoss = (redPower / (bluePower + redPower)) * rate * delta;

        simRedRem = Math.max(0, simRedRem - redLoss);
        simBlueRem = Math.max(0, simBlueRem - blueLoss);

        if (simReportTimer >= 0.35) {
          simReportTimer = 0;
          const roundedRed = Math.round(simRedRem);
          const roundedBlue = Math.round(simBlueRem);
          let winner: 'none' | 'home' | 'opponent' | 'draw' = 'none';
          if (roundedRed <= 0 && roundedBlue <= 0) winner = 'draw';
          else if (roundedRed <= 0) winner = 'home';
          else if (roundedBlue <= 0) winner = 'opponent';
          simStepCbRef.current?.(roundedBlue, roundedRed, winner);
        }

        if (fireBurstTimer >= 0.06) {
          fireBurstTimer = 0;
          const redAlive = redArmy
            ? Math.round((simRedRem / Math.max(1, b.opponentSoldiers)) * redArmy.count)
            : 0;
          const blueAlive = blueArmy
            ? Math.round((simBlueRem / Math.max(1, b.homeSoldiers)) * blueArmy.count)
            : 0;
          if (redAlive > 0) spawnFrontProjectile(redArmy, redAlive);
          if (blueAlive > 0) spawnFrontProjectile(blueArmy, blueAlive);
          if (Math.random() < 0.25) {
            battleAudio.playShot(Math.random() - 0.5);
          }
        }
      } else {
        simRedRem = b.opponentRemaining;
        simBlueRem = b.homeRemaining;
      }

      const redAliveTarget =
        redArmy && b.opponentSoldiers > 0
          ? Math.round(
              (Math.max(0, b.status === 'fighting' ? simRedRem : b.opponentRemaining) /
                b.opponentSoldiers) *
                redArmy.count
            )
          : 0;
      const blueAliveTarget =
        blueArmy && b.homeSoldiers > 0
          ? Math.round(
              (Math.max(0, b.status === 'fighting' ? simBlueRem : b.homeRemaining) /
                b.homeSoldiers) *
                blueArmy.count
            )
          : 0;

      updateArmyInstances(
        redArmy,
        redAliveTarget,
        b.status,
        b.winnerSide,
        elapsed,
        delta,
        speed,
        combatAdvanceTime,
        b.opponentColor
      );
      updateArmyInstances(
        blueArmy,
        blueAliveTarget,
        b.status,
        b.winnerSide,
        elapsed,
        delta,
        speed,
        combatAdvanceTime,
        b.homeColor
      );

      // Update projectiles
      for (const p of projectiles) {
        if (!p.active) continue;
        p.life -= delta;
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        if (p.life <= 0 || Math.abs(p.mesh.position.x) > 54) {
          p.active = false;
          p.mesh.visible = false;
        }
      }

      // Update sparks / victory bursts
      if (b.status === 'finished' && Math.random() < 0.08) {
        const winColor = b.winnerSide === 'home' ? b.homeColor : b.opponentColor;
        spawnBurst(
          (Math.random() - 0.5) * 28,
          6 + Math.random() * 5,
          (Math.random() - 0.5) * 24,
          winColor,
          12
        );
      }

      for (const sp of sparks) {
        if (!sp.active) continue;
        sp.life -= delta;
        sp.vy -= 14 * delta;
        sp.mesh.position.x += sp.vx * delta;
        sp.mesh.position.y += sp.vy * delta;
        sp.mesh.position.z += sp.vz * delta;
        if (sp.life <= 0 || sp.mesh.position.y < 0) {
          sp.active = false;
          sp.mesh.visible = false;
        }
      }

      // Smooth Camera Preset Transitions (yields immediately when user interacts)
      if (!userInteracting) {
        const preset = cameraPresetRef.current;
        const aspectBoost =
          camera.aspect < 1 ? Math.min(1.85, 1.05 / Math.max(0.45, camera.aspect)) : 1;
        if (preset === 'cinematic') {
          const angle = elapsed * 0.2;
          _vec3.set(
            Math.sin(angle) * 62 * aspectBoost,
            28 * aspectBoost,
            Math.cos(angle) * 62 * aspectBoost
          );
          _targetVec.set(0, 2, 0);
        } else if (preset === 'red') {
          _vec3.set(-34, 16 * aspectBoost, 30 * aspectBoost);
          _targetVec.set(-14, 1.5, 0);
        } else if (preset === 'blue') {
          _vec3.set(42, 18 * aspectBoost, 36 * aspectBoost);
          _targetVec.set(22, 1.5, 0);
        } else {
          _vec3.set(0, 36 * aspectBoost, 68 * aspectBoost);
          _targetVec.set(0, 1.5, 0);
        }
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _vec3.x, 3.2, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _vec3.y, 3.2, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _vec3.z, 3.2, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetVec.x, 3.2, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetVec.y, 3.2, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetVec.z, 3.2, delta);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      onCanvasReady?.(null);
      controls.dispose();
      disposeArmy(redArmy);
      disposeArmy(blueArmy);
      currentRedFlagTex?.dispose();
      currentBlueFlagTex?.dispose();
      terrainTex.dispose();
      wallTex.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      projGeo.dispose();
      redProjMat.dispose();
      blueProjMat.dispose();
      sparkGeo.dispose();
      renderer.dispose();
    };
  }, []);

  const toggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    battleAudio.setEnabled(next);
  };

  const presetLabels: { id: CameraPreset; label: string }[] = [
    { id: 'overview', label: 'Genel Bakış' },
    { id: 'red', label: 'Kırmızı Cephe' },
    { id: 'blue', label: 'Mavi Cephe' },
    { id: 'cinematic', label: 'Sinematik' },
  ];

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070B12]">
      {webglError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <img
            src="/src/assets/images/arena_command_sky_1795466647268.jpg"
            alt="3B Savaş Alanı Arka Planı"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="relative z-10 max-w-md bg-[#0D131F]/90 border border-slate-800 rounded-xl p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">3B Görüntüleme Hazır Değil</h3>
            <p className="text-sm text-slate-300">
              Tarayıcı WebGL bağlamı başlatılamadı. Canlı asker sayıları ve savaş durumu üst panelden takip edilmeye devam etmektedir.
            </p>
          </div>
        </div>
      ) : (
        <div ref={mountRef} className="w-full h-full" />
      )}

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion, Mobile-Safe) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2.5 sm:bottom-4 z-20 flex flex-col items-center gap-1.5 sm:gap-2 px-2 sm:px-4">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-[#0D131F]/90 border border-slate-700/80 px-3 py-1 text-[11px] sm:text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Kontrolleri Göster' : 'Kontrolleri Gizle'}</span>
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 rounded-xl bg-[#0D131F]/92 border border-slate-700/80 px-2 py-1.5 sm:px-3 sm:py-2 shadow-2xl max-w-[96vw] overflow-x-auto">
            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400 pr-2 border-r border-slate-800 whitespace-nowrap shrink-0">
              <Camera className="w-3.5 h-3.5 text-sky-400" />
              <span>Kamera</span>
            </div>

            <div className="flex items-center gap-1 bg-[#141D2E] p-1 rounded-lg shrink-0">
              {presetLabels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCameraPresetChange(item.id)}
                  className={`px-2 py-1 sm:px-2.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === item.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={toggleAudio}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                audioEnabled
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-[#141D2E] border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{audioEnabled ? 'Ses Açık' : 'Ses Kapalı'}</span>
              <span className="sm:hidden">{audioEnabled ? 'Açık' : 'Ses'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
