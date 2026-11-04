import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas = document.querySelector('#game');
const loading = document.querySelector('#loading');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(96, innerWidth / innerHeight, .1, 180);
camera.rotation.order = 'YXZ';
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 6.5;
const world = new Map();
const editableTypes = ['grass', 'wood', 'stone', 'glow'];
const inventory = { grass: 12, wood: 8, stone: 8, glow: 4 };
const selectedType = { value: 'grass' };
const blockDefs = {
  grass: { side: '#8a7554', top: '#76a86a', bottom: '#6f634d', name: 'Grass' },
  dirt: { side: '#846b4d', top: '#846b4d', bottom: '#70583f' },
  stone: { side: '#899494', top: '#a2aaa4', bottom: '#68777a', name: 'Stone' },
  sand: { side: '#c5ad7c', top: '#e0cf9e', bottom: '#b59a68' },
  wood: { side: '#956643', top: '#bd8b5a', bottom: '#755039', name: 'Wood' },
  leaves: { side: '#55845c', top: '#6e9a69', bottom: '#426d4e' },
  glow: { side: '#e7ca78', top: '#fff0a4', bottom: '#d8a957', name: 'Glow', glow: true },
  beacon: { side: '#5e7779', top: '#92b2a7', bottom: '#405e66' },
};
const keyOf = (x, y, z) => `${x},${y},${z}`;
const blockGeom = new THREE.BoxGeometry(1, 1, 1);
blockGeom.clearGroups();
// BoxGeometry's six face groups are ordered +X, -X, +Y, -Y, +Z, -Z.
for (let face = 0; face < 6; face++) blockGeom.addGroup(face * 6, 6, face === 2 ? 0 : face === 3 ? 2 : 1);
const blockMaterials = {};
for (const [type, def] of Object.entries(blockDefs)) {
  blockMaterials[type] = [
    new THREE.MeshStandardMaterial({ color: def.top, roughness: .88, emissive: def.glow ? '#7a5415' : '#000000', emissiveIntensity: def.glow ? .4 : 0 }),
    new THREE.MeshStandardMaterial({ color: def.side, roughness: .92, emissive: def.glow ? '#7a5415' : '#000000', emissiveIntensity: def.glow ? .3 : 0 }),
    new THREE.MeshStandardMaterial({ color: def.bottom, roughness: .96 }),
  ];
}
const addBlock = (x, y, z, type, fixed = false) => {
  const key = keyOf(x, y, z);
  world.set(key, { x, y, z, type, fixed });
};
let blockMeshes = [];
function rebuildBlocks() {
  for (const mesh of blockMeshes) { scene.remove(mesh); mesh.dispose?.(); }
  blockMeshes = [];
  const groups = {};
  for (const block of world.values()) (groups[block.type] ??= []).push(block);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const [type, blocks] of Object.entries(groups)) {
    const mesh = new THREE.InstancedMesh(blockGeom, blockMaterials[type], blocks.length);
    mesh.userData.blockType = type;
    mesh.userData.blocks = blocks;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    blocks.forEach((b, i) => {
      matrix.makeTranslation(b.x, b.y, b.z);
      mesh.setMatrixAt(i, matrix);
      const variation = 0.94 + (((b.x * 17 + b.z * 31 + b.y * 11) % 9 + 9) % 9) * .014;
      tint.setScalar(variation);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    blockMeshes.push(mesh);
  }
}
function topAt(x, z) {
  const ix = Math.round(x), iz = Math.round(z);
  for (let y = 16; y >= -8; y--) if (world.has(keyOf(ix, y, iz))) return y + .5;
  return -30;
}
function hash(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function terrainHeight(x, z) {
  const r = Math.sqrt((x / 10.4) ** 2 + (z / 9.2) ** 2);
  if (r > 1) return -99;
  return Math.floor((1 - r) * 2.2 + Math.sin(x * .65) * .23 + Math.cos(z * .7) * .2 + hash(x, z) * .5);
}
for (let x = -12; x <= 12; x++) for (let z = -11; z <= 11; z++) {
  const h = terrainHeight(x, z);
  if (h < 0) continue;
  const r = Math.sqrt((x / 10.4) ** 2 + (z / 9.2) ** 2);
  for (let y = -4; y <= h; y++) {
    let type = y === h ? (r > .82 ? 'sand' : 'grass') : y >= h - 1 ? 'dirt' : 'stone';
    if (y === -4 && r > .72 && hash(x + 33, z - 11) > .42) continue;
    addBlock(x, y, z, type, true);
  }
}
// Soft, stepped underside gives the island a floating, hand-built silhouette.
for (let x = -8; x <= 8; x++) for (let z = -7; z <= 7; z++) {
  const r = Math.sqrt((x / 9) ** 2 + (z / 8) ** 2);
  if (r < .88 && r > .68 && hash(x + 50, z + 29) > .28) addBlock(x, -5, z, 'stone', true);
}

const hemi = new THREE.HemisphereLight('#e7f8ff', '#685c46', 1.65);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight('#fff0d1', 2.5);
sunLight.castShadow = !isTouch;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -22; sunLight.shadow.camera.right = 22;
sunLight.shadow.camera.top = 22; sunLight.shadow.camera.bottom = -22;
sunLight.shadow.bias = -.0007;
scene.add(sunLight, sunLight.target);
const fill = new THREE.DirectionalLight('#b7e5ef', .45);
fill.position.set(-12, 8, 10); scene.add(fill);
scene.fog = new THREE.FogExp2('#b7e0ec', .008);
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#78b9d1', roughness: .34, metalness: .05 }));
ocean.rotation.x = -Math.PI / 2; ocean.position.y = -7.5; ocean.receiveShadow = true; scene.add(ocean);
const islandMist = new THREE.Group(); scene.add(islandMist);
for (let i = 0; i < 13; i++) {
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#f1fbff', transparent: true, opacity: .16, depthWrite: false }));
  const a = i / 13 * Math.PI * 2; cloud.position.set(Math.cos(a) * (11 + hash(i, 3) * 5), -4 + hash(3, i) * 2, Math.sin(a) * (10 + hash(i, 7) * 4));
  cloud.scale.set(2.2 + hash(4, i), .7 + hash(5, i) * .5, 1.5 + hash(6, i)); islandMist.add(cloud);
}
const skyObjects = new THREE.Group(); scene.add(skyObjects);
function addCloud(x, y, z, scale = 1) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#f8fdff', transparent: true, opacity: .8 });
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(1.7, .7 + hash(i, x) * .7, 1.5), mat);
    puff.position.set((i - 2.5) * .8, hash(i, z) * .35, (hash(i + 8, x) - .5) * 1.2);
    group.add(puff);
  }
  group.position.set(x, y, z); group.scale.setScalar(scale); skyObjects.add(group); return group;
}
const clouds = [addCloud(-19, 9, -15, 1.7), addCloud(18, 12, -22, 1.5), addCloud(20, 7, 11, 1.2), addCloud(-22, 13, 7, 1.4)];
function makeTree(x, z, size = 1) {
  const ground = Math.max(0, terrainHeight(x, z));
  for (let y = 1; y <= 3 * size; y++) addBlock(x, ground + y, z, 'wood', true);
  const cy = ground + Math.ceil(3 * size);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) {
    const d = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * .65;
    if (d < 3.1 && dy <= 1 && hash(x + dx * 3, z + dz * 5 + dy) > .12) addBlock(x + dx, cy + dy, z + dz, 'leaves', true);
  }
}
[[ -7, -4, 1 ], [7, -5, 1], [2, -8, .8]].forEach(t => makeTree(...t));
// Keep the spawn-side path clear so the island view is not blocked by foreground props.
// Restored by gathering all five fragments.
const beacon = new THREE.Group(); scene.add(beacon);
const beaconBaseY = topAt(0, -1) + .5;
for (const [x, z] of [[0, -1], [1, -1], [0, 0], [1, 0]]) addBlock(x, Math.floor(beaconBaseY), z, 'beacon', true);
addBlock(0, Math.floor(beaconBaseY) + 1, 0, 'beacon', true);
addBlock(0, Math.floor(beaconBaseY) + 2, 0, 'beacon', true);
const beaconCore = new THREE.Mesh(new THREE.OctahedronGeometry(.58, 0), new THREE.MeshStandardMaterial({ color: '#ffe49a', emissive: '#e8a84a', emissiveIntensity: .35, roughness: .25, metalness: .12 }));
beaconCore.position.set(.5, beaconBaseY + 2.8, -.5); beacon.add(beaconCore);
const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(.86, .035, 8, 48), new THREE.MeshBasicMaterial({ color: '#f4d28a', transparent: true, opacity: .5 }));
beaconRing.position.copy(beaconCore.position); beaconRing.rotation.x = Math.PI / 2; beacon.add(beaconRing);
const beaconLight = new THREE.PointLight('#ffd77c', .5, 12); beaconLight.position.copy(beaconCore.position); beacon.add(beaconLight);
const beaconHalo = new THREE.Mesh(new THREE.CylinderGeometry(.08, .42, 3, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#f8d994', transparent: true, opacity: .04, side: THREE.DoubleSide, depthWrite: false }));
beaconHalo.position.set(.5, beaconBaseY + 2.5, -.5); beacon.add(beaconHalo);

const shardPositions = [[8, 1], [-8, -1], [4, -7], [-4, 7], [7, 6]];
const shards = [];
for (let i = 0; i < shardPositions.length; i++) {
  const [x, z] = shardPositions[i], y = Math.max(0, terrainHeight(x, z)) + 1.35;
  const group = new THREE.Group(); group.position.set(x, y, z); group.userData.index = i;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.4, 0), new THREE.MeshStandardMaterial({ color: '#d9fff6', emissive: '#57d7cb', emissiveIntensity: 1.6, metalness: .25, roughness: .16 }));
  crystal.scale.set(.72, 1.35, .72); group.add(crystal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.64, .022, 6, 24), new THREE.MeshBasicMaterial({ color: '#b7fff0', transparent: true, opacity: .78 }));
  ring.rotation.x = Math.PI / 2; group.add(ring);
  const light = new THREE.PointLight('#79eee0', 1.1, 4); group.add(light);
  scene.add(group); shards.push({ group, crystal, ring, collected: false, baseY: y });
}

