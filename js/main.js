// Boot, main loop, speed control, autosave.
(function (G) {
  const SIM = G.SIM;
  const SAVE_KEY = 'pixelworld-save-v1';
  const STEP = 0.1;

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return SIM.deserialize(raw);
    } catch (e) { console.warn('Could not restore saved world', e); }
    return null;
  }
  function save(S) {
    try { localStorage.setItem(SAVE_KEY, SIM.serialize(S)); } catch (e) { /* storage full or blocked: keep running */ }
  }

  G.startPixelWorld = function () {
    const canvas = document.getElementById('view');
    const app = { speed: 2, S: null };
    app.R = new G.Renderer(canvas);
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

    app.S = load() || SIM.create();
    app.R.setState(app.S);
    app.S.fx.events.length = 0;
    app.ui.reset(app.S);

    app.rig.onClick = (e) => {
      const r = canvas.getBoundingClientRect();
      const id = app.R.pickPerson(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (id != null) { app.rig.manual(); app.rig.followPerson(id); }
    };

    const resize = () => app.R.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', resize);
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
    function frame(now) {
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
      for (const e of S.fx.events) { app.R.onEvent(e); app.ui.event(e); if (e.big || e.kind === 'space') app.rig.event(e); }
      S.fx.events.length = 0;
      app.rig.update(dt, S);
      app.R.update(S, dt);
      app.ui.frame(S, dt);

      if (!S.people.length) {
        app.extinctT += dt;
        if (app.extinctT > 8) { app.ui.toast('Life on this world has ended. A new world begins…'); app.newWorld(); }
      }
      saveT += dt;
      if (saveT > 30) { saveT = 0; save(S); }
      requestAnimationFrame(frame);
    }
    window.addEventListener('beforeunload', () => save(app.S));
    document.getElementById('loading').classList.add('gone');
    requestAnimationFrame(frame);
    G.app = app;
  };
})(typeof window !== 'undefined' ? window : globalThis);
