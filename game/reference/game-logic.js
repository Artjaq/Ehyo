
class Component extends DCLogic {
  wrapRef = React.createRef();
  canvasRef = React.createRef();
  crtRef = React.createRef();
  xpFillRef = React.createRef();
  hpFillRef = React.createRef();
  hpTextRef = React.createRef();
  timeRef = React.createRef();
  lvlRef = React.createRef();
  killRef = React.createRef();
  joyBaseRef = React.createRef();
  joyStickRef = React.createRef();
  fTimeRef = React.createRef();
  fKillRef = React.createRef();
  fLvlRef = React.createRef();

  state = { screen: 'start', cards: [] };

  renderVals() {
    return {
      wrapRef: this.wrapRef, canvasRef: this.canvasRef, crtRef: this.crtRef,
      xpFillRef: this.xpFillRef, hpFillRef: this.hpFillRef, hpTextRef: this.hpTextRef,
      timeRef: this.timeRef, lvlRef: this.lvlRef, killRef: this.killRef,
      joyBaseRef: this.joyBaseRef, joyStickRef: this.joyStickRef,
      fTimeRef: this.fTimeRef, fKillRef: this.fKillRef, fLvlRef: this.fLvlRef,
      isStart: this.state.screen === 'start',
      isPlaying: this.state.screen === 'playing',
      isLevel: this.state.screen === 'levelup',
      isOver: this.state.screen === 'gameover',
      cards: this.state.cards,
      start: () => this.start(),
      restart: () => this.start(),
    };
  }