const starPositions = [];
for (let i = 0; i < 430; i++) {
  const theta = hash(i, 2) * Math.PI * 2, phi = .12 + hash(i, 5) * 1.05, r = 85;
  starPositions.push(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r + 12, Math.sin(theta) * Math.sin(phi) * r);
}
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#e8f4ff', size: .28, transparent: true, opacity: 0, sizeAttenuation: true })); scene.add(stars);
const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe6a5' })); scene.add(sunOrb);
const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(1.65, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe9bb', transparent: true, opacity: .2 })); scene.add(sunGlow);
const moonOrb = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 10), new THREE.MeshBasicMaterial({ color: '#d9e8ff' })); scene.add(moonOrb);

const keys = {};
const player = { x: 0, z: 9, y: 3, vy: 0, yaw: 0, pitch: .07, grounded: false };
let started = false, pointerLocked = false, dragged = false, lastTouch = null;
let cycle = .085, cycleLength = 180, elapsed = 0, toastTimer = 0;
let shardsFound = 0, beaconRestored = false;
const prompt = document.querySelector('#interact-prompt');
const toast = document.querySelector('#toast');
const interactionHint = document.querySelector('#interaction-hint');
const startOverlay = document.querySelector('#start-overlay');
const selectedSlots = [...document.querySelectorAll('.slot')];
const touchVector = { x: 0, z: 0 };
let jumpPressed = false;

