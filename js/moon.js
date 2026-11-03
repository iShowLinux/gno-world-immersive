// High-resolution lunar surface: procedural terrain (fBm + crater field),
// 2K albedo and a derived normal map, Earth in a star-filled sky, a landed
// module, flag, scattered rocks and drifting dust. First-person walking with
// lunar gravity.
import * as THREE from 'three';
import { mulberry32, fbm2, ridged2 } from './noise.js';
import {
  makeMoonAlbedo,
  makeNormalFromHeight,
  makeEarthTexture,
  makeCloudTexture,
  makeStarTexture,
  makeFlagTexture,
  makeGoldTexture,
  makeMetalTexture,
  makeDustSprite,
  makeTileableNormalTexture,
} from './textures.js';

export const WORLD = 1000;
const SEG = 512;
const HRES = 1024;
const EYE = 1.7;
const GRAVITY = 1.62; // m/s^2, the real lunar value

// ---------------------------------------------------------------------------
// Terrain

function buildCraters(count, seed) {
  const rng = mulberry32(seed);
  const craters = [];
  for (let i = 0; i < count; i++) {
    craters.push({
      x: rng(),
      y: rng(),
      r: 0.002 + Math.pow(rng(), 2.2) * 0.035,
      depth: 0.6 + rng() * 2.6,
    });
  }
  // A few guaranteed craters around the spawn point (uv 0.5,0.5 = origin).
  craters.push(
    { x: 0.46, y: 0.52, r: 0.021, depth: 2.3 },
    { x: 0.55, y: 0.47, r: 0.014, depth: 1.6 },
    { x: 0.5, y: 0.585, r: 0.01, depth: 1.2 },
    { x: 0.585, y: 0.55, r: 0.027, depth: 2.9 },
    { x: 0.415, y: 0.44, r: 0.008, depth: 0.9 },
    { x: 0.53, y: 0.62, r: 0.006, depth: 0.7 }
  );
  return craters;
}

// Uniform grid so each heightfield texel only tests nearby craters.
function buildCraterGrid(craters, cells = 64) {
  const grid = new Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const c of craters) {
    const r = c.r * 1.5;
    const x0 = Math.max(0, Math.floor((c.x - r) * cells));
    const x1 = Math.min(cells - 1, Math.floor((c.x + r) * cells));
    const y0 = Math.max(0, Math.floor((c.y - r) * cells));
    const y1 = Math.min(cells - 1, Math.floor((c.y + r) * cells));
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) grid[j * cells + i].push(c);
    }
  }
  return { grid, cells };
}

function buildHeightField() {
  const craters = buildCraters(320, 1337);
  const { grid, cells } = buildCraterGrid(craters);
  const hm = new Float32Array(HRES * HRES);

  for (let j = 0; j < HRES; j++) {
    const v = j / (HRES - 1);
    const cv = Math.min(cells - 1, Math.floor(v * cells));
    for (let i = 0; i < HRES; i++) {
      const u = i / (HRES - 1);
      const cu = Math.min(cells - 1, Math.floor(u * cells));
      let h = (fbm2(u * 6, v * 6, 5) - 0.5) * 14;
      h += (ridged2(u * 3 + 11, v * 3 + 5, 4) - 0.5) * 10;
      const list = grid[cv * cells + cu];
      for (let k = 0; k < list.length; k++) {
        const c = list[k];
        const dx = (u - c.x) * WORLD;
        const dy = (v - c.y) * WORLD;
        const d2 = dx * dx + dy * dy;
        const R = c.r * WORLD;
        if (d2 < R * R * 2.25) {
          const d = Math.sqrt(d2);
          const t = d / R;
          if (t < 1) h -= c.depth * (1 - t * t) * (1 - t * t);
          h += c.depth * 0.35 * Math.exp(-Math.pow((t - 1) * 3.2, 2));
        }
      }
      hm[j * HRES + i] = h;
    }
  }
  return { hm, craters };
}

