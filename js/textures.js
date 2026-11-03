// Procedural textures. Everything is generated on a canvas at runtime so the
// repo ships no binary art assets and works offline.
import * as THREE from 'three';
import { fbm2, fbm3, fbmPeriodic, ridged2, mulberry32, hash2 } from './noise.js';

function canvasOf(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = false, aniso = 16 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Low-res noise fields, bilinearly sampled by the big texture loops so a 2K/4K
// albedo stays cheap to build.
function noiseBuffer(res, fn) {
  const buf = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    const v = j / res;
    for (let i = 0; i < res; i++) {
      buf[j * res + i] = fn(i / res, v);
    }
  }
  return buf;
}

function sampleBuf(buf, res, u, v) {
  const x = Math.min(res - 1.001, Math.max(0, u * res));
  const y = Math.min(res - 1.001, Math.max(0, v * res));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fu = x - i;
  const fv = y - j;
  const a = buf[j * res + i];
  const b = buf[j * res + i + 1];
  const c = buf[(j + 1) * res + i];
  const d = buf[(j + 1) * res + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

// ---------------------------------------------------------------------------
// Moon

export function makeMoonAlbedo(size, heightAt, craters, worldSize) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  // Precomputed fields: the albedo loop below only samples them.
  // Grain runs near the texture's Nyquist limit so the near ground keeps
  // centimetre-scale detail instead of soft 10 m blotches.
  const grain = noiseBuffer(2048, (u, v) => fbm2(u * 450, v * 450, 2));
  const maria = noiseBuffer(256, (u, v) => fbm2(u * 3 + 7.3, v * 3 + 3.1, 3));

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const h = heightAt(u, v);
      let g = 0.62 + (sampleBuf(grain, 2048, u, v) - 0.5) * 0.5;
      const m = sampleBuf(maria, 256, u, v);
      if (m > 0.56) g *= 0.66 + (m - 0.56) * 0.5;
      g *= 0.82 + Math.max(-1, Math.min(1, h * 0.06)) * 0.28;
      g += (hash2(x, y) - 0.5) * 0.05;
      const val = Math.max(0, Math.min(255, g * 255));
      const i = (y * size + x) * 4;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Crisp crater rims and floors drawn vectorially over the pixel noise.
  for (const c of craters) {
    const cx = c.x * size;
    const cy = c.y * size;
    const r = c.r * size;
    if (r < 2) continue;

    let grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fill();

    grad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.85, 'rgba(255,255,255,0.38)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, 0, 6.2832);
    ctx.fill();
  }

  return toTexture(canvas);
}

// Sobel normal map from a square heightmap (Float32Array, res*res).
export function makeNormalFromHeight(hm, res, worldSize, strength = 1) {
  const canvas = canvasOf(res);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(res, res);
  const d = img.data;
  const s = strength * (worldSize / res) * 0.6;

  for (let j = 0; j < res; j++) {
    const jd = j - 1 < 0 ? 0 : j - 1;
    const ju = j + 1 >= res ? res - 1 : j + 1;
    for (let i = 0; i < res; i++) {
      const il = i - 1 < 0 ? 0 : i - 1;
      const ir = i + 1 >= res ? res - 1 : i + 1;
      const dx = (hm[j * res + ir] - hm[j * res + il]) * s;
      const dy = (hm[ju * res + i] - hm[jd * res + i]) * s;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const k = (j * res + i) * 4;
      d[k] = (nx * 0.5 + 0.5) * 255;
      d[k + 1] = (ny * 0.5 + 0.5) * 255;
      d[k + 2] = (nz * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { srgb: false, aniso: 8 });
}

// Tileable micro-relief normal map, blended over the macro normal map in the
// terrain shader so close-up ground keeps its detail.
export function makeTileableNormalTexture(size = 512, baseCells = 24, octaves = 4, strength = 1) {
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const v = j / size;
    for (let i = 0; i < size; i++) {
      h[j * size + i] = fbmPeriodic(i / size, v, baseCells, octaves);
    }
  }
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const s = strength * baseCells * 0.12;
  for (let j = 0; j < size; j++) {
    const jd = (j - 1 + size) % size;
    const ju = (j + 1) % size;
    for (let i = 0; i < size; i++) {
      const il = (i - 1 + size) % size;
      const ir = (i + 1) % size;
      const dx = (h[j * size + ir] - h[j * size + il]) * s;
      const dy = (h[ju * size + i] - h[jd * size + i]) * s;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const k = (j * size + i) * 4;
      d[k] = (nx * 0.5 + 0.5) * 255;
      d[k + 1] = (ny * 0.5 + 0.5) * 255;
      d[k + 2] = (nz * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { srgb: false, repeat: true });
}

// ---------------------------------------------------------------------------
// Earth (equirectangular, for a sphere)

export function makeEarthTexture(w = 1024, h = 512) {
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (0.5 - v) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const lon = (u - 0.5) * Math.PI * 2;
      const cx = cl * Math.cos(lon);
      const cy = sl;
      const cz = cl * Math.sin(lon);
      const n = fbm3(cx * 2.4 + 5.2, cy * 2.4 + 5.2, cz * 2.4 + 5.2, 4);
      const detail = fbm3(cx * 9 + 1, cy * 9 + 1, cz * 9 + 1, 3);

      let r;
      let g;
      let b;
      const land = n > 0.54;
      if (land) {
        const t = Math.min(1, (n - 0.54) * 6);
        r = 55 + t * 95 + detail * 45;
        g = 85 + t * 75 + detail * 35;
        b = 45 + t * 40 + detail * 25;
        if (Math.abs(lat) < 0.45 && detail > 0.55) {
          r += 65;
          g += 45;
          b += 15;
        }
      } else {
        const depth = Math.min(1, (0.54 - n) * 5);
        r = 8 + (1 - depth) * 26;
        g = 38 + (1 - depth) * 58;
        b = 88 + (1 - depth) * 82;
      }
      const ice = Math.abs(lat) > 1.12 + (detail - 0.5) * 0.22;
      if (ice) {
        r = 225;
        g = 232;
        b = 240;
      }
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

export function makeCloudTexture(w = 512, h = 256) {
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (0.5 - v) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const lon = (u - 0.5) * Math.PI * 2;
      const n = fbm3(cl * Math.cos(lon) * 3 + 2, sl * 3 + 2, cl * Math.sin(lon) * 3 + 2, 5);
      const a = Math.max(0, Math.min(1, (n - 0.6) * 4));
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = a * 170;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

// ---------------------------------------------------------------------------
// Stars

export function makeStarTexture(w = 2048, h = 1024, seed = 42) {
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const band = Math.exp(-Math.pow((v - 0.5 - (u - 0.5) * 0.35) * 7.0, 2));
      const n = fbm2(u * 26, v * 26, 4);
      const glow = band * Math.max(0, n - 0.42) * 0.4;
      const val = glow * 130;
      const i = (y * w + x) * 4;
      d[i] = val * 0.85;
      d[i + 1] = val * 0.92;
      d[i + 2] = val * 1.15;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rng = mulberry32(seed);
  for (let i = 0; i < 12000; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const b = 0.25 + rng() * 0.75;
    const s = 1;
    const warm = rng();
    const r = 255 * b;
    const g = 255 * b * (0.85 + warm * 0.15);
    const bl = 255 * b * (0.8 + (1 - warm) * 0.2);
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${0.5 + rng() * 0.5})`;
    ctx.fillRect(x, y, s, s);
  }
  return toTexture(canvas);
}

// ---------------------------------------------------------------------------
// ISS materials

export function makePanelTexture(size = 1024) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cfd2d4';
  ctx.fillRect(0, 0, size, size);

  const rng = mulberry32(7);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 16;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Panel seams on a tileable grid.
  const step = size / 8;
  ctx.strokeStyle = 'rgba(70,74,78,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  // Rivets.
  ctx.fillStyle = 'rgba(90,94,98,0.8)';
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const p = i * step;
      const q = j * step;
      ctx.beginPath();
      ctx.arc((p + step / 2) % size, (q + step / 2) % size, 2.2, 0, 6.2832);
      ctx.fill();
    }
  }
  // Labels.
  ctx.fillStyle = 'rgba(40,44,48,0.75)';
  ctx.font = '600 22px monospace';
  ctx.fillText('NODE 1', step * 0.4, step * 0.9);
  ctx.fillText('OVHD', step * 0.4, step * 0.55);
  return toTexture(canvas, { repeat: true, aniso: 8 });
}

export function makeRackTexture(size = 512) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(19);
  for (let i = 0; i < 26; i++) {
    const w = 20 + rng() * 70;
    const h = 14 + rng() * 40;
    const x = rng() * (size - w);
    const y = rng() * (size - h);
    const shade = 60 + rng() * 90;
    ctx.fillStyle = `rgb(${shade | 0},${(shade + 6) | 0},${(shade + 12) | 0})`;
    ctx.fillRect(x, y, w, h);
    if (rng() < 0.4) {
      ctx.fillStyle = 'rgba(120,200,255,0.75)';
      ctx.fillRect(x + 3, y + 3, w * 0.4, h * 0.28);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  return toTexture(canvas);
}

export function makeSolarTexture(w = 1024, h = 512) {
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0a1a3a');
  grad.addColorStop(0.5, '#122a5c');
  grad.addColorStop(1, '#081430');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(180,200,255,0.35)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  return toTexture(canvas, { repeat: true });
}

export function makeGoldTexture(size = 512) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = ridged2(x * 0.03, y * 0.03, 5);
      const v = 0.55 + n * 0.45;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, 200 * v + 40);
      d[i + 1] = Math.min(255, 150 * v + 25);
      d[i + 2] = Math.min(255, 40 * v);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { repeat: true });
}

export function makeMetalTexture(size = 512) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rng = mulberry32(31);
  for (let i = 0; i < d.length; i += 4) {
    const n = 150 + (rng() - 0.5) * 30;
    d[i] = n;
    d[i + 1] = n + 3;
    d[i + 2] = n + 6;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { repeat: true });
}

export function makeDustSprite(size = 64) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, { srgb: false });
}

export function makeFlagTexture(w = 512, h = 320) {
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1b3a';
  ctx.fillRect(0, 0, w, h);
  // Earth disc
  ctx.fillStyle = '#3f7fd6';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, h * 0.26, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = '#6fae5c';
  ctx.beginPath();
  ctx.ellipse(w / 2 - 12, h * 0.38, h * 0.1, h * 0.07, 0.4, 0, 6.2832);
  ctx.fill();
  // Moon disc
  ctx.fillStyle = '#c9ccd1';
  ctx.beginPath();
  ctx.arc(w / 2 + h * 0.2, h * 0.3, h * 0.09, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(h * 0.16)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('GNO.WORLD', w / 2, h * 0.86);
  return toTexture(canvas);
}
