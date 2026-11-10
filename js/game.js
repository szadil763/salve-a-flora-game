/* SALVE A FLORA — jogo educativo sobre a proteção da flora brasileira */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const wrap = $('board-wrap');
  const overlay = $('overlay');
  const card = $('card');

  // ---------------- Dados ----------------
  const SPECIES = [
    { name: 'Ipê-amarelo', color: '#f7c948', dark: '#d9a514', shape: 'round' },
    { name: 'Ipê-roxo', color: '#d36fd8', dark: '#a8459f', shape: 'round' },
    { name: 'Pau-brasil', color: '#3fa34d', dark: '#2b7a37', shape: 'round' },
    { name: 'Jacarandá', color: '#8c8fe8', dark: '#5f62c4', shape: 'round' },
    { name: 'Araucária', color: '#2d6a4f', dark: '#1b4332', shape: 'araucaria' },
    { name: 'Jatobá', color: '#52b04a', dark: '#357a30', shape: 'round' },
  ];

  const LEVELS = [
    { name: 'Mata Atlântica', target: 0.40, time: 90, fire: 12, trash: 8, dozer: 0, spread: 0.12 },
    { name: 'Cerrado', target: 0.50, time: 90, fire: 9, trash: 7, dozer: 0, spread: 0.18 },
    { name: 'Floresta de Araucárias', target: 0.55, time: 95, fire: 8, trash: 6, dozer: 20, spread: 0.2 },
    { name: 'Pantanal', target: 0.60, time: 100, fire: 6.5, trash: 5, dozer: 15, spread: 0.24 },
    { name: 'Amazônia', target: 0.65, time: 110, fire: 5.5, trash: 4.5, dozer: 11, spread: 0.28 },
  ];

  const TIPS = [
    '<b>Pau-brasil</b> é a árvore nacional do Brasil e deu nome ao nosso país. Hoje ela está ameaçada de extinção.',
    'Restam apenas cerca de <b>12% da Mata Atlântica</b> original. Cada muda plantada ajuda a reconectar a floresta!',
    'O <b>Cerrado</b> é chamado de "berço das águas": nele nascem rios que abastecem várias bacias do Brasil.',
    'A <b>araucária</b> está ameaçada. A gralha-azul enterra pinhões para comer depois e, ao esquecê-los, ajuda a plantar novas árvores.',
    'Muitas queimadas começam por ação humana. <b>Nunca solte balões</b> nem jogue bitucas de cigarro na vegetação.',
    'Uma garrafa plástica pode levar <b>mais de 400 anos</b> para se decompor. Recicle e não jogue lixo na natureza!',
    'A <b>Amazônia</b> abriga uma das maiores biodiversidades de plantas do planeta e ajuda a regular as chuvas de todo o país.',
  ];

  const GROW_TIME = 5;      // segundos para a muda virar árvore
  const BURN_TIME = 6;      // segundos até a árvore virar cinzas
  const ASH_TIME = 10;      // segundos até as cinzas sumirem
  const MAX_WATER = 10;
  const MAX_SEEDS = 12;

  // ---------------- Armazenamento seguro ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  };

  // ---------------- Sons (sintetizados) ----------------
  const Sound = (() => {
    let ac = null;
    let muted = store.get('flora_muted', false);
    function ensure() {
      try {
        if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
        if (ac && ac.state === 'suspended') ac.resume();
      } catch (e) { ac = null; }
    }
    function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
      if (muted || !ac) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol = 0.2, freq = 1200, delay = 0) {
      if (muted || !ac) return;
      const t = ac.currentTime + delay;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource(); s.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
      const g = ac.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t);
    }
    return {
      ensure,
      get muted() { return muted; },
      toggle() { muted = !muted; store.set('flora_muted', muted); return muted; },
      plant() { tone(420, 0.14, 'triangle', 0.15, 780); },
      grow() { tone(660, 0.12, 'sine', 0.08, 1000); },
      water() { noise(0.35, 0.4, 1800); },
      trash() { tone(300, 0.07, 'square', 0.07); tone(520, 0.08, 'square', 0.05, null, 0.07); },
      fire() { noise(0.6, 0.3, 280); },
      chop() { noise(0.3, 0.35, 600); tone(130, 0.22, 'sawtooth', 0.07, 70); },
      expel() { tone(520, 0.18, 'square', 0.06, 180); },
      error() { tone(170, 0.15, 'sawtooth', 0.06); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.14, null, i * 0.12)); },
      lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, 'triangle', 0.14, null, i * 0.16)); },
    };
  })();

  // ---------------- Estado ----------------
  let G = null;
  let screen = 'menu'; // menu | playing | paused | levelEnd | over
  let best = store.get('flora_best', 0);
  let cols = 8, rows = 6, cell = 60, offX = 0, offY = 0, W = 0, H = 0, dpr = 1;
  let clock = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newGame() {
    G = { level: 0, score: 0 };
    startLevel();
  }

  function startLevel() {
    const L = LEVELS[G.level];
    measure();
    if (H > W * 1.15) { cols = 6; rows = 8; } else { cols = 8; rows = 6; }
    resize();

    G.cfg = L;
    G.grid = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        G.grid.push({ s: 'empty', sp: null, g: 0, b: 0, t: 0, acc: 0, v: Math.random(), c, r });
      }
    }
    const shuffled = G.grid.slice().sort(() => Math.random() - 0.5);
    const startTrees = Math.round(G.grid.length * 0.15);
    shuffled.slice(0, startTrees).forEach((cl) => { cl.s = 'tree'; cl.sp = pick(SPECIES); });
    shuffled.slice(startTrees, startTrees + 2 + G.level).forEach((cl) => { cl.s = 'trash'; });

    G.time = L.time;
    G.water = 8;
    G.seeds = 6;
    G.health = 100;
    G.waterAcc = 0;
    G.seedAcc = 0;
    G.fireT = L.fire + 3;
    G.trashT = L.trash;
    G.dozerT = L.dozer ? L.dozer * 0.6 : Infinity;
    G.dozers = [];
    G.particles = [];
    G.floats = [];
    G.birds = [];
    G.levelScore = 0;
    G.stats = { planted: 0, fires: 0, trash: 0, dozers: 0 };
    screen = 'playing';
    hideOverlay();
    updateHUD(true);
  }

  // ---------------- Tamanho ----------------
  function measure() {
    const r = wrap.getBoundingClientRect();
    W = Math.max(100, r.width - 16);
    H = Math.max(100, r.height - 8);
  }
  function resize() {
    measure();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    cell = Math.floor(Math.min(W / cols, H / rows));
    offX = Math.floor((W - cell * cols) / 2);
    offY = Math.floor((H - cell * rows) / 2);
  }
  window.addEventListener('resize', () => { resize(); });

  // ---------------- Utilidades de jogo ----------------
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? null : G.grid[r * cols + c];
  const neighbors = (cl) => [at(cl.c + 1, cl.r), at(cl.c - 1, cl.r), at(cl.c, cl.r + 1), at(cl.c, cl.r - 1)].filter(Boolean);
  const cellCenter = (cl) => ({ x: offX + (cl.c + 0.5) * cell, y: offY + (cl.r + 0.5) * cell });
  const countState = (s) => G.grid.reduce((n, cl) => n + (cl.s === s ? 1 : 0), 0);
  const coverage = () => countState('tree') / G.grid.length;

  function addScore(n, cl, color = '#f08c00') {
    G.score += n;
    G.levelScore += n;
    if (cl) floatText(cl, '+' + n, color);
  }
  function floatText(cl, text, color = '#fff') {
    const p = cellCenter(cl);
    G.floats.push({ x: p.x, y: p.y - cell * 0.2, text, color, life: 1.2 });
  }
  function burst(cl, color, n, opts = {}) {
    const p = cellCenter(cl);
    for (let i = 0; i < n; i++) {
      G.particles.push({
        x: p.x + rand(-cell * 0.25, cell * 0.25), y: p.y + rand(-cell * 0.25, cell * 0.1),
        vx: rand(-40, 40) * (opts.spread || 1), vy: rand(-90, -20) * (opts.up || 1),
        g: opts.g == null ? 120 : opts.g, life: rand(0.5, 1), max: 1, color, size: rand(2, 5) * (cell / 60),
      });
    }
  }

  function ignite(cl) {
    cl.s = 'fire'; cl.b = 0; cl.acc = 0;
    Sound.fire();
  }

  // ---------------- Ações do jogador ----------------
  function handleTap(x, y) {
    if (screen !== 'playing') return;
    // Trator primeiro
    for (const d of G.dozers) {
      const dx = offX + d.x * cell, dy = offY + (d.row + 0.5) * cell;
      if (Math.abs(x - dx) < cell * 0.55 && Math.abs(y - dy) < cell * 0.5) {
        d.dead = true;
        G.stats.dozers++;
        Sound.expel();
        const cl = at(clamp(Math.floor(d.x), 0, cols - 1), d.row);
        addScore(25, cl, '#ffd43b');
        burst(cl, '#adb5bd', 12, { g: 0, up: 0.6, spread: 2 });
        return;
      }
    }
    const c = Math.floor((x - offX) / cell), r = Math.floor((y - offY) / cell);
    const cl = at(c, r);
    if (!cl) return;

    switch (cl.s) {
      case 'empty':
        if (G.seeds <= 0) { floatText(cl, 'Sem sementes!', '#ffe3e3'); Sound.error(); return; }
        G.seeds--; cl.s = 'sprout'; cl.g = 0; cl.sp = pick(SPECIES);
        G.stats.planted++;
        addScore(5, cl);
        burst(cl, '#8d6e4a', 8);
        Sound.plant();
        break;
      case 'fire':
        if (G.water <= 0) { floatText(cl, 'Sem água!', '#ffe3e3'); Sound.error(); return; }
        G.water--; cl.s = 'tree'; cl.b = 0;
        G.stats.fires++;
        addScore(15, cl, '#74c0fc');
        burst(cl, '#4dabf7', 16, { up: 1.3 });
        Sound.water();
        break;
      case 'trash':
        cl.s = 'empty';
        G.seeds = Math.min(MAX_SEEDS, G.seeds + 1);
        G.stats.trash++;
        addScore(10, cl);
        burst(cl, '#ced4da', 8);
        Sound.trash();
        break;
      case 'ash':
        cl.s = 'empty';
        addScore(2, cl);
        burst(cl, '#868e96', 6);
        Sound.trash();
        break;
      case 'tree':
      case 'sprout':
        floatText(cl, cl.sp.name, '#ffffff');
        break;
    }
  }

  // ---------------- Atualização ----------------
  function update(dt) {
    const L = G.cfg;
    G.time -= dt;

    G.waterAcc += dt;
    if (G.waterAcc >= 1.3) { G.waterAcc = 0; G.water = Math.min(MAX_WATER, G.water + 1); }
    G.seedAcc += dt;
    if (G.seedAcc >= 3) { G.seedAcc = 0; G.seeds = Math.min(MAX_SEEDS, G.seeds + 1); }

    let fires = 0, trash = 0, trees = 0;
    for (const cl of G.grid) {
      if (cl.s === 'sprout') {
        cl.g += dt / GROW_TIME;
        if (cl.g >= 1) {
          cl.s = 'tree'; cl.g = 1;
          addScore(10, cl, '#8ce99a');
          burst(cl, cl.sp.color, 10);
          Sound.grow();
        }
      } else if (cl.s === 'fire') {
        fires++;
        cl.b += dt;
        cl.acc += dt;
        if (Math.random() < dt * 6) {
          const p = cellCenter(cl);
          G.particles.push({ x: p.x + rand(-cell * 0.2, cell * 0.2), y: p.y - cell * 0.3, vx: rand(-10, 10), vy: rand(-50, -30), g: 0, life: 1.2, max: 1.2, color: 'rgba(80,80,80,0.5)', size: rand(4, 8) * (cell / 60), smoke: true });
        }
        if (cl.acc >= 1) {
          cl.acc -= 1;
          if (Math.random() < L.spread) {
            const opts = neighbors(cl).filter((n) => n.s === 'tree' || n.s === 'sprout');
            if (opts.length) { const n = pick(opts); if (!n.sp) n.sp = pick(SPECIES); ignite(n); }
          }
        }
        if (cl.b >= BURN_TIME) { cl.s = 'ash'; cl.t = 0; G.health -= 4; }
      } else if (cl.s === 'ash') {
        cl.t += dt;
        if (cl.t >= ASH_TIME) cl.s = 'empty';
      } else if (cl.s === 'trash') {
        trash++;
      } else if (cl.s === 'tree') {
        trees++;
      }
    }

    // Perigos
    G.fireT -= dt;
    if (G.fireT <= 0) {
      G.fireT = L.fire * rand(0.7, 1.3);
      const opts = G.grid.filter((cl) => cl.s === 'tree');
      if (opts.length) ignite(pick(opts));
    }
    G.trashT -= dt;
    if (G.trashT <= 0) {
      G.trashT = L.trash * rand(0.7, 1.3);
      const opts = G.grid.filter((cl) => cl.s === 'empty');
      if (opts.length) { const cl = pick(opts); cl.s = 'trash'; }
    }
    G.dozerT -= dt;
    if (G.dozerT <= 0) {
      G.dozerT = L.dozer * rand(0.8, 1.2);
      const dir = Math.random() < 0.5 ? 1 : -1;
      G.dozers.push({ row: Math.floor(Math.random() * rows), x: dir > 0 ? -0.6 : cols + 0.6, dir, speed: 0.55, cut: 0 });
      Sound.chop();
    }

    // Tratores
    for (const d of G.dozers) {
      const front = d.x + d.dir * 0.35;
      const cl = at(Math.floor(front), d.row);
      if (cl && (cl.s === 'tree' || cl.s === 'sprout' || cl.s === 'fire')) {
        d.cut += dt;
        if (d.cut >= 1.1) {
          d.cut = 0;
          cl.s = 'empty'; cl.g = 0;
          G.health -= 3;
          burst(cl, '#8d6e4a', 12);
          Sound.chop();
        }
      } else {
        d.cut = 0;
        d.x += d.dir * d.speed * dt;
      }
      if (d.x < -1 || d.x > cols + 1) d.dead = true;
    }
    G.dozers = G.dozers.filter((d) => !d.dead);

    // Saúde
    const delta = -(fires * 1.6 + trash * 0.5 + G.dozers.length * 0.8) + trees * 0.05;
    G.health = clamp(G.health + delta * dt, 0, 100);

    // Pássaros (aparecem quando a floresta cresce)
    const cov = coverage();
    const wantBirds = Math.floor(cov * 8);
    if (G.birds.length < wantBirds && Math.random() < dt * 0.6) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      G.birds.push({ x: dir > 0 ? -20 : W + 20, y: rand(offY + 10, offY + cell * rows * 0.6), vx: dir * rand(50, 90), ph: rand(0, 6), color: pick(['#1c7ed6', '#e8590c', '#2b2b2b', '#f59f00']) });
    }
    for (const b of G.birds) { b.x += b.vx * dt; b.ph += dt * 10; b.y += Math.sin(b.ph * 0.3) * 0.4; }
    G.birds = G.birds.filter((b) => b.x > -40 && b.x < W + 40);

    updateEffects(dt);

    // Condições de fim
    if (cov >= L.target) return levelComplete();
    if (G.health <= 0) return gameOver('A natureza não resistiu às queimadas e ao lixo.');
    if (G.time <= 0) { G.time = 0; return gameOver('O tempo acabou antes de a floresta atingir a meta.'); }
  }

  function updateEffects(dt) {
    for (const p of G.particles) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    G.particles = G.particles.filter((p) => p.life > 0);
    for (const f of G.floats) { f.y -= 30 * dt; f.life -= dt; }
    G.floats = G.floats.filter((f) => f.life > 0);
  }

  // ---------------- Desenho ----------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSoil(cx, cy, s, color = '#8d6e4a') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.28, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCanopy(cx, by, s, sp, sway, color, dark) {
    if (sp.shape === 'araucaria') {
      const top = by - s * 0.62;
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(cx + sway, top + s * 0.08, s * 0.36, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx + sway, top, s * 0.32, s * 0.11, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + sway, top - s * 0.06, s * 0.2, s * 0.08, 0, Math.PI, 0); ctx.fill();
    } else {
      const top = by - s * 0.48;
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(cx + sway, top + s * 0.06, s * 0.27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(cx - s * 0.12 + sway, top, s * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.12 + sway, top, s * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + sway, top - s * 0.11, s * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawTree(cx, cy, s, sp, scale, burnt, v) {
    const by = cy + s * 0.3;
    const ss = s * scale;
    const sway = Math.sin(clock * 1.5 + v * 10) * s * 0.015;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(cx, by, ss * 0.28, ss * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // tronco
    const trunkH = sp.shape === 'araucaria' ? ss * 0.6 : ss * 0.36;
    ctx.fillStyle = '#7a4f2a';
    ctx.fillRect(cx - ss * 0.045, by - trunkH, ss * 0.09, trunkH);
    drawCanopy(cx, by, ss, sp, sway, sp.color, sp.dark);
    if (burnt > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, burnt);
      drawCanopy(cx, by, ss, sp, sway, '#3b2a1e', '#2a1d14');
      ctx.restore();
    }
  }

  function drawFlames(cx, cy, s, v) {
    const by = cy + s * 0.2;
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * s * 0.15;
      const h = s * (0.38 + 0.12 * Math.sin(clock * 14 + i * 2.1 + v * 9));
      const w = s * 0.13;
      ctx.fillStyle = '#ff6b00';
      ctx.beginPath();
      ctx.moveTo(cx + ox - w, by);
      ctx.quadraticCurveTo(cx + ox - w, by - h * 0.6, cx + ox, by - h);
      ctx.quadraticCurveTo(cx + ox + w, by - h * 0.6, cx + ox + w, by);
      ctx.fill();
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(cx + ox - w * 0.5, by);
      ctx.quadraticCurveTo(cx + ox - w * 0.5, by - h * 0.35, cx + ox, by - h * 0.6);
      ctx.quadraticCurveTo(cx + ox + w * 0.5, by - h * 0.35, cx + ox + w * 0.5, by);
      ctx.fill();
    }
  }

  function drawTrash(cx, cy, s) {
    // saco de lixo
    ctx.fillStyle = '#343a40';
    ctx.beginPath(); ctx.ellipse(cx - s * 0.08, cy + s * 0.1, s * 0.17, s * 0.19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#495057';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.14, cy - s * 0.07); ctx.lineTo(cx - s * 0.02, cy - s * 0.07); ctx.lineTo(cx - s * 0.08, cy - s * 0.15); ctx.fill();
    // garrafa
    ctx.save();
    ctx.translate(cx + s * 0.15, cy + s * 0.2);
    ctx.rotate(-0.9);
    ctx.fillStyle = 'rgba(116,192,252,0.9)';
    roundRect(-s * 0.05, -s * 0.13, s * 0.1, s * 0.2, s * 0.03); ctx.fill();
    ctx.fillRect(-s * 0.025, -s * 0.18, s * 0.05, s * 0.06);
    ctx.fillStyle = '#e03131';
    ctx.fillRect(-s * 0.03, -s * 0.2, s * 0.06, s * 0.03);
    ctx.restore();
    // lata
    ctx.fillStyle = '#ced4da';
    roundRect(cx + s * 0.02, cy - s * 0.12, s * 0.09, s * 0.13, s * 0.02); ctx.fill();
    ctx.fillStyle = '#e03131';
    ctx.fillRect(cx + s * 0.02, cy - s * 0.08, s * 0.09, s * 0.04);
  }

  function drawAsh(cx, cy, s) {
    ctx.fillStyle = '#6c6c6c';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.25, s * 0.3, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b2a1e';
    ctx.fillRect(cx - s * 0.05, cy + s * 0.1, s * 0.1, s * 0.15);
    ctx.fillStyle = '#9a9a9a';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(cx + (i - 1.5) * s * 0.12, cy + s * 0.24 + (i % 2) * s * 0.03, s * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawDozer(d) {
    const s = cell;
    const cx = offX + d.x * cell, cy = offY + (d.row + 0.5) * cell;
    const shake = d.cut > 0 ? Math.sin(clock * 60) * s * 0.02 : 0;
    ctx.save();
    ctx.translate(cx + shake, cy);
    ctx.scale(d.dir, 1);
    // alerta
    ctx.strokeStyle = `rgba(224,49,49,${0.5 + 0.5 * Math.sin(clock * 8)})`;
    ctx.lineWidth = Math.max(2, s * 0.04);
    roundRect(-s * 0.48, -s * 0.42, s * 0.96, s * 0.84, s * 0.12); ctx.stroke();
    // lâmina
    ctx.fillStyle = '#868e96';
    ctx.fillRect(s * 0.28, -s * 0.12, s * 0.09, s * 0.36);
    // corpo
    ctx.fillStyle = '#fab005';
    roundRect(-s * 0.3, -s * 0.05, s * 0.58, s * 0.22, s * 0.04); ctx.fill();
    // cabine
    ctx.fillStyle = '#f59f00';
    ctx.fillRect(-s * 0.26, -s * 0.28, s * 0.24, s * 0.24);
    ctx.fillStyle = '#a5d8ff';
    ctx.fillRect(-s * 0.22, -s * 0.24, s * 0.16, s * 0.12);
    // esteira
    ctx.fillStyle = '#212529';
    roundRect(-s * 0.32, s * 0.15, s * 0.6, s * 0.12, s * 0.06); ctx.fill();
    ctx.restore();
  }

  function drawBird(b) {
    const w = 8 + Math.sin(b.ph) * 4;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(b.x - 9, b.y - w * 0.5);
    ctx.quadraticCurveTo(b.x - 4, b.y - 2, b.x, b.y);
    ctx.quadraticCurveTo(b.x + 4, b.y - 2, b.x + 9, b.y - w * 0.5);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!G || !G.grid) return;

    // fundo do campo
    ctx.fillStyle = '#5c8d3a';
    roundRect(offX - 6, offY - 6, cell * cols + 12, cell * rows + 12, 14);
    ctx.fill();

    for (const cl of G.grid) {
      const x = offX + cl.c * cell, y = offY + cl.r * cell;
      const cx = x + cell / 2, cy = y + cell / 2;
      ctx.fillStyle = `hsl(${92 + cl.v * 14}, ${44 + cl.v * 8}%, ${44 + cl.v * 6}%)`;
      roundRect(x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.12);
      ctx.fill();

      switch (cl.s) {
        case 'empty':
          drawSoil(cx, cy, cell);
          // pequeno "+" convidando ao plantio
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = Math.max(1.5, cell * 0.03);
          ctx.beginPath();
          ctx.moveTo(cx - cell * 0.06, cy + cell * 0.05); ctx.lineTo(cx + cell * 0.06, cy + cell * 0.05);
          ctx.moveTo(cx, cy - cell * 0.01); ctx.lineTo(cx, cy + cell * 0.11);
          ctx.stroke();
          break;
        case 'sprout': {
          drawSoil(cx, cy, cell);
          if (cl.g < 0.5) {
            const h = cell * (0.1 + cl.g * 0.4);
            const by = cy + cell * 0.28;
            ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = Math.max(2, cell * 0.04);
            ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - h); ctx.stroke();
            ctx.fillStyle = '#69db7c';
            ctx.beginPath(); ctx.ellipse(cx - cell * 0.06, by - h, cell * 0.07, cell * 0.035, -0.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + cell * 0.06, by - h, cell * 0.07, cell * 0.035, 0.5, 0, Math.PI * 2); ctx.fill();
          } else {
            drawTree(cx, cy, cell, cl.sp, 0.45 + cl.g * 0.5, 0, cl.v);
          }
          // anel de crescimento
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = Math.max(2, cell * 0.04);
          ctx.beginPath(); ctx.arc(x + cell * 0.85, y + cell * 0.15, cell * 0.08, -Math.PI / 2, -Math.PI / 2 + cl.g * Math.PI * 2); ctx.stroke();
          break;
        }
        case 'tree':
          drawTree(cx, cy, cell, cl.sp, 1, 0, cl.v);
          break;
        case 'fire':
          ctx.fillStyle = `rgba(255,120,0,${0.25 + 0.1 * Math.sin(clock * 10)})`;
          roundRect(x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.12); ctx.fill();
          drawTree(cx, cy, cell, cl.sp, 1, cl.b / BURN_TIME, cl.v);
          drawFlames(cx, cy, cell, cl.v);
          // barra de tempo até queimar
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + cell * 0.15, y + cell * 0.88, cell * 0.7, cell * 0.06);
          ctx.fillStyle = '#e03131';
          ctx.fillRect(x + cell * 0.15, y + cell * 0.88, cell * 0.7 * (1 - cl.b / BURN_TIME), cell * 0.06);
          break;
        case 'ash':
          drawAsh(cx, cy, cell);
          break;
        case 'trash':
          drawTrash(cx, cy, cell);
          break;
      }
    }

    for (const d of G.dozers) drawDozer(d);
    for (const b of G.birds) drawBird(b);

    for (const p of G.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.smoke ? p.size * (2 - p.life) : p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(13, cell * 0.24);
    ctx.font = `bold ${fs}px "Trebuchet MS", Arial, sans-serif`;
    for (const f of G.floats) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- HUD ----------------
  const hud = {
    level: $('hud-level'), score: $('hud-score'), time: $('hud-time'), water: $('hud-water'), seeds: $('hud-seeds'),
    cov: $('hud-cov'), target: $('hud-target'), health: $('hud-health'),
    barCov: $('bar-cov'), barTarget: $('bar-target'), barHealth: $('bar-health'),
  };
  let hudAcc = 0;
  function updateHUD(force) {
    if (!G || !G.grid) return;
    hudAcc++;
    if (!force && hudAcc % 6) return;
    const cov = coverage();
    hud.level.textContent = `${G.level + 1}/${LEVELS.length}`;
    hud.score.textContent = G.score;
    hud.time.textContent = Math.ceil(G.time);
    hud.time.parentElement.classList.toggle('warn', G.time <= 15);
    hud.water.textContent = G.water;
    hud.water.parentElement.classList.toggle('warn', G.water === 0);
    hud.seeds.textContent = G.seeds;
    hud.seeds.parentElement.classList.toggle('warn', G.seeds === 0);
    hud.cov.textContent = Math.round(cov * 100) + '%';
    hud.target.textContent = Math.round(G.cfg.target * 100) + '%';
    hud.barCov.style.width = Math.min(100, cov * 100) + '%';
    hud.barTarget.style.left = G.cfg.target * 100 + '%';
    hud.health.textContent = Math.ceil(G.health);
    hud.barHealth.style.width = G.health + '%';
  }

  // ---------------- Telas ----------------
  function showOverlay(html) {
    card.innerHTML = html;
    overlay.classList.add('show');
    const btns = card.querySelectorAll('[data-action]');
    btns.forEach((b) => b.addEventListener('click', () => {
      Sound.ensure();
      actions[b.dataset.action]();
    }));
    if (btns[0]) btns[0].focus();
  }
  function hideOverlay() { overlay.classList.remove('show'); }

  const actions = {
    start: () => newGame(),
    next: () => { G.level++; startLevel(); },
    resume: () => { screen = 'playing'; hideOverlay(); last = performance.now(); },
    menu: () => showMenu(),
    howto: () => showHowTo(),
  };

  function showMenu() {
    screen = 'menu';
    showOverlay(`
      <div style="font-size:44px">🌳🦜🌺</div><h1>SALVE A FLORA</h1>
      <p class="sub">Proteja os biomas brasileiros: plante árvores, apague queimadas e mantenha a natureza limpa!</p>
      <button class="btn" data-action="start">▶ Jogar</button><br>
      <button class="btn secondary" data-action="howto">Como jogar</button>
      ${best ? `<p class="sub" style="margin-top:12px">🏆 Recorde: <b>${best}</b> pontos</p>` : ''}
    `);
  }

  function showHowTo() {
    showOverlay(`
      <h2>Como jogar</h2>
      <ul>
        <li>🌱 <b>Toque no solo</b> para plantar uma muda (gasta 1 semente). Em poucos segundos ela vira árvore.</li>
        <li>🔥 <b>Toque no fogo</b> para apagar (gasta 1 de água). Se demorar, a árvore vira cinzas e o fogo se espalha!</li>
        <li>🗑️ <b>Toque no lixo</b> para recolher. Você ganha uma semente de bônus.</li>
        <li>🚜 <b>Toque no trator</b> para expulsá-lo antes que ele derrube as árvores.</li>
        <li>🪨 Toque nas cinzas para limpar o terreno.</li>
        <li>💧 Água e 🌱 sementes se recarregam com o tempo.</li>
      </ul>
      <p>🎯 Alcance a <b>meta de floresta</b> antes que o tempo acabe e não deixe a <b>saúde</b> chegar a zero. São 5 biomas!</p>
      <button class="btn" data-action="start">▶ Jogar</button><br>
      <button class="btn secondary" data-action="menu">Voltar</button>
    `);
  }

  function levelComplete() {
    screen = 'levelEnd';
    const timeBonus = Math.ceil(G.time) * 5;
    const healthBonus = Math.round(G.health) * 2;
    G.score += timeBonus + healthBonus;
    Sound.win();
    const last = G.level === LEVELS.length - 1;
    if (G.score > best) { best = G.score; store.set('flora_best', best); }
    const tip = TIPS[G.level % TIPS.length];
    updateHUD(true);
    if (last) {
      showOverlay(`
        <h2>🏆 Você salvou a flora brasileira!</h2>
        <p>Todos os 5 biomas estão protegidos. Parabéns, guardião(ã) da natureza!</p>
        <div class="score-line"><span>Bônus de tempo</span><b>+${timeBonus}</b></div>
        <div class="score-line"><span>Bônus de saúde</span><b>+${healthBonus}</b></div>
        <div class="big-score">⭐ ${G.score}</div>
        <p class="sub">🏆 Recorde: ${best}</p>
        <div class="tip">🌎 ${TIPS[TIPS.length - 1]}</div>
        <button class="btn" data-action="start">Jogar de novo</button><br>
        <button class="btn secondary" data-action="menu">Menu</button>
      `);
    } else {
      showOverlay(`
        <h2>🌳 ${G.cfg.name} protegida!</h2>
        <div class="score-line"><span>Mudas plantadas</span><b>${G.stats.planted}</b></div>
        <div class="score-line"><span>Focos de incêndio apagados</span><b>${G.stats.fires}</b></div>
        <div class="score-line"><span>Lixo recolhido</span><b>${G.stats.trash}</b></div>
        <div class="score-line"><span>Tratores expulsos</span><b>${G.stats.dozers}</b></div>
        <div class="score-line"><span>Bônus de tempo</span><b>+${timeBonus}</b></div>
        <div class="score-line"><span>Bônus de saúde</span><b>+${healthBonus}</b></div>
        <div class="big-score">⭐ ${G.score}</div>
        <div class="tip">💡 <b>Você sabia?</b> ${tip}</div>
        <p class="sub">Próximo bioma: <b>${LEVELS[G.level + 1].name}</b></p>
        <button class="btn" data-action="next">Próxima fase ▶</button>
      `);
    }
  }

  function gameOver(reason) {
    screen = 'over';
    Sound.lose();
    if (G.score > best) { best = G.score; store.set('flora_best', best); }
    updateHUD(true);
    showOverlay(`
      <h2 class="bad">🔥 Fim de jogo</h2>
      <p>${reason}</p>
      <p class="sub">Você chegou até o bioma <b>${G.cfg.name}</b> (fase ${G.level + 1}).</p>
      <div class="big-score">⭐ ${G.score}</div>
      <p class="sub">🏆 Recorde: ${best}</p>
      <div class="tip">💡 ${TIPS[4]}</div>
      <button class="btn" data-action="start">Tentar de novo</button><br>
      <button class="btn secondary" data-action="menu">Menu</button>
    `);
  }

  function pause() {
    if (screen !== 'playing') return;
    screen = 'paused';
    showOverlay(`
      <h2>⏸️ Pausado</h2>
      <p>Fase ${G.level + 1}: <b>${G.cfg.name}</b></p>
      <button class="btn" data-action="resume">Continuar</button><br>
      <button class="btn secondary" data-action="menu">Sair para o menu</button>
    `);
  }

  // ---------------- Entrada ----------------
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.ensure();
    const r = canvas.getBoundingClientRect();
    handleTap(e.clientX - r.left, e.clientY - r.top);
  });
  $('btn-pause').addEventListener('click', () => { Sound.ensure(); if (screen === 'playing') pause(); else if (screen === 'paused') actions.resume(); });
  const soundBtn = $('btn-sound');
  const syncSoundBtn = () => { soundBtn.textContent = Sound.muted ? '🔇' : '🔊'; };
  soundBtn.addEventListener('click', () => { Sound.ensure(); Sound.toggle(); syncSoundBtn(); });
  syncSoundBtn();
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (screen === 'playing') pause(); else if (screen === 'paused') actions.resume(); }
  });

  // ---------------- Loop ----------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (screen === 'playing') {
      update(dt);
      updateHUD(false);
    } else if (G && G.particles && screen !== 'paused') {
      updateEffects(dt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // Tela de fundo do menu: um campo decorativo
  function demoField() {
    G = { level: 0, score: 0 };
    measure();
    if (H > W * 1.15) { cols = 6; rows = 8; } else { cols = 8; rows = 6; }
    resize();
    G.cfg = LEVELS[0];
    G.grid = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cl = { s: 'empty', sp: null, g: 0, b: 0, t: 0, acc: 0, v: Math.random(), c, r };
      if (Math.random() < 0.55) { cl.s = 'tree'; cl.sp = pick(SPECIES); }
      G.grid.push(cl);
    }
    G.time = LEVELS[0].time; G.water = 8; G.seeds = 6; G.health = 100;
    G.dozers = []; G.particles = []; G.floats = []; G.birds = [];
  }

  demoField();
  updateHUD(true);
  showMenu();
  requestAnimationFrame(frame);

  // Exposto apenas para testes automatizados
  window.__flora = { get state() { return G; }, get screen() { return screen; } };
})();
