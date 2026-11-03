// App shell: renderer, camera, pointer-lock look, input, scene switching, HUD.
import * as THREE from 'three';
import { PointerLockControls } from './vendor/PointerLockControls.js';
import { buildMoon } from './moon.js';
import { buildISS } from './iss.js';

window.__booted = true;

const canvas = document.getElementById('view');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const posEl = document.getElementById('pos');
const modeEl = document.getElementById('mode');
const lockHint = document.getElementById('lockhint');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 90000);
const controls = new PointerLockControls(camera, document.body);

const input = { keys: new Set(), pressed: new Set() };

const builders = { moon: buildMoon, iss: buildISS };
const instances = {};
let active = null;
let activeName = null;

const nextFrame = () => new Promise((r) => setTimeout(r, 10));

function setStatus(text) {
  statusEl.textContent = text;
}

async function switchTo(name) {
  if (activeName === name || !builders[name]) return;
  setStatus(`Building ${name === 'moon' ? 'the Moon' : 'the station'}…`);
  await nextFrame();
  await nextFrame();
  if (!instances[name]) instances[name] = builders[name]();
  active = instances[name];
  activeName = name;
  active.start(camera);
  renderer.render(active.scene, camera);
  setStatus('');
}

function showMenu() {
  overlay.classList.remove('hidden');
  hud.classList.add('hidden');
}

// Entering a scene always drops the menu; pointer lock is an enhancement, not
// a gate — if it is denied the view is still fully usable and the hint shows.
function showSceneUI() {
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  lockHint.classList.toggle('hidden', controls.isLocked);
}

function lock() {
  controls.lock();
}

overlay.addEventListener('click', (e) => {
  const card = e.target.closest('[data-scene]');
  if (card) {
    switchTo(card.dataset.scene).then(() => {
      showSceneUI();
      lock();
    });
  } else {
    showSceneUI();
    lock();
  }
});

hud.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-scene]');
  if (btn) switchTo(btn.dataset.scene);
});

document.addEventListener('click', () => {
  if (overlay.classList.contains('hidden') && !controls.isLocked) lock();
});

controls.addEventListener('lock', showSceneUI);
controls.addEventListener('unlock', showMenu);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys.add(e.code);
  input.pressed.add(e.code);
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  if (e.code === 'Digit1') switchTo('moon');
  if (e.code === 'Digit2') switchTo('iss');
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => input.keys.clear());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function updateHud() {
  const p = camera.position;
  posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  modeEl.textContent = active && active.getMode ? active.getMode() : '';
}

// rAF normally; falls back to a timer if the environment starves rAF
// (headless browsers, background tabs, some remote-desktop setups).
function scheduleFrame(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  setTimeout(run, 50);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
}

function animate() {
  scheduleFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (active) {
    active.update(dt, input, camera);
    renderer.render(active.scene, camera);
    updateHud();
  }
  input.pressed.clear();
}

(async function boot() {
  setStatus('Building the Moon…');
  await nextFrame();
  await nextFrame();
  instances.moon = buildMoon();
  active = instances.moon;
  activeName = 'moon';
  active.start(camera);
  renderer.render(active.scene, camera);
  setStatus('');
  animate();
})();
