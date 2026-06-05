// ─────────────────────────────────────────────────────────────────────────────
// SCROLL INDICATOR
// ─────────────────────────────────────────────────────────────────────────────
const indicator = document.getElementById('scrollIndicator');
window.addEventListener('scroll', () => {
  indicator.classList.toggle('hidden', window.scrollY > window.innerHeight * 0.2);
}, { passive: true });


// ─────────────────────────────────────────────────────────────────────────────
// BINARY TITLE REVEAL — "takibyte"
// ─────────────────────────────────────────────────────────────────────────────
const word = 'takibyte';

function getByte(ch) {
  const c = ch.charCodeAt(0);
  return Array.from({ length: 8 }, (_, i) => String((c >> (7 - i)) & 1));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function animateChar(el, ch, delay, spd) {
  el.textContent = '\u00a0';
  await sleep(delay);
  for (const b of getByte(ch)) { el.textContent = b; await sleep(spd); }
  await sleep(400);
  el.textContent = ch;
}

async function runEffect() {
  const el = document.querySelector('.section-content');
  el.innerHTML = [...word].map((_, i) => `<span id="bc${i}"></span>`).join('');
  await sleep(10);
  await Promise.all(
    [...word].map((ch, i) => animateChar(document.getElementById('bc' + i), ch, i * 50, 200))
  );
}

async function titleLoop() { await runEffect(); await sleep(4000); titleLoop(); }
document.addEventListener('DOMContentLoaded', titleLoop);


// ─────────────────────────────────────────────────────────────────────────────
// SHARED TEXTURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const HEX    = '0123456789ABCDEF';
const rndHex = () => HEX[Math.floor(Math.random() * 16)] + HEX[Math.floor(Math.random() * 16)];

function makeByteTexture(hex, color, glowing, cache) {
  const key = `${hex}|${color}|${glowing}`;
  if (cache?.[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 22px "Roboto Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glowing) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
  ctx.fillStyle = color;
  ctx.fillText(hex, 32, 20);
  const t = new THREE.CanvasTexture(c);
  if (cache) cache[key] = t;
  return t;
}

function makeLabelTexture(text, color, cache) {
  const key = `lbl|${text}|${color}`;
  if (cache?.[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 36;
  const ctx = c.getContext('2d');
  ctx.font = '13px "Roboto Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillText(text, 4, 18);
  const t = new THREE.CanvasTexture(c);
  if (cache) cache[key] = t;
  return t;
}

function makeGlitchTexture(hex, color) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 22px "Roboto Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bands = 4 + Math.floor(Math.random() * 4);
  for (let b = 0; b < bands; b++) {
    const y0 = (b / bands) * 40, h = 40 / bands;
    const xOff = (Math.random() - 0.5) * 10;
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.random() * 0.6;
    ctx.fillStyle   = Math.random() > 0.5 ? color : '#ff9e64';
    ctx.beginPath(); ctx.rect(0, y0, 64, h); ctx.clip();
    ctx.fillText(hex, 32 + xOff, 20);
    ctx.restore();
  }
  return new THREE.CanvasTexture(c);
}


// ─────────────────────────────────────────────────────────────────────────────
// ATTACK / BENIGN TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const ATTACK_TYPES = [
  { label: 'SYN → :22',    flags: '02', dport: '00 16', color: '#f7768e' },
  { label: 'SYN → :3389',  flags: '02', dport: '0D 3D', color: '#f7768e' },
  { label: 'XMAS → :443',  flags: '29', dport: '01 BB', color: '#f7768e' },
  { label: 'NULL → :80',   flags: '00', dport: '00 50', color: '#f7768e' },
  { label: 'SYN → :8080',  flags: '02', dport: '1F 90', color: '#f7768e' },
  { label: 'ACK → :21',    flags: '10', dport: '00 15', color: '#f7768e' },
  { label: 'EXPLOIT :445', flags: '18', dport: '01 BD', color: '#f7768e' },
  { label: 'SYN → :23',    flags: '02', dport: '00 17', color: '#f7768e' },
];

const BENIGN_TYPES = [
  { label: 'ACK :443',  flags: '10', dport: '01 BB', color: '#4a5068' },
  { label: 'TLS :443',  flags: '18', dport: '01 BB', color: '#4a5068' },
  { label: 'GET :80',   flags: '18', dport: '00 50', color: '#3d4460' },
  { label: 'DNS :53',   flags: '10', dport: '00 35', color: '#4a5068' },
  { label: 'NTP :123',  flags: '10', dport: '00 7B', color: '#3d4460' },
  { label: 'ACK :22',   flags: '10', dport: '00 16', color: '#4a5068' },
  { label: 'PUSH :443', flags: '18', dport: '01 BB', color: '#3d4460' },
  { label: 'FIN :80',   flags: '11', dport: '00 50', color: '#4a5068' },
];

const ESTABLISHED_TYPES = [
  { label: 'EST :443', color: '#323650' },
  { label: 'EST :22',  color: '#2e3350' },
  { label: 'EST :80',  color: '#323650' },
];


// ─────────────────────────────────────────────────────────────────────────────
// PACKET BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildPacket(scene, type, x, startY, vy, cache, opts = {}) {
  const color   = type.color;
  const byteLen = opts.byteLen  || 8;
  const scale   = opts.scale    || [5, 3];
  // All packets start invisible — faded in during the animate loop
  const opacity = 0;

  const rawBytes = [
    'FF','FF','FF','FF','FF','FF',
    rndHex(),rndHex(),rndHex(),rndHex(),rndHex(),rndHex(),
    '08','00',
    '45','00', rndHex(),rndHex(), rndHex(),rndHex(), '40','00',
    '40','06', rndHex(),rndHex(),
    rndHex(),rndHex(),rndHex(),rndHex(),
    rndHex(),rndHex(),rndHex(),rndHex(),
    rndHex(),rndHex(), ...(type.dport || '00 50').split(' '),
    rndHex(),rndHex(),rndHex(),rndHex(),
    rndHex(),rndHex(),rndHex(),rndHex(),
    '50', (type.flags || '10'), rndHex(),rndHex(), rndHex(),rndHex(), '00','00',
  ];
  const ws        = 14 + Math.floor(Math.random() * 10);
  const displayed = rawBytes.slice(ws, ws + byteLen);
  const SPACING   = 5.5;
  const byteSprites = [];

  for (let i = 0; i < displayed.length; i++) {
    const mat = new THREE.SpriteMaterial({
      map: makeByteTexture(displayed[i], color, opts.glowing !== false, cache),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale[0], scale[1], 1);
    sp.position.set(x, startY - i * SPACING, opts.z || (Math.random() - 0.5) * 4);
    scene.add(sp);
    byteSprites.push(sp);
  }

  const labelSp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeLabelTexture(type.label, color, cache),
    transparent: true, blending: THREE.AdditiveBlending,
    opacity, depthWrite: false,
  }));
  labelSp.scale.set(18, 3, 1);
  labelSp.position.set(x + 4, startY + 5, opts.z || 0);
  scene.add(labelSp);

  return {
    byteSprites, labelSprite: labelSp,
    x, vy, displayed, color,
    state: 'falling',
    glitchTick:  0,
    glitchMax:   opts.glitchMax || 20 + Math.floor(Math.random() * 8),
    canBreakThrough: opts.canBreakThrough || false,
    // target opacities reached after fade-in
    targetOpacity:      opts.targetOpacity      != null ? opts.targetOpacity      : 0.8,
    targetLabelOpacity: opts.targetLabelOpacity  != null ? opts.targetLabelOpacity : 0.9,
    fadeInTick:  0,
    fadeInDur:   opts.fadeInDur != null ? opts.fadeInDur : 22,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// FIREWALL FLASH
// ─────────────────────────────────────────────────────────────────────────────
function makeFirewallFlasher(scene, firewallY) {
  const POOL_SIZE = 6;
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const pts = [
      new THREE.Vector3(-12, firewallY, 1),
      new THREE.Vector3( 12, firewallY, 1),
    ];
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const mat  = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    pool.push({ line, mat, active: false, tick: 0, duration: 14 });
  }

  function flash(x) {
    const slot = pool.find(p => !p.active);
    if (!slot) return;
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, x - 14, firewallY, 1);
    pos.setXYZ(1, x + 14, firewallY, 1);
    pos.needsUpdate    = true;
    slot.mat.opacity   = 1.0;
    slot.mat.color.set(0xffffff);
    slot.active = true;
    slot.tick   = 0;
  }

  function update() {
    for (const p of pool) {
      if (!p.active) continue;
      p.tick++;
      const prog    = p.tick / p.duration;
      p.mat.opacity = (1 - prog) * 0.9;
      p.mat.color.setRGB(1, 1 - prog * 0.6, 1 - prog * 0.8);
      if (p.tick >= p.duration) { p.active = false; p.mat.opacity = 0; }
    }
  }

  return { flash, update };
}


