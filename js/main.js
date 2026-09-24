// Boot, main loop, speed control, autosave.
(function (G) {
  const SIM = G.SIM;
  const STEP = 0.1;

  // ---------- Saving ----------
  // Every save goes to two places: alternating localStorage slots (synchronous, survives a sudden
  // refresh) and IndexedDB (bigger quota). On load, the newest copy that parses wins, so one
  // bad or half-written copy can never wipe the world.
  const LS_KEYS = ['pixelworld-save-v1', 'pixelworld-save-v1b'];
  const status = { ok: null, t: 0, err: '' };

  const idb = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('pixelworld', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('saves');
          r.onsuccess = () => { idb.db = r.result; res(true); };
          r.onerror = r.onblocked = () => res(false);
        } catch (e) { res(false); }
      });
    },
    get(key) {
      return new Promise((res) => {
        if (!idb.db) return res(null);
        try { const q = idb.db.transaction('saves').objectStore('saves').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); }
      });
    },
    put(key, rec) {
      return new Promise((res) => {
        if (!idb.db) return res(false);
        try { const tx = idb.db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(rec, key); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); } catch (e) { res(false); }
      });
    },
  };

  const pack = (rec) => `${rec.t}|${rec.year}|${rec.data}`;
  function unpack(str) {
    if (!str) return null;
    const a = str.indexOf('|'), b = str.indexOf('|', a + 1);
    if (a > 0 && b > a && /^\d+$/.test(str.slice(0, a))) return { t: +str.slice(0, a), year: +str.slice(a + 1, b), data: str.slice(b + 1) };
    return { t: 0, year: 0, data: str }; // saves from before this format
  }

  function writeLocal(rec) {
    const str = pack(rec);
    let slot = 0;
    try { slot = localStorage.getItem('pixelworld-save-slot') === '0' ? 1 : 0; } catch (e) { return 'blocked'; }
    try {
      localStorage.setItem(LS_KEYS[slot], str);
      localStorage.setItem('pixelworld-save-slot', String(slot));
      return 'ok';
    } catch (e) {
      // Out of room: drop the older copy and try once more.
      try {
        localStorage.removeItem(LS_KEYS[slot]);
        localStorage.setItem(LS_KEYS[slot], str);
        localStorage.setItem('pixelworld-save-slot', String(slot));
        return 'ok';
      } catch (e2) { return e2 && e2.name === 'QuotaExceededError' ? 'full' : 'blocked'; }
    }
  }

  function save(S) {
    if (!S) return;
    let rec;
    try { rec = { t: Date.now(), year: SIM.yearOf(S), data: SIM.serialize(S) }; } catch (e) { status.ok = false; status.err = 'error'; return; }
    const local = writeLocal(rec);
    if (local === 'ok') { status.ok = true; status.t = Date.now(); status.err = ''; }
    idb.put('main', rec).then((ok) => {
      if (ok) { status.ok = true; status.t = Date.now(); status.err = ''; }
      else if (local !== 'ok') { status.ok = false; status.err = local; }
    });
  }

  async function load() {
    const cands = [];
    for (const k of LS_KEYS) { try { const r = unpack(localStorage.getItem(k)); if (r) cands.push(r); } catch (e) { /* blocked */ } }
    const r = await idb.get('main');
    if (r && r.data) cands.push(r);
    cands.sort((a, b) => b.t - a.t);
    for (const c of cands) {
      try { return { S: SIM.deserialize(c.data) }; } catch (e) { console.warn('Skipping unreadable save', e); }
    }
    if (cands.length) {
      // Keep the unreadable save around rather than overwriting it.
      await idb.put('broken-' + Date.now(), cands[0]);
      return { S: null, broken: true };
    }
    return { S: null };
  }

  G.startPixelWorld = async function () {
    const canvas = document.getElementById('view');
    const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700 || window.innerWidth < 640;
    document.body.classList.toggle('mobile', mobile);
    const app = { speed: 2, S: null, mobile };
    app.R = new G.Renderer(canvas, { mobile });
    app.rig = new G.CameraRig(app.R.camera, canvas, app.R);
    app.ui = new G.UI(app);

    app.setSpeed = (v) => { app.speed = v; };
    app.newWorld = () => {
      app.S = SIM.create();
      app.R.setState(app.S);
      app.S.fx.events.length = 0;
      app.ui.reset(app.S);
      app.rig.setAuto(true);
      app.rig.follow = null;
      app.extinctT = 0;
      save(app.S);
    };

    await idb.open();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
    const loaded = await load();
    app.S = loaded.S || SIM.create();
    app.save = () => save(app.S);
    app.saveStatus = status;
    app.R.setState(app.S);
    if (loaded.broken) setTimeout(() => app.ui.toast('Your saved world could not be loaded, so a new one has begun.'), 1500);
    save(app.S);
    app.S.fx.events.length = 0;
    app.ui.reset(app.S);

    app.rig.onClick = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let id = app.R.pickPerson((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
      if (id == null) id = app.R.nearestPerson(x, y, r.width, r.height, e.pointerType === 'touch' ? 36 : 14);
      if (id != null) { app.rig.manual(); app.rig.followPerson(id); }
    };

    const resize = () => app.R.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));

    // Keep the screen awake while watching (where supported), and save whenever the page is backgrounded.
    let wake = null;
    const keepAwake = async () => {
      try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { /* not allowed yet */ }
    };
    keepAwake();
    window.addEventListener('pointerdown', keepAwake, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save(app.S);
      else { keepAwake(); last = performance.now(); }
    });
    window.addEventListener('pagehide', () => save(app.S));
    resize();

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const speeds = { Digit1: 1, Digit2: 2, Digit3: 5, Digit4: 15, Digit5: 40 };
      if (e.code === 'Space') { app.speed = app.speed ? 0 : app._last || 2; e.preventDefault(); }
      else if (speeds[e.code]) app.speed = speeds[e.code];
      else if (e.code === 'KeyC') app.rig.setAuto(!app.rig.auto);
      if (app.speed) app._last = app.speed;
    });

    let last = performance.now(), acc = 0, saveT = 0;
    app.extinctT = 0;
    let errT = 0;
    function frame(now) {
      // Queue the next frame first so one bad frame can never stop the world (or its autosave).
      requestAnimationFrame(frame);
      try { tick(now); } catch (e) {
        if (now - errT > 5000) { errT = now; console.error(e); }
      }
    }
    function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const S = app.S;
      acc += dt * app.speed;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= STEP && steps < 600) {
        SIM.step(S, STEP);
        acc -= STEP; steps++;
        if ((steps & 15) === 0 && performance.now() - t0 > 30) { acc = 0; break; } // never freeze the tab
      }
      saveT += dt;
      if (saveT > 10) { saveT = 0; save(S); }
      for (const e of S.fx.events) { app.R.onEvent(e); app.ui.event(e); if (e.big || e.kind === 'space') app.rig.event(e); }
      S.fx.events.length = 0;
      app.rig.update(dt, S);
      app.R.update(S, dt);
      app.ui.frame(S, dt);
    }
    window.addEventListener('beforeunload', () => save(app.S));
    document.getElementById('loading').classList.add('gone');
    requestAnimationFrame(frame);
    G.app = app;
  };
})(typeof window !== 'undefined' ? window : globalThis);
