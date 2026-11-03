// International Space Station: a walkable pressurized module (panel walls with
// real window openings, racks, handrails, ceiling lights), a cupola looking
// down at Earth, and an EVA mode outside with the truss, solar wings and
// radiators. Zero-g drift outside, walked corridor inside.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import {
  makePanelTexture,
  makeRackTexture,
  makeSolarTexture,
  makeMetalTexture,
  makeEarthTexture,
  makeCloudTexture,
  makeStarTexture,
} from './textures.js';

const R = 2.2; // module radius
const LEN = 14; // module length
const FLOOR = -1.9; // walk plane, close to the hull's lower surface
const EYE = 1.7;
const PORTHOLES = [-3.5, 0, 3.5]; // z positions on the +X wall

// Cylinder along Z with circular holes punched through it (indexed triangle
// filtering), so the portholes are real openings rather than painted-on glass.
function makeCylinderWithHoles(radius, length, radialSegs, heightSegs, holes) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegs, heightSegs, true);
  geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position;
  const idx = geo.index;
  const kept = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const theta = Math.atan2(cx, -cy);
    let keep = true;
    for (const h of holes) {
      let dTheta = Math.abs(theta - h.theta);
      if (dTheta > Math.PI) dTheta = 2 * Math.PI - dTheta;
      if (dTheta < h.rTheta && Math.abs(cz - h.z) < h.rZ) {
        keep = false;
        break;
      }
    }
    if (keep) kept.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos.clone());
  out.setAttribute('uv', geo.attributes.uv.clone());
  out.setIndex(kept);
  out.computeVertexNormals();
  return out;
}

// Floor plane with a circular opening (same triangle-filtering approach).
function makeFloorWithHole(width, length, segsX, segsZ, holeX, holeZ, holeR) {
  const geo = new THREE.PlaneGeometry(width, length, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const idx = geo.index;
  const kept = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if (Math.hypot(cx - holeX, cz - holeZ) > holeR) kept.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos.clone());
  out.setAttribute('uv', geo.attributes.uv.clone());
  out.setIndex(kept);
  out.computeVertexNormals();
  return out;
}

