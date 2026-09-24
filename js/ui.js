// HUD: stats, civilisation cards, chronicle, person card, labels, chart.
(function (G) {
  const U = G.U, TD = G.TECHDATA, SIM = G.SIM;
  const $ = (id) => document.getElementById(id);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const JOB = { food: 'Food gatherer', wood: 'Woodcutter', stone: 'Stonemason', metal: 'Miner', build: 'Builder', research: 'Thinker', trade: 'Trader' };

  class UI {
    constructor(app) {
      this.app = app;
      this.acc = 1; // fill the HUD on the first frame
      this.labels = new Map();
      this.toastT = 0;
      this.logCount = 0;
      document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => app.setSpeed(+b.dataset.speed)));
      $('b-cam').addEventListener('click', () => app.rig.setAuto(!app.rig.auto));
      // Mobile pull-up sheet.
      const body = document.body;
      this.sheet = (tab) => {
        body.classList.remove('sheet', 'sheet-towns', 'sheet-stats');
        if (tab) body.classList.add('sheet', 'sheet-' + tab);
        document.querySelectorAll('#sheetbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      };
      $('b-info').addEventListener('click', () => this.sheet(body.classList.contains('sheet') ? null : 'towns'));
      $('sheetbar').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) this.sheet(b.dataset.tab || null);
      });
      $('caption').addEventListener('click', () => { if (app.mobile) this.sheet('stats'); });
      $('person').addEventListener('click', (e) => {
        if (e.target.id !== 'b-unfollow') return;
        app.rig.follow = null; app.rig.manual();
        if (app.mobile) this.sheet(null);
      });
      $('b-new').addEventListener('click', () => { if (confirm('Start a brand-new world? The current one will be lost.')) app.newWorld(); });
      $('towns').addEventListener('click', (e) => {
        const el = e.target.closest('.town');
        if (!el) return;
        const s = app.S.cache.s.get(+el.dataset.id);
        if (s) { app.rig.manual(); app.rig.focus(s.cx - 64, s.cz - 64, 30, 0.65); if (app.mobile) this.sheet(null); }
      });
    }

    reset(S) {
      $('log').innerHTML = '';
      this.logCount = 0;
      for (const el of this.labels.values()) el.remove();
      this.labels.clear();
      S.chronicle.slice(-7).forEach((e) => this.addLog(e));
    }

    addLog(e) {
      const li = document.createElement('li');
      if (e.big) li.className = 'big';
      if (e.kind === 'disaster' || e.kind === 'war') li.className = 'disaster';
      if (e.kind === 'evo') li.className = 'evo';
      li.innerHTML = `<span class="y">Year ${e.y}</span><span>${esc(e.text)}</span>`;
      const ul = $('log');
      ul.prepend(li);
      while (ul.children.length > 7) ul.lastChild.remove();
    }

    event(e) {
      if (!e.text) return;
      this.addLog(e);
      if (e.big) this.toast(e.text);
    }

    toast(text) {
      const t = $('toast');
      t.textContent = text;
      t.classList.add('show');
      this.toastT = 6;
    }

    frame(S, dt) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').classList.remove('show');
      this.drawLabels(S);
      this.acc += dt;
      if (this.acc < 0.25) return;
      this.acc = 0;
      this.stats(S);
      this.towns(S);
      this.person(S);
      this.caption(S);
    }

    stats(S) {
      $('s-year').textContent = SIM.yearOf(S);
      $('s-era').textContent = TD.eraName(S.globalEra);
      $('s-pop').textContent = S.people.length;
      $('s-towns').textContent = S.settlements.filter((s) => s.alive).length;
      const tod = SIM.tod(S);
      $('s-time').textContent = SIM.isNight(S) ? '☾ Night' : tod < 0.3 ? '☀ Morning' : tod < 0.65 ? '☀ Day' : '☀ Evening';
      const temp = S.climate.temp;
      $('s-climate').textContent = temp < -0.5 ? '❄ Ice age' : temp < -0.2 ? '❄ Cooling' : temp > 0.35 ? '🌿 Warm age' : '';
      $('s-war').textContent = S.wars.length ? `⚔ ${S.wars.length} war${S.wars.length > 1 ? 's' : ''}` : '';
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === this.app.speed));
      $('b-cam').classList.toggle('on', this.app.rig.auto);
      this.chart(S);
    }

    towns(S) {
      const list = S.settlements.slice().sort((a, b) => (b.alive - a.alive) || b.pop - a.pop);
      const html = list.map((s) => {
        const r = s.research ? TD.tech(s.research.id) : null;
        const foes = S.wars.filter((w) => w.a === s.id || w.b === s.id).map((w) => S.cache.s.get(w.a === s.id ? w.b : w.a)).filter(Boolean);
        const pct = r ? Math.min(100, (s.research.rp / r.cost) * 100) : 100;
        const nTech = Object.keys(s.known).length;
        return `<div class="town ${s.alive ? '' : 'dead'}" data-id="${s.id}">
          <div class="row"><span class="dot" style="background:${hex(s.color)}"></span><span class="name">${esc(s.name)}</span><span class="era">${s.alive ? TD.eraName(s.era) : 'Ruins'}</span></div>
          <div class="meta">${s.pop} people · ${nTech} techs${r ? ` · researching <b style="color:#dfe6ee">${r.name}</b>` : ''}</div>
          ${foes.length ? `<div class="meta" style="color:#ff7a6a">⚔ At war with ${foes.map((o) => esc(o.name)).join(', ')}</div>` : ''}
          ${s.alive ? `<div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="res">🍖 ${s.stock.food | 0} &nbsp;🪵 ${s.stock.wood | 0} &nbsp;🪨 ${s.stock.stone | 0} &nbsp;⛓ ${s.stock.metal | 0}</div>` : ''}
        </div>`;
      }).join('');
      if (html !== this._townsHtml) { $('towns').innerHTML = html; this._townsHtml = html; }
    }

    person(S) {
      const id = this.app.rig.follow;
      const el = $('person');
      const p = id != null ? S.cache.p.get(id) : null;
      if (!p) { el.style.display = 'none'; return; }
      const s = S.cache.s.get(p.sid);
      const partner = S.cache.p.get(p.partner);
      const stage = p.age < 5 ? 'Toddler' : p.age < 13 ? 'Child' : p.age > 58 ? 'Elder' : JOB[p.job] || 'Adult';
      const tbar = (name, v) => `<span>${name}</span><div class="bar"><i style="width:${Math.min(100, (v / 2) * 100)}%;background:#7ab8ff"></i></div><b>${v.toFixed(2)}</b>`;
      const sbar = (name, v) => `<span>${name}</span><div class="bar"><i style="width:${v * 100}%;background:#6fdc8c"></i></div><b>${Math.round(v * 100)}</b>`;
      el.style.display = 'block';
      const html = `<h2>Following</h2>
        <div class="pname"><span class="dot" style="background:${hex(s ? s.color : 0x888888)}"></span>${esc(p.name)}</div>
        <div class="small">${p.sex === 'F' ? 'She' : 'He'} is ${Math.floor(p.age)} · ${stage} of ${esc(s ? s.name : '?')} · generation ${p.gen}</div>
        <div class="thought">“${esc(p.thought)}”</div>
        ${p.mut && p.mut.length ? `<div class="chips" style="margin:4px 0">${p.mut.map((k) => `<span class="chip ${SIM.MUTATIONS[k].good ? '' : 'bad'}">${SIM.MUTATIONS[k].name}</span>`).join('')}</div>` : ''}
        <div class="small">${p.armed ? '<span style="color:#ff7a6a">⚔ Soldier</span> · ' : ''}${partner ? `Partner: ${esc(partner.name)} · ` : ''}${p.kids ? `${p.kids} ${p.kids === 1 ? 'child' : 'children'}` : 'No children'}${p.sick > 0 ? ' · <span style="color:#ff7a6a">sick</span>' : ''}${p.hunger > 1 ? ' · <span style="color:#ff7a6a">hungry</span>' : ''}</div>
        <div class="traits">${tbar('Strength', p.traits.str)}${tbar('Intellect', p.traits.int)}${tbar('Constitution', p.traits.con)}${tbar('Curiosity', p.traits.cur)}
        ${sbar('Gathering', p.skills.gather)}${sbar('Building', p.skills.build)}${sbar('Research', p.skills.research)}</div>
        <div style="margin-top:8px"><button id="b-unfollow">Stop following</button></div>`;
      // Only touch the DOM when something changed, so taps on the button aren't lost mid-rebuild.
      if (html !== this._personHtml) { el.innerHTML = html; this._personHtml = html; }
    }

    caption(S) {
      const rig = this.app.rig;
      let text = '';
      if (rig.follow != null) {
        const p = S.cache.p.get(rig.follow);
        if (p) text = `${p.name} — ${p.thought}${this.app.mobile ? '  ›' : ''}`;
      } else if (rig.shotKind === 'town' && rig.auto && rig.lastTown) text = `${rig.lastTown.name} · ${TD.eraName(rig.lastTown.era)} · ${rig.lastTown.pop} people`;
      $('caption').textContent = text;
    }

    chart(S) {
      const cv = $('chart'), g = cv.getContext('2d');
      const w = cv.width, h = cv.height;
      g.clearRect(0, 0, w, h);
      const H = S.history;
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, (h * k) / 4); g.lineTo(w, (h * k) / 4); g.stroke(); }
      if (H.length >= 2) {
        const line = (key, max, min, color) => {
          g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
          H.forEach((d, k) => {
            const x = (k / (H.length - 1)) * w;
            const y = h - 6 - ((d[key] - min) / (max - min || 1)) * (h - 12);
            k ? g.lineTo(x, y) : g.moveTo(x, y);
          });
          g.stroke();
        };
        line('pop', Math.max(...H.map((d) => d.pop)) * 1.05, 0, '#6fdc8c');
        line('techs', Math.max(TD.TECHS.length, ...H.map((d) => d.techs)) * 1.05, 0, '#ffd35a');
        const ints = H.map((d) => d.int);
        line('int', Math.max(1.3, ...ints), Math.min(0.8, ...ints), '#7ab8ff');
      } else {
        g.fillStyle = '#9aa6b8'; g.font = '22px Inter'; g.fillText('History starts after year 1…', 12, h / 2);
      }
      const n = S.people.length || 1;
      const avg = (k) => S.people.reduce((a, p) => a + p.traits[k], 0) / n;
      const first = H[0];
      const tr = (name, key) => {
        const v = avg(key), d = first ? v - first[key] : 0;
        const arrow = Math.abs(d) < 0.005 ? '' : d > 0 ? ` <span style="color:#6fdc8c">▲${d.toFixed(2)}</span>` : ` <span style="color:#ff7a6a">▼${(-d).toFixed(2)}</span>`;
        return `<span>${name}</span><div class="bar"><i style="width:${(v / 2) * 100}%;background:#7ab8ff"></i></div><b>${v.toFixed(2)}${arrow}</b>`;
      };
      const oldest = S.people.reduce((a, p) => (p.age > (a ? a.age : 0) ? p : a), null);
      const gen = S.people.reduce((a, p) => Math.max(a, p.gen), 1);
      $('traits').innerHTML = tr('Intellect', 'int') + tr('Strength', 'str') + tr('Constitution', 'con') +
        `<span>Generation</span><span></span><b>${gen}</b><span>Births</span><span></span><b>${S.stats.births}</b><span>Deaths</span><span></span><b>${S.stats.deaths}</b>` +
        (oldest ? `<span>Oldest</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(oldest.name)}</span><b>${Math.floor(oldest.age)}</b>` : '');
      // Mutations currently in the gene pool.
      const M = SIM.MUTATIONS;
      const chips = Object.keys(M).map((k) => [k, S.people.filter((p) => p.mut && p.mut.includes(k)).length / n]).filter(([, v]) => v >= 0.01).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<span class="chip ${M[k].good ? '' : 'bad'}">${M[k].name} ${Math.round(v * 100)}%</span>`).join('');
      const temp = S.climate.temp;
      const clim = temp < -0.5 ? 'Ice age ❄' : temp < -0.2 ? 'Cooling' : temp > 0.35 ? 'Warm age' : 'Temperate';
      const col = S.colonies.reduce((a, c) => a + c.pop, 0);
      const world = `<div class="world"><span>Climate</span><b>${clim}</b><span>Wars fought</span><b>${S.stats.wars || 0}</b><span>Dark ages</span><b>${S.stats.darkAges || 0}</b>` +
        `<span>Star colonies</span><b>${S.colonies.length ? `${S.colonies.length} · ${col.toLocaleString()} people` : 'none yet'}</b></div>`;
      const html = `<h2 style="margin-top:10px">Mutations</h2><div class="chips">${chips || '<span class="small">None yet: they appear at random in newborns.</span>'}</div><h2 style="margin-top:10px">World</h2>${world}`;
      if (html !== this._extraHtml) { $('extra').innerHTML = html; this._extraHtml = html; }
    }

    drawLabels(S) {
      const R = this.app.R;
      const box = document.body.getBoundingClientRect();
      const seen = new Set();
      for (const s of S.settlements) {
        if (!s.alive) continue;
        seen.add(s.id);
        let el = this.labels.get(s.id);
        if (!el) { el = document.createElement('div'); el.className = 'label'; $('labels').appendChild(el); this.labels.set(s.id, el); }
        const b = S.cache.b.get(s.centerB);
        const top = b ? b.baseY * 0.5 + 2.2 + (b.style >= 8 ? 5 : [1.3, 2, 2, 2.2, 2.4, 4.5, 5.5, 11][b.style]) : 4;
        const v = R.project(s.cx - 64, top, s.cz - 64);
        const dist = R.camera.position.distanceTo(new THREE.Vector3(s.cx - 64, top, s.cz - 64));
        if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 || dist > 260) { el.style.display = 'none'; continue; }
        el.style.display = 'flex';
        el.style.left = ((v.x + 1) / 2) * box.width + 'px';
        el.style.top = ((1 - v.y) / 2) * box.height + 'px';
        el.style.opacity = dist > 160 ? 0.6 : 1;
        const html = `<span class="dot" style="background:${hex(s.color)}"></span>${esc(s.name)}<small>${s.pop}</small>`;
        if (el._h !== html) { el.innerHTML = html; el._h = html; }
      }
      for (const [id, el] of this.labels) if (!seen.has(id)) { el.remove(); this.labels.delete(id); }
    }
  }

  G.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