function makeSampler(hm) {
  return (x, z) => {
    let u = ((x + WORLD / 2) / WORLD) * (HRES - 1);
    let v = ((z + WORLD / 2) / WORLD) * (HRES - 1);
    u = Math.max(0, Math.min(HRES - 1.001, u));
    v = Math.max(0, Math.min(HRES - 1.001, v));
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const a = hm[j * HRES + i];
    const b = hm[j * HRES + i + 1];
    const c = hm[(j + 1) * HRES + i];
    const d = hm[(j + 1) * HRES + i + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
}

// ---------------------------------------------------------------------------
// Props

function buildLander() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ map: makeGoldTexture(), roughness: 0.35, metalness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ map: makeMetalTexture(), roughness: 0.45, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 2.2, 14), gold);
  body.position.y = 2.6;
  g.add(body);

  const ascent = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 1.6, 10), metal);
  ascent.position.y = 4.4;
  g.add(ascent);

  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 14), dark);
  nozzle.position.y = 1.15;
  g.add(nozzle);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), metal);
    leg.position.set(Math.cos(a) * 2.9, 1.4, Math.sin(a) * 2.9);
    leg.rotation.z = Math.cos(a) * 0.5;
    leg.rotation.x = -Math.sin(a) * 0.5;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 10), dark);
    foot.position.set(Math.cos(a) * 3.7, 0.08, Math.sin(a) * 3.7);
    g.add(foot);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), metal);
  mast.position.y = 6.2;
  g.add(mast);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    metal
  );
  dish.position.y = 7.2;
  dish.rotation.x = Math.PI;
  g.add(dish);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function buildFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 3.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.85, roughness: 0.35 })
  );
  pole.position.y = 1.55;
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.05),
    new THREE.MeshStandardMaterial({ map: makeFlagTexture(), side: THREE.DoubleSide, roughness: 0.95 })
  );
  flag.position.set(0.87, 2.55, 0);
  g.add(flag);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// ---------------------------------------------------------------------------
// Scene