function showToast(message) {
  toast.textContent = message; toast.classList.add('show'); toastTimer = 2.4;
}
function updateInventory() {
  for (const type of editableTypes) document.querySelector(`#count-${type}`).textContent = inventory[type];
  document.querySelector('#inventory-label').textContent = `${editableTypes.reduce((sum, type) => sum + inventory[type], 0)} blocks`;
}
function selectBlock(type) {
  selectedType.value = type;
  selectedSlots.forEach(slot => slot.classList.toggle('selected', slot.dataset.type === type));
}
function nearestShard() {
  let nearest = null, best = 3.8;
  for (const shard of shards) if (!shard.collected) {
    const distance = shard.group.position.distanceTo(camera.position);
    if (distance < best) { nearest = shard; best = distance; }
  }
  return nearest;
}
function collectShard(shard) {
  shard.collected = true; scene.remove(shard.group); shardsFound++;
  document.querySelector('#shard-count').textContent = `${shardsFound} / 5`;
  document.querySelector('#progress-fill').style.width = `${shardsFound * 20}%`;
  if (shardsFound < 5) {
    document.querySelector('#objective-label').textContent = `${5 - shardsFound} FRAGMENT${5 - shardsFound === 1 ? '' : 'S'} LEFT TO FIND`;
    showToast(['A piece of the old sky!', 'The beacon remembers.', 'One more glimmer found.', 'Your path is glowing.'][shardsFound % 4]);
  } else {
    beaconRestored = true;
    document.querySelector('#mission-title').textContent = 'The beacon is home';
    document.querySelector('#mission-copy').textContent = 'You brought the light back. Take a moment to watch the island shine.';
    document.querySelector('#objective-label').textContent = 'BEACON RESTORED · WELL DONE';
    document.querySelector('.objective-icon').textContent = '✦';
    beaconCore.material.emissiveIntensity = 3.5; beaconCore.material.color.set('#fff3bf');
    beaconLight.intensity = 4.5; beaconLight.distance = 28;
    beaconHalo.material.opacity = .12; beaconRing.material.opacity = .95;
    showToast('All five shards found — the beacon is alive!');
  }
}
function blockTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(blockMeshes, false)[0];
  if (!hit || hit.instanceId === undefined) return null;
  const block = hit.object.userData.blocks[hit.instanceId];
  return { hit, block };
}
function breakBlock() {
  const target = blockTarget(); if (!target) return;
  const { block } = target;
  if (block.type === 'beacon') { showToast('The beacon is part of this island.'); return; }
  world.delete(keyOf(block.x, block.y, block.z));
  if (editableTypes.includes(block.type)) inventory[block.type] = Math.min(40, inventory[block.type] + 1);
  rebuildBlocks(); updateInventory();
}
function placeBlock() {
  const target = blockTarget(); if (!target) return;
  const { hit } = target;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p = hit.point.clone().addScaledVector(n, .51);
  const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z);
  const key = keyOf(x, y, z);
  if (world.has(key)) return;
  const type = selectedType.value;
  if (inventory[type] <= 0) { showToast(`No ${type} blocks left — break blocks to gather more.`); return; }
  world.set(key, { x, y, z, type, fixed: false }); inventory[type]--;
  rebuildBlocks(); updateInventory();
}
function useAction() {
  const shard = nearestShard();
  if (shard) { collectShard(shard); return; }
  const target = blockTarget();
  if (target && inventory[selectedType.value] > 0) placeBlock();
}
function startGame() {
  if (started) return;
  started = true; startOverlay.classList.add('hidden');
  if (!isTouch && canvas.requestPointerLock) canvas.requestPointerLock();
  else interactionHint.classList.add('hidden');
}
function doJump() { if (player.grounded) { player.vy = 7; player.grounded = false; } }
function resetPlayer() {
  player.x = 0; player.z = 9; player.y = topAt(0, 9) + 1.68; player.vy = 0;
  showToast('A soft landing. The island is still here.');
}
function onLook(dx, dy) {
  player.yaw -= dx * .0024;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * .0022, -1.35, 1.35);
}

