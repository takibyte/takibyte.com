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
// ATTACK TYPE DEFINITIONS
// Roughly accurate TCP flags and destination ports per attack
// ─────────────────────────────────────────────────────────────────────────────
const ATTACK_TYPES = [
  { label: 'SYN → :22',    flags: '02', dport: '00 16', color: '#f7768e' }, // SSH
  { label: 'SYN → :3389',  flags: '02', dport: '0D 3D', color: '#f7768e' }, // RDP
  { label: 'XMAS → :443',  flags: '29', dport: '01 BB', color: '#f7768e' }, // HTTPS
  { label: 'NULL → :80',   flags: '00', dport: '00 50', color: '#f7768e' }, // HTTP
  { label: 'SYN → :8080',  flags: '02', dport: '1F 90', color: '#f7768e' },
  { label: 'ACK → :21',    flags: '10', dport: '00 15', color: '#f7768e' }, // FTP
  { label: 'EXPLOIT :445', flags: '18', dport: '01 BD', color: '#f7768e' }, // SMB
  { label: 'SYN → :23',   flags:  '02', dport: '00 17', color: '#f7768e' }, // Telnet
];

function buildRedPacket(scene, attack, x, startY, vy, cache) {
  const color = attack.color;
  // Ethernet (14) + IP (20) + TCP (20) byte sequence
  const rawBytes = [
    // Ethernet: dst MAC, src MAC, EtherType 0x0800
    'FF','FF','FF','FF','FF','FF',
    rndHex(),rndHex(),rndHex(),rndHex(),rndHex(),rndHex(),
    '08','00',
    // IP: ver/IHL, DSCP, len(2), id(2), flags/frag(2), TTL, proto=TCP, checksum(2)
    '45','00', rndHex(),rndHex(), rndHex(),rndHex(), '40','00',
    '40','06', rndHex(),rndHex(),
    // src IP (4), dst IP (4)
    rndHex(),rndHex(),rndHex(),rndHex(),
    rndHex(),rndHex(),rndHex(),rndHex(),
    // TCP: sport(2), dport(2), seq(4), ack(4), offset|flags, window(2), checksum(2), urg(2)
    rndHex(),rndHex(), ...attack.dport.split(' '),
    rndHex(),rndHex(),rndHex(),rndHex(),
    rndHex(),rndHex(),rndHex(),rndHex(),
    '50', attack.flags, rndHex(),rndHex(), rndHex(),rndHex(), '00','00',
  ];
  const ws       = 14 + Math.floor(Math.random() * 10);
  const displayed = rawBytes.slice(ws, ws + 8);
  const SPACING   = 5.5;
  const byteSprites = [];

  for (let i = 0; i < displayed.length; i++) {
    const mat = new THREE.SpriteMaterial({
      map: makeByteTexture(displayed[i], color, true, cache),
      transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0.8, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(5, 3, 1);
    sp.position.set(x, startY - i * SPACING, (Math.random() - 0.5) * 4);
    scene.add(sp);
    byteSprites.push(sp);
  }

  const labelSp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeLabelTexture(attack.label, color, cache),
    transparent: true, blending: THREE.AdditiveBlending,
    opacity: 0.9, depthWrite: false,
  }));
  labelSp.scale.set(18, 3, 1);
  labelSp.position.set(x + 4, startY + 5, 0);
  scene.add(labelSp);

  return {
    byteSprites, labelSprite: labelSp, x, vy,
    state: 'falling', glitchTick: 0,
    glitchMax: 20 + Math.floor(Math.random() * 8),
    canBreakThrough: Math.random() < 0.15,
    displayed, color,
  };
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

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.z = 90;

  const FIREWALL_Y = -50;
  const SPAWN_Y    =  65;
  const cache = {}, packets = [];
  let spawnTimer = 0;

  function spawn() {
    const attack = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)];
    const lane   = Math.floor(Math.random() * 9) - 4;
    const x      = lane * 16 + (Math.random() - 0.5) * 4;
    packets.push(buildRedPacket(scene, attack, x, SPAWN_Y, -(0.5 + Math.random() * 0.12), cache));
  }

  // Seed with packets already mid-flight
  for (let i = 0; i < 6; i++) {
    spawn();
    const p   = packets[packets.length - 1];
    const off = Math.random() * (SPAWN_Y - FIREWALL_Y);
    p.byteSprites.forEach(sp => sp.position.y -= off);
    p.labelSprite.position.y -= off;
  }

  function kill(p) {
    p.byteSprites.forEach(sp => scene.remove(sp));
    scene.remove(p.labelSprite);
    p.state = 'dead';
  }

  (function animate() {
    requestAnimationFrame(animate);
    spawnTimer++;
    if (spawnTimer > 55 && packets.filter(p => p.state !== 'dead').length < 10) {
      spawn(); spawnTimer = 0;
    }

    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      if (p.state === 'dead') { packets.splice(i, 1); continue; }

      if (p.state === 'falling') {
        p.byteSprites.forEach(sp => sp.position.y += p.vy);
        p.labelSprite.position.y += p.vy;
        if (p.byteSprites[p.byteSprites.length - 1].position.y <= FIREWALL_Y) {
          p.state = p.canBreakThrough ? 'through' : 'glitching';
          if (p.state === 'through') {
            p.byteSprites.forEach(sp => sp.material.opacity = 0.3);
            p.labelSprite.material.opacity = 0.25;
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
        if (p.glitchTick >= p.glitchMax) kill(p);

      } else if (p.state === 'through') {
        p.byteSprites.forEach(sp => {
          sp.position.y      += p.vy * 0.6;
          sp.material.opacity -= 0.004;
        });
        p.labelSprite.position.y      += p.vy * 0.6;
        p.labelSprite.material.opacity -= 0.004;
        if (p.byteSprites[0].material.opacity <= 0) kill(p);
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
// Three layered behaviours: perimeter patrol, scan sweep, alert columns
// ─────────────────────────────────────────────────────────────────────────────
function createBlueTeam() {
  const canvas   = document.getElementById('blueCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let W = canvas.parentElement.clientWidth;
  let H = canvas.parentElement.clientHeight;
  renderer.setSize(W, H);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.z = 90;

  // World half-extents (fov 60 at z=90 → half-height ≈ 51.96)
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

  // Map a distance along the perimeter to world x,y (clockwise from top-left)
  function perimPos(d) {
    d = ((d % PERIM) + PERIM) % PERIM;
    if (d < PW)       return { x: -BX + d,   y:  BY };       // top    L→R
    d -= PW;
    if (d < PH)       return { x:  BX,        y:  BY - d };   // right  T→B
    d -= PH;
    if (d < PW)       return { x:  BX - d,    y: -BY };       // bottom R→L
    d -= PW;
                      return { x: -BX,        y: -BY + d };   // left   B→T
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
    perimSprites.push({ sp, dist: t, hex: '', col,
      pulsePhase: Math.random() * Math.PI * 2,
      alertFlash: 0,
    });
  }

  // ── LAYER 2: SCAN SWEEP ─────────────────────────────────────────────────
  const SCAN_COLS    = 24;
  const SCAN_SPACING = (PW) / SCAN_COLS;
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
        new THREE.Vector3(bx,          BY - 1,               2),
        new THREE.Vector3(bx + side*2, BY - 1,               2),
        new THREE.Vector3(bx + side*2, BY - 1,               2),
        new THREE.Vector3(bx + side*2, BY - 4 - ROWS*ROW_H,  2),
        new THREE.Vector3(bx + side*2, BY - 4 - ROWS*ROW_H,  2),
        new THREE.Vector3(bx,          BY - 4 - ROWS*ROW_H,  2),
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

    // Ping nearby perimeter bytes orange
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





