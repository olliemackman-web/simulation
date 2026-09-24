// Three.js voxel renderer. Reads simulation state, never changes it.
(function (G) {
  const U = G.U, W = G.WORLD, MODELS = G.MODELS;
  const { T, R, N } = W;
  const HS = 0.5;          // world units per height step
  const OFF = N / 2;       // tile -> world offset
  const SEA_Y = W.SEA * HS - 0.18;

  let _m, _q, _p, _s, _c, _v, UP, ZAX, ZERO;
  const colCache = new Map();
  const col = (hex) => { let c = colCache.get(hex); if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); } return c; };
  const { mix, shade } = MODELS;

  class Pool {
    constructor(scene, cap, material, cast, receive) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cap);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.setColorAt(0, col(0xffffff));
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.mesh.count = 0;
      this.mesh.castShadow = cast; this.mesh.receiveShadow = receive;
      this.mesh.frustumCulled = false;
      this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);
      this.cap = cap; this.free = []; this.hi = 0; this.n = 0; this.lo = Infinity; this.up = -1;
      scene.add(this.mesh);
    }
    reset() { this.free = []; this.hi = 0; this.n = 0; this.mesh.count = 0; this.lo = Infinity; this.up = -1; }
    alloc() {
      if (this.free.length) return this.free.pop();
      if (this.hi >= this.cap) return -1;
      const i = this.hi++;
      this.mesh.count = this.hi;
      return i;
    }
    release(i) { this.mesh.setMatrixAt(i, ZERO); this.free.push(i); this.mark(i); }
    mark(i) { if (i < this.lo) this.lo = i; if (i > this.up) this.up = i; }
    set(i, x, y, z, w, h, d, c, rotY, quat) {
      _p.set(x, y, z); _s.set(w, h, d);
      if (quat) _q.copy(quat); else if (rotY) _q.setFromAxisAngle(UP, rotY); else _q.identity();
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, typeof c === 'number' ? col(c) : c);
      this.mark(i);
    }
    // min-corner box helper
    add(x, y, z, w, h, d, c) {
      const i = this.alloc();
      if (i >= 0) this.set(i, x + w / 2, y + h / 2, z + d / 2, w, h, d, c);
      return i;
    }
    flush() {
      if (this.up < 0) return;
      const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
      if (im.clearUpdateRanges) {
        im.clearUpdateRanges(); im.addUpdateRange(this.lo * 16, (this.up - this.lo + 1) * 16);
        ic.clearUpdateRanges(); ic.addUpdateRange(this.lo * 3, (this.up - this.lo + 1) * 3);
      }
      im.needsUpdate = true; ic.needsUpdate = true;
      this.lo = Infinity; this.up = -1;
    }
    // Streaming mode (rewritten every frame).
    begin() { this.n = 0; }
    push(x, y, z, w, h, d, c, rotY, quat) {
      if (this.n >= this.cap) return -1;
      const i = this.n++;
      this.set(i, x, y, z, w, h, d, c, rotY, quat);
      return i;
    }
    end() { this.mesh.count = this.n; if (this.n) { this.lo = 0; this.up = this.n - 1; this.flush(); } }
  }

  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
  const HAIR = [0x2a1a10, 0x4a3020, 0x111111, 0xc9a050, 0x7a3a1a];
  const CARS = [0xd03030, 0x3060d0, 0xe0e0e0, 0x303030, 0xe0b030, 0x30a060, 0x8040c0];
  const CARRY = { wood: 0x8b5a2b, stone: 0x9a9a9a, food: 0xd04040, metal: 0xc0c8d8, goods: 0xe0b040 };

  class Renderer {
    constructor(canvas, opts = {}) {
      this.mobile = !!opts.mobile;
      this.pcap = this.mobile ? 500 : 1600;
      _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _p = new THREE.Vector3(); _s = new THREE.Vector3();
      _c = new THREE.Color(); _v = new THREE.Vector3(); UP = new THREE.Vector3(0, 1, 0); ZAX = new THREE.Vector3(0, 0, 1);
      ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

      const r = (this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      const scene = (this.scene = new THREE.Scene());
      scene.fog = new THREE.Fog(0x87c5ee, 160, 420);
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.3, 900);

      this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6a3a, 1.2);
      scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.setScalar(this.mobile ? 1024 : 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 420;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.02;
      scene.add(this.sun); scene.add(this.sun.target);

      const solid = new THREE.MeshLambertMaterial({ color: 0xffffff });
      this.winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const glowDyn = new THREE.MeshBasicMaterial({ color: 0xffffff });

      this.terrain = new Pool(scene, N * N * 2, solid, false, true);
      this.props = new Pool(scene, 30000, solid, true, true);
      this.bld = new Pool(scene, 60000, solid, true, true);
      this.wins = new Pool(scene, 30000, this.winMat, false, false);
      this.glowS = new Pool(scene, 8000, glow, false, false);
      this.dyn = new Pool(scene, 14000, solid, true, true);
      this.dynGlow = new Pool(scene, 5000, glowDyn, false, false);

      const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x2f86c9, transparent: true, opacity: 0.78 }));
      water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y; water.receiveShadow = true;
      this.water = water; scene.add(water);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x1d4f7a }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5; scene.add(floor);

      // Stars.
      const sp = [];
      for (let k = 0; k < 900; k++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.1, rr = 500;
        sp.push(Math.cos(a) * Math.cos(e) * rr, Math.sin(e) * rr, Math.sin(a) * Math.cos(e) * rr);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
      scene.add(this.stars);

      this.clouds = [];
      for (let k = 0; k < (this.mobile ? 9 : 16); k++) {
        const parts = [];
        const n = U.randi(3, 6);
        for (let j = 0; j < n; j++) parts.push([U.rand(-4, 4), U.rand(0, 1), U.rand(-2.5, 2.5), U.rand(3, 7), U.rand(0.8, 1.6), U.rand(2.5, 5)]);
        this.clouds.push({ x: U.rand(-110, 110), z: U.rand(-90, 90), y: U.rand(26, 34), parts });
      }

      this.particles = [];
      this.launches = [];
      this.bursts = [];
      this.pick = [];
      this.rs = new Map();
      this.time = 0;
      this.dayF = 1;
    }

    resize(w, h) { this.gl.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

    // ---------- full rebuild ----------
    setState(S) {
      this.S = S;
      for (const p of [this.terrain, this.props, this.bld, this.wins, this.glowS]) p.reset();
      this.tSlots = new Array(N * N);
      this.bSlots = new Map();
      this.emitters = new Map();
      this.particles = []; this.launches = []; this.bursts = []; this.rs.clear();
      this.elec = this.anyHas('electricity');
      this.temp = S.climate ? S.climate.temp : 0;
      for (let i = 0; i < N * N; i++) { this.terrain.alloc(); this.terrain.alloc(); }
      for (let i = 0; i < N * N; i++) { this.drawTile(i); this.drawProps(i); }
      for (const b of S.buildings) this.drawBuilding(b);
      S.fx.tiles.clear(); S.fx.bld.clear(); S.fx.removed.length = 0;
      for (const p of [this.terrain, this.props, this.bld, this.wins, this.glowS]) { p.lo = 0; p.up = p.hi - 1; p.flush(); }
    }

    anyHas(t) { return this.S.settlements.some((s) => s.alive && s.known[t]); }

    groundY(x, z) {
      const Wd = this.S.world;
      const xi = U.clamp(Math.floor(x), 0, N - 1), zi = U.clamp(Math.floor(z), 0, N - 1);
      const i = zi * N + xi;
      if (Wd.type[i] === T.WATER) return SEA_Y + 0.02;
      const o = Wd.occ[i];
      if (o >= 0) { const b = this.S.cache.b.get(o); if (b && b.type !== 'field' && b.type !== 'pasture') return b.baseY * HS; }
      return Wd.h[i] * HS;
    }

    // Snow line and vegetation tint follow the climate.
    snowLine() { return 25 - Math.max(0, -this.temp) * 13; }

    tileTop(i) {
      const S = this.S, Wd = S.world;
      const t = Wd.type[i], h = Wd.h[i], v = 1 + (U.hash(i * 3 + 11) - 0.5) * 0.09;
      const cold = Math.max(0, -this.temp), warm = Math.max(0, this.temp);
      let c;
      const o = Wd.occ[i];
      const b = o >= 0 ? S.cache.b.get(o) : null;
      if (b && b.type === 'field') c = (i % 2 ? 0x7a5634 : 0x6f4e2e);
      else if (b && b.type === 'pasture') c = 0x5d9a40;
      else if (b) c = b.style >= 5 ? 0x9a9ea2 : b.style >= 2 ? 0xb8b0a0 : 0xa08a62;
      else if (Wd.road[i]) c = [0, 0xa8875c, 0xa9a59b, 0x44474c][Wd.road[i]];
      else if (t === T.WATER) c = mix(0x6a7a5a, 0xd8c890, h / W.SEA);
      else if (t === T.SAND) c = 0xe3d49a;
      else if (t === T.GRASS) c = mix(mix(0x5fae45, 0x93b55a, U.clamp((h - 10) / 9, 0, 1)), cold ? 0xc6d2c2 : 0x49a83a, cold ? cold * 0.55 : warm * 0.35);
      else if (t === T.ROCK) c = mix(0x8a8a86, 0x9d9a94, U.hash(i));
      else c = 0xf4f7fa;
      if (!b && !Wd.road[i] && t !== T.WATER && h >= this.snowLine() + (U.hash(i * 5) - 0.5) * 1.5) c = 0xf2f6fa;
      if (Wd.fire[i] > 0) c = 0x3a3a30;
      return shade(c, v);
    }

    drawTile(i) {
      const Wd = this.S.world;
      const x = (i % N) - OFF + 0.5, z = Math.floor(i / N) - OFF + 0.5;
      const top = Wd.h[i] * HS;
      const t = Wd.type[i];
      const body = t === T.WATER ? 0xb8a878 : t === T.SAND ? 0xcdb97a : t === T.GRASS ? 0x7b5a3c : t === T.ROCK ? 0x707070 : 0x9aa0a6;
      const bh = top - 0.14 + 2;
      this.terrain.set(i * 2, x, -2 + bh / 2, z, 1, bh, 1, shade(body, 1 + (U.hash(i) - 0.5) * 0.08));
      this.terrain.set(i * 2 + 1, x, top - 0.07, z, 1, 0.14, 1, this.tileTop(i));
    }

    drawProps(i) {
      const S = this.S, Wd = S.world;
      const old = this.tSlots[i];
      if (old) { for (const [pool, k] of old) pool.release(k); }
      const list = (this.tSlots[i] = []);
      const r = Wd.res[i];
      const road = Wd.road[i];
      if (!r && !(road >= 2 && this.elec)) { this.tSlots[i] = null; return; }
      const tx = i % N, tz = Math.floor(i / N);
      const hs = U.hash(i * 13 + 1);
      const X = tx - OFF + 0.5 + (hs - 0.5) * 0.3, Z = tz - OFF + 0.5 + (U.hash(i * 7 + 5) - 0.5) * 0.3, Y = Wd.h[i] * HS;
      const add = (pool, x, y, z, w, h, d, c) => { const k = pool.add(x - w / 2, y, z - d / 2, w, h, d, c); if (k >= 0) list.push([pool, k]); };
      const burnt = Wd.fire[i] > 0;
      if (r === R.TREE) {
        const g = Math.min(1, Wd.grow[i]);
        const k = 0.3 + 0.7 * (Math.floor(g * 3) / 3 || 0.1) * (0.85 + hs * 0.3);
        let leaf = burnt ? 0x3a2a20 : Wd.h[i] >= 15 || hs < 0.3 ? shade(0x2f6b3a, 0.9 + hs * 0.2) : shade(0x3f8f3a, 0.85 + hs * 0.3);
        if (!burnt && Wd.h[i] >= this.snowLine() - 4) leaf = mix(leaf, 0xf2f6fa, 0.65);
        if (Wd.h[i] >= 15 || hs < 0.3) {
          add(this.props, X, Y, Z, 0.14, 0.35 * k, 0.14, 0x5a3a20);
          add(this.props, X, Y + 0.3 * k, Z, 0.85 * k, 0.4 * k, 0.85 * k, leaf);
          add(this.props, X, Y + 0.65 * k, Z, 0.6 * k, 0.4 * k, 0.6 * k, shade(leaf, 1.05));
          add(this.props, X, Y + 1.0 * k, Z, 0.35 * k, 0.4 * k, 0.35 * k, shade(leaf, 1.1));
        } else {
          add(this.props, X, Y, Z, 0.16, 0.6 * k, 0.16, 0x6b4a2b);
          add(this.props, X, Y + 0.5 * k, Z, 0.8 * k, 0.65 * k, 0.8 * k, leaf);
          add(this.props, X + 0.08 * k, Y + 1.1 * k, Z - 0.05, 0.45 * k, 0.3 * k, 0.45 * k, shade(leaf, 1.12));
        }
      } else if (r === R.BUSH) {
        add(this.props, X, Y, Z, 0.5, 0.3, 0.5, 0x2e7d32);
        if (Wd.amt[i] >= 1) for (let b = 0; b < 3; b++) add(this.props, X + (U.hash(i + b) - 0.5) * 0.4, Y + 0.22, Z + (U.hash(i * 2 + b) - 0.5) * 0.4, 0.09, 0.09, 0.09, 0xd02040);
      } else if (r === R.BOULDER) {
        add(this.props, X, Y, Z, 0.6, 0.35, 0.5, shade(0x8d8d8d, 0.9 + hs * 0.2));
        add(this.props, X + 0.15, Y, Z + 0.15, 0.3, 0.5, 0.3, 0x9a9a9a);
      } else if (r === R.ORE) {
        add(this.props, X, Y, Z, 0.6, 0.4, 0.55, 0x7a7470);
        add(this.props, X - 0.1, Y + 0.3, Z + 0.28, 0.15, 0.12, 0.05, 0xe0902b);
        add(this.props, X + 0.2, Y + 0.12, Z - 0.28, 0.12, 0.1, 0.05, 0xe0b040);
      }
      if (road >= 2 && this.elec && U.hash(i * 31 + 7) < 0.14 && !r) {
        const lx = tx - OFF + 0.12, lz = tz - OFF + 0.12;
        add(this.props, lx, Y, lz, 0.06, 1.0, 0.06, 0x3a3a3a);
        add(this.wins, lx, Y + 1.0, lz, 0.16, 0.08, 0.16, 0xfff0b0);
      }
    }

    drawBuilding(b) {
      const old = this.bSlots.get(b.id);
      if (old) for (const [pool, k] of old) pool.release(k);
      this.emitters.delete(b.id);
      const S = this.S;
      if (!S.cache.b.has(b.id)) { this.bSlots.delete(b.id); return; }
      const s = S.cache.s.get(b.sid);
      if (!s) return;
      const list = [];
      this.bSlots.set(b.id, list);
      const m = MODELS.build(b, s);
      const ox = b.x - OFF, oz = b.z - OFF, oy = b.baseY * HS;
      const Wd = S.world;
      if (b.type !== 'field' && b.type !== 'pasture') {
        let lo = 99;
        for (let zz = b.z; zz < b.z + b.d; zz++) for (let xx = b.x; xx < b.x + b.w; xx++) lo = Math.min(lo, Wd.h[zz * N + xx]);
        if (lo < b.baseY) m.boxes.unshift([0, (lo - b.baseY) * HS - 0.14, 0, b.w, (b.baseY - lo) * HS + 0.14, b.d, b.style >= 2 ? 0xa8a498 : 0x8a7050, 0, true]);
        else m.boxes.unshift([0, -0.14, 0, b.w, 0.16, b.d, b.style >= 5 ? 0x9a9ea2 : b.style >= 2 ? 0xb8b0a0 : 0xa08a62, 0, true]);
      }
      const prog = b.built && !b.upgrading ? 1 : U.clamp(b.progress, 0, 1);
      let H = 0;
      for (const bx of m.boxes) if (!bx[8]) H = Math.max(H, bx[1] + bx[4]);
      const limit = prog * H;
      const fieldLike = b.type === 'field' || b.type === 'pasture';
      for (const [x, y, z, w, h, d, c, flag, base] of m.boxes) {
        let hh = h;
        if (prog < 1 && !base && !fieldLike) { if (y >= limit) continue; hh = Math.min(h, limit - y); }
        if (fieldLike && prog < 1) continue;
        const pool = flag === 1 ? this.wins : flag === 2 ? this.glowS : this.bld;
        const k = pool.add(ox + x, oy + y, oz + z, w, hh, d, c);
        if (k >= 0) list.push([pool, k]);
      }
      if (prog < 1 && !fieldLike) {
        const ph = limit + 0.35;
        for (const [x, z] of [[0.05, 0.05], [b.w - 0.1, 0.05], [0.05, b.d - 0.1], [b.w - 0.1, b.d - 0.1]]) {
          const k = this.bld.add(ox + x, oy, oz + z, 0.06, ph, 0.06, 0xb08850);
          if (k >= 0) list.push([this.bld, k]);
        }
        const k1 = this.bld.add(ox + b.w - 0.7, oy, oz - 0.45, 0.5, 0.2, 0.3, 0x8b5a2b);
        const k2 = this.bld.add(ox - 0.45, oy, oz + b.d - 0.6, 0.3, 0.25, 0.4, 0x9a9a9a);
        if (k1 >= 0) list.push([this.bld, k1]); if (k2 >= 0) list.push([this.bld, k2]);
      }
      if (prog >= 1 || (b.upgrading && b.type === 'center')) {
        this.emitters.set(b.id, m.emit.map((e) => ({ ...e, x: ox + e.x, y: oy + (e.y || 0), z: oz + e.z, w: e.w, d: e.d, bid: b.id, acc: Math.random() })));
      }
    }

    // ---------- per frame ----------
    update(S, dt, info) {
      if (S !== this.S) this.setState(S);
      this.time += dt;
      const fx = S.fx;
      const elec = this.anyHas('electricity');
      if (elec !== this.elec) { this.elec = elec; for (let i = 0; i < N * N; i++) if (S.world.road[i] >= 2) fx.tiles.add(i); }
      if (Math.abs(S.climate.temp - this.temp) > 0.06) { this.temp = S.climate.temp; for (let i = 0; i < N * N; i++) fx.tiles.add(i); }
      let n = 0;
      for (const i of fx.tiles) { this.drawTile(i); this.drawProps(i); fx.tiles.delete(i); if (++n > 3000) break; }
      for (const id of fx.removed) { const old = this.bSlots.get(id); if (old) for (const [pool, k] of old) pool.release(k); this.bSlots.delete(id); this.emitters.delete(id); }
      fx.removed.length = 0;
      for (const id of fx.bld) {
        const b = S.cache.b.get(id);
        if (!b) continue;
        this.drawBuilding(b);
        for (let zz = b.z; zz < b.z + b.d; zz++) for (let xx = b.x; xx < b.x + b.w; xx++) this.drawTile(zz * N + xx);
      }
      fx.bld.clear();
      for (const p of [this.terrain, this.props, this.bld, this.wins, this.glowS]) p.flush();

      this.lighting(S);
      this.dyn.begin(); this.dynGlow.begin(); this.pick.length = 0;
      this.drawPeople(S, dt);
      this.drawAnimals(S, dt);
      this.drawEmitters(S, dt);
      this.drawLaunches(dt);
      this.drawFires(S);
      this.drawParticles(dt);
      this.drawClouds(dt);
      this.dyn.end(); this.dynGlow.end();
      this.water.material.opacity = 0.74 + Math.sin(this.time * 0.8) * 0.03;
      this.gl.render(this.scene, this.camera);
    }

    lighting(S) {
      const tod = (S.t % 30) / 30;
      const a = (tod - 0.25) * Math.PI * 2;
      const el = Math.sin(a);
      const day = U.clamp(el * 2.5 + 0.3, 0, 1);
      this.dayF = day;
      const cx = 0, cz = 0;
      this.sun.position.set(cx + Math.cos(a) * 110, Math.max(12, el * 140), cz + 55);
      this.sun.target.position.set(cx, 0, cz);
      this.sun.intensity = 2.8 * day;
      const dusk = U.clamp(1 - Math.abs(el) * 3.5, 0, 1);
      this.sun.color.set(mix(0xfff2d8, 0xffa060, dusk));
      this.hemi.intensity = 0.75 + 0.6 * day;
      this.hemi.color.set(mix(0x5a6ab0, 0xcfe8ff, day));
      const sky = mix(mix(0x121c44, 0x86c4ee, day), 0xf09a60, dusk * 0.55 * (day > 0.05 ? 1 : 0.3));
      this.scene.background = col(sky);
      this.scene.fog.color.set(sky);
      this.stars.material.opacity = U.clamp(1 - day * 1.6, 0, 1);
      this.winMat.color.setScalar(U.lerp(1.0, 0.22, day));
      this.water.material.color.set(mix(0x173a62, 0x2f86c9, day));
    }

    drawPeople(S, dt) {
      const t = this.time;
      const night = this.dayF < 0.4;
      const seen = new Set();
      for (const p of S.people) {
        if (p.mode === 'hidden') continue;
        const s = S.cache.s.get(p.sid);
        let rs = this.rs.get(p.id);
        const gy = this.groundY(p.x, p.z);
        if (!rs) { rs = { y: gy, ph: Math.random() * 6 }; this.rs.set(p.id, rs); }
        seen.add(p.id);
        rs.y += (gy - rs.y) * Math.min(1, dt * 10);
        if (p.moving) rs.ph += dt * 11;
        const X = p.x - OFF, Z = p.z - OFF, Y = rs.y;
        const sc = (p.age < 14 ? 0.55 + (p.age / 14) * 0.45 : 1) * (p.mut && p.mut.includes('giant') ? 1.3 : 1);
        const f = p.facing;
        const fx = Math.sin(f), fz = Math.cos(f), px = Math.cos(f), pz = -Math.sin(f);
        const shirt = s ? shade(s.color, 0.85 + U.hash(p.id) * 0.3) : 0x888888;
        const skin = SKIN[p.id % SKIN.length];
        const hair = p.armed && era >= 2 ? 0x8a8e94 : p.age > 58 ? 0xd8d8d8 : HAIR[(p.id * 7) % HAIR.length];
        const era = s ? s.era : 0;
        const legsC = s && s.era >= 5 ? 0x34495e : 0x5a4632;
        const headC = p.sick > 0 ? mix(skin, 0x80c060, 0.6) : skin;
        const mark = (k) => { if (k >= 0) this.pick[k] = p.id; };

        if (p.mode === 'car') {
          const hover = era >= 7;
          const cy = Y + (hover ? 0.45 + Math.sin(t * 3 + p.id) * 0.05 : 0);
          const cc = CARS[p.id % CARS.length];
          mark(this.dyn.push(X, cy + 0.12, Z, 0.3, 0.14, 0.56, cc, f));
          mark(this.dyn.push(X - fx * 0.04, cy + 0.25, Z - fz * 0.04, 0.26, 0.12, 0.3, 0x2a3440, f));
          if (!hover) for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.dyn.push(X + px * 0.15 * sx + fx * 0.17 * sz, cy + 0.05, Z + pz * 0.15 * sx + fz * 0.17 * sz, 0.06, 0.1, 0.1, 0x151515, f);
          if (hover) this.dynGlow.push(X, cy - 0.02, Z, 0.24, 0.03, 0.4, 0x6ff0ff, f);
          if (night) for (const sx of [-1, 1]) this.dynGlow.push(X + fx * 0.29 + px * 0.1 * sx, cy + 0.13, Z + fz * 0.29 + pz * 0.1 * sx, 0.06, 0.05, 0.03, 0xfff6c0, f);
          continue;
        }
        if (p.mode === 'sleep') {
          mark(this.dyn.push(X, Y + 0.04, Z, 0.14 * sc, 0.08, 0.26 * sc, shirt, f));
          mark(this.dyn.push(X + fx * 0.17 * sc, Y + 0.05, Z + fz * 0.17 * sc, 0.1 * sc, 0.09, 0.1 * sc, skin, f));
          continue;
        }
        if (p.mode === 'swim') {
          mark(this.dyn.push(X, Y - 0.02, Z, 0.14, 0.06, 0.1, shirt, f));
          mark(this.dyn.push(X, Y + 0.06, Z, 0.1, 0.1, 0.1, headC, f));
          continue;
        }
        let base = Y;
        if (p.mode === 'boat') {
          this.dyn.push(X, Y + 0.02, Z, 0.26, 0.1, 0.55, 0x8b5a2b, f);
          this.dyn.push(X - fx * 0.12, Y + 0.1, Z - fz * 0.12, 0.03, 0.55, 0.03, 0x6a4a2a, f);
          this.dyn.push(X - fx * 0.12 + px * 0.08, Y + 0.3, Z - fz * 0.12 + pz * 0.08, 0.14, 0.3, 0.02, 0xf0ece0, f + Math.PI / 2);
          base = Y - 0.02;
        }
        const legH = 0.14 * sc, torH = 0.15 * sc, head = 0.11 * sc, wdt = 0.14 * sc;
        const swing = p.moving ? Math.sin(rs.ph) * 0.035 * sc : 0;
        const bob = p.working ? Math.abs(Math.sin(t * 9 + p.id)) * 0.03 : p.moving ? Math.abs(Math.cos(rs.ph)) * 0.015 : 0;
        if (p.mode !== 'boat') {
          for (const side of [-1, 1]) {
            const o = swing * side;
            this.dyn.push(X + px * 0.035 * sc * side + fx * o, base + legH / 2 + bob, Z + pz * 0.035 * sc * side + fz * o, 0.055 * sc, legH, 0.07 * sc, legsC, f);
          }
        }
        const ty = base + legH + torH / 2 + bob;
        mark(this.dyn.push(X, ty, Z, wdt, torH, 0.09 * sc, shirt, f));
        mark(this.dyn.push(X, ty + torH / 2 + head / 2, Z, head, head, head, headC, f));
        this.dyn.push(X - fx * 0.01, ty + torH / 2 + head + 0.012 * sc, Z - fz * 0.01, head * 1.05, 0.03 * sc, head * 1.05, hair, f);
        if (p.armed) {
          if (era < 5) {
            this.dyn.push(X + px * 0.1 * sc, ty + 0.05, Z + pz * 0.1 * sc, 0.025, 0.5 * sc, 0.025, era >= 2 ? 0xb8b8c0 : 0x8b5a2b, f);
            this.dyn.push(X - px * 0.09 * sc + fx * 0.02, ty, Z - pz * 0.09 * sc + fz * 0.02, 0.03, 0.16 * sc, 0.13 * sc, s ? s.color : 0x888888, f);
          } else {
            this.dyn.push(X + px * 0.08 * sc + fx * 0.1, ty + 0.02, Z + pz * 0.08 * sc + fz * 0.1, 0.03, 0.03, 0.26 * sc, era >= 8 ? 0xe0f0ff : 0x2a2a2a, f);
            if (era >= 8) this.dynGlow.push(X + px * 0.08 * sc + fx * 0.24, ty + 0.02, Z + pz * 0.08 * sc + fz * 0.24, 0.035, 0.035, 0.035, s ? s.color : 0x9ff3ff, f);
          }
        }
        if (p.carry && p.carry.type !== 'goods') {
          if (era >= 2) {
            // Hand cart trailing behind.
            const bx = X - fx * 0.28, bz = Z - fz * 0.28;
            this.dyn.push(bx, base + 0.1, bz, 0.22, 0.1, 0.24, 0x8b6a3a, f);
            this.dyn.push(bx, base + 0.19, bz, 0.14, 0.08, 0.16, CARRY[p.carry.type], f);
          } else this.dyn.push(X, ty + torH / 2 + head + 0.08, Z, 0.13, 0.08, 0.13, CARRY[p.carry.type], f);
        } else if (p.carry) {
          // Trader with a pack animal / wagon.
          const bx = X - fx * 0.35, bz = Z - fz * 0.35;
          this.dyn.push(bx, base + 0.15, bz, 0.2, 0.18, 0.32, 0xe8e0c8, f);
          this.dyn.push(bx, base + 0.03, bz, 0.22, 0.06, 0.3, 0x5a3a20, f);
        }
      }
      if (this.rs.size > S.people.length + 50) for (const id of this.rs.keys()) if (!seen.has(id)) this.rs.delete(id);
    }

    drawAnimals(S) {
      for (const a of S.animals) {
        const X = a.x - OFF, Z = a.z - OFF, Y = this.groundY(a.x, a.z);
        const f = a.facing, fx = Math.sin(f), fz = Math.cos(f);
        this.dyn.push(X, Y + 0.08, Z, 0.1, 0.16, 0.22, 0x5a3a20, f);
        this.dyn.push(X, Y + 0.2, Z, 0.13, 0.11, 0.3, 0x9b6a3a, f);
        this.dyn.push(X + fx * 0.17, Y + 0.3, Z + fz * 0.17, 0.08, 0.1, 0.1, 0x8a5a2a, f);
        this.dyn.push(X - fx * 0.14, Y + 0.24, Z - fz * 0.14, 0.05, 0.05, 0.04, 0xf0f0f0, f);
      }
    }

    drawEmitters(S, dt) {
      const t = this.time;
      for (const [bid, list] of this.emitters) {
        for (const e of list) {
          if (e.k === 'smoke') {
            e.acc += dt * e.rate * 1.2;
            while (e.acc > 1) {
              e.acc -= 1;
              if (this.particles.length < this.pcap) this.particles.push({ x: e.x + U.rand(-0.05, 0.05), y: e.y, z: e.z + U.rand(-0.05, 0.05), vy: U.rand(0.5, 0.8), age: 0, life: U.rand(3, 5), s: U.rand(0.12, 0.2), dark: e.dark });
            }
          } else if (e.k === 'fire') {
            for (let k = 0; k < 3; k++) {
              const fl = 0.7 + Math.sin(t * 13 + k * 2.1 + bid) * 0.3;
              this.dynGlow.push(e.x + (k - 1) * 0.07 * e.size, e.y + 0.08 * fl * e.size, e.z + Math.sin(k * 2) * 0.05 * e.size, 0.1 * e.size, 0.25 * fl * e.size, 0.1 * e.size, k === 1 ? 0xffd040 : 0xff7020);
            }
          } else if (e.k === 'blades') {
            const base = t * 1.4 + bid;
            this.dyn.push(e.x, e.y, e.z, 0.14, 0.14, 0.14, 0x5a4a3a);
            for (let k = 0; k < 4; k++) {
              const a = base + (k * Math.PI) / 2;
              _q.setFromAxisAngle(ZAX, a);
              const q = _q.clone();
              this.dyn.push(e.x + Math.cos(a) * 0.62, e.y + Math.sin(a) * 0.62, e.z - 0.04, 1.15, 0.2, 0.03, 0xe8dcc0, 0, q);
            }
          } else if (e.k === 'sheep') {
            for (let k = 0; k < 3; k++) {
              const sx = e.x + e.w * (0.5 + 0.45 * Math.sin(t * 0.13 + k * 2.3 + bid)), sz = e.z + e.d * (0.5 + 0.45 * Math.sin(t * 0.09 + k * 4.1 + bid * 0.7));
              const f = t * 0.1 + k * 2;
              this.dyn.push(sx, e.y + 0.14, sz, 0.18, 0.15, 0.25, 0xf2f0e8, f);
              this.dyn.push(sx + Math.sin(f) * 0.15, e.y + 0.2, sz + Math.cos(f) * 0.15, 0.09, 0.09, 0.09, 0x2a2a2a, f);
            }
          } else if (e.k === 'rocket') {
            if (this.launches.some((l) => l.bid === bid && l.t < 25)) continue;
            this.drawRocket(e.x, e.y, e.z, 1, false);
          }
        }
      }
      // Discovery sparkles.
      for (const b of this.bursts) {
        b.t += dt;
        for (let k = 0; k < 10; k++) {
          const a = k * 0.63 + b.t * 1.5, r = 0.5 + b.t * 0.6;
          this.dynGlow.push(b.x + Math.cos(a) * r, b.y + b.t * 2.2 + (k % 3) * 0.3, b.z + Math.sin(a) * r, 0.12, 0.12, 0.12, b.c);
        }
      }
      this.bursts = this.bursts.filter((b) => b.t < 3);
    }

    drawRocket(x, y, z, k, starship) {
      const body = starship ? 0xd8dde2 : 0xf4f4f4;
      this.dyn.push(x, y + 1.3 * k, z, 0.42 * k, 2.2 * k, 0.42 * k, body);
      this.dyn.push(x, y + 2.55 * k, z, 0.3 * k, 0.3 * k, 0.3 * k, starship ? 0x9ab0c0 : 0xd04030);
      this.dyn.push(x, y + 2.8 * k, z, 0.14 * k, 0.25 * k, 0.14 * k, starship ? 0x9ab0c0 : 0xd04030);
      this.dyn.push(x, y + 0.35 * k, z, 0.9 * k, 0.5 * k, 0.1 * k, 0x404850);
      this.dyn.push(x, y + 0.35 * k, z, 0.1 * k, 0.5 * k, 0.9 * k, 0x404850);
      this.dyn.push(x, y + 1.8 * k, z + 0.215 * k, 0.2 * k, 0.2 * k, 0.02, 0x3a6a9a);
    }

    launch(e) {
      const list = this.emitters.get(e.bid);
      const r = list && list.find((x) => x.k === 'rocket');
      if (!r) return;
      this.launches.push({ bid: e.bid, x: r.x, y: r.y, z: r.z, t: 0, starship: !!e.starship });
    }

    drawLaunches(dt) {
      for (const l of this.launches) {
        l.t += dt;
        const lift = Math.max(0, l.t - 2.5);
        let h = 0.35 * lift * lift;
        if (l.landing) {
          const k = Math.max(0, 1 - l.t / 8);
          h = 70 * k * k;
          if (l.t > 14) continue;
        }
        const k = l.starship ? 1.8 : 1;
        this.drawRocket(l.x, l.y + h, l.z, k, l.starship);
        const flame = l.starship ? 0x8ff0ff : 0xffa030;
        const fl = 0.8 + Math.random() * 0.4;
        this.dynGlow.push(l.x, l.y + h - 0.3 * k * fl, l.z, 0.3 * k, 0.6 * k * fl, 0.3 * k, flame);
        this.dynGlow.push(l.x, l.y + h - 0.7 * k * fl, l.z, 0.18 * k, 0.5 * k * fl, 0.18 * k, 0xfff0a0);
        const n = l.landing ? (h > 0.2 && h < 12 ? 3 : 0) : l.t < 6 ? 5 : 1;
        for (let j = 0; j < n && this.particles.length < this.pcap + 200; j++) {
          this.particles.push({ x: l.x + U.rand(-0.4, 0.4), y: l.y + h, z: l.z + U.rand(-0.4, 0.4), vy: U.rand(-0.2, 0.3), vx: U.rand(-0.8, 0.8), vz: U.rand(-0.8, 0.8), age: 0, life: U.rand(2, 5), s: U.rand(0.3, 0.6), dark: false });
        }
      }
      this.launches = this.launches.filter((l) => l.t < 30);
    }

    drawFires(S) {
      const t = this.time;
      for (const b of S.buildings) {
        if (!b.fire) continue;
        const y0 = b.baseY * HS;
        for (let k = 0; k < 6; k++) {
          const fl = 0.6 + Math.sin(t * 12 + k * 1.7 + b.id) * 0.4;
          const x = b.x - OFF + 0.3 + U.hash(b.id * 9 + k) * (b.w - 0.6), z = b.z - OFF + 0.3 + U.hash(b.id * 5 + k * 3) * (b.d - 0.6);
          this.dynGlow.push(x, y0 + 0.4 + fl * 0.4 + (k % 3) * 0.3, z, 0.3, 0.8 * fl + 0.2, 0.3, k % 2 ? 0xffd040 : 0xff5010);
        }
        if (Math.random() < 0.4 && this.particles.length < this.pcap) this.particles.push({ x: b.x - OFF + b.w / 2, y: y0 + 1.5, z: b.z - OFF + b.d / 2, vy: 1.3, age: 0, life: 4, s: 0.35, dark: true });
      }
      for (const i of S.burning) {
        const X = (i % N) - OFF + 0.5, Z = Math.floor(i / N) - OFF + 0.5, Y = S.world.h[i] * HS;
        for (let k = 0; k < 3; k++) {
          const fl = 0.6 + Math.sin(t * 11 + k * 2 + i) * 0.4;
          this.dynGlow.push(X + (k - 1) * 0.2, Y + 0.3 + fl * 0.3, Z + Math.sin(k + i) * 0.2, 0.22, 0.6 * fl + 0.2, 0.22, k === 1 ? 0xffd040 : 0xff6010);
        }
        if (Math.random() < 0.15 && this.particles.length < this.pcap) this.particles.push({ x: X, y: Y + 1, z: Z, vy: 1.2, age: 0, life: 4, s: 0.3, dark: true });
      }
    }

    drawParticles(dt) {
      const ps = this.particles;
      let w = 0;
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        p.age += dt;
        if (p.age >= p.life) continue;
        p.y += p.vy * dt; p.x += (0.25 + (p.vx || 0)) * dt; p.z += (p.vz || 0) * dt;
        const f = p.age / p.life;
        const s = p.s * (1 + f * 2.2) * (1 - f * f * 0.6);
        const c = p.col != null ? mix(p.col, 0xe8e0d0, f) : p.dark ? mix(0x3a3a3a, 0x8a8a8a, f) : mix(0xe8e8e8, 0xffffff, f);
        this.dyn.push(p.x, p.y, p.z, s, s, s, c);
        ps[w++] = p;
      }
      ps.length = w;
    }

    drawClouds(dt) {
      for (const c of this.clouds) {
        c.x += dt * 0.7;
        if (c.x > 120) c.x = -120;
        for (const [x, y, z, w, h, d] of c.parts) this.dyn.push(c.x + x, c.y + y, c.z + z, w, h, d, 0xffffff);
      }
    }

    // Events coming from the sim (discoveries, rockets...)
    onEvent(e) {
      if (e.kind === 'rocket') this.launch(e);
      if (e.kind === 'dust') {
        const X = e.x - OFF, Z = e.z - OFF, Y = this.groundY(e.x, e.z);
        for (let k = 0; k < (this.mobile ? 14 : 30); k++) this.particles.push({ x: X + U.rand(-1, 1), y: Y + U.rand(0, 1.5), z: Z + U.rand(-1, 1), vy: U.rand(0.3, 1.2), vx: U.rand(-0.8, 0.8), vz: U.rand(-0.8, 0.8), age: 0, life: U.rand(2, 3.5), s: U.rand(0.3, 0.6), col: 0xa89878 });
      }
      if (e.kind === 'landing') {
        const x = e.x + 3, z = e.z + 3;
        this.launches.push({ landing: true, bid: -1, x: x - OFF, y: this.groundY(x, z), z: z - OFF, t: 0, starship: true });
      }
      if ((e.kind === 'tech' || e.kind === 'era' || e.kind === 'colony') && e.x != null) {
        const s = e.sid != null ? this.S.cache.s.get(e.sid) : null;
        this.bursts.push({ x: e.x - OFF, y: this.groundY(e.x, e.z) + 1.5, z: e.z - OFF, t: 0, c: e.kind === 'era' ? 0xffe060 : s ? s.color : 0xffffff });
      }
    }

    pickPerson(ndcX, ndcY) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
      const hits = ray.intersectObject(this.dyn.mesh);
      for (const h of hits) { const id = this.pick[h.instanceId]; if (id != null) return id; }
      return null;
    }

    // Nearest visible person to a screen point (in pixels), for taps that miss the tiny voxels.
    nearestPerson(px, py, w, h, maxPx) {
      let best = null, bd = maxPx;
      for (const p of this.S.people) {
        if (p.mode === 'hidden') continue;
        _v.set(p.x - OFF, this.groundY(p.x, p.z) + 0.25, p.z - OFF).project(this.camera);
        if (_v.z > 1) continue;
        const d = Math.hypot(((_v.x + 1) / 2) * w - px, ((1 - _v.y) / 2) * h - py);
        if (d < bd) { bd = d; best = p.id; }
      }
      return best;
    }

    project(x, y, z) {
      _v.set(x, y, z).project(this.camera);
      return _v;
    }
  }

  G.Renderer = Renderer;
  G.RENDER_CONST = { HS, OFF, SEA_Y };
})(typeof window !== 'undefined' ? window : globalThis);