// ─────────────────────────────────────────────────────────────────────────────
// RED TEAM SCENE
// ─────────────────────────────────────────────────────────────────────────────
function createRedTeam() {
  const canvas   = document.getElementById('redCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let W = canvas.parentElement.clientWidth;
  let H = canvas.parentElement.clientHeight;
  renderer.setSize(W, H);
  requestAnimationFrame(() => canvas.classList.add('visible'));

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.z = 90;

  // SPAWN_Y pushed well above the visible frustum top (~52 world units at z=0)
  // so packets are fully off-screen when they spawn, then fade in as they descend
  const FIREWALL_Y = -50;
  const SPAWN_Y    =  82;

  const cache       = {};
  const packets     = [];
  const ambient     = [];
  const established = [];
  let spawnTimer    = 0;
  let ambientTimer  = 0;
  let burstTimer    = 0;
  let burstMode     = false;
  let burstCount    = 0;

  const fwFlasher = makeFirewallFlasher(scene, FIREWALL_Y);

  // ── Established sessions ─────────────────────────────────────────────────
  const EST_LANES = [-60, -44, 44, 60];
  for (let i = 0; i < EST_LANES.length; i++) {
    const type = ESTABLISHED_TYPES[i % ESTABLISHED_TYPES.length];
    const dir  = i % 2 === 0 ? 1 : -1;
    established.push({
      type, x: EST_LANES[i], dir,
      packets: [],
      spawnTimer:    Math.floor(Math.random() * 60),
      spawnInterval: 55 + Math.floor(Math.random() * 25),
    });
  }

  function spawnEstPacket(est) {
    const startY = est.dir > 0 ? FIREWALL_Y + 2 : SPAWN_Y;
    const vy     = est.dir * (0.06 + Math.random() * 0.04);
    const p = buildPacket(scene, est.type, est.x, startY, vy, cache, {
      byteLen:            5,
      scale:              [4, 2.4],
      targetOpacity:      0.28,
      targetLabelOpacity: 0.22,
      glowing:            false,
      z:                  -3,
      fadeInDur:          30,
    });
    est.packets.push(p);
  }

  // Seed established sessions mid-stream
  for (const est of established) {
    spawnEstPacket(est);
    const p   = est.packets[0];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y);
    p.byteSprites.forEach(sp => sp.position.y -= off * est.dir);
    p.labelSprite.position.y -= off * est.dir;
    // Pre-set opacity for seeded packets so they don't fade in from nothing
    p.fadeInTick = p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = p.targetOpacity);
    p.labelSprite.material.opacity = p.targetLabelOpacity;
  }

  // ── Attack spawner ────────────────────────────────────────────────────────
  function spawnAttack(forceLane) {
    const attack = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)];
    const lane   = forceLane != null ? forceLane : Math.floor(Math.random() * 7) - 3;
    const x      = lane * 14 + (Math.random() - 0.5) * 3;
    packets.push(buildPacket(scene, attack, x, SPAWN_Y, -(0.4 + Math.random() * 0.12), cache, {
      glitchMax:           20 + Math.floor(Math.random() * 8),
      canBreakThrough:     Math.random() < 0.15,
      targetOpacity:       0.8,
      targetLabelOpacity:  0.9,
      fadeInDur:           22,
    }));
  }

  // ── Ambient spawner ───────────────────────────────────────────────────────
  function spawnAmbient() {
    const type    = BENIGN_TYPES[Math.floor(Math.random() * BENIGN_TYPES.length)];
    const lane    = Math.floor(Math.random() * 11) - 5;
    const x       = lane * 13 + (Math.random() - 0.5) * 4;
    const goingUp = Math.random() < 0.5;
    const vy      = goingUp ? (0.5 + Math.random() * 0.07) : -(0.5 + Math.random() * 0.07);
    // Upward ambient packets spawn below the firewall; downward from above screen
    const startY  = goingUp ? FIREWALL_Y - 5 : SPAWN_Y;
    const p = buildPacket(scene, type, x, startY, vy, cache, {
      byteLen:            6,
      scale:              [4.2, 2.6],
      targetOpacity:      0.32,
      targetLabelOpacity: 0.28,
      glowing:            false,
      z:                  -2,
      fadeInDur:          28,
    });
    p.goingUp = goingUp;
    ambient.push(p);
  }

  // Seed ambient traffic spread across the scene with opacity already set
  for (let i = 0; i < 10; i++) {
    spawnAmbient();
    const p   = ambient[ambient.length - 1];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y) * 0.8;
    p.byteSprites.forEach(sp => sp.position.y += off * Math.sign(p.vy));
    p.labelSprite.position.y += off * Math.sign(p.vy);
    p.fadeInTick = p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = p.targetOpacity);
    p.labelSprite.material.opacity = p.targetLabelOpacity;
  }

  // Seed attack packets mid-flight with opacity already set
  for (let i = 0; i < 5; i++) {
    spawnAttack();
    const p   = packets[packets.length - 1];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y);
    p.byteSprites.forEach(sp => sp.position.y -= off);
    p.labelSprite.position.y -= off;
    p.fadeInTick = p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = p.targetOpacity);
    p.labelSprite.material.opacity = p.targetLabelOpacity;
  }

  // ── Kill helper ───────────────────────────────────────────────────────────
  function kill(p, arr, i) {
    p.byteSprites.forEach(sp => scene.remove(sp));
    scene.remove(p.labelSprite);
    p.state = 'dead';
    if (arr && i != null) arr.splice(i, 1);
  }

  // ── Shared fade-in helper — call once per frame per falling packet ────────
  function tickFadeIn(p) {
    if (p.fadeInTick >= p.fadeInDur) return;
    p.fadeInTick++;
    const t = p.fadeInTick / p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = t * p.targetOpacity);
    p.labelSprite.material.opacity = t * p.targetLabelOpacity;
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  let frame = 0;
  (function animate() {
    requestAnimationFrame(animate);
    frame++;

    fwFlasher.update();

    // — Burst mode: less frequent, ~600–1000 frames between floods —
    burstTimer++;
    if (!burstMode && burstTimer > 600 + Math.floor(Math.random() * 400)) {
      burstMode  = true;
      burstCount = 4 + Math.floor(Math.random() * 4);
      burstTimer = 0;
    }

    // — Attack spawning —
    spawnTimer++;
    const activeAttack = packets.filter(p => p.state !== 'dead').length;
    if (burstMode && burstCount > 0) {
      if (spawnTimer % 8 === 0) {
        const lane = Math.floor(Math.random() * 3) - 1;
        spawnAttack(lane);
        burstCount--;
        if (burstCount <= 0) { burstMode = false; spawnTimer = 0; }
      }
    } else if (spawnTimer > 60 && activeAttack < 10) {
      spawnAttack(); spawnTimer = 0;
    }

    // — Ambient spawning —
    ambientTimer++;
    if (ambientTimer > 38 && ambient.length < 14) { spawnAmbient(); ambientTimer = 0; }

    // — Established sessions —
    for (const est of established) {
      est.spawnTimer++;
      if (est.spawnTimer >= est.spawnInterval &&
          est.packets.filter(p => p.state !== 'dead').length < 2) {
        spawnEstPacket(est);
        est.spawnTimer = 0;
      }
      for (let i = est.packets.length - 1; i >= 0; i--) {
        const p = est.packets[i];
        if (p.state === 'dead') { est.packets.splice(i, 1); continue; }
        tickFadeIn(p);
        p.byteSprites.forEach(sp => sp.position.y += p.vy);
        p.labelSprite.position.y += p.vy;
        const leadY = p.byteSprites[p.byteSprites.length - 1].position.y;
        if (leadY > SPAWN_Y + 15 || leadY < FIREWALL_Y - 30) kill(p, est.packets, i);
      }
    }

    // — Ambient packets —
    for (let i = ambient.length - 1; i >= 0; i--) {
      const p = ambient[i];
      if (p.state === 'dead') { ambient.splice(i, 1); continue; }

      if (p.state === 'fadingOut') {
        p.byteSprites.forEach(sp => {
          sp.position.y      += p.vy;
          sp.material.opacity = Math.max(0, sp.material.opacity - 0.022);
        });
        p.labelSprite.position.y      += p.vy;
        p.labelSprite.material.opacity = Math.max(0, p.labelSprite.material.opacity - 0.022);
        if (p.byteSprites[0].material.opacity <= 0) kill(p, ambient, i);
        continue;
      }

      tickFadeIn(p);
      p.byteSprites.forEach(sp => sp.position.y += p.vy);
      p.labelSprite.position.y += p.vy;
      const leadY = p.byteSprites[p.byteSprites.length - 1].position.y;
      // Trigger fade-out a little before the hard edge
      if (leadY > SPAWN_Y - 5 || leadY < FIREWALL_Y - 10) p.state = 'fadingOut';
    }

    // — Attack packets —
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      if (p.state === 'dead') { packets.splice(i, 1); continue; }

      if (p.state === 'falling') {
        tickFadeIn(p);
        p.byteSprites.forEach(sp => sp.position.y += p.vy);
        p.labelSprite.position.y += p.vy;

        if (p.byteSprites[p.byteSprites.length - 1].position.y <= FIREWALL_Y) {
          if (p.canBreakThrough) {
            p.state = 'through';
            p.byteSprites.forEach(sp => sp.material.opacity = 0.3);
            p.labelSprite.material.opacity = 0.25;
          } else {
            p.state = 'glitching';
            fwFlasher.flash(p.x);
          }
        }

      } else if (p.state === 'glitching') {
        p.glitchTick++;
        const prog = p.glitchTick / p.glitchMax;
        p.byteSprites.forEach((sp, si) => {
          if (p.glitchTick % 2 === 0) {
            sp.material.map = makeGlitchTexture(p.displayed[si] || rndHex(), p.color);
            sp.material.needsUpdate = true;
            sp.position.x += (Math.random() - 0.5) * 2.5;
            sp.position.y += (Math.random() - 0.5) * 1.5;
          }
          sp.material.opacity = 0.8 * (1 - prog);
          const sc = 5 * (1 - prog * 0.4);
          sp.scale.set(sc, 3 * (1 - prog * 0.4), 1);
        });
        p.labelSprite.material.opacity = 0.9 * (1 - prog);
        if (p.glitchTick >= p.glitchMax) kill(p, packets, i);

      } else if (p.state === 'through') {
        p.byteSprites.forEach(sp => {
          sp.position.y      += p.vy * 0.6;
          sp.material.opacity -= 0.004;
        });
        p.labelSprite.position.y      += p.vy * 0.6;
        p.labelSprite.material.opacity -= 0.004;
        if (p.byteSprites[0].material.opacity <= 0) kill(p, packets, i);
      }
    }

    renderer.render(scene, camera);
  })();

  window.addEventListener('resize', () => {
    W = canvas.parentElement.clientWidth;
    H = canvas.parentElement.clientHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// BLUE TEAM — SIEM / IDS SENTINEL SCENE
// ─────────────────────────────────────────────────────────────────────────────
function createBlueTeam() {
  const canvas   = document.getElementById('blueCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let W = canvas.parentElement.clientWidth;
  let H = canvas.parentElement.clientHeight;
  renderer.setSize(W, H);
  requestAnimationFrame(() => canvas.classList.add('visible'));

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.z = 90;

  const BX = 115, BY = 45;
  const C_BLUE  = '#7aa2f7';
  const C_PURP  = '#bb9af7';
  const C_ALERT = '#ff9e64';
  const cache   = {};

  // ── LAYER 1: PERIMETER PATROL ───────────────────────────────────────────
  const PERIM_COUNT = 80;
  const perimSprites = [];
  const PW = BX * 2, PH = BY * 2;
  const PERIM = 2 * (PW + PH);

  function perimPos(d) {
    d = ((d % PERIM) + PERIM) % PERIM;
    if (d < PW)  return { x: -BX + d,  y:  BY };
    d -= PW;
    if (d < PH)  return { x:  BX,       y:  BY - d };
    d -= PH;
    if (d < PW)  return { x:  BX - d,   y: -BY };
    d -= PW;
                 return { x: -BX,       y: -BY + d };
  }

  for (let i = 0; i < PERIM_COUNT; i++) {
    const t   = (i / PERIM_COUNT) * PERIM;
    const col = i % 3 === 0 ? C_PURP : C_BLUE;
    const mat = new THREE.SpriteMaterial({
      map: makeByteTexture(rndHex(), col, true, cache),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0.45 + Math.random() * 0.3, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(4.5, 2.8, 1);
    const pos = perimPos(t);
    sp.position.set(pos.x, pos.y, (Math.random() - 0.5) * 3);
    scene.add(sp);
    perimSprites.push({ sp, dist: t, hex: rndHex(), col,
      pulsePhase: Math.random() * Math.PI * 2,
      alertFlash: 0,
    });
  }

  // ── LAYER 2: SCAN SWEEP ─────────────────────────────────────────────────
  const SCAN_COLS    = 24;
  const SCAN_SPACING = PW / SCAN_COLS;
  const scanBytes    = [];
  let   scanY        = BY;
  const SCAN_SPEED   = 0.15;

  const scanLinePts = [
    new THREE.Vector3(-BX, 0, 0),
    new THREE.Vector3( BX, 0, 0),
  ];
  const scanLineMat = new THREE.LineBasicMaterial({ color: 0x7aa2f7, transparent: true, opacity: 0.35 });
  const scanLine    = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanLinePts), scanLineMat);
  scanLine.position.y = scanY;
  scene.add(scanLine);

  const trailLineMat = new THREE.LineBasicMaterial({ color: 0x7aa2f7, transparent: true, opacity: 0.1 });
  const trailLine    = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanLinePts), trailLineMat);
  trailLine.position.y = scanY + 3;
  scene.add(trailLine);

  for (let i = 0; i < SCAN_COLS; i++) {
    const x   = -BX + i * SCAN_SPACING + SCAN_SPACING * 0.5;
    const mat = new THREE.SpriteMaterial({
      map: makeByteTexture(rndHex(), C_BLUE, false, cache),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(4.5, 2.8, 1);
    sp.position.set(x, scanY - 3.5, 1);
    scene.add(sp);
    scanBytes.push({ sp, x });
  }

  // ── LAYER 3: ALERT RESPONSE COLUMNS ────────────────────────────────────
  const ALERT_LABELS = [
    'RST ← :22',  'DROP :3389', 'BLOCK :443',  'FW RULE :80',
    'IDS ALERT',  'ACK ← :21', 'DROP :445',   'RST ← :23',
    'RULE #0x2F', 'LOG EVENT',  'QUARANTINE',  'BLACKLIST',
  ];
  const alertColumns = [];
  let alertTimer = 0;
  const ALERT_INTERVAL = 120;

  function spawnAlertColumn() {
    const lanes = [-56, -42, -28, 28, 42, 56];
    const x     = lanes[Math.floor(Math.random() * lanes.length)];
    const label = ALERT_LABELS[Math.floor(Math.random() * ALERT_LABELS.length)];
    const col   = Math.random() > 0.5 ? C_BLUE : C_PURP;
    const ROWS  = 6, ROW_H = 5;

    const byteSprites = [];
    for (let r = 0; r < ROWS; r++) {
      const mat = new THREE.SpriteMaterial({
        map: makeByteTexture(rndHex(), col, true, cache),
        transparent: true, blending: THREE.AdditiveBlending,
        opacity: 0, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(5, 3, 1);
      sp.position.set(x, BY - 4 - r * ROW_H, 2);
      scene.add(sp);
      byteSprites.push({ sp, hex: rndHex(), r });
    }

    const labelSp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabelTexture('▶ ' + label, col, cache),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0, depthWrite: false,
    }));
    labelSp.scale.set(20, 3, 1);
    labelSp.position.set(x + 2, BY + 2, 2);
    scene.add(labelSp);

    function makeBracket(side) {
      const bx  = x + side * 4.5;
      const pts = [
        new THREE.Vector3(bx,           BY - 1,              2),
        new THREE.Vector3(bx + side*2,  BY - 1,              2),
        new THREE.Vector3(bx + side*2,  BY - 1,              2),
        new THREE.Vector3(bx + side*2,  BY - 4 - ROWS*ROW_H, 2),
        new THREE.Vector3(bx + side*2,  BY - 4 - ROWS*ROW_H, 2),
        new THREE.Vector3(bx,           BY - 4 - ROWS*ROW_H, 2),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x7aa2f7, transparent: true, opacity: 0 });
      const ln  = new THREE.LineSegments(geo, mat);
      scene.add(ln);
      return ln;
    }
    const bracketL = makeBracket(-1), bracketR = makeBracket(1);

    alertColumns.push({
      byteSprites, labelSp, bracketL, bracketR,
      state: 'in', tick: 0,
      inDur: 12, holdDur: 80, outDur: 20,
      col,
    });

    for (const pb of perimSprites) {
      if (Math.abs(pb.sp.position.x - x) < 20) pb.alertFlash = 18;
    }
  }

  // ── ANIMATION LOOP ──────────────────────────────────────────────────────
  let frame = 0;
  (function animate() {
    requestAnimationFrame(animate);
    frame++;
    const t = frame * 0.016;

    // — Perimeter patrol —
    const PATROL_SPEED = 0.6;
    for (const pb of perimSprites) {
      pb.dist = (pb.dist + PATROL_SPEED) % PERIM;
      const pos = perimPos(pb.dist);
      pb.sp.position.x = pos.x;
      pb.sp.position.y = pos.y;
      if (Math.random() < 0.002) {
        pb.hex = rndHex();
        pb.sp.material.map = makeByteTexture(pb.hex, pb.alertFlash > 0 ? C_ALERT : pb.col, true, cache);
        pb.sp.material.needsUpdate = true;
      }
      if (pb.alertFlash > 0) {
        pb.alertFlash--;
        pb.sp.material.opacity = 0.9;
        pb.sp.material.map = makeByteTexture(pb.hex, C_ALERT, true, cache);
        pb.sp.material.needsUpdate = true;
      } else {
        pb.sp.material.opacity = 0.35 + 0.18 * Math.sin(t * 1.2 + pb.pulsePhase);
      }
    }

    // — Scan sweep —
    scanY -= SCAN_SPEED;
    if (scanY < -BY) scanY = BY;
    scanLine.position.y  = scanY;
    trailLine.position.y = scanY + 2.5;
    for (const sb of scanBytes) {
      sb.sp.position.y = scanY - 3.5;
      const relY = (scanY - (-BY)) / (BY * 2);
      sb.sp.material.opacity = 0.55 * Math.sin(relY * Math.PI);
      if (frame % 6 === 0) {
        sb.sp.material.map = makeByteTexture(rndHex(), C_BLUE, false, cache);
        sb.sp.material.needsUpdate = true;
      }
    }
    scanLineMat.opacity = 0.25 + 0.15 * Math.sin(t * 8);

    // — Alert columns —
    alertTimer++;
    if (alertTimer >= ALERT_INTERVAL) { spawnAlertColumn(); alertTimer = 0; }

    for (let i = alertColumns.length - 1; i >= 0; i--) {
      const ac = alertColumns[i];
      ac.tick++;
      let opacity;
      if (ac.state === 'in') {
        opacity = ac.tick / ac.inDur;
        if (ac.tick >= ac.inDur) { ac.state = 'hold'; ac.tick = 0; }
      } else if (ac.state === 'hold') {
        opacity = 1;
        if (ac.tick % 14 === 0) {
          const rb = ac.byteSprites[Math.floor(Math.random() * ac.byteSprites.length)];
          rb.hex = rndHex();
          rb.sp.material.map = makeByteTexture(rb.hex, ac.col, true, cache);
          rb.sp.material.needsUpdate = true;
        }
        if (ac.tick >= ac.holdDur) { ac.state = 'out'; ac.tick = 0; }
      } else {
        opacity = 1 - ac.tick / ac.outDur;
        if (ac.tick >= ac.outDur) {
          ac.byteSprites.forEach(b => scene.remove(b.sp));
          scene.remove(ac.labelSp);
          scene.remove(ac.bracketL);
          scene.remove(ac.bracketR);
          alertColumns.splice(i, 1);
          continue;
        }
      }
      ac.byteSprites.forEach(b => { b.sp.material.opacity = opacity * 0.85; });
      ac.labelSp.material.opacity  = opacity * 0.9;
      ac.bracketL.material.opacity = opacity * 0.5;
      ac.bracketR.material.opacity = opacity * 0.5;
    }

    renderer.render(scene, camera);
  })();

  window.addEventListener('resize', () => {
    W = canvas.parentElement.clientWidth;
    H = canvas.parentElement.clientHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  createRedTeam();
  createBlueTeam();
});