export function buildMoon() {
  const { hm, craters } = buildHeightField();
  const sample = makeSampler(hm);
  const heightAtUV = (u, v) => sample((u - 0.5) * WORLD, (v - 0.5) * WORLD);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.00085);

  // Sky
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 48, 32),
    new THREE.MeshBasicMaterial({ map: makeStarTexture(2048, 1024), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // Earth, low over the horizon
  const earthPos = new THREE.Vector3(2200, 1400, -7500);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(500, 48, 32),
    new THREE.MeshStandardMaterial({
      map: makeEarthTexture(1024, 512),
      roughness: 0.75,
      metalness: 0,
      emissive: 0x1c3a5e,
      emissiveIntensity: 0.3,
      fog: false,
    })
  );
  earth.position.copy(earthPos);
  earth.rotation.x = Math.PI / 2; // an equatorial view sits under the station
  scene.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(517, 48, 32),
    new THREE.MeshStandardMaterial({
      map: makeCloudTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      fog: false,
    })
  );
  clouds.position.copy(earthPos);
  clouds.rotation.x = Math.PI / 2;
  scene.add(clouds);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(542, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4a90ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  glow.position.copy(earthPos);
  scene.add(glow);

  // Sun + shadows
  const sun = new THREE.DirectionalLight(0xfff3e0, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 130;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x1a2a44, 0x0a0a0a, 0.45));

  // Terrain
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, sample(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const albedo = makeMoonAlbedo(2048, heightAtUV, craters, WORLD);
  const normal = makeNormalFromHeight(hm, 1024, WORLD, 1.6);
  const detailNormal = makeTileableNormalTexture(512, 24, 4, 1);
  const detailRepeat = new THREE.Vector2(26, 26);
  const terrainMat = new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(2.0, 2.0),
    roughness: 0.97,
    metalness: 0,
  });
  // Blend a tiled micro-relief normal over the macro normal map so the ground
  // keeps fine detail where the 2 m geometry quads run out.
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.detailNormalMap = { value: detailNormal };
    shader.uniforms.detailRepeat = { value: detailRepeat };
    const source = shader.fragmentShader;
    const patched =
      'uniform sampler2D detailNormalMap;\nuniform vec2 detailRepeat;\n' +
      source.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n' +
          '\t\tvec3 detN = texture2D( detailNormalMap, vNormalMapUv * detailRepeat ).xyz * 2.0 - 1.0;\n' +
          '\t\tmapN = normalize( mapN + detN * 1.3 );'
      );
    shader.fragmentShader = patched;
  };
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Distant mountain ring, tucked under the terrain edge and faded by fog.
  const ringGeo = new THREE.RingGeometry(400, 4200, 160, 12);
  ringGeo.rotateX(-Math.PI / 2);
  const rpos = ringGeo.attributes.position;
  for (let i = 0; i < rpos.count; i++) {
    const x = rpos.getX(i);
    const z = rpos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    let y = -20;
    if (r > 550) {
      const t = Math.min(1, (r - 550) / 500);
      y = -20 + Math.max(0, ridged2(x * 0.0016 + 3, z * 0.0016 + 3, 5) - 0.42) * 340 * t;
    }
    rpos.setY(i, y);
  }
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 1, metalness: 0 })
  );
  ring.receiveShadow = true;
  scene.add(ring);

  // Props
  const lander = buildLander();
  lander.position.set(48, sample(48, -72), -72);
  lander.rotation.y = 0.6;
  scene.add(lander);

  const flag = buildFlag();
  flag.position.set(18, sample(18, -28), -28);
  scene.add(flag);

  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7c7c, roughness: 1, metalness: 0 });
  const rng = mulberry32(99);
  for (let i = 0; i < 130; i++) {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const a = rng() * Math.PI * 2;
    const r = 6 + Math.pow(rng(), 1.6) * 250;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.12 + Math.pow(rng(), 2.2) * 2.3;
    m.position.set(x, sample(x, z) + s * 0.3, z);
    m.scale.set(s, s * (0.55 + rng() * 0.5), s);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Drifting dust
  const DN = 900;
  const dustPos = new Float32Array(DN * 3);
  const drng = mulberry32(5);
  for (let i = 0; i < DN; i++) {
    dustPos[i * 3] = (drng() - 0.5) * 120;
    dustPos[i * 3 + 1] = drng() * 8;
    dustPos[i * 3 + 2] = (drng() - 0.5) * 120;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.32,
      map: makeDustSprite(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  scene.add(dust);

  // --- controller state ---
  const velocity = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  const startPos = new THREE.Vector3(0, sample(0, 0) + EYE, 0);
  let onGround = false;

  function start(camera) {
    camera.position.copy(startPos);
    const look = new THREE.Vector3(60, 12, -190).add(startPos);
    camera.lookAt(look);
    camera.rotation.z = 0;
    velocity.set(0, 0, 0);
    sun.position.set(camera.position.x + 500, camera.position.y + 700, camera.position.z + 300);
    sun.target.position.copy(camera.position);
  }

  function update(dt, input, camera) {
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = sprint ? 9 : 3.6;

    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.crossVectors(fwd, up).normalize();

    move.set(0, 0, 0);
    if (input.keys.has('KeyW')) move.add(fwd);
    if (input.keys.has('KeyS')) move.sub(fwd);
    if (input.keys.has('KeyD')) move.add(right);
    if (input.keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      camera.position.add(move);
    }

    const ground = sample(camera.position.x, camera.position.z) + EYE;
    velocity.y -= GRAVITY * dt;
    camera.position.y += velocity.y * dt;
    if (camera.position.y <= ground) {
      camera.position.y = ground;
      velocity.y = 0;
      onGround = true;
    } else {
      onGround = false;
    }
    if (input.keys.has('Space') && onGround) velocity.y = 3.4;

    const lim = WORLD / 2 - 8;
    camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
    camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));

    // Keep the shadow box centred on the player.
    sun.position.set(camera.position.x + 500, camera.position.y + 700, camera.position.z + 300);
    sun.target.position.copy(camera.position);
    sun.target.updateMatrixWorld();

    dust.rotation.y += dt * 0.012;
    earth.rotation.y += dt * 0.004;
    clouds.rotation.y += dt * 0.006;
  }

  return { name: 'moon', scene, start, update };
}