  componentDidMount() { this.setup(); }
  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }

  // ---------- setup ----------
  setup() {
    const cv = this.canvasRef.current;
    this.ctx = cv.getContext('2d');
    this.neon = this.props.leadNeon || '#ff2fb9';
    const wrap = this.wrapRef.current;
    if (wrap) wrap.style.setProperty('--neon', this.neon);
    if (this.crtRef.current) this.crtRef.current.style.opacity = String(this.props.crt ?? 0.55);

    this.keys = {}; this.joy = null;
    this.NEONS = ['#ff2fb9', '#22e0e0', '#e8ff33', '#6cff3a'];
    this.buildSprites();
    this.buildGlows();
    this.buildTile();
    this.initGame();

    this.onKey = (e) => {
      const k = e.key.toLowerCase();
      const map = { w:1,a:1,s:1,d:1,arrowup:1,arrowdown:1,arrowleft:1,arrowright:1 };
      if (map[k]) { this.keys[k] = (e.type === 'keydown'); e.preventDefault(); }
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('resize', this.onResize = () => this.resize());

    const el = this.wrapRef.current;
    el.addEventListener('pointerdown', (e) => this.onPointer('down', e));
    el.addEventListener('pointermove', (e) => this.onPointer('move', e));
    el.addEventListener('pointerup', (e) => this.onPointer('up', e));
    el.addEventListener('pointercancel', (e) => this.onPointer('up', e));

    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const cv = this.canvasRef.current; if (!cv) return;
    const r = this.wrapRef.current.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = Math.max(320, r.width); this.vh = Math.max(320, r.height);
    cv.width = Math.floor(this.vw * this.dpr);
    cv.height = Math.floor(this.vh * this.dpr);
  }

  // ---------- sprites ----------
  bake(w, h, rects, pal) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    rects.forEach(([rx, ry, rw, rh, k]) => { x.fillStyle = pal[k]; x.fillRect(rx, ry, rw, rh); });
    return c;
  }
  buildSprites() {
    const P = {
      player: { w:12,h:14,anchor:'foot',glow:this.neon, pal:{g:'#7a7f86',f:'#22252b',c:'#22e0e0',m:this.neon,s:'#e3e7ec',d:'#43464c',k:'#0b0b0d'},
        r:[[3,0,6,1,'k'],[3,1,6,5,'g'],[4,3,4,2,'f'],[2,6,8,4,'g'],[2,6,8,1,'c'],[9,6,2,4,'m'],[10,5,1,1,'s'],[3,10,2,4,'d'],[7,10,2,4,'d']] },
      cop: { w:12,h:14,anchor:'foot',glow:'#22e0e0', pal:{b:'#2a3350',h:'#151a2e',v:'#22e0e0',S:'#8f959c',k:'#101218',t:'#3a4straw'},
        r:[[3,0,6,3,'h'],[4,1,4,1,'v'],[3,3,6,7,'b'],[3,4,6,1,'k'],[1,4,2,8,'S'],[1,4,2,1,'k'],[3,10,2,4,'k'],[7,10,2,4,'k']] },
      buffer: { w:14,h:14,anchor:'foot',glow:'#ff7a1a', pal:{g:'#797d84',f:'#25272c',r:'#ff7a1a',y:'#f4e21a',w:'#5b4626',k:'#101218'},
        r:[[4,0,5,2,'g'],[4,2,5,2,'f'],[3,4,7,6,'r'],[3,4,7,1,'k'],[4,10,2,4,'g'],[7,10,2,4,'g'],[10,5,1,4,'w'],[11,4,3,3,'y']] },
      tagger: { w:12,h:14,anchor:'foot',glow:'#6cff3a', pal:{G:'#6cff3a',k:'#0e120d',y:'#d0ff2a',d:'#2f3a24',s:'#e3e7ec'},
        r:[[3,0,6,1,'k'],[3,1,6,5,'G'],[4,3,4,2,'k'],[2,6,8,5,'G'],[9,7,2,3,'y'],[10,6,1,1,'s'],[3,11,2,3,'d'],[7,11,2,3,'d']] },
      dog: { w:14,h:9,anchor:'foot',glow:this.neon, pal:{d:'#4a4d52',c:'#22e0e0',r:'#ff3b3b',k:'#0e0f12'},
        r:[[2,2,9,4,'d'],[10,1,4,3,'d'],[12,2,1,1,'r'],[9,2,1,4,'c'],[1,3,1,2,'d'],[3,6,1,3,'k'],[5,6,1,3,'k'],[8,6,1,3,'k'],[11,6,1,3,'k']] },
      drone: { w:12,h:10,anchor:'center',glow:'#ff3b3b', pal:{p:'#9aa0a6',b:'#2a2d33',r:'#ff3b3b',k:'#121418'},
        r:[[0,0,4,1,'p'],[8,0,4,1,'p'],[1,1,10,1,'k'],[3,2,6,4,'b'],[3,3,6,2,'r'],[3,5,6,1,'k']] },
    };
    // fix a bad palette value
    P.cop.pal.t = '#3a4256';
    this.spr = {};
    for (const key in P) { const s = P[key]; this.spr[key] = { cv: this.bake(s.w, s.h, s.r, s.pal), w:s.w, h:s.h, anchor:s.anchor, glow:s.glow }; }
  }
  buildGlows() {
    this.glows = {};
    const mk = (col) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
      g.addColorStop(0, col); g.addColorStop(.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = .55; x.fillStyle = g; x.beginPath(); x.arc(32,32,32,0,7); x.fill();
      return c;
    };
    [this.neon, '#22e0e0', '#e8ff33', '#6cff3a', '#ff7a1a', '#ff3b3b', '#ffffff'].forEach(c => this.glows[c] = mk(c));
    // shadow
    const s = document.createElement('canvas'); s.width = 64; s.height = 32; const sx = s.getContext('2d');
    const sg = sx.createRadialGradient(32,16,0,32,16,32); sg.addColorStop(0,'rgba(0,0,0,.5)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    sx.fillStyle = sg; sx.fillRect(0,0,64,32); this.shadow = s;
  }
  glow(col, x, y, size, a) {
    const g = this.glows[col] || this.glows['#ffffff'];
    const ctx = this.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(g, x - size/2, y - size/2, size, size); ctx.restore();
  }
  buildTile() {
    const T = 220; const c = document.createElement('canvas'); c.width = T; c.height = T;
    const x = c.getContext('2d');
    x.fillStyle = '#232427'; x.fillRect(0,0,T,T);
    for (let i=0;i<1400;i++){ const g=18+Math.random()*26; x.fillStyle=`rgba(${g},${g+2},${g+4},${Math.random()*.5})`; x.fillRect(Math.random()*T,Math.random()*T,2,2); }
    x.strokeStyle='rgba(0,0,0,.35)'; x.lineWidth=2;
    for (let i=0;i<3;i++){ x.beginPath(); let px=Math.random()*T, py=Math.random()*T; x.moveTo(px,py); for(let j=0;j<5;j++){ px+=(Math.random()-.5)*70; py+=(Math.random()-.5)*70; x.lineTo(px,py);} x.stroke(); }
    // tile seams
    x.strokeStyle='rgba(0,0,0,.5)'; x.lineWidth=3; x.strokeRect(1,1,T-2,T-2);
    this.tile = c; this.tilePattern = this.ctx.createPattern(c, 'repeat');
  }

  // ---------- game state ----------
  initGame() {
    const W = 3600, H = 1390;
    // station layout: wall band / platform / edge lip / track pit
    const L = { platTop:190, edgeY:1004, pitTop:1050, tunnelW:230 };
    const dm = { easy:.8, normal:1, hard:1.35 }[this.props.startDifficulty || 'normal'];
    this.g = {
      W, H, L, dm,
      p: { x:W/2, y:(L.platTop+L.edgeY)/2, hp:110, maxHp:110, speed:158, face:1,
           dmgMul:1, areaMul:1, fireMul:1, spdMul:1, pickup:78, bombs:1,
           fireCd:1.05, fireT:0, level:1, xp:0, xpNext:6 },
      cam:{x:0,y:0}, enemies:[], bombs:[], orbs:[], parts:[], splats:[], tags:[],
      pillars:[], benches:[], obstacles:[], signs:[], stencils:[], puddles:[],
      time:0, kills:0, spawnT:0, shake:0, pending:0,
    };
    const g = this.g;
    // support columns down the platform
    for (let x=520; x<W-200; x+=560){ g.pillars.push({ x, y:640 }); g.obstacles.push({ x, y:640, r:38 }); }
    // benches against the wall
    for (let x=800; x<W-300; x+=1120){ const y=252; g.benches.push({ x, y }); g.obstacles.push({ x:x-34, y, r:24 }, { x:x+34, y, r:24 }); }
    g.signs = [ {x:620, txt:'PLATFORM 3'}, {x:1840, txt:'NORTHGATE ST'}, {x:3060, txt:'PLATFORM 3'} ];
    for (let x=520; x<W; x+=880) g.stencils.push(x);
    for (let i=0;i<10;i++) g.puddles.push({ x:300+Math.random()*(W-400), y:L.pitTop+70+Math.random()*210, r:30+Math.random()*70, col:this.NEONS[(Math.random()*4)|0] });
    // graffiti: big pieces on the wall, faint tags on the floor
    this.decals = [];
    const words = ['REX','ZK','VYBE','OMEN','SL8','KAPO','NÎM','FLUX','13','WAKE'];
    for (let i=0;i<16;i++){
      this.decals.push({ x:120+Math.random()*(W-240), y:78+Math.random()*88, col:this.NEONS[(Math.random()*4)|0],
        rot:(Math.random()-.5)*0.12, txt:words[(Math.random()*words.length)|0], sz:30+Math.random()*34, a:.38+Math.random()*.25 });
    }
    for (let i=0;i<22;i++){
      this.decals.push({ x:Math.random()*W, y:L.platTop+80+Math.random()*(L.edgeY-L.platTop-140), col:this.NEONS[(Math.random()*4)|0],
        rot:(Math.random()-.5)*0.5, txt:words[(Math.random()*words.length)|0], sz:14+Math.random()*26, a:.09+Math.random()*.12 });
    }
  }

  start() {
    this.initGame();
    this.setState({ screen: 'playing', cards: [] });
  }

  // ---------- input ----------
  onPointer(kind, e) {
    if (this.state.screen !== 'playing') return;
    const r = this.wrapRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (kind === 'down') {
      this.joy = { id:e.pointerId, ox:px, oy:py, x:px, y:py };
      const b = this.joyBaseRef.current; if (b){ b.style.display='block'; b.style.left=px+'px'; b.style.top=py+'px'; }
      const s = this.joyStickRef.current; if (s){ s.style.left='50%'; s.style.top='50%'; }
    } else if (kind === 'move' && this.joy && e.pointerId === this.joy.id) {
      this.joy.x = px; this.joy.y = py;
      let dx = px - this.joy.ox, dy = py - this.joy.oy; const d = Math.hypot(dx,dy), max=52;
      if (d > max){ dx = dx/d*max; dy = dy/d*max; }
      const s = this.joyStickRef.current; if (s){ s.style.left=(60+dx)+'px'; s.style.top=(60+dy)+'px'; }
    } else if (kind === 'up' && this.joy && e.pointerId === this.joy.id) {
      this.joy = null; const b = this.joyBaseRef.current; if (b) b.style.display='none';
    }
  }
  moveVec() {
    let x=0,y=0;
    const k=this.keys;
    if (k.a||k.arrowleft) x-=1; if (k.d||k.arrowright) x+=1;
    if (k.w||k.arrowup) y-=1; if (k.s||k.arrowdown) y+=1;
    if (this.joy){ const dx=this.joy.x-this.joy.ox, dy=this.joy.y-this.joy.oy, d=Math.hypot(dx,dy); if (d>8){ x=dx/d; y=dy/d; } }
    const m = Math.hypot(x,y); if (m>1){ x/=m; y/=m; }
    return { x, y };
  }

  // ---------- loop ----------
  loop(t) {
    let dt = (t - this.last) / 1000; this.last = t; if (dt > 0.05) dt = 0.05;
    if (this.state.screen === 'playing') this.update(dt);
    this.render();
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }

  ENEMY_DEFS() {
    return {
      dog:    { spr:'dog',    hp:26, spd:118, dmg:7,  size:26, xp:3, s:1 },
      tagger: { spr:'tagger', hp:46, spd:74,  dmg:9,  size:30, xp:4, s:1 },
      cop:    { spr:'cop',    hp:64, spd:56,  dmg:13, size:32, xp:6, s:1 },
      buffer: { spr:'buffer', hp:96, spd:44,  dmg:11, size:36, xp:8, s:1 },
      drone:  { spr:'drone',  hp:24, spd:88,  dmg:6,  size:26, xp:3, s:1 },
    };
  }

  update(dt) {
    const g = this.g, p = g.p;
    g.time += dt;

    // move
    const mv = this.moveVec();
    p.x += mv.x * p.speed * p.spdMul * dt;
    p.y += mv.y * p.speed * p.spdMul * dt;
    p.x = Math.max(24, Math.min(g.W-24, p.x));
    p.y = Math.max(g.L.platTop+18, Math.min(g.L.edgeY-8, p.y));
    this.pushOut(p, 12);
    if (mv.x) p.face = mv.x < 0 ? -1 : 1;

    // camera
    g.cam.x = Math.max(0, Math.min(Math.max(0, g.W - this.vw), p.x - this.vw/2));
    g.cam.y = Math.max(0, Math.min(Math.max(0, g.H - this.vh), p.y - this.vh/2));

    // spawn
    g.spawnT -= dt;
    const interval = Math.max(0.3, 1.5 - g.time*0.013) / g.dm;
    if (g.spawnT <= 0 && g.enemies.length < 240) {
      g.spawnT = interval;
      const batch = 1 + Math.floor(g.time/26);
      for (let i=0;i<batch;i++) this.spawnEnemy();
    }

    // enemies
    const defs = this.ENEMY_DEFS();
    for (let i=g.enemies.length-1;i>=0;i--) {
      const e = g.enemies[i];
      const dx = p.x-e.x, dy = p.y-e.y, d = Math.hypot(dx,dy)||1;
      e.x += dx/d*e.spd*dt; e.y += dy/d*e.spd*dt;
      if (e.type !== 'drone') {
        e.y = Math.max(g.L.platTop+14, Math.min(g.L.edgeY-6, e.y));
        this.pushOut(e, e.size*0.28);
      }
      e.face = dx<0?-1:1;
      e.hitT -= dt;
      if (d < e.size*0.5 + 12 && e.hitT <= 0) {
        e.hitT = 0.6; p.hp -= e.dmg * g.dm; g.shake = Math.min(9, g.shake+4);
        if (p.hp <= 0) return this.gameOver();
      }
      e.flash = Math.max(0, e.flash - dt*6);
      if (e.hp <= 0) {
        g.enemies.splice(i,1); g.kills++;
        g.orbs.push({ x:e.x, y:e.y, xp:e.xp, vx:(Math.random()-.5)*40, vy:(Math.random()-.5)*40 });
        if (Math.random() < 0.14) this.spawnTag(e.x, e.y);
      }
    }

    // auto fire
    p.fireT -= dt;
    if (p.fireT <= 0 && g.enemies.length) {
      let best=null, bd=1e9;
      for (const e of g.enemies){ const dd=(e.x-p.x)**2+(e.y-p.y)**2; if (dd<bd){bd=dd;best=e;} }
      if (best) {
        p.fireT = p.fireCd / p.fireMul;
        const base = Math.atan2(best.y-p.y, best.x-p.x);
        const range = Math.max(120, Math.min(560, Math.sqrt(bd)));
        const n = p.bombs, spread = 0.28;
        for (let i=0;i<n;i++){
          const a = base + (i-(n-1)/2)*spread;
          const tx = p.x + Math.cos(a)*range, ty = p.y + Math.sin(a)*range;
          g.bombs.push({ x:p.x, y:p.y, sx:p.x, sy:p.y, tx, ty, prog:0, spd:430, col:this.NEONS[(Math.random()*4)|0], rot:0 });
        }
      }
    }

    // bombs
    const baseR = 70, baseDmg = 34;
    for (let i=g.bombs.length-1;i>=0;i--) {
      const b = g.bombs[i];
      const dx=b.tx-b.x, dy=b.ty-b.y, d=Math.hypot(dx,dy)||1;
      const step = b.spd*dt;
      b.rot += dt*14;
      if (d <= step+4) {
        this.explode(b.tx, b.ty, baseR*p.areaMul, baseDmg*p.dmgMul, b.col);
        g.bombs.splice(i,1);
      } else { b.x += dx/d*step; b.y += dy/d*step; b.prog = 1 - d/(Math.hypot(b.tx-b.sx,b.ty-b.sy)||1); }
    }

    // orbs
    for (let i=g.orbs.length-1;i>=0;i--) {
      const o = g.orbs[i];
      o.x += o.vx*dt; o.y += o.vy*dt; o.vx*=0.9; o.vy*=0.9;
      const dx=p.x-o.x, dy=p.y-o.y, d=Math.hypot(dx,dy)||1;
      if (d < p.pickup) { o.x += dx/d*260*dt; o.y += dy/d*260*dt; }
      if (d < 16) { g.orbs.splice(i,1); this.gainXp(o.xp); }
    }

    // particles
    for (let i=g.parts.length-1;i>=0;i--) {
      const q=g.parts[i]; q.x+=q.vx*dt; q.y+=q.vy*dt; q.vx*=0.92; q.vy*=0.92; q.life-=dt;
      if (q.life<=0) g.parts.splice(i,1);
    }
    // tags float
    for (let i=g.tags.length-1;i>=0;i--){ const tg=g.tags[i]; tg.y-=26*dt; tg.life-=dt; if(tg.life<=0) g.tags.splice(i,1); }

    if (g.splats.length > 60) g.splats.splice(0, g.splats.length-60);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt*22);

    this.updateHud();
  }

  spawnEnemy() {
    const g = this.g, defs = this.ENEMY_DEFS();
    // weighted pick, harder types grow with time
    const t = g.time;
    const weights = { dog: 3+Math.max(0,t*0.02), tagger: 1.5+t*0.03, cop: t>25?1+t*0.03:0.2, buffer: t>50?0.8+t*0.02:0, drone: t>15?1+t*0.02:0.3 };
    let total=0; for (const k in weights) total+=weights[k];
    let r=Math.random()*total, key='dog';
    for (const k in weights){ r-=weights[k]; if (r<=0){ key=k; break; } }
    const d = defs[key];
    let ex, ey;
    if (key === 'drone') {
      const ang = Math.random()*Math.PI*2;
      const rad = Math.max(this.vw, this.vh)*0.62 + 60;
      ex = Math.max(30, Math.min(g.W-30, g.p.x+Math.cos(ang)*rad));
      ey = Math.max(30, Math.min(g.H-30, g.p.y+Math.sin(ang)*rad));
    } else {
      const L = g.L;
      const side = Math.random()<.5 ? -1 : 1;
      ex = side<0 ? g.cam.x - 90 - Math.random()*160 : g.cam.x + this.vw + 90 + Math.random()*160;
      if (ex < 30 || ex > g.W-30) ex = side<0 ? g.cam.x + this.vw + 90 + Math.random()*160 : g.cam.x - 90 - Math.random()*160;
      ex = Math.max(30, Math.min(g.W-30, ex));
      ey = L.platTop + 26 + Math.random()*(L.edgeY - L.platTop - 52);
    }
    const elite = t>60 && Math.random()<0.09;
    const hpScale = 1 + t*0.012;
    g.enemies.push({
      type:key, spr:d.spr, x: ex, y: ey,
      hp: d.hp*hpScale*(elite?2.4:1), maxHp: d.hp*hpScale*(elite?2.4:1),
      spd: d.spd*(elite?0.85:1), dmg: d.dmg*(elite?1.6:1), size: d.size*(elite?1.4:1),
      xp: d.xp*(elite?4:1), face:1, hitT:0, flash:0, elite, scale:(elite?1.4:1),
    });
  }

  explode(x, y, radius, dmg, col) {
    const g = this.g;
    for (const e of g.enemies) {
      const d = Math.hypot(e.x-x, e.y-y);
      if (d < radius + e.size*0.4) { e.hp -= dmg; e.flash = 1;
        const k = Math.max(0, 1 - d/radius)*40; const a=Math.atan2(e.y-y,e.x-x); e.x+=Math.cos(a)*k; e.y+=Math.sin(a)*k; }
    }
    // splat decal
    const blobs=[]; const nb = 5 + (Math.random()*4|0);
    for (let i=0;i<nb;i++) blobs.push({ dx:(Math.random()-.5)*radius*1.1, dy:(Math.random()-.5)*radius*1.1, r: radius*(0.18+Math.random()*0.34) });
    g.splats.push({ x, y, col, blobs });
    // particles
    for (let i=0;i<16;i++){ const a=Math.random()*7, s=60+Math.random()*220; g.parts.push({ x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:2+Math.random()*4, col, life:0.4+Math.random()*0.4, max:0.8 }); }
    g.shake = Math.min(12, g.shake + radius*0.06);
  }

  spawnTag(x,y){ const words=['REKT','BOOM','TAGGED','FRESH','SPLAT','BUFF\'D']; this.g.tags.push({ x, y, txt:words[(Math.random()*words.length)|0], col:this.NEONS[(Math.random()*4)|0], life:0.9 }); }

  gainXp(v) {
    const p = this.g.p; p.xp += v;
    let leveled = 0;
    while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = Math.floor(p.xpNext*1.32 + 4); leveled++; }
    if (leveled) { this.g.pending += leveled; this.openLevelUp(); }
  }

  UPGRADES() {
    return [
      { id:'area', tag:'A', color:'#ff2fb9', title:'FAT CAP', desc:'+28% paint bomb blast radius.', ap:p=>p.areaMul*=1.28 },
      { id:'dmg', tag:'D', color:'#e8ff33', title:'HEAVY INK', desc:'+22% bomb damage.', ap:p=>p.dmgMul*=1.22 },
      { id:'fire', tag:'F', color:'#22e0e0', title:'RAPID SHAKE', desc:'+20% throw speed.', ap:p=>p.fireMul*=1.2 },
      { id:'spd', tag:'S', color:'#6cff3a', title:'FRESH KICKS', desc:'+14% move speed.', ap:p=>p.spdMul*=1.14 },
      { id:'bomb', tag:'+', color:'#ff7a1a', title:'DOUBLE TOSS', desc:'Throw one more bomb per volley.', ap:p=>p.bombs+=1 },
      { id:'pick', tag:'P', color:'#22e0e0', title:'DEEP POCKETS', desc:'+30% paint pickup range.', ap:p=>p.pickup*=1.3 },
      { id:'hp', tag:'H', color:'#ff2f5e', title:'IRON LUNGS', desc:'+25 max HP and patch up.', ap:p=>{ p.maxHp+=25; p.hp=Math.min(p.maxHp,p.hp+25); } },
      { id:'heal', tag:'♥', color:'#6cff3a', title:'FRESH COAT', desc:'Heal 45% of max HP now.', ap:p=>{ p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.45); } },
    ];
  }
  openLevelUp() {
    const pool = this.UPGRADES().slice();
    const picks = [];
    for (let i=0;i<3 && pool.length;i++){ const idx=(Math.random()*pool.length)|0; const u=pool.splice(idx,1)[0]; picks.push({ ...u, onPick:()=>this.pick(u) }); }
    this.setState({ screen:'levelup', cards:picks });
  }
  pick(u) {
    u.ap(this.g.p);
    this.g.pending--;
    if (this.g.pending > 0) this.openLevelUp();
    else this.setState({ screen:'playing', cards:[] });
  }

  gameOver() {
    const g = this.g;
    this.setState({ screen:'gameover', cards:[] });
    setTimeout(() => {
      if (this.fTimeRef.current) this.fTimeRef.current.textContent = this.fmt(g.time);
      if (this.fKillRef.current) this.fKillRef.current.textContent = g.kills;
      if (this.fLvlRef.current) this.fLvlRef.current.textContent = 'LV ' + g.p.level;
    }, 30);
  }

  fmt(t){ const m=Math.floor(t/60), s=Math.floor(t%60); return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  updateHud() {
    const g = this.g, p = g.p;
    if (this.hpFillRef.current) this.hpFillRef.current.style.width = Math.max(0, p.hp/p.maxHp*100)+'%';
    if (this.hpTextRef.current) this.hpTextRef.current.textContent = Math.max(0, Math.ceil(p.hp));
    if (this.xpFillRef.current) this.xpFillRef.current.style.width = (p.xp/p.xpNext*100)+'%';
    if (this.lvlRef.current) this.lvlRef.current.textContent = p.level;
    if (this.timeRef.current) this.timeRef.current.textContent = this.fmt(g.time);
    if (this.killRef.current) this.killRef.current.textContent = g.kills;
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx; if (!ctx) return;
    const g = this.g, dpr = this.dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,this.vw,this.vh);

    let sx=0, sy=0;
    if (g.shake>0){ sx=(Math.random()-.5)*g.shake; sy=(Math.random()-.5)*g.shake; }
    ctx.save();
    ctx.translate(-g.cam.x + sx, -g.cam.y + sy);

    // station architecture
    this.drawScene(ctx, g);

    // ambient graffiti decals
    ctx.font = "700 1px 'Silkscreen', monospace";
    for (const d of this.decals) {
      if (d.x < g.cam.x-120 || d.x > g.cam.x+this.vw+120 || d.y < g.cam.y-120 || d.y > g.cam.y+this.vh+120) continue;
      ctx.save(); ctx.translate(d.x,d.y); ctx.rotate(d.rot); ctx.globalAlpha=d.a;
      ctx.font = `700 ${d.sz}px 'Silkscreen', monospace`; ctx.fillStyle=d.col;
      ctx.fillText(d.txt, 0, 0); ctx.restore();
    }

    // paint splats
    for (const s of g.splats) {
      ctx.save(); ctx.globalAlpha = 0.82; ctx.fillStyle = s.col;
      for (const b of s.blobs){ ctx.beginPath(); ctx.arc(s.x+b.dx, s.y+b.dy, b.r, 0, 7); ctx.fill(); }
      ctx.restore();
    }

    // orbs
    for (const o of g.orbs) { this.glow('#22e0e0', o.x, o.y, 20, .7); ctx.fillStyle='#bffcff'; ctx.beginPath(); ctx.arc(o.x,o.y,3.4,0,7); ctx.fill(); }

    // y-sorted world objects: benches, pillars, enemies, player
    const S = 3.5;
    const p = g.p;
    const list = [];
    for (const b of g.benches) list.push({ y:b.y+12, f:() => this.drawBench(b.x, b.y) });
    for (const pl of g.pillars) list.push({ y:pl.y+24, f:() => this.drawPillar(pl.x, pl.y) });
    for (const e of g.enemies) list.push({ y:e.y, f:() => {
      const sp = this.spr[e.spr]; const sc = S * (e.scale||1);
      ctx.globalAlpha=.5; ctx.drawImage(this.shadow, e.x-14, e.y+2, 28, 12); ctx.globalAlpha=1;
      if (e.type==='drone') this.glow(sp.glow, e.x, e.y, 34*(e.scale||1), .5);
      else this.glow(sp.glow, e.x, e.y-4, 30*(e.scale||1), .38);
      this.drawSprite(sp, e.x, e.y, sc, e.face);
      if (e.flash>0){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=e.flash*.8; ctx.fillStyle='#fff'; ctx.fillRect(e.x-sp.w*sc/2, e.y-sp.h*sc, sp.w*sc, sp.h*sc); ctx.restore(); }
    }});
    list.push({ y:p.y, f:() => {
      ctx.globalAlpha=.5; ctx.drawImage(this.shadow, p.x-16, p.y+2, 32, 13); ctx.globalAlpha=1;
      this.glow(this.neon, p.x, p.y-6, 34, .45);
      this.drawSprite(this.spr.player, p.x, p.y, S, p.face);
    }});
    list.sort((a,b) => a.y - b.y);
    for (const it of list) it.f();

    // bombs
    for (const b of g.bombs) {
      const hop = Math.sin(b.prog*Math.PI)*18;
      ctx.globalAlpha=.4; ctx.drawImage(this.shadow, b.x-8, b.y, 16, 7); ctx.globalAlpha=1;
      const by = b.y - hop;
      this.glow(b.col, b.x, by, 22, .8);
      ctx.save(); ctx.translate(b.x, by); ctx.rotate(b.rot);
      ctx.fillStyle='#141518'; ctx.fillRect(-5,-5,10,10);
      ctx.fillStyle=b.col; ctx.fillRect(-2,-2,4,4);
      ctx.restore();
    }

    // particles
    for (const q of g.parts) { ctx.globalAlpha = Math.max(0,q.life/q.max); ctx.fillStyle=q.col; ctx.beginPath(); ctx.arc(q.x,q.y,q.r,0,7); ctx.fill(); }
    ctx.globalAlpha=1;

    // floating tags
    for (const tg of g.tags) {
      ctx.save(); ctx.globalAlpha=Math.min(1,tg.life*1.6);
      ctx.font="700 16px 'Silkscreen', monospace"; ctx.textAlign='center';
      ctx.fillStyle='#0a0a0c'; ctx.fillText(tg.txt, tg.x+2, tg.y+2);
      ctx.fillStyle=tg.col; ctx.fillText(tg.txt, tg.x, tg.y); ctx.restore();
    }
    ctx.textAlign='left';

    ctx.restore();
  }

  pushOut(ent, er) {
    for (const o of this.g.obstacles) {
      const dx = ent.x-o.x, dy = ent.y-o.y, d = Math.hypot(dx,dy), min = o.r+er;
      if (d > 0.01 && d < min) { ent.x = o.x + dx/d*min; ent.y = o.y + dy/d*min; }
    }
  }

  drawScene(ctx, g) {
    const L = g.L;
    const x0 = g.cam.x-8, x1 = g.cam.x+this.vw+8, y0 = g.cam.y-8, y1 = g.cam.y+this.vh+8;

    // platform concrete
    ctx.fillStyle = this.tilePattern;
    ctx.fillRect(x0, y0, x1-x0, y1-y0);

    // ---- back wall band ----
    if (y0 < L.platTop) {
      ctx.fillStyle = '#141519'; ctx.fillRect(x0, y0, x1-x0, L.platTop-y0);
      // tile courses
      ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 2;
      for (let ty=26; ty<L.platTop-10; ty+=26) { ctx.beginPath(); ctx.moveTo(x0,ty); ctx.lineTo(x1,ty); ctx.stroke(); }
      for (let row=0; row<7; row++) {
        const ty = row*26, offx = (row%2)*23;
        for (let tx = Math.floor(x0/46)*46 + offx; tx < x1; tx += 46) {
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, Math.min(ty+26, L.platTop-10)); ctx.stroke();
        }
      }
      // trim stripe
      ctx.fillStyle = '#4b1230'; ctx.fillRect(x0, L.platTop-36, x1-x0, 10);
      // station signs
      ctx.textAlign = 'center';
      for (const s of g.signs) {
        if (s.x < x0-160 || s.x > x1+160) continue;
        const w = 30 + s.txt.length*15;
        ctx.fillStyle = '#0c0d10'; ctx.fillRect(s.x-w/2-3, 52-3, w+6, 46);
        ctx.fillStyle = '#e9e6dc'; ctx.fillRect(s.x-w/2, 52, w, 40);
        ctx.fillStyle = '#15171b'; ctx.font = "700 17px 'Silkscreen', monospace";
        ctx.fillText(s.txt, s.x, 79);
      }
      ctx.textAlign = 'left';
      // wall base + drop shadow onto floor
      ctx.fillStyle = '#0a0b0d'; ctx.fillRect(x0, L.platTop-8, x1-x0, 8);
      const wg = ctx.createLinearGradient(0, L.platTop, 0, L.platTop+30);
      wg.addColorStop(0, 'rgba(0,0,0,.55)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = wg; ctx.fillRect(x0, L.platTop, x1-x0, 30);
    }

    // ---- platform edge + track pit ----
    if (y1 > L.edgeY) {
      // edge lip
      ctx.fillStyle = '#36383e'; ctx.fillRect(x0, L.edgeY, x1-x0, L.pitTop-L.edgeY);
      ctx.fillStyle = 'rgba(232,255,51,.10)'; ctx.fillRect(x0, L.edgeY+2, x1-x0, 16);
      ctx.fillStyle = '#e8ff33'; ctx.fillRect(x0, L.edgeY+6, x1-x0, 7);
      // tactile studs
      ctx.fillStyle = 'rgba(240,255,120,.30)';
      for (let dx = Math.floor(x0/20)*20; dx < x1; dx += 20) ctx.fillRect(dx, L.edgeY+24, 6, 6);
      // stencils
      ctx.font = "700 13px 'Silkscreen', monospace"; ctx.fillStyle = 'rgba(255,255,255,.20)';
      for (const sx of g.stencils) if (sx > x0-200 && sx < x1) ctx.fillText('STAND BACK', sx, L.edgeY+42);

      // pit
      ctx.fillStyle = '#0b0c0f'; ctx.fillRect(x0, L.pitTop, x1-x0, y1-L.pitTop);
      ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = this.tilePattern;
      ctx.fillRect(x0, L.pitTop, x1-x0, g.H-L.pitTop); ctx.restore();
      // pit wall shadow
      const pg = ctx.createLinearGradient(0, L.pitTop, 0, L.pitTop+34);
      pg.addColorStop(0, 'rgba(0,0,0,.8)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg; ctx.fillRect(x0, L.pitTop, x1-x0, 34);
      // sleepers
      ctx.fillStyle = '#16171b';
      const st = L.pitTop+44, sh = g.H-L.pitTop-78;
      for (let sxp = Math.floor(x0/48)*48; sxp < x1; sxp += 48) ctx.fillRect(sxp, st, 18, sh);
      // rails
      for (const ry of [L.pitTop+82, L.pitTop+198]) {
        ctx.fillStyle = '#3a3f46'; ctx.fillRect(x0, ry, x1-x0, 8);
        ctx.fillStyle = '#8b939d'; ctx.fillRect(x0, ry, x1-x0, 3);
      }
      // third rail
      ctx.fillStyle = '#23262c'; ctx.fillRect(x0, L.pitTop+20, x1-x0, 5);
      // neon reflections in puddles
      for (const pd of g.puddles) {
        if (pd.x < x0-100 || pd.x > x1+100) continue;
        ctx.save(); ctx.globalAlpha = .15; ctx.fillStyle = pd.col;
        ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.r, pd.r*0.28, 0, 0, 7); ctx.fill(); ctx.restore();
      }
      // tunnel mouth (left end)
      if (x0 < L.tunnelW+240) {
        const tg = ctx.createLinearGradient(L.tunnelW+240, 0, 0, 0);
        tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(.5, 'rgba(0,0,0,.88)'); tg.addColorStop(1, '#000');
        ctx.fillStyle = tg; ctx.fillRect(0, L.pitTop, L.tunnelW+240, g.H-L.pitTop);
        // hazard chevron strip at tunnel jamb
        for (let cy = L.pitTop; cy < g.H; cy += 24) {
          ctx.fillStyle = ((cy/24)|0)%2 ? '#e8ff33' : '#141416';
          ctx.fillRect(L.tunnelW+232, cy, 8, 24);
        }
        // signal light in the dark
        this.glow('#6cff3a', 92, L.pitTop+46, 30, .85);
        ctx.fillStyle = '#6cff3a'; ctx.fillRect(88, L.pitTop+42, 7, 7);
      }
    }
  }

  drawPillar(x, y) {
    const ctx = this.ctx, s = 58;
    ctx.globalAlpha = .45; ctx.drawImage(this.shadow, x-s*0.85, y+s*0.26, s*1.7, s*0.62); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d0e11'; ctx.fillRect(x-s/2-3, y-s/2-3, s+6, s+6);
    ctx.fillStyle = '#3d4149'; ctx.fillRect(x-s/2, y-s/2, s, s);
    ctx.fillStyle = '#50555e'; ctx.fillRect(x-s/2, y-s/2, s, 10);
    ctx.fillStyle = '#2c2f35'; ctx.fillRect(x-s/2, y+s/2-14, s, 14);
    // hazard band at base
    const seg = s/6;
    for (let i=0;i<6;i++) { ctx.fillStyle = i%2 ? '#e8ff33' : '#17181c'; ctx.fillRect(x-s/2 + i*seg, y+s/2-6, seg, 6); }
    // wrapped tag scribble
    ctx.fillStyle = this.NEONS[((x/560)|0) % 4];
    ctx.globalAlpha = .8;
    ctx.fillRect(x-14, y-6, 20, 4); ctx.fillRect(x-8, y+2, 16, 4); ctx.fillRect(x-16, y+10, 12, 4);
    ctx.globalAlpha = 1;
  }

  drawBench(x, y) {
    const ctx = this.ctx, w = 132, h = 38;
    ctx.globalAlpha = .4; ctx.drawImage(this.shadow, x-w/2, y+h/2-8, w, 18); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0f1013'; ctx.fillRect(x-w/2-2, y-h/2-2, w+4, h+4);
    for (let i=0;i<4;i++) {
      ctx.fillStyle = i%2 ? '#59452e' : '#6a5338';
      ctx.fillRect(x-w/2, y-h/2 + i*(h/4)+1, w, h/4-2);
    }
    ctx.fillStyle = '#22242a'; ctx.fillRect(x-w/2, y-h/2, 6, h); ctx.fillRect(x+w/2-6, y-h/2, 6, h);
  }

  drawSprite(sp, x, y, scale, dir) {
    const ctx = this.ctx; const w = sp.w*scale, h = sp.h*scale;
    const dy = sp.anchor==='center' ? -h/2 : -h;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir,1);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sp.cv, Math.round(-w/2), Math.round(dy), w, h);
    ctx.restore();
  }
}
