// Camera rig: a cinematic auto-director by default, with drag/scroll orbit controls when you want them.
(function (G) {
  const U = G.U;

  class CameraRig {
    constructor(camera, dom, renderer) {
      this.cam = camera; this.R = renderer;
      this.target = new THREE.Vector3(0, 6, 0);
      this.goal = new THREE.Vector3(0, 6, 0);
      this.dist = 150; this.goalDist = 110;
      this.yaw = 0.7; this.pitch = 0.8; this.goalPitch = 0.8;
      this.spin = 0.04;
      this.auto = true;
      this.idle = 0;
      this.follow = null;
      this.shotT = 3;
      this.shotKind = 'overview';
      this.lastEventShot = -99;
      this.clock = 0;
      this.onShot = null; // callback(kind, info)

      let drag = null;
      const el = dom;
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: false };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (!drag.moved) return;
        this.manual();
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) {
          this.follow = null;
          const s = this.dist * 0.0018;
          const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
          // right = (cos, 0, -sin), forward = (-sin, 0, -cos)
          this.goal.x += (-dx * cy - dy * sy) * s;
          this.goal.z += (dx * sy - dy * cy) * s;
          this.goal.x = U.clamp(this.goal.x, -70, 70); this.goal.z = U.clamp(this.goal.z, -70, 70);
        } else {
          this.yaw -= dx * 0.006;
          this.goalPitch = U.clamp(this.goalPitch + dy * 0.004, 0.12, 1.45);
        }
      });
      el.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved && this.onClick) this.onClick(e);
        drag = null;
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.manual();
        this.goalDist = U.clamp(this.goalDist * Math.exp(e.deltaY * 0.0012), 5, 220);
      }, { passive: false });
    }

    manual() { this.auto = false; this.idle = 0; }
    setAuto(v) { this.auto = v; this.idle = 0; if (v) this.shotT = 0; }

    focus(x, z, dist = 28, pitch = 0.6) {
      this.follow = null;
      this.goal.set(x, this.R.groundY(x + 64, z + 64), z);
      this.goalDist = dist; this.goalPitch = pitch;
    }
    followPerson(id) { this.follow = id; this.goalDist = 10; this.goalPitch = 0.5; }

    // A big thing just happened: go and look at it.
    event(e) {
      if (!this.auto || e.x == null) return;
      if (this.clock - this.lastEventShot < 10 && e.kind !== 'space' && e.kind !== 'era') return;
      this.lastEventShot = this.clock;
      this.focus(e.x - 64, e.z - 64, e.kind === 'space' ? 34 : 26, 0.5);
      this.shotKind = 'event';
      this.shotT = e.kind === 'space' ? 22 : 14;
      if (this.onShot) this.onShot('event', e);
    }

    director(S) {
      const alive = S.settlements.filter((s) => s.alive);
      const r = Math.random();
      if (r < 0.14 || !alive.length) {
        this.follow = null;
        this.goal.set(0, 4, 0); this.goalDist = 125; this.goalPitch = 0.85;
        this.shotKind = 'overview'; this.shotT = U.rand(14, 20);
        if (this.onShot) this.onShot('overview');
        return;
      }
      if (r < 0.52) {
        const adults = S.people.filter((p) => p.age > 8 && p.mode !== 'hidden' && !p.asleep);
        if (adults.length) {
          const p = U.pick(adults);
          this.followPerson(p.id);
          this.shotKind = 'follow'; this.shotT = U.rand(18, 28);
          if (this.onShot) this.onShot('follow', p);
          return;
        }
      }
      const s = U.weightedPick(alive, (s) => s.pop + 5);
      this.follow = null;
      this.focus(s.cx - 64 + U.rand(-3, 3), s.cz - 64 + U.rand(-3, 3), U.rand(20, 38), U.rand(0.45, 0.8));
      this.shotKind = 'town'; this.shotT = U.rand(16, 24); this.lastTown = s;
      if (this.onShot) this.onShot('town', s);
    }

    update(dt, S) {
      this.clock += dt;
      if (!this.auto) { this.idle += dt; if (this.idle > 90) this.setAuto(true); }
      if (this.auto) {
        this.shotT -= dt;
        if (this.shotT <= 0) this.director(S);
        this.yaw += dt * (this.follow ? 0.08 : this.shotKind === 'overview' ? 0.03 : 0.05);
      }
      if (this.follow != null) {
        const p = S.cache.p.get(this.follow);
        if (!p) { this.follow = null; if (this.auto) this.shotT = 0; }
        else if (p.mode === 'hidden' && this.auto && this.shotT > 4) this.shotT = 4;
        if (p) this.goal.set(p.x - 64, this.R.groundY(p.x, p.z) + 0.3, p.z - 64);
      }
      const k = 1 - Math.exp(-dt * (this.follow ? 4 : 1.2));
      this.target.lerp(this.goal, k);
      this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 1.5));
      this.pitch += (this.goalPitch - this.pitch) * (1 - Math.exp(-dt * 2));
      const cp = Math.cos(this.pitch);
      const pos = new THREE.Vector3(
        this.target.x + Math.sin(this.yaw) * cp * this.dist,
        this.target.y + Math.sin(this.pitch) * this.dist,
        this.target.z + Math.cos(this.yaw) * cp * this.dist,
      );
      const gy = this.R.groundY(pos.x + 64, pos.z + 64) + 1.5;
      if (pos.y < gy) pos.y = gy;
      this.cam.position.copy(pos);
      this.cam.lookAt(this.target);
    }
  }

  G.CameraRig = CameraRig;
})(typeof window !== 'undefined' ? window : globalThis);