canvas.addEventListener('click', () => { if (!started) startGame(); });
canvas.addEventListener('mousedown', e => {
  if (!started) return;
  if (e.button === 0 && pointerLocked) breakBlock();
  if (e.button === 2) { e.preventDefault(); if (pointerLocked) placeBlock(); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) interactionHint.classList.add('hidden');
  else if (started && !isTouch) interactionHint.classList.remove('hidden');
});
document.addEventListener('mousemove', e => { if (pointerLocked) onLook(e.movementX, e.movementY); });
canvas.addEventListener('pointerdown', e => {
  if (!isTouch || !started || e.pointerType !== 'touch') return;
  lastTouch = { x: e.clientX, y: e.clientY }; dragged = false;
});
canvas.addEventListener('pointermove', e => {
  if (!isTouch || !lastTouch || e.pointerType !== 'touch') return;
  const dx = e.clientX - lastTouch.x, dy = e.clientY - lastTouch.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
  onLook(dx, dy); lastTouch = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { lastTouch = null; });
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code.toLowerCase()] = true;
  if (e.repeat) return;
  if (e.code === 'Space') doJump();
  if (e.code.toLowerCase() === 'keye') useAction();
  const number = Number(e.key); if (number >= 1 && number <= 4) selectBlock(editableTypes[number - 1]);
});
window.addEventListener('keyup', e => { keys[e.code.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const key in keys) keys[key] = false; });
selectedSlots.forEach(slot => slot.addEventListener('click', () => selectBlock(slot.dataset.type)));
document.querySelector('#start-button').addEventListener('click', startGame);
document.querySelector('#close-help').addEventListener('click', () => document.querySelector('#controls-card').style.display = 'none');
document.querySelector('#use-touch').addEventListener('pointerdown', e => { e.preventDefault(); useAction(); });
document.querySelector('#jump-touch').addEventListener('pointerdown', e => { e.preventDefault(); doJump(); });
document.querySelector('#build-touch').addEventListener('pointerdown', e => { e.preventDefault(); placeBlock(); });

