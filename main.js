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

let pageLoaded = false;
window.addEventListener('load', () => { pageLoaded = true; });

document.addEventListener('DOMContentLoaded', () => {
  const kickoff = () => {
    if (pageLoaded) {
      setTimeout(titleLoop, 500); // load already fired, still give scenes a beat to init
    } else {
      window.addEventListener('load', () => setTimeout(titleLoop, 800), { once: true });
    }
  };
  kickoff();
});


// ─────────────────────────────────────────────────────────────────────────────
// SHARED TEXTURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const HEX    = '0123456789ABCDEF';
const rndHex = () => HEX[Math.floor(Math.random() * 16)] + HEX[Math.floor(Math.random() * 16)];

// Pre-baked pools: 32 random hex textures per color/glow combo
const BYTE_TEX_POOL_SIZE = 32;
const byteTexPools = {};

function getByteTexture(color, glowing) {
  const key = `${color}|${glowing}`;
  if (!byteTexPools[key]) {
    byteTexPools[key] = Array.from({ length: BYTE_TEX_POOL_SIZE }, () => {
      const hex = HEX[Math.floor(Math.random()*16)] + HEX[Math.floor(Math.random()*16)];
      const c = document.createElement('canvas');
      c.width = 64; c.height = 40;
      const ctx = c.getContext('2d');
      ctx.font = 'bold 22px "Roboto Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (glowing) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
      ctx.fillStyle = color;
      ctx.fillText(hex, 32, 20);
      return new THREE.CanvasTexture(c);
    });
  }
  const pool = byteTexPools[key];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Label textures: small fixed set, disposed only on page unload
const labelTexCache = {};
function makeLabelTexture(text, color, _cache) {
  const key = `${text}|${color}`;
  if (labelTexCache[key]) return labelTexCache[key];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 36;
  const ctx = c.getContext('2d');
  ctx.font = '13px "Roboto Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillText(text, 4, 18);
  const t = new THREE.CanvasTexture(c);
  labelTexCache[key] = t;
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

// Weighted benign types — 443 dominates, then DNS, then others
// Each entry has a weight for sampling
const BENIGN_DEFS = [
  { label: 'ACK :443',  flags: '10', dport: '01 BB', weight: 22 },
  { label: 'TLS :443',  flags: '18', dport: '01 BB', weight: 18 },
  { label: 'PUSH :443', flags: '18', dport: '01 BB', weight: 12 },
  { label: 'DNS :53',   flags: '10', dport: '00 35', weight: 10 },
  { label: 'GET :80',   flags: '18', dport: '00 50', weight:  8 },
  { label: 'ACK :22',   flags: '10', dport: '00 16', weight:  6 },
  { label: 'FIN :443',  flags: '11', dport: '01 BB', weight:  5 },
  { label: 'NTP :123',  flags: '10', dport: '00 7B', weight:  4 },
  { label: 'FIN :80',   flags: '11', dport: '00 50', weight:  3 },
  { label: 'ACK :21',   flags: '10', dport: '00 15', weight:  2 },
];
// Build cumulative weight table for fast weighted sampling
const BENIGN_TOTAL = BENIGN_DEFS.reduce((s, d) => s + d.weight, 0);
function sampleBenign() {
  let r = Math.random() * BENIGN_TOTAL;
  for (const d of BENIGN_DEFS) { r -= d.weight; if (r <= 0) return d; }
  return BENIGN_DEFS[BENIGN_DEFS.length - 1];
}

const ESTABLISHED_TYPES = [
  { label: 'EST :443', color: '#323650' },
  { label: 'EST :22',  color: '#2e3350' },
  { label: 'EST :80',  color: '#323650' },
];

// ── Port-scan sequences — ordered port lists an attacker sweeps ────────────
const SCAN_SEQUENCES = [
  // TCP common ports scan
  [
    { label: 'SYN → :21',  flags: '02', dport: '00 15', color: '#f7768e' },
    { label: 'SYN → :22',  flags: '02', dport: '00 16', color: '#f7768e' },
    { label: 'SYN → :23',  flags: '02', dport: '00 17', color: '#f7768e' },
    { label: 'SYN → :25',  flags: '02', dport: '00 19', color: '#f7768e' },
    { label: 'SYN → :80',  flags: '02', dport: '00 50', color: '#f7768e' },
    { label: 'SYN → :443', flags: '02', dport: '01 BB', color: '#f7768e' },
  ],
  // RDP / SMB targeted scan
  [
    { label: 'SYN → :445',  flags: '02', dport: '01 BD', color: '#f7768e' },
    { label: 'SYN → :3389', flags: '02', dport: '0D 3D', color: '#f7768e' },
    { label: 'SYN → :5985', flags: '02', dport: '17 59', color: '#f7768e' },
    { label: 'SYN → :5986', flags: '02', dport: '17 5A', color: '#f7768e' },
  ],
  // Web service scan
  [
    { label: 'SYN → :80',   flags: '02', dport: '00 50', color: '#f7768e' },
    { label: 'SYN → :8080', flags: '02', dport: '1F 90', color: '#f7768e' },
    { label: 'SYN → :8443', flags: '02', dport: '20 FB', color: '#f7768e' },
    { label: 'SYN → :443',  flags: '02', dport: '01 BB', color: '#f7768e' },
    { label: 'XMAS → :443', flags: '29', dport: '01 BB', color: '#f7768e' },
  ],
  // NULL scan sweep
  [
    { label: 'NULL → :22',  flags: '00', dport: '00 16', color: '#f7768e' },
    { label: 'NULL → :80',  flags: '00', dport: '00 50', color: '#f7768e' },
    { label: 'NULL → :443', flags: '00', dport: '01 BB', color: '#f7768e' },
    { label: 'NULL → :8080',flags: '00', dport: '1F 90', color: '#f7768e' },
  ],
];


// ─────────────────────────────────────────────────────────────────────────────
// PACKET BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildPacket(scene, type, x, startY, vy, cache, opts = {}) {
  const color   = type.color;
  const byteLen = opts.byteLen  || 8;
  const scale   = opts.scale    || [5, 3];
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
  const SPACING   = opts.spacing || 5.5;
  const byteSprites = [];

  for (let i = 0; i < displayed.length; i++) {
    const mat = new THREE.SpriteMaterial({
      map: getByteTexture(color, opts.glowing !== false),
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

  // Blocked label sprites pool
  const LABEL_POOL_SIZE = 6;
  const labelPool = [];
  for (let i = 0; i < LABEL_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: makeLabelTexture('BLOCKED', '#f7768e', null),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(14, 3.5, 1);
    sp.position.set(0, firewallY + 4, 3);
    scene.add(sp);
    labelPool.push({ sp, mat, active: false, tick: 0, duration: 28, x: 0 });
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

    // Spawn a BLOCKED label near the impact
    const lSlot = labelPool.find(l => !l.active);
    if (lSlot) {
      lSlot.sp.position.set(x + (Math.random() - 0.5) * 6, firewallY + 5, 3);
      lSlot.mat.opacity = 0.95;
      lSlot.active = true;
      lSlot.tick   = 0;
    }
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
    for (const l of labelPool) {
      if (!l.active) continue;
      l.tick++;
      const prog = l.tick / l.duration;
      l.mat.opacity = (1 - prog) * 0.95;
      l.sp.position.y += 0.12; // drift upward slightly
      if (l.tick >= l.duration) {
        l.active = false;
        l.mat.opacity = 0;
        l.sp.position.y = firewallY + 4; // reset
      }
    }
  }

  return { flash, update };
}


// ─────────────────────────────────────────────────────────────────────────────
// FLOW MANAGER — realistic ambient network traffic
// Manages a set of persistent "pipe lanes" each with directional bias.
// Spawns connection flows: a burst of N packets in quick succession on
// the same lane, mimicking real TCP/UDP flows.
// ─────────────────────────────────────────────────────────────────────────────
function createFlowManager(scene, cache, firewallY, spawnY) {

  // Fixed pipe lanes with direction bias and x-position
  // dir: 1 = upward (response / outbound), -1 = downward (inbound request)
  const PIPE_LANES = [
    { x: -52, dir: -1, bias: 'inbound'  },  // far left inbound
    { x: -38, dir:  1, bias: 'outbound' },
    { x: -24, dir: -1, bias: 'inbound'  },
    { x: -10, dir:  1, bias: 'outbound' },
    { x:  10, dir: -1, bias: 'inbound'  },
    { x:  24, dir:  1, bias: 'outbound' },
    { x:  38, dir: -1, bias: 'inbound'  },
    { x:  52, dir:  1, bias: 'outbound' },
  ];

  // Color tint by direction: inbound slightly cooler, outbound slightly warmer
  const C_INBOUND  = '#4a6fa5';   // muted blue
  const C_OUTBOUND = '#3d6b6b';   // muted teal

  // Per-lane state: each lane has a Poisson-like timer and active flows
  const lanes = PIPE_LANES.map(pipe => ({
    ...pipe,
    flows: [],            // active packet groups on this lane
    // Poisson inter-arrival: base interval plus jitter
    nextFlowIn: 40 + Math.floor(Math.random() * 80),
    timer: 0,
    // Occasionally a lane goes quiet (simulates idle connection)
    quietTimer: 0,
    quietDur: 0,
    isQuiet: false,
  }));

  // Active lone packets being animated (across all lanes)
  const allPackets = [];

  // ── Spawn a full flow (burst of packets) on a lane ──────────────────────
  function spawnFlow(lane) {
    const def        = sampleBenign();
    const flowSize   = 3 + Math.floor(Math.random() * 5);   // 3–7 packets
    const burstGap   = 8 + Math.floor(Math.random() * 12);  // frames between packets in burst
    const x          = lane.x + (Math.random() - 0.5) * 1.5; // tiny jitter only
    const baseColor  = lane.dir < 0 ? C_INBOUND : C_OUTBOUND;
    // Slightly vary hue per flow for visual interest
    const hueShift   = (Math.random() - 0.5) * 0.08;
    const flowColor  = shiftHex(baseColor, hueShift);

    const type = { ...def, color: flowColor };
    const vy   = lane.dir * (0.42 + Math.random() * 0.08);
    const startY = lane.dir < 0 ? spawnY : firewallY - 3;

    for (let i = 0; i < flowSize; i++) {
      const delayFrames = i * burstGap;
      allPackets.push({
        lane,
        type,
        x,
        startY: startY - lane.dir * i * 5.5 * 1.5, // pre-space the burst
        vy,
        spawnDelay: delayFrames,
        spawned: false,
        dead: false,
        packet: null,
      });
    }
  }

  // Tiny hue-shift helper — nudges an #rrggbb color slightly
  function shiftHex(hex, amount) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    return '#' +
      clamp(r + amount * 60).toString(16).padStart(2,'0') +
      clamp(g + amount * 40).toString(16).padStart(2,'0') +
      clamp(b + amount * 80).toString(16).padStart(2,'0');
  }

  // ── Kill a packet ────────────────────────────────────────────────────────
  function killPacket(p) {
    if (!p.packet) return;
    p.packet.byteSprites.forEach(sp => {
      sp.material.map?.dispose();
      sp.material.dispose();
      scene.remove(sp);
    });
    p.packet.labelSprite.material.map?.dispose();
    p.packet.labelSprite.material.dispose();
    scene.remove(p.packet.labelSprite);
    p.packet.state = 'dead';
    p.dead = true;
  }

  // ── Tick fade-in ─────────────────────────────────────────────────────────
  function tickFadeIn(pk) {
    if (pk.fadeInTick >= pk.fadeInDur) return;
    pk.fadeInTick++;
    const t = pk.fadeInTick / pk.fadeInDur;
    pk.byteSprites.forEach(sp => sp.material.opacity = t * pk.targetOpacity);
    pk.labelSprite.material.opacity = t * pk.targetLabelOpacity;
  }

  let frame = 0;

  // ── Main update — call once per animation frame ──────────────────────────
  function update() {
    frame++;

    // — Lane flow spawning —
    for (const lane of lanes) {
      if (lane.isQuiet) {
        lane.quietTimer++;
        if (lane.quietTimer >= lane.quietDur) {
          lane.isQuiet = false;
          lane.timer = 0;
          lane.nextFlowIn = 20 + Math.floor(Math.random() * 40);
        }
        continue;
      }

      lane.timer++;
      if (lane.timer >= lane.nextFlowIn) {
        spawnFlow(lane);
        lane.timer = 0;
        // Next flow: Poisson-like — mostly short gaps, occasionally long
        // Use exponential-ish distribution: -ln(U) * mean

        // adjust mean for traffic interval time
        const mean = 100;
        const u    = Math.max(0.01, Math.random());
        lane.nextFlowIn = Math.round(-Math.log(u) * mean);
        lane.nextFlowIn = Math.min(Math.max(lane.nextFlowIn, 18), 220);

        // Randomly go quiet after spawning (~8% chance)
        if (Math.random() < 0.08) {
          lane.isQuiet  = true;
          lane.quietDur = 80 + Math.floor(Math.random() * 180);
          lane.quietTimer = 0;
        }
      }
    }

    // — Packet lifecycle —
    for (let i = allPackets.length - 1; i >= 0; i--) {
      const entry = allPackets[i];
      if (entry.dead) { allPackets.splice(i, 1); continue; }

      // Delayed spawn — packet hasn't been built yet
      if (!entry.spawned) {
        entry.spawnDelay--;
        if (entry.spawnDelay <= 0) {
          entry.packet = buildPacket(
            scene, entry.type, entry.x, entry.startY, entry.vy, cache,
            {
              byteLen:            5,
              scale:              [4.0, 2.5],
              targetOpacity:      0.38,
              targetLabelOpacity: 0.30,
              glowing:            false,
              z:                  -1.5,
              fadeInDur:          20,
              spacing:            4.8,
            }
          );
          entry.spawned = true;
        }
        continue;
      }

      const pk = entry.packet;
      if (!pk || pk.state === 'dead') { entry.dead = true; allPackets.splice(i, 1); continue; }

      if (pk.state === 'fadingOut') {
        pk.byteSprites.forEach(sp => {
          sp.position.y      += pk.vy;
          sp.material.opacity = Math.max(0, sp.material.opacity - 0.025);
        });
        pk.labelSprite.position.y      += pk.vy;
        pk.labelSprite.material.opacity = Math.max(0, pk.labelSprite.material.opacity - 0.025);
        if (pk.byteSprites[0].material.opacity <= 0) killPacket(entry);
        continue;
      }

      tickFadeIn(pk);
      pk.byteSprites.forEach(sp => sp.position.y += pk.vy);
      pk.labelSprite.position.y += pk.vy;

// Expire based on the leading edge for each direction
      const headY = pk.byteSprites[0].position.y;
      const tailY = pk.byteSprites[pk.byteSprites.length - 1].position.y;
      if (entry.vy < 0 && tailY < firewallY - 12) pk.state = 'fadingOut'; // inbound: bottom byte past firewall
      if (entry.vy > 0 && headY > spawnY + 5)     pk.state = 'fadingOut'; // outbound: top byte past spawn
    }
  }

  // Seed lanes with in-flight packets at startup so the scene doesn't start empty
  function seed() {
    for (const lane of lanes) {
      // Spawn 1–2 flows per lane, scattered mid-flight
      const flowCount = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < flowCount; f++) {
        spawnFlow(lane);
      }
    }
    // Immediately build packets and scatter them vertically
    // by fast-forwarding the delay and repositioning
    for (const entry of allPackets) {
      entry.spawnDelay = 0;
      entry.packet = buildPacket(
        scene, entry.type, entry.x, entry.startY, entry.vy, cache,
        {
          byteLen: 5, scale: [4.0, 2.5],
          targetOpacity: 0.38, targetLabelOpacity: 0.30,
          glowing: false, z: -1.5, fadeInDur: 20, spacing: 4.8,
        }
      );
      entry.spawned = true;
      // Scatter mid-flight along the correct travel direction.
      // Inbound (vy < 0): starts at spawnY top, scatter downward from there.
      // Outbound (vy > 0): starts at firewallY bottom, scatter upward from there.
      const travelRange = spawnY - firewallY;
      const offset = Math.random() * travelRange * 0.9;
      const scatterY = entry.vy < 0 ? spawnY - offset : firewallY + offset;
      const dy = scatterY - entry.startY;
      entry.packet.byteSprites.forEach(sp => sp.position.y += dy);
      entry.packet.labelSprite.position.y += dy;
      // Pre-set opacity so they're already visible
      entry.packet.fadeInTick = entry.packet.fadeInDur;
      entry.packet.byteSprites.forEach(sp => sp.material.opacity = entry.packet.targetOpacity);
      entry.packet.labelSprite.material.opacity = entry.packet.targetLabelOpacity;
    }
  }

  return { update, seed };
}


// ─────────────────────────────────────────────────────────────────────────────
// PORT SCAN MANAGER — coordinates realistic sequential attack scans
// ─────────────────────────────────────────────────────────────────────────────
function createScanManager(scene, cache, firewallY, spawnY, onPacketSpawned) {
  const activeScan = { running: false };
  let scanTimer = 0;
  const SCAN_MIN_INTERVAL = 340; // frames between scan waves

  function startScan() {
    if (activeScan.running) return;
    const seq  = SCAN_SEQUENCES[Math.floor(Math.random() * SCAN_SEQUENCES.length)];
    const lane = (Math.floor(Math.random() * 5) - 2) * 14 + (Math.random() - 0.5) * 2;
    const gap  = 28 + Math.floor(Math.random() * 14); // frames between each probe
    activeScan.running = true;
    activeScan.seq     = seq;
    activeScan.idx     = 0;
    activeScan.lane    = lane;
    activeScan.gap     = gap;
    activeScan.timer   = 0;
  }

  function update() {
    scanTimer++;
    if (!activeScan.running && scanTimer > SCAN_MIN_INTERVAL + Math.floor(Math.random() * 200)) {
      startScan();
      scanTimer = 0;
    }

    if (activeScan.running) {
      activeScan.timer++;
      if (activeScan.timer >= activeScan.gap) {
        activeScan.timer = 0;
        const type = activeScan.seq[activeScan.idx];
        const x    = activeScan.lane + (Math.random() - 0.5) * 1.5;
        const pkt  = buildPacket(scene, type, x, spawnY, -(0.38 + Math.random() * 0.1), cache, {
          glitchMax:           20 + Math.floor(Math.random() * 8),
          canBreakThrough:     activeScan.idx === activeScan.seq.length - 1 && Math.random() < 0.2,
          targetOpacity:       0.85,
          targetLabelOpacity:  0.9,
          fadeInDur:           18,
        });
        onPacketSpawned(pkt);
        activeScan.idx++;
        if (activeScan.idx >= activeScan.seq.length) activeScan.running = false;
      }
    }
  }

  return { update };
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

  const FIREWALL_Y = -50;
  const SPAWN_Y    =  82;

  const cache   = {};
  const packets = [];   // active attack packets

  const fwFlasher  = makeFirewallFlasher(scene, FIREWALL_Y);

  // ── Flow manager for ambient traffic ─────────────────────────────────────
  const flowManager = createFlowManager(scene, cache, FIREWALL_Y, SPAWN_Y);
  flowManager.seed();

  // ── Scan manager for realistic port-scan attacks ──────────────────────────
  const scanManager = createScanManager(
    scene, cache, FIREWALL_Y, SPAWN_Y,
    pkt => packets.push(pkt)
  );

  // ── Established sessions (tighter lanes, more central) ────────────────────
  const established = [];
  const EST_LANES   = [-30, -20, 20, 30];
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
      targetOpacity:      0.22,
      targetLabelOpacity: 0.18,
      glowing:            false,
      z:                  -3,
      fadeInDur:          30,
    });
    est.packets.push(p);
  }

  for (const est of established) {
    spawnEstPacket(est);
    const p   = est.packets[0];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y);
    p.byteSprites.forEach(sp => sp.position.y -= off * est.dir);
    p.labelSprite.position.y -= off * est.dir;
    p.fadeInTick = p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = p.targetOpacity);
    p.labelSprite.material.opacity = p.targetLabelOpacity;
  }

  // ── Lone random attack spawner (non-scan, sporadic singles) ──────────────
  let soloAttackTimer = 0;

  function spawnSoloAttack() {
    const attack = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)];
    const lane   = Math.floor(Math.random() * 7) - 3;
    const x      = lane * 14 + (Math.random() - 0.5) * 3;
    packets.push(buildPacket(scene, attack, x, SPAWN_Y, -(0.4 + Math.random() * 0.12), cache, {
      glitchMax:           20 + Math.floor(Math.random() * 8),
      canBreakThrough:     Math.random() < 0.12,
      targetOpacity:       0.8,
      targetLabelOpacity:  0.9,
      fadeInDur:           22,
    }));
  }

  // Seed a few attack packets mid-flight
  for (let i = 0; i < 4; i++) {
    spawnSoloAttack();
    const p = packets[packets.length - 1];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y);
    p.byteSprites.forEach(sp => sp.position.y -= off);
    p.labelSprite.position.y -= off;
    p.fadeInTick = p.fadeInDur;
    p.byteSprites.forEach(sp => sp.material.opacity = p.targetOpacity);
    p.labelSprite.material.opacity = p.targetLabelOpacity;
  }

  // ── Kill helper ───────────────────────────────────────────────────────────
  function kill(p, arr, i) {
    p.byteSprites.forEach(sp => {
      sp.material.map?.dispose();
      sp.material.dispose();
      scene.remove(sp);
    });
    p.labelSprite.material.map?.dispose();
    p.labelSprite.material.dispose();
    scene.remove(p.labelSprite);
    p.state = 'dead';
    if (arr && i != null) arr.splice(i, 1);
  }

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
    flowManager.update();
    scanManager.update();

    // — Solo attack spawning (sporadic singles between scans) —
    soloAttackTimer++;
    const activeAttackCount = packets.filter(p => p.state !== 'dead').length;
    if (soloAttackTimer > 90 && activeAttackCount < 8) {
      spawnSoloAttack();
      soloAttackTimer = 0;
    }

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
            const oldTex = sp.material.map;
            sp.material.map = makeGlitchTexture(p.displayed[si] || rndHex(), p.color);
            oldTex?.dispose();
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


 // ── LAYER 1: EAST-WEST LATERAL TRAFFIC ─────────────────────────────────
  // Two lanes per edge (top/bottom only), different speeds/protocols/depths
  const LATERAL_PROTOCOLS = [
    { label: 'KERBEROS', color: C_BLUE  },
    { label: 'LDAP',     color: C_BLUE  },
    { label: 'SMB',      color: C_PURP  },
    { label: 'RDP',      color: C_PURP  },
    { label: 'DNS-INT',  color: C_BLUE  },
    { label: 'WINRM',    color: C_PURP  },
    { label: 'DCERPC',   color: C_BLUE  },
    { label: 'NTLM',     color: C_PURP  },
  ];

  // Lane definitions: edge, direction, speed, density, z-depth, protocol set
  const LATERAL_LANES = [
    // TOP EDGE — two lanes
    { edge: 'top',    dir:  1, speed: 0.55, z:  1.5, density: 'high', protocols: ['KERBEROS','LDAP','DNS-INT','DCERPC'] },
    { edge: 'top',    dir:  1, speed: 0.28, z: -0.5, density: 'low',  protocols: ['SMB','RDP','WINRM','NTLM'] },
    // BOTTOM EDGE — two lanes, opposing direction
    { edge: 'bottom', dir: -1, speed: 0.48, z:  1.5, density: 'high', protocols: ['KERBEROS','LDAP','DNS-INT','NTLM'] },
    { edge: 'bottom', dir: -1, speed: 0.22, z: -0.5, density: 'low',  protocols: ['SMB','RDP','DCERPC','WINRM'] },
  ];

  const BYTE_SPACING  = 14;  // world units between bytes along the edge
  const EDGE_HALFSPAN = 95; // just beyond viewport edge, ~BX

  // Each lane holds an array of sprites spread across the edge
  const lateralLanes = LATERAL_LANES.map(def => {
    const y       = def.edge === 'top' ? BY : -BY;
    const yOffset = def.z > 0 ? 2.5 : 0; // front lane slightly inward
    const count   = Math.ceil(EDGE_HALFSPAN * 2 / BYTE_SPACING) + 2;
    const sprites = [];

    for (let i = 0; i < count; i++) {
      const proto = def.protocols[Math.floor(Math.random() * def.protocols.length)];
      const col   = LATERAL_PROTOCOLS.find(p => p.label === proto)?.color || C_BLUE;
      const isLabel = (i % 5 === 0); // every 5th sprite shows protocol label

      const mat = new THREE.SpriteMaterial({
        map: isLabel
          ? makeLabelTexture(proto, col, cache)
          : getByteTexture(col, true),
        transparent: true, blending: THREE.AdditiveBlending,
        opacity: def.density === 'high' ? 0.5 + Math.random() * 0.2 : 0.3 + Math.random() * 0.15,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(isLabel ? 14 : 4.5, 2.6, 1);
      const x = -EDGE_HALFSPAN + i * BYTE_SPACING;
      sp.position.set(x, y + (def.edge === 'top' ? -yOffset : yOffset), def.z);
      scene.add(sp);
      sprites.push({ sp, mat, isLabel, proto, col,
        pulsePhase: Math.random() * Math.PI * 2,
        alertFlash: 0,
        refreshTimer: Math.floor(Math.random() * 120),
      });
    }
    return { ...def, sprites, y, yOffset };
  });

  // Flat list for scan interaction lookups
  const allLateralSprites = lateralLanes.flatMap(l => l.sprites);

  // ── LAYER 2: SCAN SWEEP ─────────────────────────────────────────────────
  const SCAN_COLS    = 24;
  const SCAN_SPACING = (BX * 2) / SCAN_COLS;
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
      map: getByteTexture(C_BLUE, false),
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
        map: getByteTexture(col, true),
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

    for (const s of allLateralSprites) {
      if (Math.random() < 0.15) s.alertFlash = 18;
    }
  }

  // ── ANIMATION LOOP ──────────────────────────────────────────────────────
  let frame = 0;
  (function animate() {
    requestAnimationFrame(animate);
    frame++;
    const t = frame * 0.016;

// — Lateral east-west traffic —
    const tSin = Math.sin(t * 1.1);
    for (const lane of lateralLanes) {
      for (const s of lane.sprites) {
        // Move along edge
        s.sp.position.x += lane.speed * lane.dir;

        // Wrap around when off the far edge
        if (lane.dir > 0 && s.sp.position.x >  EDGE_HALFSPAN + 8) s.sp.position.x = -EDGE_HALFSPAN - 8;
        if (lane.dir < 0 && s.sp.position.x < -EDGE_HALFSPAN - 8) s.sp.position.x =  EDGE_HALFSPAN + 8;

        // Pulse opacity
        if (s.alertFlash > 0) {
          s.alertFlash--;
          s.mat.opacity = 0.95;
          if (!s.isLabel) {
            s.mat.map = getByteTexture(C_ALERT, true);
            s.mat.needsUpdate = true;
          }
        } else {
          const base = lane.density === 'high' ? 0.42 : 0.25;
          s.mat.opacity = base + 0.12 * Math.sin(t * 1.1 + s.pulsePhase);
          s.mat.needsUpdate = false;
        }

        // Occasionally refresh hex values
        s.refreshTimer--;
        if (s.refreshTimer <= 0) {
          s.refreshTimer = 60 + Math.floor(Math.random() * 120);
          if (!s.isLabel) {
            s.mat.map = getByteTexture(s.col, true);
            s.mat.needsUpdate = true;
          }
        }
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
        sb.sp.material.map = getByteTexture(C_BLUE, false);
        sb.sp.material.needsUpdate = true;
      }
    }
    // Highlight lateral sprites near the scan line
    for (const s of allLateralSprites) {
      const sx = s.sp.position.x;
      if (sx < -BX - 10 || sx > BX + 10) continue; // off-screen cull
      const dist = Math.abs(s.sp.position.y - scanY);
      if (dist < 4 && s.alertFlash <= 0) {
        s.mat.opacity = Math.max(s.mat.opacity, 0.85 * (1 - dist / 4));
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
          rb.sp.material.map = getByteTexture(ac.col, true);
          rb.sp.material.needsUpdate = true;
        }
        if (ac.tick >= ac.holdDur) { ac.state = 'out'; ac.tick = 0; }
      } else {
        opacity = 1 - ac.tick / ac.outDur;
        if (ac.tick >= ac.outDur) {
          ac.byteSprites.forEach(b => {
            b.sp.material.map?.dispose();
            b.sp.material.dispose();
            scene.remove(b.sp);
          });
          ac.labelSp.material.map?.dispose();
          ac.labelSp.material.dispose();
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