export function buildISS() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const interior = new THREE.Group();
  const exterior = new THREE.Group();
  scene.add(interior);
  scene.add(exterior);

  // ------------------------------------------------------------------ exterior
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40000, 48, 32),
    new THREE.MeshBasicMaterial({ map: makeStarTexture(2048, 1024, 7), side: THREE.BackSide, fog: false })
  );
  exterior.add(sky);

  const earthPos = new THREE.Vector3(0, -12000, 0);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 64, 48),
    new THREE.MeshStandardMaterial({
      map: makeEarthTexture(1024, 512),
      roughness: 0.8,
      metalness: 0,
      emissive: 0x1c3a5e,
      emissiveIntensity: 0.35,
      fog: false,
    })
  );
  earth.position.copy(earthPos);
  earth.rotation.x = Math.PI / 2; // an equatorial view sits under the station
  exterior.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(6080, 64, 48),
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
  exterior.add(clouds);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(6260, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0x4a90ff,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  glow.position.copy(earthPos);
  exterior.add(glow);

  const sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
  sun.position.set(2000, 3000, 1500);
  exterior.add(sun);
  exterior.add(new THREE.HemisphereLight(0x334455, 0x0a0a0a, 0.5));

  // Station exterior: hull, truss, solar wings, radiators, extra modules.
  const hullMat = new THREE.MeshStandardMaterial({ map: makeMetalTexture(), roughness: 0.55, metalness: 0.75 });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.15, R + 0.15, LEN + 0.6, 32, 1, true), hullMat);
  hull.geometry.rotateX(Math.PI / 2);
  exterior.add(hull);
  const capGeo = new THREE.CircleGeometry(R + 0.15, 32);
  for (const z of [-LEN / 2 - 0.3, LEN / 2 + 0.3]) {
    const cap = new THREE.Mesh(capGeo, hullMat);
    cap.position.z = z;
    if (z > 0) cap.rotation.y = Math.PI;
    exterior.add(cap);
  }

  const trussMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.8 });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(90, 1.1, 1.1), trussMat);
  truss.position.set(0, 4, 0);
  exterior.add(truss);
  for (let x = -42; x <= 42; x += 6) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), trussMat);
    brace.position.set(x, 4, 0);
    exterior.add(brace);
  }

  const solarMat = new THREE.MeshStandardMaterial({
    map: makeSolarTexture(),
    roughness: 0.35,
    metalness: 0.6,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(26, 0.12, 11), solarMat);
      wing.position.set(sx * 26, 4, sz * 7);
      wing.rotation.y = sz * 0.12;
      exterior.add(wing);
    }
  }
  const radiatorMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 });
  for (const sz of [-1, 1]) {
    const rad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 4), radiatorMat);
    rad.position.set(0, 4, sz * 13);
    exterior.add(rad);
  }
  const node = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 20), hullMat);
  node.geometry.rotateX(Math.PI / 2);
  node.position.set(0, 0, LEN / 2 + 5);
  exterior.add(node);
  const capsule = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 5, 16), hullMat);
  capsule.geometry.rotateX(Math.PI / 2);
  capsule.position.set(0, 0, -LEN / 2 - 4);
  exterior.add(capsule);

  // ------------------------------------------------------------------ interior
  const panelTex = makePanelTexture(1024);
  panelTex.repeat.set(8, 3);
  const wallMat = new THREE.MeshStandardMaterial({
    map: panelTex,
    side: THREE.BackSide,
    roughness: 0.7,
    metalness: 0.25,
  });

  const holes = [
    ...PORTHOLES.map((z) => ({ theta: Math.PI / 2, z, rTheta: 0.26, rZ: 0.52 })),
    // Matching opening in the hull's lower surface, under the floor's nadir
    // window, so a look straight down actually leaves the station.
    { theta: 0, z: 5.5, rTheta: 0.3, rZ: 0.6 },
  ];
  const wall = new THREE.Mesh(makeCylinderWithHoles(R, LEN, 96, 48, holes), wallMat);
  interior.add(wall);

  const capMat = new THREE.MeshStandardMaterial({ map: panelTex, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.25 });
  for (const z of [-LEN / 2, LEN / 2]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat);
    cap.position.z = z;
    if (z > 0) cap.rotation.y = Math.PI;
    interior.add(cap);
  }

  // Floor, with a circular nadir window opening near the forward end.
  const floorTex = makePanelTexture(1024);
  floorTex.repeat.set(2, 8);
  const floor = new THREE.Mesh(
    makeFloorWithHole(3.4, LEN - 0.4, 40, 160, 0, 5.5, 0.62),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x4a4d52,
      roughness: 0.85,
      metalness: 0.2,
      side: THREE.DoubleSide,
    })
  );
  floor.position.y = FLOOR;
  interior.add(floor);

  // Ceiling lights
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff6e0,
    emissiveIntensity: 1.5,
    roughness: 0.4,
  });
  for (const z of [-5, -2.5, 0, 2.5, 5]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.35), lightMat);
    lamp.position.set(0, R - 0.08, z);
    interior.add(lamp);
  }
  for (const z of [-4, 0, 4]) {
    const p = new THREE.PointLight(0xfff2dd, 5, 10, 1.8);
    p.position.set(0, R - 0.5, z);
    interior.add(p);
  }
  interior.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.42));
  const earthShine = new THREE.DirectionalLight(0x6f9fd8, 0.45);
  earthShine.position.set(0, -1, 0);
  interior.add(earthShine);

  // Racks along both sides
  const rackMat = new THREE.MeshStandardMaterial({ map: makeRackTexture(1024), roughness: 0.8, metalness: 0.3 });
  for (const sx of [-1, 1]) {
    for (const z of [-4.5, 4.5]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 2.6), rackMat);
      rack.position.set(sx * 1.8, -0.85, z);
      interior.add(rack);
    }
  }

  // Handrails
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.4, metalness: 0.7 });
  for (const sx of [-1, 1]) {
    for (const y of [-0.7, 0.7]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, LEN - 1.5, 8), railMat);
      rail.geometry.rotateX(Math.PI / 2);
      rail.position.set(sx * 1.95, y, 0);
      interior.add(rail);
    }
  }

  // Portholes: ring + glass in each punched hole
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.35, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fc4e8,
    transparent: true,
    opacity: 0.08,
    roughness: 0.05,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const z of PORTHOLES) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 12, 32), ringMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(R - 0.02, 0, z);
    interior.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(R - 0.02, 0, z);
    interior.add(glass);
  }

  // Cupola at the +Z end: rim, six window frames, nadir window
  const cupola = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 12, 40), ringMat);
  rim.position.z = LEN / 2 + 0.15;
  cupola.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.1), ringMat);
    frame.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, LEN / 2 + 0.6);
    frame.lookAt(new THREE.Vector3(Math.cos(a) * 3, Math.sin(a) * 3, LEN / 2 + 3));
    cupola.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), glassMat);
    pane.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, LEN / 2 + 0.6);
    pane.lookAt(new THREE.Vector3(Math.cos(a) * 3, Math.sin(a) * 3, LEN / 2 + 3));
    cupola.add(pane);
  }
  interior.add(cupola);

  // Nadir observation window in the floor: looking straight down puts Earth
  // in the frame, the way the real cupola's nadir window does.
  const nadirRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 12, 40), ringMat);
  nadirRing.rotation.x = Math.PI / 2;
  nadirRing.position.set(0, FLOOR, 5.5);
  interior.add(nadirRing);
  const nadirGlass = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), glassMat);
  nadirGlass.rotation.x = -Math.PI / 2;
  nadirGlass.position.set(0, FLOOR, 5.5);
  interior.add(nadirGlass);

  // ------------------------------------------------------------------ controls
  const velocity = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  let mode = 'interior'; // 'interior' | 'eva'
  let buoyancy = 0;

  function start(camera) {
    mode = 'interior';
    camera.position.set(0, FLOOR + EYE, -4.5);
    camera.lookAt(5, FLOOR + EYE, 2.5);
    velocity.set(0, 0, 0);
  }

  function enterEVA(camera) {
    mode = 'eva';
    camera.position.set(0, 0, -LEN / 2 - 6);
    camera.lookAt(0, 0, -LEN / 2 - 30);
    velocity.set(0, 0, 0);
  }

  function exitEVA(camera) {
    mode = 'interior';
    camera.position.set(0, FLOOR + EYE, -LEN / 2 + 1.2);
    camera.lookAt(0, FLOOR + EYE, 0);
    velocity.set(0, 0, 0);
  }

  function update(dt, input, camera) {
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = sprint ? 6 : 2.4;

    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, up).normalize();

    if (input.pressed.has('KeyE')) {
      if (mode === 'interior' && camera.position.z < -LEN / 2 + 1.6) enterEVA(camera);
      else if (mode === 'eva') exitEVA(camera);
    }

    if (mode === 'interior') {
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
      fwd.normalize();
      move.set(0, 0, 0);
      if (input.keys.has('KeyW')) move.add(fwd);
      if (input.keys.has('KeyS')) move.sub(fwd);
      if (input.keys.has('KeyD')) move.add(right);
      if (input.keys.has('KeyA')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        camera.position.add(move);
      }
      camera.position.y = FLOOR + EYE;
      camera.position.x = Math.max(-1.3, Math.min(1.3, camera.position.x));
      camera.position.z = Math.max(-LEN / 2 + 0.7, Math.min(LEN / 2 - 0.7, camera.position.z));
    } else {
      // Zero-g: thrust along the view, damped.
      move.set(0, 0, 0);
      if (input.keys.has('KeyW')) move.add(fwd);
      if (input.keys.has('KeyS')) move.sub(fwd);
      if (input.keys.has('KeyD')) move.add(right);
      if (input.keys.has('KeyA')) move.sub(right);
      if (input.keys.has('Space')) move.y += 1;
      if (input.keys.has('ControlLeft')) move.y -= 1;
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar((sprint ? 18 : 7) * dt);
        velocity.add(move);
      }
      velocity.multiplyScalar(Math.pow(0.35, dt));
      camera.position.addScaledVector(velocity, dt);

      // Soft boundary around the station.
      const d = camera.position.length();
      if (d > 220) {
        camera.position.multiplyScalar(220 / d);
        velocity.multiplyScalar(0.4);
      }
      buoyancy += dt;
    }

    earth.rotation.y += dt * 0.004;
    clouds.rotation.y += dt * 0.006;
  }

  return { name: 'iss', scene, start, update, getMode: () => mode };
}
