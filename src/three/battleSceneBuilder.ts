import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ArenaTheme, SoldierModelType } from '../types/battle';
import { drawCountryFlagOnCanvas } from './flagRenderer';

export interface InstancedSoldierGeometrySet {
  armorGeo: THREE.BufferGeometry;
  gearGeo: THREE.BufferGeometry;
  visorGeo: THREE.BufferGeometry;
}

function normalizeAndMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const cleaned = parts.map((raw) => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    raw.dispose();
    return g;
  });
  const merged = mergeGeometries(cleaned, false);
  cleaned.forEach((g) => g.dispose());
  if (!merged) {
    return new THREE.BoxGeometry(0.4, 1.4, 0.4);
  }
  merged.computeVertexNormals();
  return merged;
}

function transformPart(
  geo: THREE.BufferGeometry,
  tx: number,
  ty: number,
  tz: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  if (rx !== 0) geo.rotateX(rx);
  if (ry !== 0) geo.rotateY(ry);
  if (rz !== 0) geo.rotateZ(rz);
  geo.translate(tx, ty, tz);
  return geo;
}

export function buildInstancedSoldierGeometries(
  modelType: SoldierModelType
): InstancedSoldierGeometrySet {
  const s = modelType === 'heavy' ? 1.18 : modelType === 'commando' ? 0.98 : 1.04;
  const pauldronW = modelType === 'heavy' ? 0.24 : 0.16;
  const rifleLen = modelType === 'heavy' ? 0.92 : 0.72;

  const armorParts: THREE.BufferGeometry[] = [];
  const gearParts: THREE.BufferGeometry[] = [];
  const visorParts: THREE.BufferGeometry[] = [];

  // 1-2. Boots & Legs (resting flush at y = 0)
  gearParts.push(transformPart(new THREE.BoxGeometry(0.18, 0.54, 0.2), -0.14, 0.39, 0));
  gearParts.push(transformPart(new THREE.BoxGeometry(0.18, 0.54, 0.2), 0.14, 0.39, 0));
  gearParts.push(transformPart(new THREE.BoxGeometry(0.2, 0.14, 0.28), -0.14, 0.07, 0.03));
  gearParts.push(transformPart(new THREE.BoxGeometry(0.2, 0.14, 0.28), 0.14, 0.07, 0.03));

  // 3. Torso Armor
  armorParts.push(transformPart(new THREE.BoxGeometry(0.5 * s, 0.64, 0.32 * s), 0, 0.98, 0));

  // 4. Tactical Backpack
  gearParts.push(transformPart(new THREE.BoxGeometry(0.36, 0.44, 0.18), 0, 1.0, -0.22 * s));

  // 5. Shoulder Pauldrons
  armorParts.push(transformPart(new THREE.BoxGeometry(pauldronW, 0.18, 0.28), -0.32 * s, 1.24, 0));
  armorParts.push(transformPart(new THREE.BoxGeometry(pauldronW, 0.18, 0.28), 0.32 * s, 1.24, 0));

  // 6. Head & Model-specific Helmet / Shako
  gearParts.push(transformPart(new THREE.BoxGeometry(0.26, 0.26, 0.26), 0, 1.46, 0));

  if (modelType === 'guard') {
    gearParts.push(transformPart(new THREE.CylinderGeometry(0.17, 0.19, 0.28, 8), 0, 1.66, 0));
  } else if (modelType === 'commando') {
    armorParts.push(
      transformPart(new THREE.SphereGeometry(0.2, 8, 6), 0, 1.54, 0, 0, 0, 0, 1, 0.85, 1.05)
    );
  } else if (modelType === 'heavy') {
    armorParts.push(transformPart(new THREE.BoxGeometry(0.36, 0.32, 0.36), 0, 1.52, 0));
  } else {
    gearParts.push(
      transformPart(
        new THREE.SphereGeometry(0.21, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
        0,
        1.5,
        0
      )
    );
  }

  // 7. Tactical Visor (accent emissive layer)
  visorParts.push(transformPart(new THREE.BoxGeometry(0.24, 0.08, 0.08), 0, 1.48, 0.15));

  // 8. Left Stabilizer Arm + Right Firing Arm
  armorParts.push(transformPart(new THREE.BoxGeometry(0.14, 0.46, 0.16), -0.34 * s, 0.96, 0.14, -0.65));
  armorParts.push(
    transformPart(new THREE.BoxGeometry(0.14, 0.44, 0.16), 0.32 * s, 1.06, 0.16, -Math.PI / 2.2)
  );

  // 9. Rifle
  gearParts.push(
    transformPart(
      new THREE.BoxGeometry(0.09, 0.13, rifleLen),
      0.22 * s,
      1.04,
      0.44 + rifleLen * 0.18
    )
  );

  return {
    armorGeo: normalizeAndMerge(armorParts),
    gearGeo: normalizeAndMerge(gearParts),
    visorGeo: normalizeAndMerge(visorParts),
  };
}

export function createFlagTexture(
  countryCode: string,
  flagEmoji: string,
  countryName: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawCountryFlagOnCanvas(ctx, countryCode, 512, 320, flagEmoji, accentHex, countryName);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTerrainTexture(theme: ArenaTheme, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const palette =
      theme === 'desert'
        ? { base: '#5c4b37', accent: '#756046', grid: 'rgba(255,235,200,0.06)' }
        : theme === 'alpine'
        ? { base: '#334155', accent: '#475569', grid: 'rgba(226,232,240,0.07)' }
        : { base: '#1e293b', accent: '#273549', grid: 'rgba(148,163,184,0.06)' };

    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 420; i++) {
      const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * 512;
      const y = (Math.cos(i * 37.7) * 0.5 + 0.5) * 512;
      const r = 4 + (i % 14);
      ctx.fillStyle = i % 2 === 0 ? palette.accent : 'rgba(15,23,42,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let g = 0; g <= 512; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createWallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 6;
    for (let x = 0; x <= 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 512, 24);
    ctx.fillStyle = '#111827';
    for (let sx = -32; sx < 544; sx += 40) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + 20, 0);
      ctx.lineTo(sx + 8, 24);
      ctx.lineTo(sx - 12, 24);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(12, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