const joystick = document.querySelector('#joystick'), joyKnob = document.querySelector('#joy-knob');
let joyPointer = null;
joystick.addEventListener('pointerdown', e => { joyPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveJoy(e); });
joystick.addEventListener('pointermove', e => { if (joyPointer === e.pointerId) moveJoy(e); });
function moveJoy(e) {
  const r = joystick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy), max = 31, scale = len > max ? max / len : 1;
  joyKnob.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  touchVector.x = dx * scale / max; touchVector.z = dy * scale / max;
}
function releaseJoy() { joyPointer = null; touchVector.x = 0; touchVector.z = 0; joyKnob.style.transform = ''; }
joystick.addEventListener('pointerup', releaseJoy); joystick.addEventListener('pointercancel', releaseJoy);

const colorNight = new THREE.Color('#172849'), colorDusk = new THREE.Color('#e3a58f'), colorDay = new THREE.Color('#82cce5');
const skyColor = new THREE.Color();
function updateDaylight(dt) {
  cycle = (cycle + dt / cycleLength) % 1;
  const angle = cycle * Math.PI * 2;
  const sy = Math.sin(angle), daylight = THREE.MathUtils.smoothstep(sy, -.18, .32);
  const twilight = 1 - THREE.MathUtils.smoothstep(Math.abs(sy), .02, .38);
  skyColor.copy(colorNight).lerp(colorDusk, twilight).lerp(colorDay, daylight);
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);
  stars.material.opacity = (1 - daylight) * .9;
  const x = Math.cos(angle) * 34, y = sy * 34;
  sunOrb.position.set(x, y, -28); sunGlow.position.copy(sunOrb.position);
  sunOrb.visible = y > -3; sunGlow.visible = y > 0;
  moonOrb.position.set(-x, -y, -24); moonOrb.visible = y < 8;
  sunLight.position.set(x, y, -20); sunLight.intensity = .08 + daylight * 2.5;
  sunLight.color.set(daylight > .3 ? '#fff1d2' : '#ffc28e');
  hemi.intensity = .28 + daylight * 1.35;
  fill.intensity = .13 + daylight * .33;
  beaconLight.intensity = beaconRestored ? 4.5 : .35 + (1 - daylight) * .7;
  beaconCore.material.emissiveIntensity = beaconRestored ? 3.5 : .35 + (1 - daylight) * .5;
  beaconRing.material.opacity = beaconRestored ? .95 : .35 + (1 - daylight) * .3;
  const hourFloat = (6 + cycle * 24) % 24, hour = Math.floor(hourFloat), minute = Math.floor((hourFloat - hour) * 60);
  document.querySelector('#clock-label').textContent = `DAY 01 · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  let phase, label, symbol;
  if (cycle < .19) { phase = 'MORNING'; label = 'MORNING'; symbol = '☀'; }
  else if (cycle < .39) { phase = 'DAYLIGHT'; label = 'DAYLIGHT'; symbol = '☀'; }
  else if (cycle < .57) { phase = 'SUNSET'; label = 'SUNSET'; symbol = '◒'; }
  else if (cycle < .82) { phase = 'NIGHT'; label = 'NIGHT'; symbol = '☾'; }
  else { phase = 'SUNRISE'; label = 'SUNRISE'; symbol = '☼'; }
  document.querySelector('#day-state').textContent = label;
  document.querySelector('#day-symbol').textContent = symbol;
  const next = cycle < .19 ? .19 : cycle < .39 ? .39 : cycle < .57 ? .57 : cycle < .82 ? .82 : 1;
  const left = Math.max(0, Math.floor((next - cycle) * cycleLength));
  document.querySelector('#time-left').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}
function updatePlayer(dt) {
  if (!started) return;
  const forward = (keys['keyw'] || keys['arrowup'] ? 1 : 0) - (keys['keys'] || keys['arrowdown'] ? 1 : 0) - touchVector.z;
  const side = (keys['keyd'] || keys['arrowright'] ? 1 : 0) - (keys['keya'] || keys['arrowleft'] ? 1 : 0) + touchVector.x;
  const length = Math.hypot(forward, side) || 1;
  const speed = keys['shiftleft'] ? 7.3 : 5.2;
  player.x += (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * side) / length * speed * dt;
  player.z += (-Math.cos(player.yaw) * forward + Math.sin(player.yaw) * side) / length * speed * dt;
  player.vy -= 18 * dt; player.y += player.vy * dt;
  const floor = topAt(player.x, player.z) + 1.95;
  if (player.y <= floor) { player.y = floor; player.vy = 0; player.grounded = true; }
  else player.grounded = false;
  if (player.y < -8) resetPlayer();
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const shard = nearestShard();
  prompt.style.display = shard ? 'flex' : 'none';
  if (shard) prompt.innerHTML = `${isTouch ? 'TAP E' : 'E'} <span>Collect sky shard</span>`;
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .1), time = clock.elapsedTime;
  elapsed += dt;
  updateDaylight(dt);
  updatePlayer(dt);
  shards.forEach((s, i) => {
    if (s.collected) return;
    s.group.position.y = s.baseY + Math.sin(time * 1.7 + i) * .16;
    s.crystal.rotation.y = time * .55 + i;
    s.ring.rotation.z = time * .35 + i;
  });
  beaconCore.rotation.y = time * (beaconRestored ? .85 : .3);
  beaconRing.rotation.z = time * .16;
  beaconHalo.material.opacity = beaconRestored ? .11 + Math.sin(time * 2) * .025 : .035 + Math.sin(time * 1.3) * .012;
  clouds.forEach((cloud, i) => { cloud.position.x += dt * (.16 + i * .025); if (cloud.position.x > 27) cloud.position.x = -27; });
  islandMist.rotation.y += dt * .008;
  ocean.position.x = player.x * .08; ocean.position.z = player.z * .08;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toast.classList.remove('show'); }
  if (sunLight.castShadow) sunLight.position.set(Math.cos(cycle * Math.PI * 2) * 34, Math.max(2, Math.sin(cycle * Math.PI * 2) * 34), -20);
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
document.querySelector('#sound-button').addEventListener('click', e => {
  const on = e.currentTarget.classList.toggle('muted');
  e.currentTarget.textContent = on ? '♫̸' : '♫';
  showToast(on ? 'Ambient sound off' : 'Ambient sound on');
});

rebuildBlocks(); updateInventory();
player.y = topAt(player.x, player.z) + 1.95;
camera.position.set(player.x, player.y, player.z);
camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
updateDaylight(0);
setTimeout(() => loading.classList.add('done'), 350);
setTimeout(() => loading.remove(), 1100);
animate();
