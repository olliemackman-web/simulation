// The autonomous simulation. Pure data + logic; the renderer only reads it.
(function (G) {
  const U = G.U, W = G.WORLD, TD = G.TECHDATA;
  const { T, R, N } = W;
  const { TECHS, BUILDINGS } = TD;

  const DAY = 30;          // sim-seconds per day
  const YEAR = 60;         // sim-seconds per year
  const BASE_POP = 420;
  const maxPop = (S) => BASE_POP + 35 * U.clamp(S.globalEra - 7, 0, 4);

  // Inherited mutations. Good ones spread because their carriers live longer or have more children.
  const MUTATIONS = {
    longevity: { name: 'Long-lived', good: true, w: 1 },
    genius: { name: 'Genius', good: true, w: 1 },
    mighty: { name: 'Mighty', good: true, w: 1 },
    resistant: { name: 'Plague-resistant', good: true, w: 1 },
    fertile: { name: 'Fertile', good: true, w: 0.8 },
    hardy: { name: 'Cold-hardy', good: true, w: 1 },
    swift: { name: 'Swift', good: true, w: 1 },
    giant: { name: 'Giant', good: true, w: 0.6 },
    frail: { name: 'Frail', good: false, w: 1.4 },
    dim: { name: 'Slow-witted', good: false, w: 1.2 },
  };
  const mut = (p, k) => !!(p.mut && p.mut.includes(k));
  // How attractive / fit a person is: drives partner choice and fertility.
  const fitness = (p) => (p.traits.str + p.traits.int * 1.4 + p.traits.con * 1.3 + p.traits.cur * 0.4) / 4.1 +
    (p.mut ? p.mut.reduce((a, k) => a + (MUTATIONS[k].good ? 0.12 : -0.2), 0) : 0) + (p.health - 1) * 0.3;
  const MAX_SETTLEMENTS = 10;
  const WALK = 2.4;        // tiles per sim-second

  // ---------- bookkeeping ----------
  function attach(S) {
    S.fx = { tiles: new Set(), bld: new Set(), removed: [], events: [] };
    S.cache = { p: new Map(), b: new Map(), s: new Map(), claims: new Map() };
    S.people.forEach((p) => S.cache.p.set(p.id, p));
    S.buildings.forEach((b) => S.cache.b.set(b.id, b));
    S.settlements.forEach((s) => S.cache.s.set(s.id, s));
  }
  const nid = (S) => S.nextId++;
  const getP = (S, id) => S.cache.p.get(id);
  const getB = (S, id) => S.cache.b.get(id);
  const getS = (S, id) => S.cache.s.get(id);
  const yearOf = (S) => Math.floor(S.t / YEAR) + 1;
  const tod = (S) => (S.t % DAY) / DAY;
  const isNight = (S) => { const d = tod(S); return d < 0.2 || d > 0.84; };
  const has = (s, id) => !!(s && s.known[id]);

  function log(S, text, o = {}) {
    const e = { y: yearOf(S), text, big: !!o.big, sid: o.sid ?? null, x: o.x ?? null, z: o.z ?? null, kind: o.kind || 'info' };
    S.chronicle.push(e);
    if (S.chronicle.length > 300) S.chronicle.shift();
    S.fx.events.push(e);
  }

  function claim(S, key, d) { const c = S.cache.claims; c.set(key, (c.get(key) || 0) + d); if (c.get(key) <= 0) c.delete(key); }
  const claims = (S, key) => S.cache.claims.get(key) || 0;

  // ---------- creation ----------
  function create(seed) {
    seed = seed ?? Math.floor(Math.random() * 1e9);
    const S = {
      version: 1, seed, t: DAY * 0.3, world: W.generate(seed),
      people: [], settlements: [], buildings: [], animals: [], burning: [],
      nextId: 1, chronicle: [], history: [], globalEra: 0, usedColors: [],
      timers: { world: 0, settle: 0, year: 0, animals: 0, pair: 0, diffuse: 0, event: YEAR * 3 },
      stats: { births: 0, deaths: 0, launches: 0, starships: 0, wars: 0, darkAges: 0, quakes: 0 },
      climate: { temp: 0, target: 0, next: YEAR * U.rand(35, 70) }, wars: [], colonies: [], bestKnown: {}, extinctT: 0,
    };
    attach(S);
    // Wildlife.
    for (let k = 0; k < 70; k++) {
      const i = randomTile(S, (i) => S.world.type[i] === T.GRASS && S.world.res[i] === R.NONE);
      if (i >= 0) spawnDeer(S, i % N + 0.5, Math.floor(i / N) + 0.5);
    }
    for (let k = 0; k < 3; k++) spawnTribe(S, null);
    return S;
  }

  // A fresh band of people arrives. `known` lets returning star-colonists bring their knowledge back.
  function spawnTribe(S, known, text) {
    const site = findSettlementSite(S, [], null);
    if (!site) return null;
    const s = makeSettlement(S, site, known ? { known, era: Math.max(0, ...Object.keys(known).map((id) => TD.tech(id)?.era || 0)) } : null);
    const b = getB(S, s.centerB);
    if (b && known) { b.built = true; b.progress = 1; b.upgrading = false; }
    for (let c = 0; c < 4; c++) {
      const m = makePerson(S, s, site.x + U.rand(-2, 2), site.z + U.rand(-2, 2), U.rand(17, 30), null);
      const f = makePerson(S, s, site.x + U.rand(-2, 2), site.z + U.rand(-2, 2), U.rand(17, 30), null);
      m.sex = 'M'; f.sex = 'F'; m.partner = f.id; f.partner = m.id;
    }
    for (let c = 0; c < 3; c++) makePerson(S, s, site.x + U.rand(-2, 2), site.z + U.rand(-2, 2), U.rand(2, 11), null);
    s.stock.food = 45; s.stock.wood = known ? 60 : 10; s.stock.stone = known ? 40 : 0;
    log(S, text ? text(s) : `The ${s.name} tribe gathers around a patch of land.`, { sid: s.id, x: s.cx, z: s.cz, big: !!text, kind: text ? 'colony' : 'info' });
    return s;
  }

  function randomTile(S, pred, tries = 2000) {
    for (let k = 0; k < tries; k++) { const i = Math.floor(Math.random() * N * N); if (pred(i)) return i; }
    return -1;
  }

  function areaOk(S, x, z, w, d, margin, maxRange, allowTypes) {
    const Wd = S.world;
    let lo = 99, hi = 0;
    for (let zz = z - margin; zz < z + d + margin; zz++) for (let xx = x - margin; xx < x + w + margin; xx++) {
      if (!W.inb(xx, zz)) return false;
      const i = W.idx(xx, zz);
      if (Wd.occ[i] !== -1) return false;
      const inside = xx >= x && xx < x + w && zz >= z && zz < z + d;
      if (!inside) continue;
      if (!allowTypes.includes(Wd.type[i])) return false;
      if (Wd.res[i] === R.BOULDER || Wd.res[i] === R.ORE) return false;
      if (Wd.road[i] >= 2) return false;
      lo = Math.min(lo, Wd.h[i]); hi = Math.max(hi, Wd.h[i]);
    }
    return hi - lo <= maxRange;
  }

  function findSettlementSite(S, existing, parent) {
    const Wd = S.world;
    let best = null, bestScore = -1e9;
    for (let k = 0; k < 700; k++) {
      const x = U.randi(6, N - 9), z = U.randi(6, N - 9);
      const i = W.idx(x + 1, z + 1);
      if (Wd.type[i] !== T.GRASS) continue;
      if (!areaOk(S, x, z, 3, 3, 1, 1, [T.GRASS, T.SAND])) continue;
      const cx = x + 1.5, cz = z + 1.5;
      const others = existing.concat(S.settlements.filter((s) => s.alive).map((s) => ({ x: s.cx, z: s.cz })));
      let minD = 1e9;
      for (const o of others) minD = Math.min(minD, U.dist(cx, cz, o.x, o.z));
      if (minD < (parent && parent.id ? 22 : 30)) continue;
      if (parent && parent.id && U.dist(cx, cz, parent.cx, parent.cz) > 60) continue;
      let score = 0, water = false, flat = 0;
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
        const xx = x + 1 + dx, zz = z + 1 + dz;
        if (!W.inb(xx, zz)) continue;
        const j = W.idx(xx, zz);
        if (Wd.res[j] === R.TREE) score += 1;
        if (Wd.res[j] === R.BUSH) score += 4;
        if (Wd.res[j] === R.BOULDER) score += 1;
        if (Wd.type[j] === T.WATER) water = true;
        if (Wd.type[j] === T.GRASS && Math.abs(Wd.h[j] - Wd.h[i]) <= 1) flat++;
      }
      score += (water ? 15 : 0) + flat * 0.15 + Math.random() * 10;
      if (parent && parent.id) score -= U.dist(cx, cz, parent.cx, parent.cz) * 0.2;
      if (score > bestScore) { bestScore = score; best = { x: cx, z: cz, tx: x, tz: z }; }
    }
    return best;
  }

  function makeSettlement(S, site, parent) {
    const free = U.TRIBE_COLORS.filter((c) => !S.usedColors.includes(c));
    const color = free.length ? free[0] : U.pick(U.TRIBE_COLORS);
    S.usedColors.push(color);
    const s = {
      id: nid(S), name: U.placeName(), color, cx: site.x, cz: site.z, alive: true,
      known: parent ? Object.assign({}, parent.known) : {}, era: parent ? parent.era : 0,
      research: null, stock: { food: 0, wood: 0, stone: 0, metal: 0 }, wanted: null,
      foundedT: S.t, lastColony: S.t, parent: parent ? parent.id : null, pop: 0, centerB: -1,
      jobs: {}, peakPop: 0, noSpace: {}, order: parent && parent.order ? parent.order.slice() : Object.keys(parent ? parent.known : {}),
      rel: {}, popLog: [], lastDark: -1e9, fut: 0,
    };
    s.fut = TD.futureCount(s.known);
    S.settlements.push(s); S.cache.s.set(s.id, s);
    const b = placeBuilding(S, s, 'center', site.tx, site.tz, s.era, !parent);
    s.centerB = b.id;
    if (parent) { b.built = true; b.progress = 0; b.upgrading = true; } // colonists raise it on arrival
    if (parent && parent.id) { s.rel[parent.id] = 40; parent.rel[s.id] = 40; }
    return s;
  }

  function inheritTraits(a, b) {
    const t = {};
    for (const k of ['str', 'int', 'con', 'cur']) {
      const base = a && b ? (a.traits[k] + b.traits[k]) / 2 : 1;
      t[k] = U.clamp(base + U.gauss() * (a ? 0.07 : 0.12), 0.4, 3);
    }
    return t;
  }

  function inheritMutations(a, b) {
    const out = [];
    if (a && b) {
      for (const k of new Set([...(a.mut || []), ...(b.mut || [])])) {
        const both = mut(a, k) && mut(b, k);
        if (Math.random() < (both ? 0.8 : 0.5)) out.push(k);
      }
    }
    // Something brand new, now and then.
    if (Math.random() < 0.03) {
      const keys = Object.keys(MUTATIONS).filter((k) => !out.includes(k));
      const k = U.weightedPick(keys, (k) => MUTATIONS[k].w);
      if (k) out.push(k);
    }
    return out;
  }

  function makePerson(S, s, x, z, age, parents) {
    const [a, b] = parents || [];
    const traits = inheritTraits(a, b);
    const muts = inheritMutations(a, b);
    if (muts.includes('giant')) traits.str = Math.min(3, traits.str + 0.25);
    if (muts.includes('dim')) traits.int = Math.max(0.4, traits.int - 0.25);
    const p = {
      id: nid(S), name: U.personName(), sid: s.id, sex: Math.random() < 0.5 ? 'M' : 'F', age,
      x, z, tx: x, tz: z, moving: false, facing: Math.random() * 6.28,
      hunger: U.rand(0, 0.4), health: 1, sick: 0, traits,
      skills: { gather: 0.1, build: 0.1, research: 0.1 },
      home: -1, partner: -1, parents: parents ? [a.id, b.id] : [], kids: 0,
      task: null, job: null, carry: null, asleep: false, thought: 'Looking around',
      life: 46 + U.gauss() * 7 + (traits.con - 1) * 25 + (muts.includes('longevity') ? 15 : 0) - (muts.includes('frail') ? 14 : 0),
      mode: 'walk', gen: parents ? Math.max(a.gen, b.gen) + 1 : 1, mut: muts,
    };
    if (a && b && muts.length && muts.some((k) => !mut(a, k) && !mut(b, k)) && Math.random() < 0.25) {
      const k = muts.find((k) => !mut(a, k) && !mut(b, k));
      log(S, `${p.name} is born in ${s.name} with a new trait: ${MUTATIONS[k].name.toLowerCase()}.`, { sid: s.id, x, z, kind: 'evo' });
    }
    if (a && b) {
      // Children pick up a little of their parents' know-how.
      for (const k in p.skills) p.skills[k] = 0.1 + ((a.skills[k] + b.skills[k]) / 2) * 0.15;
    }
    S.people.push(p); S.cache.p.set(p.id, p);
    return p;
  }

  function spawnDeer(S, x, z) {
    const d = { id: nid(S), x, z, tx: x, tz: z, wait: U.rand(0, 5), facing: 0 };
    S.animals.push(d);
    return d;
  }

  // ---------- buildings ----------
  function placeBuilding(S, s, type, x, z, style, built) {
    const def = BUILDINGS[type];
    const Wd = S.world;
    const b = {
      id: nid(S), type, sid: s.id, x, z, w: def.w, d: def.d, style, built: !!built, progress: built ? 1 : 0,
      work: def.work(style), residents: [], growth: 0, upgrading: false, baseY: 0, t: S.t,
    };
    let hi = 0;
    for (let zz = z; zz < z + b.d; zz++) for (let xx = x; xx < x + b.w; xx++) {
      const i = W.idx(xx, zz);
      Wd.occ[i] = b.id;
      if (Wd.res[i] === R.TREE) s.stock.wood += 2;
      Wd.res[i] = R.NONE; Wd.amt[i] = 0; Wd.road[i] = 0;
      hi = Math.max(hi, Wd.h[i]);
      S.fx.tiles.add(i);
    }
    b.baseY = hi;
    S.buildings.push(b); S.cache.b.set(b.id, b);
    S.fx.bld.add(b.id);
    return b;
  }

  function removeBuilding(S, b) {
    const Wd = S.world;
    for (let zz = b.z; zz < b.z + b.d; zz++) for (let xx = b.x; xx < b.x + b.w; xx++) {
      const i = W.idx(xx, zz); Wd.occ[i] = -1; S.fx.tiles.add(i);
    }
    b.residents.forEach((pid) => { const p = getP(S, pid); if (p) p.home = -1; });
    S.buildings.splice(S.buildings.indexOf(b), 1);
    S.cache.b.delete(b.id);
    S.fx.removed.push(b.id);
  }

  const bCenter = (b) => ({ x: b.x + b.w / 2, z: b.z + b.d / 2 });
  const sBuildings = (S, s, type) => S.buildings.filter((b) => b.sid === s.id && (!type || b.type === type));
  const capacity = (b) => (b.type === 'house' && b.built ? BUILDINGS.house.capacity(b.style) : 0);

  function findSpot(S, s, type) {
    const def = BUILDINGS[type];
    const minR = { field: 5, pasture: 7, factory: 8, power: 10, launchpad: 12, reactor: 10 }[type] || 2;
    const others = S.settlements.filter((o) => o.alive && o.id !== s.id);
    const types = type === 'field' || type === 'pasture' ? [T.GRASS] : [T.GRASS, T.SAND, T.ROCK];
    for (let r = minR; r <= 30; r++) {
      const cand = [];
      for (let k = -r; k <= r; k++) {
        cand.push([k, -r], [k, r]);
        if (k > -r && k < r) cand.push([-r, k], [r, k]);
      }
      for (let n = cand.length - 1; n > 0; n--) { const j = Math.floor(Math.random() * (n + 1)); [cand[n], cand[j]] = [cand[j], cand[n]]; }
      for (const [dx, dz] of cand) {
        const x = Math.floor(s.cx + dx - def.w / 2), z = Math.floor(s.cz + dz - def.d / 2);
        const cx = x + def.w / 2, cz = z + def.d / 2;
        const myD = U.dist(cx, cz, s.cx, s.cz);
        if (others.some((o) => U.dist(cx, cz, o.cx, o.cz) < myD + 2)) continue;
        if (areaOk(S, x, z, def.w, def.d, 1, type === 'field' || type === 'pasture' ? 1 : 2, types)) return { x, z };
      }
    }
    return null;
  }

  function canAfford(s, cost) {
    for (const k in cost) if ((s.stock[k] || 0) < cost[k]) return false;
    return true;
  }
  function pay(s, cost) { for (const k in cost) s.stock[k] -= cost[k]; }

  function decideBuild(S, s) {
    const mine = sBuildings(S, s);
    const count = (t) => mine.filter((b) => b.type === t).length;
    const pop = s.pop;
    const e = s.era;
    let cap = 0;
    mine.forEach((b) => { if (b.type === 'house') cap += BUILDINGS.house.capacity(b.built ? b.style : e); });
    const want = [];
    if (has(s, 'shelter') && cap < pop + 3) want.push('house');
    if (has(s, 'agriculture') && count('field') < Math.min(10, Math.ceil(pop / 6))) want.push('field');
    if (has(s, 'writing') && count('research') < 1) want.push('research');
    if (has(s, 'pottery') && count('granary') < 1 + Math.floor(pop / 45)) want.push('granary');
    if (has(s, 'husbandry') && count('pasture') < 1 + Math.floor(pop / 45)) want.push('pasture');
    if (has(s, 'bronze') && count('smithy') < 1) want.push('smithy');
    if (has(s, 'currency') && count('market') < 1 && pop >= 14) want.push('market');
    if (has(s, 'architecture') && count('temple') < 1 && pop >= 18) want.push('temple');
    if (has(s, 'engineering') && count('windmill') < 1 + Math.floor(count('field') / 5)) want.push('windmill');
    if (has(s, 'industry') && count('factory') < 1 + Math.floor(pop / 60)) want.push('factory');
    if (has(s, 'electricity') && count('power') < 1) want.push('power');
    if (has(s, 'modern_medicine') && count('hospital') < 1 && pop >= 20) want.push('hospital');
    if (has(s, 'rocketry') && count('launchpad') < 1) want.push('launchpad');
    if (has(s, 'fusion') && count('reactor') < 1) want.push('reactor');
    for (const t of want) {
      if (s.noSpace[t] && S.t - s.noSpace[t] < 40) continue;
      return { type: t, cost: BUILDINGS[t].cost(e) };
    }
    // Modernise old buildings, one at a time.
    const stale = mine.filter((b) => b.built && !b.upgrading && b.style < e && ['center', 'house', 'research'].includes(b.type) && (b.type !== 'center' || e > 0));
    if (stale.length && !mine.some((b) => b.upgrading) && !(s.noSpace.upgrade && S.t - s.noSpace.upgrade < 40)) {
      stale.sort((a, b) => (a.type === 'center' ? -1 : 0) - (b.type === 'center' ? -1 : 0) || a.style - b.style);
      const b = stale[0];
      const c = BUILDINGS[b.type].cost(e), half = {};
      for (const k in c) half[k] = Math.ceil(c[k] * 0.6);
      return { type: b.type, cost: half, upgrade: b.id };
    }
    return null;
  }

  function plan(S, s) {
    const mine = sBuildings(S, s);
    const active = mine.filter((b) => !b.built || b.upgrading).length;
    if (active >= 1 + Math.floor(s.pop / 18)) return;
    const choice = decideBuild(S, s);
    if (choice && (!s.wanted || s.wanted.type !== choice.type)) s.wantT = S.t;
    s.wanted = choice;
    if (!choice) return;
    if (!canAfford(s, choice.cost)) {
      // Can't gather what this needs right now: set it aside and try something else later.
      if (S.t - s.wantT > 50) { s.noSpace[choice.upgrade ? 'upgrade' : choice.type] = S.t; s.wanted = null; }
      return;
    }
    if (choice.upgrade) {
      const b = getB(S, choice.upgrade);
      if (!b) return;
      pay(s, choice.cost);
      b.style = s.era; b.upgrading = true; b.progress = 0; b.work = BUILDINGS[b.type].work(s.era) * 0.7;
      S.fx.bld.add(b.id);
      s.wanted = null;
      return;
    }
    const spot = findSpot(S, s, choice.type);
    if (!spot) { s.noSpace[choice.type] = S.t; return; }
    pay(s, choice.cost);
    const b = placeBuilding(S, s, choice.type, spot.x, spot.z, s.era, false);
    s.wanted = null;
    if (['research', 'market', 'temple', 'factory', 'power', 'hospital', 'launchpad', 'reactor', 'windmill', 'smithy'].includes(b.type) && !s['first_' + b.type]) {
      s['first_' + b.type] = true;
      const name = b.type === 'research' ? TD.researchName(s.era) : BUILDINGS[b.type].name;
      log(S, `${s.name} begins building a ${name.toLowerCase()}.`, { sid: s.id, x: b.x + 1, z: b.z + 1 });
    }
  }

  function finishBuilding(S, b) {
    const wasUpgrade = b.upgrading;
    b.built = true; b.upgrading = false; b.progress = 1;
    S.fx.bld.add(b.id);
    const s = getS(S, b.sid);
    if (!s) return;
    if (b.type === 'center' && wasUpgrade && s.era > 0 && b.style === s.era) {
      if (b.style >= 2) log(S, `${s.name} completes a new ${TD.eraName(s.era).replace(' Age', '')}-era town hall.`, { sid: s.id, x: b.x + 1.5, z: b.z + 1.5 });
    }
    if (b.type === 'launchpad') log(S, `${s.name} completes a launch pad. The sky is no longer the limit.`, { sid: s.id, x: b.x + 2, z: b.z + 2, big: true });
  }

  // ---------- research ----------
  function pickResearch(S, s) {
    const avail = TD.available(s.known);
    if (!avail.length) { s.research = null; return; }
    const Wd = S.world;
    const t = U.weightedPick(avail, (t) => {
      let w = 1 / Math.pow(t.cost, 1.3);
      if (t.id === 'fishing' && W.nearWater(Wd, Math.floor(s.cx), Math.floor(s.cz), 10)) w *= 2;
      if (t.id === 'shelter' || t.id === 'agriculture') w *= 2;
      return w;
    });
    s.research = { id: t.id, rp: 0 };
  }

  function learn(S, s, id) {
    if (s.known[id]) return;
    s.known[id] = true;
    s.order.push(id);
    s.fut = TD.futureCount(s.known);
    const t = TD.tech(id);
    if (!S.bestKnown[id]) S.bestKnown[id] = true;
    const firstEver = !S.settlements.some((o) => o !== s && o.known[id]);
    log(S, `${s.name} discovered ${t.name}${firstEver ? ' — a world first!' : '.'}`, { sid: s.id, x: s.cx, z: s.cz, big: firstEver, kind: 'tech' });
    if (t.era > s.era) {
      s.era = t.era;
      log(S, `${s.name} has entered the ${TD.eraName(s.era)}!`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'era' });
      if (s.era > S.globalEra) S.globalEra = s.era;
    }
    if (id === 'electricity' || id === 'masonry' || id === 'combustion') for (let i = 0; i < N * N; i++) if (S.world.road[i]) S.fx.tiles.add(i);
    if (s.research && s.research.id === id) pickResearch(S, s);
  }

  function addResearch(S, s, rp) {
    if (!s.research) pickResearch(S, s);
    if (!s.research) return;
    s.research.rp += rp;
    const t = TD.tech(s.research.id);
    if (s.research.rp >= t.cost) { const carry = s.research.rp - t.cost; learn(S, s, t.id); if (s.research) s.research.rp = Math.min(carry, 20); }
  }

  const researchBonus = (s) =>
    (has(s, 'language') ? 1.2 : 1) * (has(s, 'writing') ? 1.2 : 1) * (has(s, 'printing') ? 1.35 : 1) *
    (has(s, 'computers') ? 1.4 : 1) * (has(s, 'ai') ? 1.6 : 1) * Math.pow(1.03, s.fut || 0);
  const toolMult = (s) => 1 + (has(s, 'stone_tools') ? 0.35 : 0) + (has(s, 'bronze') ? 0.3 : 0) + (has(s, 'iron') ? 0.3 : 0) + (has(s, 'industry') ? 0.5 : 0) + (s.fut || 0) * 0.05;
  const lifeBonus = (S, s) => (has(s, 'weaving') ? 4 : 0) + (has(s, 'medicine') ? 9 : 0) + (has(s, 'modern_medicine') ? 18 : 0) + (has(s, 'ai') ? 6 : 0) + Math.min(40, (s ? s.fut || 0 : 0) * 1.5);

  // Knowledge can be lost when a town is devastated.
  function forget(S, s, n) {
    const lost = [];
    while (n-- > 0 && s.order.length > 3) {
      const id = s.order.pop();
      delete s.known[id];
      lost.push(TD.tech(id).name);
    }
    s.fut = TD.futureCount(s.known);
    s.era = Math.max(0, ...Object.keys(s.known).map((id) => TD.tech(id)?.era || 0));
    if (s.research && !TD.tech(s.research.id).req.every((r) => s.known[r])) s.research = null;
    return lost;
  }

  // Climate: 1 = warm, 0 = normal, -1 = deep ice age.
  const foodMult = (S) => U.clamp(1 + S.climate.temp * 0.45, 0.5, 1.2);

  // ---------- people: movement ----------
  function goTo(p, x, z) { p.tx = x; p.tz = z; p.moving = true; }

  function move(S, p, s, dt) {
    const Wd = S.world;
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const d = Math.hypot(dx, dz);
    const ti = W.idx(U.clamp(Math.floor(p.x), 0, N - 1), U.clamp(Math.floor(p.z), 0, N - 1));
    let sp = WALK;
    const water = Wd.type[ti] === T.WATER;
    const road = Wd.road[ti];
    if (water) sp *= has(s, 'sailing') ? 1.1 : 0.45;
    else if (road) sp *= [1, 1.25, 1.5, 1.8][road];
    else if (Wd.type[ti] >= T.ROCK) sp *= 0.75;
    if (p.age < 12) sp *= 0.8; else if (p.age > 55) sp *= 0.8;
    if (has(s, 'wheel') && p.carry) sp *= 1.2;
    if (mut(p, 'swift')) sp *= 1.2;
    let mode = water ? (has(s, 'sailing') ? 'boat' : 'swim') : 'walk';
    if (!water && has(s, 'combustion') && p.age >= 16 && d > 7) { sp *= 2.6; mode = 'car'; }
    p.mode = mode;
    const step = sp * dt;
    if (d <= step) { p.x = p.tx; p.z = p.tz; p.moving = false; if (p.mode === 'car') p.mode = 'walk'; }
    else { p.x += (dx / d) * step; p.z += (dz / d) * step; p.facing = Math.atan2(dx, dz); }
    if (!water) Wd.traffic[ti] += dt * (mode === 'car' ? 1.5 : 1);
  }

  // ---------- people: decisions ----------
  function dropPoint(S, s, p) {
    let best = getB(S, s.centerB), bd = 1e9;
    for (const b of S.buildings) {
      if (b.sid !== s.id || !(b.type === 'center' || (b.type === 'granary' && b.built))) continue;
      const c = bCenter(b), d = U.dist(c.x, c.z, p.x, p.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? bCenter(best) : { x: s.cx, z: s.cz };
  }

  function researchSpot(S, s) {
    const r = S.buildings.find((b) => b.sid === s.id && b.type === 'research' && b.built);
    if (r) return { b: r, ...bCenter(r) };
    return { b: null, x: s.cx + U.rand(-1.5, 1.5), z: s.cz + U.rand(-1.5, 1.5) };
  }

  function chooseJob(S, p, s) {
    const pop = Math.max(1, s.pop);
    const st = s.stock;
    const cost = s.wanted ? s.wanted.cost : {};
    const need = (k, base) => {
      const target = (cost[k] || 0) + base;
      return U.clamp((target - (st[k] || 0)) / Math.max(1, target), 0, 1);
    };
    const jc = s.jobs;
    const crowd = (j) => 1 / (1 + (jc[j] || 0) * 0.25);
    const e = s.era;
    const foodNeed = U.clamp(1 - st.food / (pop * 5 + 15), 0, 1);
    const sites = S.buildings.filter((b) => b.sid === s.id && (!b.built || b.upgrading));
    const w = {
      food: (0.35 + foodNeed * 4) * p.traits.str,
      wood: (0.15 + need('wood', 15 + e * 5) * 2.2) * p.traits.str,
      stone: (e >= 2 || cost.stone ? 0.1 + need('stone', e >= 2 ? 15 + e * 5 : 0) * 2.2 : 0) * p.traits.str,
      metal: has(s, 'mining') ? (0.05 + need('metal', e >= 4 ? 10 : 0) * 2.2) * p.traits.str : 0,
      build: sites.length ? 1.2 * Math.min(3, sites.length) : 0,
      research: (0.55 + Math.min(e, 8) * 0.05) * p.traits.int * p.traits.int * (p.age > 50 ? 2.5 : 1) * (foodNeed > 0.7 ? 0.3 : 1),
      trade: has(s, 'currency') && S.settlements.filter((o) => o.alive).length > 1 ? 0.12 : 0,
      war: p.age >= 16 && p.age <= 48 && S.wars.some((w) => w.a === s.id || w.b === s.id) ? 1.1 * p.traits.str * (foodNeed > 0.8 ? 0.4 : 1) : 0,
    };
    for (const j in w) {
      w[j] *= crowd(j);
      if (p.job === j) w[j] *= 1.6; // habits form, skills specialise
    }
    return U.weightedPick(Object.keys(w), (j) => w[j]);
  }

  function think(S, p, s) {
    const night = isNight(S);
    p.asleep = false;
    if (night) return startTask(S, p, s, 'sleep');
    if (p.hunger > 0.55 && s.stock.food >= 1) return startTask(S, p, s, 'eat');
    if (p.age < 5) return startTask(S, p, s, 'toddle');
    if (p.age < 13) return startTask(S, p, s, Math.random() < 0.45 ? 'learn' : 'play');
    const job = chooseJob(S, p, s);
    p.job = job;
    let ok = false;
    if (job === 'food') {
      const opts = [];
      if (has(s, 'agriculture')) opts.push('farm', 'farm', 'farm');
      if (has(s, 'husbandry')) opts.push('herd');
      if (has(s, 'hunting')) opts.push('hunt');
      if (has(s, 'fishing')) opts.push('fish', 'fish');
      opts.push('forage', 'forage');
      const shuffled = opts.sort(() => Math.random() - 0.5);
      for (const o of shuffled) if ((ok = startTask(S, p, s, o))) break;
    } else if (job === 'wood') ok = startTask(S, p, s, 'chop');
    else if (job === 'stone') ok = startTask(S, p, s, 'quarry');
    else if (job === 'metal') ok = (Math.random() < 0.6 && startTask(S, p, s, 'manufacture')) || startTask(S, p, s, 'mine');
    else if (job === 'war') ok = startTask(S, p, s, 'fight');
    else ok = startTask(S, p, s, job);
    if (!ok) startTask(S, p, s, 'wander');
  }

  // Each task: start(S,p,s,task) -> bool, update(S,p,s,task,dt) -> true when finished.
  const TASKS = {};

  function startTask(S, p, s, kind) {
    const task = { kind, stage: 0, timer: 0 };
    const def = TASKS[kind];
    if (!def.start(S, p, s, task)) return false;
    p.task = task;
    return true;
  }
  function endTask(S, p) {
    const t = p.task;
    if (t && t.claim != null) claim(S, t.claim, -1);
    p.task = null;
  }

  // Generic "go to a tile, work it, carry the goods home" task.
  function gatherTask(opts) {
    return {
      start(S, p, s, task) {
        const Wd = S.world;
        const i = W.findNear(Wd, p.x, p.z, opts.radius || 26, (i) => opts.valid(S, s, i) && claims(S, 't' + i) < (opts.maxClaims || 1));
        if (i < 0) return false;
        task.tile = i; task.claim = 't' + i; claim(S, task.claim, 1);
        const at = opts.standAt ? opts.standAt(S, s, i) : { x: (i % N) + 0.5, z: Math.floor(i / N) + 0.5 };
        goTo(p, at.x + U.rand(-0.2, 0.2), at.z + U.rand(-0.2, 0.2));
        p.thought = opts.thought;
        return true;
      },
      update(S, p, s, task, dt) {
        if (task.stage === 0) {
          if (p.moving) return false;
          if (!opts.valid(S, s, task.tile)) return true;
          task.stage = 1; task.timer = opts.time / toolMult(s);
          return false;
        }
        if (task.stage === 1) {
          task.timer -= dt * (0.7 + p.skills.gather * 0.6) * (mut(p, 'mighty') ? 1.3 : 1);
          p.working = true;
          if (task.timer > 0) return false;
          p.working = false;
          p.skills.gather = Math.min(1, p.skills.gather + 0.01);
          const got = opts.harvest(S, s, task.tile, p);
          if (task.claim != null) { claim(S, task.claim, -1); task.claim = null; }
          if (!got) return true;
          p.carry = got;
          if (has(s, 'wheel')) p.carry.amt = Math.round(p.carry.amt * 1.4);
          addResearch(S, s, 0.4 * researchBonus(s)); // learning by doing
          const d = dropPoint(S, s, p);
          goTo(p, d.x + U.rand(-0.8, 0.8), d.z + U.rand(-0.8, 0.8));
          p.thought = `Carrying ${p.carry.type} home`;
          task.stage = 2;
          return false;
        }
        if (p.moving) return false;
        deposit(S, s, p);
        return true;
      },
    };
  }
  function deposit(S, s, p) {
    if (!p.carry) return;
    s.stock[p.carry.type] = (s.stock[p.carry.type] || 0) + p.carry.amt;
    p.carry = null;
  }

  const tileXZ = (i) => ({ x: (i % N) + 0.5, z: Math.floor(i / N) + 0.5 });
  function standBeside(S, i) {
    const x = i % N, z = Math.floor(i / N);
    let best = null, bd = 1e9;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!W.inb(x + dx, z + dz)) continue;
      const j = W.idx(x + dx, z + dz);
      if (S.world.type[j] === T.WATER) continue;
      const d = Math.random();
      if (d < bd) { bd = d; best = { x: x + 0.5 + dx * 0.55, z: z + 0.5 + dz * 0.55 }; }
    }
    return best || tileXZ(i);
  }
  const ownsArea = (S, s, i) => {
    const { x, z } = tileXZ(i);
    const d = U.dist(x, z, s.cx, s.cz);
    return !S.settlements.some((o) => o.alive && o.id !== s.id && U.dist(x, z, o.cx, o.cz) < d - 6);
  };

  TASKS.forage = gatherTask({
    thought: 'Picking berries', time: 3,
    valid: (S, s, i) => S.world.res[i] === R.BUSH && S.world.amt[i] >= 1 && ownsArea(S, s, i),
    harvest: (S, s, i) => {
      const Wd = S.world, got = Math.min(3, Math.floor(Wd.amt[i]));
      Wd.amt[i] -= got; if (Wd.amt[i] < 1) S.fx.tiles.add(i);
      return { type: 'food', amt: got * (has(s, 'fire') ? 1.2 : 1) * foodMult(S) };
    },
  });
  TASKS.chop = gatherTask({
    thought: 'Chopping wood', time: 4,
    valid: (S, s, i) => S.world.res[i] === R.TREE && S.world.grow[i] >= 1 && ownsArea(S, s, i),
    standAt: (S, s, i) => standBeside(S, i),
    harvest: (S, s, i) => {
      const Wd = S.world;
      if (Math.random() < 0.55) { Wd.grow[i] = 0.02; } else { Wd.res[i] = R.NONE; }
      S.fx.tiles.add(i);
      return { type: 'wood', amt: 4 };
    },
  });
  TASKS.quarry = gatherTask({
    thought: 'Quarrying stone', time: 5, maxClaims: 2,
    valid: (S, s, i) => { const Wd = S.world; return (Wd.res[i] === R.BOULDER || (has(s, 'mining') && Wd.type[i] === T.ROCK && Wd.res[i] === R.NONE && Wd.occ[i] === -1)) && ownsArea(S, s, i); },
    standAt: (S, s, i) => standBeside(S, i),
    harvest: (S, s, i) => {
      const Wd = S.world;
      if (Wd.res[i] === R.BOULDER) { Wd.amt[i] -= 3; if (Wd.amt[i] <= 0) { Wd.res[i] = R.NONE; S.fx.tiles.add(i); } }
      return { type: 'stone', amt: 3 };
    },
  });
  TASKS.mine = gatherTask({
    thought: 'Mining ore', time: 6, radius: 40, maxClaims: 2,
    valid: (S, s, i) => S.world.res[i] === R.ORE && ownsArea(S, s, i),
    standAt: (S, s, i) => standBeside(S, i),
    harvest: (S, s, i) => {
      const Wd = S.world;
      Wd.amt[i] -= 2; if (Wd.amt[i] <= 0) { Wd.res[i] = R.NONE; S.fx.tiles.add(i); }
      return { type: 'metal', amt: has(s, 'bronze') ? 3 : 2 };
    },
  });
  TASKS.fish = gatherTask({
    thought: 'Fishing', time: 5, radius: 22,
    valid: (S, s, i) => {
      const Wd = S.world;
      if (Wd.type[i] !== T.WATER || Wd.occ[i] !== -1) return false;
      const x = i % N, z = Math.floor(i / N);
      let land = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.inb(x + dx, z + dz) && Wd.type[W.idx(x + dx, z + dz)] !== T.WATER) land = true;
      return has(s, 'sailing') ? !land && ownsArea(S, s, i) : land && ownsArea(S, s, i);
    },
    standAt: (S, s, i) => (has(s, 'sailing') ? tileXZ(i) : standBeside(S, i)),
    harvest: (S, s) => ({ type: 'food', amt: has(s, 'sailing') ? 7 : 4 }),
  });

  TASKS.hunt = {
    start(S, p, s, task) {
      let best = null, bd = 30;
      for (const a of S.animals) {
        const d = U.dist(a.x, a.z, p.x, p.z);
        if (d < bd && claims(S, 'a' + a.id) === 0) { bd = d; best = a; }
      }
      if (!best) return false;
      task.animal = best.id; task.claim = 'a' + best.id; claim(S, task.claim, 1);
      p.thought = 'Hunting deer';
      goTo(p, best.x, best.z);
      return true;
    },
    update(S, p, s, task, dt) {
      if (task.stage === 0) {
        const a = S.animals.find((a) => a.id === task.animal);
        if (!a) return true;
        task.timer += dt;
        if (task.timer > 25) return true;
        goTo(p, a.x, a.z);
        if (U.dist(a.x, a.z, p.x, p.z) < 0.7) {
          S.animals.splice(S.animals.indexOf(a), 1);
          claim(S, task.claim, -1); task.claim = null;
          p.carry = { type: 'food', amt: has(s, 'fire') ? 10 : 8 };
          p.skills.gather = Math.min(1, p.skills.gather + 0.01);
          const d = dropPoint(S, s, p);
          goTo(p, d.x + U.rand(-0.8, 0.8), d.z + U.rand(-0.8, 0.8));
          p.thought = 'Bringing home meat';
          task.stage = 2;
        }
        return false;
      }
      if (p.moving) return false;
      deposit(S, s, p);
      return true;
    },
  };

  function fieldTask(type, amount, thought) {
    return {
      start(S, p, s, task) {
        const fields = S.buildings.filter((b) => b.sid === s.id && b.type === type && b.built && claims(S, 'b' + b.id) < 2);
        if (!fields.length) return false;
        const b = fields.reduce((a, c) => (c.growth > a.growth ? c : a));
        task.b = b.id; task.claim = 'b' + b.id; claim(S, task.claim, 1);
        goTo(p, b.x + U.rand(0.3, b.w - 0.3), b.z + U.rand(0.3, b.d - 0.3));
        p.thought = thought;
        return true;
      },
      update(S, p, s, task, dt) {
        const b = getB(S, task.b);
        if (!b) return true;
        if (task.stage === 0) { if (p.moving) return false; task.stage = 1; task.timer = 4 / toolMult(s); return false; }
        if (task.stage === 1) {
          task.timer -= dt; p.working = true;
          if (task.timer > 0) return false;
          p.working = false;
          p.skills.gather = Math.min(1, p.skills.gather + 0.01);
          if (b.growth >= 1) {
            b.growth = 0; S.fx.bld.add(b.id);
            const mills = S.buildings.filter((m) => m.sid === s.id && m.type === 'windmill' && m.built).length;
            p.carry = { type: 'food', amt: Math.round(amount * (1 + Math.min(mills, 3) * 0.2) * (has(s, 'industry') ? 1.4 : 1) * foodMult(S) * (1 + (s.fut || 0) * 0.03)) };
            if (has(s, 'wheel')) p.carry.amt = Math.round(p.carry.amt * 1.3);
            addResearch(S, s, 0.4 * researchBonus(s));
            const d = dropPoint(S, s, p);
            goTo(p, d.x + U.rand(-0.8, 0.8), d.z + U.rand(-0.8, 0.8));
            p.thought = 'Bringing in the harvest';
            claim(S, task.claim, -1); task.claim = null;
            task.stage = 2;
            return false;
          }
          const before = Math.floor(b.growth * 4);
          b.growth = Math.min(1, b.growth + 0.3);
          if (Math.floor(b.growth * 4) !== before) S.fx.bld.add(b.id);
          return true;
        }
        if (p.moving) return false;
        deposit(S, s, p);
        return true;
      },
    };
  }
  TASKS.farm = fieldTask('field', 16, 'Tending the fields');
  TASKS.herd = fieldTask('pasture', 12, 'Herding sheep');

  TASKS.build = {
    start(S, p, s, task) {
      const sites = S.buildings.filter((b) => b.sid === s.id && (!b.built || b.upgrading) && claims(S, 'b' + b.id) < 4);
      if (!sites.length) return false;
      const b = sites.reduce((a, c) => (U.dist(bCenter(c).x, bCenter(c).z, p.x, p.z) < U.dist(bCenter(a).x, bCenter(a).z, p.x, p.z) ? c : a));
      task.b = b.id; task.claim = 'b' + b.id; claim(S, task.claim, 1);
      // Stand on the edge of the footprint.
      const side = U.randi(0, 3);
      const ex = side === 0 ? b.x - 0.3 : side === 1 ? b.x + b.w + 0.3 : b.x + U.rand(0, b.w);
      const ez = side === 2 ? b.z - 0.3 : side === 3 ? b.z + b.d + 0.3 : b.z + U.rand(0, b.d);
      goTo(p, side < 2 ? ex : ex, side < 2 ? b.z + U.rand(0, b.d) : ez);
      const name = b.type === 'research' ? TD.researchName(b.style) : BUILDINGS[b.type].name;
      p.thought = `${b.upgrading ? 'Rebuilding' : 'Building'} the ${name.toLowerCase()}`;
      return true;
    },
    update(S, p, s, task, dt) {
      const b = getB(S, task.b);
      if (!b || (b.built && !b.upgrading)) return true;
      if (task.stage === 0) { if (p.moving) return false; task.stage = 1; task.timer = 12; return false; }
      p.working = true;
      const before = Math.floor(b.progress * 12);
      b.progress += (dt * (0.6 + p.skills.build) * toolMult(s)) / b.work;
      p.skills.build = Math.min(1, p.skills.build + dt * 0.002);
      if (Math.floor(b.progress * 12) !== before) S.fx.bld.add(b.id);
      if (b.progress >= 1) { finishBuilding(S, b); p.working = false; return true; }
      task.timer -= dt;
      if (task.timer <= 0 || isNight(S)) { p.working = false; return true; }
      return false;
    },
  };

  TASKS.research = {
    start(S, p, s, task) {
      const r = researchSpot(S, s);
      task.mult = r.b ? TD.researchMult(r.b.style) : 1;
      goTo(p, r.x + U.rand(-1, 1), r.z + U.rand(-1, 1));
      p.thought = s.research ? `Pondering ${TD.tech(s.research.id).name}` : 'Thinking about the world';
      return true;
    },
    update(S, p, s, task, dt) {
      if (task.stage === 0) { if (p.moving) return false; task.stage = 1; task.timer = 12; return false; }
      p.working = true;
      const rate = 0.32 * p.traits.int * (0.5 + p.skills.research) * task.mult * researchBonus(s) * (p.age > 50 ? 1.3 : 1) * (mut(p, 'genius') ? 1.6 : 1);
      addResearch(S, s, rate * dt);
      p.skills.research = Math.min(1, p.skills.research + dt * 0.002);
      task.timer -= dt;
      if (task.timer <= 0) {
        p.working = false;
        // Eureka moments favour the curious and clever.
        if (s.research && Math.random() < 0.012 * p.traits.cur * p.traits.int) {
          const t = TD.tech(s.research.id);
          addResearch(S, s, Math.min(t.cost * 0.25, 250 + 40 * s.era));
          if (Math.random() < 0.08) log(S, `Eureka! ${p.name} of ${s.name} had a breakthrough.`, { sid: s.id, x: p.x, z: p.z });
        }
        return true;
      }
      return false;
    },
  };

  TASKS.trade = {
    start(S, p, s, task) {
      const others = S.settlements.filter((o) => o.alive && o.id !== s.id && U.dist(o.cx, o.cz, s.cx, s.cz) < 75 && !atWar(S, s, o));
      if (!others.length) return false;
      const o = U.pick(others);
      task.dest = o.id;
      goTo(p, o.cx + U.rand(-1, 1), o.cz + U.rand(-1, 1));
      p.carry = { type: 'goods', amt: 0 };
      p.thought = `Travelling to trade with ${o.name}`;
      return true;
    },
    update(S, p, s, task) {
      if (p.moving) return false;
      if (task.stage === 0) {
        const o = getS(S, task.dest);
        if (o && o.alive) {
          // Ideas flow both ways along trade routes.
          shareKnowledge(S, s, o, 0.2, p);
          shareKnowledge(S, o, s, 0.2, null);
          s.stock.food += 3;
          s.rel[o.id] = Math.min(100, (s.rel[o.id] || 0) + 4); o.rel[s.id] = Math.min(100, (o.rel[s.id] || 0) + 4);
        }
        goTo(p, s.cx + U.rand(-1, 1), s.cz + U.rand(-1, 1));
        p.thought = 'Heading home from the market';
        task.stage = 1;
        return false;
      }
      p.carry = null;
      return true;
    },
  };

  function shareKnowledge(S, from, to, frac, trader) {
    if (!to.research) pickResearch(S, to);
    if (!to.research) return;
    if (from.known[to.research.id]) {
      const t = TD.tech(to.research.id);
      to.research.rp += t.cost * frac;
      if (trader && Math.random() < 0.12) log(S, `Traders from ${from.name} taught ${to.name} about ${t.name}.`, { sid: to.id, x: to.cx, z: to.cz });
      if (to.research.rp >= t.cost) addResearch(S, to, 0);
    }
  }

  TASKS.manufacture = {
    start(S, p, s, task) {
      const f = S.buildings.filter((b) => b.sid === s.id && (b.type === 'factory' || b.type === 'smithy') && b.built);
      if (!f.length) return false;
      const b = U.pick(f);
      task.b = b.id; task.factory = b.type === 'factory';
      const c = bCenter(b);
      goTo(p, c.x + U.rand(-0.5, 0.5), c.z + U.rand(-0.5, 0.5));
      p.thought = task.factory ? 'Working a shift at the factory' : 'Smelting metal at the smithy';
      return true;
    },
    update(S, p, s, task, dt) {
      if (task.stage === 0) { if (p.moving) return false; task.stage = 1; task.timer = 8; p.mode = 'hidden'; return false; }
      task.timer -= dt;
      if (task.timer > 0) return false;
      p.mode = 'walk';
      s.stock.metal += task.factory ? 4 : 1.5;
      if (task.factory) s.stock.stone += 2;
      addResearch(S, s, 0.4 * researchBonus(s));
      return true;
    },
  };

  const atWar = (S, a, b) => S.wars.some((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id));
  const enemiesOf = (S, s) => S.wars.filter((w) => w.a === s.id || w.b === s.id).map((w) => getS(S, w.a === s.id ? w.b : w.a)).filter((o) => o && o.alive);
  const military = (s) => 1 + Math.min(s.era, 10) * 0.25 + (has(s, 'bronze') ? 0.3 : 0) + (has(s, 'iron') ? 0.4 : 0);

  TASKS.fight = {
    start(S, p, s, task) {
      const foes = enemiesOf(S, s);
      if (!foes.length) return false;
      const o = U.pick(foes);
      task.foe = o.id;
      goTo(p, o.cx + U.rand(-5, 5), o.cz + U.rand(-5, 5));
      p.armed = true;
      p.thought = `Marching to war against ${o.name}`;
      return true;
    },
    update(S, p, s, task, dt) {
      const o = getS(S, task.foe);
      if (!o || !o.alive || !atWar(S, s, o)) { p.armed = false; if (p.carry) goTo(p, s.cx, s.cz); return !p.moving; }
      if (task.stage === 0) { if (p.moving) return false; task.stage = 1; task.timer = 5; p.thought = `Fighting ${o.name}`; return false; }
      if (task.stage === 1) {
        p.working = true;
        task.timer -= dt;
        if (task.timer > 0) return false;
        p.working = false;
        const w = S.wars.find((w) => (w.a === s.id && w.b === o.id) || (w.a === o.id && w.b === s.id));
        // Skirmish with the nearest defender.
        let foe = null, fd = 6;
        for (const q of S.people) if (q.sid === o.id && q.age >= 14) { const d = U.dist(q.x, q.z, p.x, p.z); if (d < fd) { fd = d; foe = q; } }
        if (foe) {
          const mine = p.traits.str * military(s) * U.rand(0.5, 1.5) * (mut(p, 'giant') ? 1.3 : 1);
          const theirs = foe.traits.str * military(o) * U.rand(0.5, 1.5) * 1.15 * (mut(foe, 'giant') ? 1.3 : 1); // defenders' advantage
          const loser = mine > theirs ? foe : p;
          loser.health -= U.rand(0.4, 1.1);
          if (loser.health <= 0) { die(S, loser, 'war'); if (w) w.dead[loser.sid === w.a ? 0 : 1]++; }
          if (p.dead) return true;
        }
        // Raid their stores, and sometimes torch a building.
        if (Math.random() < 0.35 && o.stock.food > 5) {
          const amt = Math.min(20, Math.floor(o.stock.food * 0.1));
          o.stock.food -= amt;
          p.carry = { type: 'food', amt };
        }
        if (Math.random() < 0.06) {
          const targets = S.buildings.filter((b) => b.sid === o.id && b.built && b.type !== 'center' && !b.fire);
          if (targets.length) { const b = U.pick(targets); b.fire = 10; S.fx.bld.add(b.id); }
        }
        task.stage = 2;
        goTo(p, s.cx + U.rand(-2, 2), s.cz + U.rand(-2, 2));
        p.thought = 'Returning from battle';
        return false;
      }
      if (p.moving) return false;
      deposit(S, s, p);
      p.armed = false;
      return true;
    },
  };

  TASKS.eat = {
    start(S, p, s) { const d = dropPoint(S, s, p); goTo(p, d.x + U.rand(-1.2, 1.2), d.z + U.rand(-1.2, 1.2)); p.thought = 'Hungry, heading to eat'; return true; },
    update(S, p, s) {
      if (p.moving) return false;
      if (s.stock.food >= 1) { s.stock.food -= 1; p.hunger = Math.max(0, p.hunger - (has(s, 'fire') ? 1.1 : 0.9)); p.thought = 'Enjoying a meal'; }
      else p.thought = 'There is no food left!';
      return true;
    },
  };

  TASKS.sleep = {
    start(S, p, s, task) {
      const h = getB(S, p.home);
      if (h) { const c = bCenter(h); goTo(p, c.x, c.z); task.inside = true; }
      else { goTo(p, s.cx + U.rand(-2.5, 2.5), s.cz + U.rand(-2.5, 2.5)); task.inside = false; }
      p.thought = 'Heading home to sleep';
      return true;
    },
    update(S, p, s, task) {
      if (p.moving) return false;
      p.asleep = true; p.mode = task.inside ? 'hidden' : 'sleep';
      p.thought = 'Sleeping';
      if (!isNight(S)) { p.asleep = false; p.mode = 'walk'; return true; }
      return false;
    },
  };

  const wanderTask = (radius, thought, fromHome) => ({
    start(S, p, s, task) {
      const h = fromHome ? getB(S, p.home) : null;
      const c = h ? bCenter(h) : { x: s.cx, z: s.cz };
      const x = U.clamp(c.x + U.rand(-radius, radius), 1, N - 1), z = U.clamp(c.z + U.rand(-radius, radius), 1, N - 1);
      if (S.world.type[W.idx(Math.floor(x), Math.floor(z))] === T.WATER) return false;
      goTo(p, x, z); task.timer = U.rand(1, 4);
      p.thought = thought;
      return true;
    },
    update(S, p, s, task, dt) { if (p.moving) return false; task.timer -= dt; return task.timer <= 0; },
  });
  TASKS.wander = wanderTask(6, 'Taking a stroll', false);
  TASKS.play = wanderTask(5, 'Playing with friends', false);
  TASKS.toddle = wanderTask(2, 'Toddling about', true);

  TASKS.learn = {
    start(S, p, s, task) { const r = researchSpot(S, s); goTo(p, r.x + U.rand(-1.5, 1.5), r.z + U.rand(-1.5, 1.5)); p.thought = 'Listening to the elders'; task.timer = 8; return true; },
    update(S, p, s, task, dt) {
      if (p.moving) return false;
      p.skills.research = Math.min(1, p.skills.research + dt * 0.003);
      p.skills.build = Math.min(1, p.skills.build + dt * 0.001);
      p.skills.gather = Math.min(1, p.skills.gather + dt * 0.001);
      addResearch(S, s, dt * 0.04 * p.traits.int);
      task.timer -= dt;
      return task.timer <= 0;
    },
  };

  TASKS.migrate = {
    start() { return true; },
    update(S, p, s) { if (p.moving) return false; p.thought = 'Settling into a new home'; return true; },
  };

  // ---------- people: lifecycle ----------
  function die(S, p, cause) {
    p.dead = true;
    endTask(S, p);
    const h = getB(S, p.home);
    if (h) h.residents = h.residents.filter((id) => id !== p.id);
    const partner = getP(S, p.partner);
    if (partner) partner.partner = -1;
    S.stats.deaths++;
    if (p.age > 85 && Math.random() < 0.5) log(S, `${p.name} of ${getS(S, p.sid)?.name} died peacefully at the age of ${Math.floor(p.age)}.`, { sid: p.sid, x: p.x, z: p.z });
    p.cause = cause;
  }

  function updatePerson(S, p, dt) {
    const s = getS(S, p.sid);
    p.age += dt / YEAR;
    const cold = Math.max(0, -S.climate.temp) * (mut(p, 'hardy') ? 0.15 : 0.45);
    p.hunger += dt / DAY * (p.asleep ? 0.5 : 1) * (1 + cold) * (mut(p, 'giant') ? 1.15 : 1);
    if (p.hunger > 1.4) { p.health -= dt * 0.025; p.thought = 'Starving...'; }
    else p.health = Math.min(1, p.health + dt * 0.004);
    if (p.sick > 0) {
      p.sick -= dt;
      const med = has(s, 'modern_medicine') ? 0.85 : has(s, 'medicine') ? 0.5 : 0;
      p.health -= dt * 0.022 * (1 - med) / p.traits.con * (mut(p, 'resistant') ? 0.3 : 1) * (mut(p, 'frail') ? 1.5 : 1);
    }
    // Infant mortality weeds out the weak, less so with medicine.
    if (p.age < 5) {
      const med = has(s, 'modern_medicine') ? 0.9 : has(s, 'medicine') ? 0.6 : 0;
      if (Math.random() < (dt / YEAR) * 0.05 * Math.max(0, 2.1 - p.traits.con) * (mut(p, 'frail') ? 2 : 1) * (1 - med)) return die(S, p, 'infancy');
    }
    if (p.health <= 0) return die(S, p, p.sick > 0 ? 'illness' : 'starvation');
    if (p.age > p.life + lifeBonus(S, s)) return die(S, p, 'old age');

    if (p.moving) move(S, p, s, dt);
    if (!p.task) think(S, p, s);
    else if (TASKS[p.task.kind].update(S, p, s, p.task, dt)) {
      endTask(S, p);
      p.working = false;
      if (p.mode === 'car') p.mode = 'walk';
    }
    // Wake at night-time into sleep if caught mid-task (not builders mid-beam; they stop on their own).
    if (p.task && isNight(S) && ['wander', 'play', 'toddle', 'learn', 'research'].includes(p.task.kind)) { endTask(S, p); p.working = false; }
    if (!p.task) p.armed = false;
    if (p.hunger > 1.0 && p.task && p.task.kind !== 'eat' && !p.carry && s.stock.food >= 1 && Math.random() < dt) { endTask(S, p); startTask(S, p, s, 'eat'); }
  }

  // ---------- settlements ----------
  function updateSettlement(S, s, dt) {
    const members = S.people.filter((p) => p.sid === s.id);
    s.pop = members.length;
    s.peakPop = Math.max(s.peakPop, s.pop);
    if (!s.pop) {
      if (s.alive) {
        s.alive = false; s.diedT = S.t;
        S.wars = S.wars.filter((w) => w.a !== s.id && w.b !== s.id);
        log(S, `${s.name} has been abandoned. Its ruins will slowly crumble.`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'disaster' });
      }
      // Ruins crumble over the years, freeing the land for new settlers.
      for (const b of S.buildings.filter((b) => b.sid === s.id)) {
        if (Math.random() < dt / (YEAR * 12)) { S.fx.events.push({ kind: 'dust', x: b.x + b.w / 2, z: b.z + b.d / 2 }); removeBuilding(S, b); }
      }
      return;
    }
    s.jobs = {};
    members.forEach((p) => { if (p.job && p.task && p.age >= 13) s.jobs[p.job] = (s.jobs[p.job] || 0) + 1; });
    if (!s.research) pickResearch(S, s);

    // Storage limits.
    const granaries = S.buildings.filter((b) => b.sid === s.id && b.type === 'granary' && b.built).length;
    const foodCap = 80 + granaries * 150 + s.era * 30 + s.pop * 3;
    if (s.stock.food > foodCap) s.stock.food = foodCap;
    for (const k of ['wood', 'stone', 'metal']) s.stock[k] = Math.min(s.stock[k], 250 + s.era * 80);

    plan(S, s);
    assignHomes(S, s, members);

    // Births.
    const houses = S.buildings.filter((b) => b.sid === s.id && b.type === 'house' && b.built);
    const cap = houses.reduce((a, b) => a + capacity(b), 0);
    const housing = has(s, 'shelter') ? (cap > s.pop ? 1 : 0.04) : s.pop < 14 ? 0.5 : 0.08;
    const food = s.stock.food > s.pop * 2 ? 1 : s.stock.food > s.pop * 0.7 ? 0.35 : 0.03;
    const MP = maxPop(S);
    const global = (S.people.length >= MP ? 0 : 1 - S.people.length / (MP * 1.3)) * (s.pop > 140 ? 0.3 : 1);
    for (const m of members) {
      if (m.sex !== 'F' || m.age < 17 || m.age > 42 || m.partner < 0) continue;
      const dad = getP(S, m.partner);
      if (!dad || dad.dead) continue;
      const fit = Math.pow(Math.max(0.2, (fitness(m) + fitness(dad)) / 2), 2) * (mut(m, 'fertile') || mut(dad, 'fertile') ? 1.6 : 1);
      if (Math.random() < (dt * 0.55 * housing * food * global * fit * (m.health > 0.6 ? 1 : 0.3)) / YEAR) {
        const c = makePerson(S, s, m.x, m.z, 0, [m, dad]);
        c.home = m.home;
        const h = getB(S, m.home);
        if (h) h.residents.push(c.id);
        m.kids++; dad.kids++;
        S.stats.births++;
      }
    }

    // Colonies.
    const alive = S.settlements.filter((o) => o.alive).length;
    if (s.pop >= 28 + Math.min(s.era, 8) * 3 && alive < MAX_SETTLEMENTS && S.t - s.lastColony > YEAR * 5 && S.t - s.foundedT > YEAR * 5) {
      s.lastColony = S.t;
      found(S, s, members);
    }
  }

  function assignHomes(S, s, members) {
    const houses = S.buildings.filter((b) => b.sid === s.id && b.type === 'house' && b.built);
    if (!houses.length) return;
    for (const p of members) {
      if (p.home >= 0 && getB(S, p.home)) continue;
      p.home = -1;
      const prefer = [getP(S, p.partner), ...p.parents.map((id) => getP(S, id))].filter(Boolean).map((q) => getB(S, q.home)).filter(Boolean);
      const h = prefer.find((h) => h.sid === s.id && h.residents.length < capacity(h)) || houses.find((h) => h.residents.length < capacity(h));
      if (h) { h.residents.push(p.id); p.home = h.id; }
    }
  }

  function found(S, parent, members) {
    const site = findSettlementSite(S, [], parent);
    if (!site) return;
    const couples = members.filter((p) => p.sex === 'F' && p.age >= 17 && p.age < 38 && p.partner >= 0 && getP(S, p.partner) && !p.carry)
      .sort(() => Math.random() - 0.5).slice(0, 4);
    if (couples.length < 2) return;
    const group = [];
    couples.forEach((f) => {
      group.push(f, getP(S, f.partner));
      members.forEach((c) => { if (c.age < 13 && c.parents.includes(f.id)) group.push(c); });
    });
    const s = makeSettlement(S, site, parent);
    s.stock.food = Math.floor(parent.stock.food * 0.3); parent.stock.food -= s.stock.food;
    s.stock.wood = Math.floor(parent.stock.wood * 0.25); parent.stock.wood -= s.stock.wood;
    s.stock.stone = Math.floor(parent.stock.stone * 0.2); parent.stock.stone -= s.stock.stone;
    if (parent.research) s.research = { id: parent.research.id, rp: parent.research.rp * 0.5 };
    for (const p of group) {
      endTask(S, p);
      const h = getB(S, p.home);
      if (h) h.residents = h.residents.filter((id) => id !== p.id);
      p.home = -1; p.sid = s.id; p.carry = null; p.asleep = false;
      p.task = { kind: 'migrate', stage: 0, timer: 0 };
      goTo(p, site.x + U.rand(-2, 2), site.z + U.rand(-2, 2));
      p.thought = `Journeying to found ${s.name}`;
    }
    log(S, `${group.length} settlers left ${parent.name} to found ${s.name}.`, { sid: s.id, x: site.x, z: site.z, big: true, kind: 'colony' });
  }

  // ---------- world ----------
  function updateWorld(S, dt) {
    const Wd = S.world;
    const decay = Math.pow(0.992, dt);
    const era = S.globalEra;
    let ore = 0;
    for (let i = 0; i < N * N; i++) {
      const r = Wd.res[i];
      if (r === R.TREE && Wd.grow[i] < 1) {
        const g0 = Wd.grow[i];
        Wd.grow[i] = Math.min(1, g0 + dt * 0.012);
        if (Math.floor(g0 * 3) !== Math.floor(Wd.grow[i] * 3)) S.fx.tiles.add(i);
      } else if (r === R.BUSH && Wd.amt[i] < 5) {
        const a0 = Wd.amt[i];
        Wd.amt[i] = Math.min(5, a0 + dt * 0.035 * (S.drought > 0 ? 0.1 : 1) * foodMult(S));
        if (a0 < 1 && Wd.amt[i] >= 1) S.fx.tiles.add(i);
      } else if (r === R.ORE) ore++;
      const tr = (Wd.traffic[i] *= decay);
      if (tr > 0.3 || Wd.road[i]) {
        let lvl = 0;
        if (Wd.occ[i] === -1 && Wd.type[i] !== T.WATER) {
          if (tr > 5) lvl = 1;
          if (tr > 12 && era >= 2) lvl = 2;
          if (tr > 12 && era >= 6) lvl = 3;
          if (Wd.road[i] && tr > 2.5) lvl = Math.max(lvl, Math.min(Wd.road[i], tr > 8 ? 3 : 1));
        }
        if (lvl !== Wd.road[i]) { Wd.road[i] = lvl; S.fx.tiles.add(i); }
      }
    }
    if (S.drought > 0) S.drought -= dt;
    // Forests spread slowly.
    for (let k = 0; k < 30; k++) {
      const i = Math.floor(Math.random() * N * N);
      if (Wd.type[i] !== T.GRASS || Wd.res[i] !== R.NONE || Wd.occ[i] !== -1 || Wd.traffic[i] > 0.5 || Wd.road[i]) continue;
      const x = i % N, z = Math.floor(i / N);
      let trees = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.inb(x + dx, z + dz) && Wd.res[W.idx(x + dx, z + dz)] === R.TREE) trees++;
      if (trees && Math.random() < 0.5) { Wd.res[i] = R.TREE; Wd.grow[i] = 0.02; S.fx.tiles.add(i); }
      else if (!trees && Math.random() < 0.02) { Wd.res[i] = Math.random() < 0.5 ? R.BUSH : R.TREE; Wd.grow[i] = 0.02; Wd.amt[i] = 1; S.fx.tiles.add(i); }
    }
    if (ore < 50) {
      const i = randomTile(S, (i) => Wd.type[i] === T.ROCK && Wd.res[i] === R.NONE && Wd.occ[i] === -1, 200);
      if (i >= 0) { Wd.res[i] = R.ORE; Wd.amt[i] = 40; S.fx.tiles.add(i); }
    }
    // Wildfires.
    const next = [];
    for (const i of S.burning) {
      Wd.fire[i] -= dt;
      if (Wd.fire[i] > 0) { next.push(i); continue; }
      Wd.fire[i] = 0; Wd.res[i] = R.NONE; S.fx.tiles.add(i);
      const x = i % N, z = Math.floor(i / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        if (!W.inb(x + dx, z + dz)) continue;
        const j = W.idx(x + dx, z + dz);
        if (Wd.res[j] === R.TREE && Wd.fire[j] <= 0 && Math.random() < 0.42) { Wd.fire[j] = U.rand(3, 6); next.push(j); S.fx.tiles.add(j); }
      }
    }
    S.burning = next;
  }

  function updateAnimals(S, dt) {
    const Wd = S.world;
    for (const a of S.animals) {
      if (a.wait > 0) { a.wait -= dt; continue; }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d < 0.1) {
        const x = a.x + U.rand(-5, 5), z = a.z + U.rand(-5, 5);
        if (W.inb(Math.floor(x), Math.floor(z))) {
          const i = W.idx(Math.floor(x), Math.floor(z));
          if (Wd.type[i] === T.GRASS && Wd.occ[i] === -1) { a.tx = x; a.tz = z; }
        }
        a.wait = U.rand(1, 6);
        continue;
      }
      const st = Math.min(d, 1.3 * dt);
      a.x += (dx / d) * st; a.z += (dz / d) * st; a.facing = Math.atan2(dx, dz);
    }
    if (S.animals.length < 80 && S.animals.length > 1 && Math.random() < dt * 0.15) {
      const m = U.pick(S.animals);
      spawnDeer(S, m.x + U.rand(-1, 1), m.z + U.rand(-1, 1));
    } else if (S.animals.length <= 1 && Math.random() < dt * 0.02) {
      const i = randomTile(S, (i) => Wd.type[i] === T.GRASS && Wd.occ[i] === -1);
      if (i >= 0) spawnDeer(S, i % N + 0.5, Math.floor(i / N) + 0.5);
    }
  }

  function randomEvent(S) {
    const alive = S.settlements.filter((s) => s.alive);
    if (!alive.length) return;
    const s = U.pick(alive);
    const r = Math.random();
    if (r < 0.3) {
      // Wildfire in a forest away from towns.
      const Wd = S.world;
      const i = randomTile(S, (i) => Wd.res[i] === R.TREE && Wd.grow[i] >= 1 && S.settlements.every((o) => U.dist(i % N, Math.floor(i / N), o.cx, o.cz) > 12), 500);
      if (i < 0) return;
      Wd.fire[i] = 6; S.burning.push(i); S.fx.tiles.add(i);
      const near = alive.reduce((a, o) => (U.dist(i % N, Math.floor(i / N), o.cx, o.cz) < U.dist(i % N, Math.floor(i / N), a.cx, a.cz) ? o : a));
      log(S, `Lightning sparks a wildfire in the forests near ${near.name}!`, { x: i % N, z: Math.floor(i / N), big: true, kind: 'disaster' });
    } else if (r < 0.5 && s.pop >= 15) {
      const members = S.people.filter((p) => p.sid === s.id);
      let n = 0;
      members.forEach((p) => { if (Math.random() < 0.35) { p.sick = U.rand(20, 45); n++; } });
      log(S, `A plague sweeps through ${s.name}; ${n} fall ill.${has(s, 'medicine') ? ' Healers get to work.' : ''}`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'disaster' });
    } else if (r < 0.65) {
      S.drought = YEAR * 1.5;
      log(S, 'A drought grips the land. The berry bushes wither.', { kind: 'disaster' });
    } else if (r < 0.72 && S.buildings.some((b) => b.sid === s.id && b.type !== 'center')) {
      // Earthquake: a few buildings come down.
      const bs = S.buildings.filter((b) => b.sid === s.id && b.type !== 'center' && b.type !== 'field' && b.type !== 'pasture');
      const n = Math.min(bs.length, U.randi(1, 3));
      for (let k = 0; k < n; k++) {
        const b = bs.splice(Math.floor(Math.random() * bs.length), 1)[0];
        S.fx.events.push({ kind: 'dust', x: b.x + b.w / 2, z: b.z + b.d / 2 });
        removeBuilding(S, b);
      }
      S.stats.quakes++;
      if (n) log(S, `An earthquake shakes ${s.name}! ${n} building${n > 1 ? 's' : ''} collapse${n > 1 ? '' : 's'}.`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'disaster' });
    } else if (r < 0.85) {
      s.stock.food += 40;
      log(S, `A bountiful season! ${s.name} celebrates a great harvest.`, { sid: s.id, x: s.cx, z: s.cz });
    } else {
      // A wandering stranger joins, bringing fresh blood.
      const p = makePerson(S, s, s.cx + U.rand(-3, 3), s.cz + U.rand(-3, 3), U.rand(18, 28), null);
      p.traits.int = U.clamp(p.traits.int + 0.2, 0.5, 2.2);
      log(S, `A wanderer named ${p.name} arrives in ${s.name} and decides to stay.`, { sid: s.id, x: p.x, z: p.z });
    }
  }

  function pairUp(S) {
    for (const s of S.settlements) {
      if (!s.alive) continue;
      const single = S.people.filter((p) => p.sid === s.id && p.age >= 16 && p.age < 50 && (p.partner < 0 || !getP(S, p.partner)));
      const men = single.filter((p) => p.sex === 'M'), women = single.filter((p) => p.sex === 'F');
      // Everyone looks for the fittest partner they can find (with a bit of luck involved).
      women.sort((a, b) => fitness(b) - fitness(a));
      for (const f of women) {
        const cands = men.filter((m) => !m.taken && Math.abs(m.age - f.age) < 14 && !m.parents.some((x) => f.parents.includes(x)));
        if (!cands.length) continue;
        const m = cands.reduce((a, c) => (fitness(c) * U.rand(0.8, 1.2) > fitness(a) * U.rand(0.8, 1.2) ? c : a));
        if (fitness(f) < 0.75 && Math.random() < 0.5) continue; // the least fit often stay single
        m.taken = true; m.partner = f.id; f.partner = m.id;
      }
      men.forEach((m) => delete m.taken);
    }
  }

  function spaceProgram(S, dt) {
    for (const b of S.buildings) {
      if (b.type !== 'launchpad' || !b.built) continue;
      const s = getS(S, b.sid);
      if (!s || !s.alive) continue;
      b.launchT = (b.launchT || 0) + dt;
      const period = has(s, 'starships') ? YEAR * 6 : YEAR * 2;
      if (b.launchT < period) continue;
      b.launchT = 0;
      if (has(s, 'starships')) {
        const crew = s.pop > 30 ? S.people.filter((p) => p.sid === s.id && p.age > 20 && p.age < 40).slice(0, 6) : [];
        crew.forEach((p) => { die(S, p, 'departed for the stars'); S.stats.deaths--; });
        S.stats.starships++;
        if (crew.length) {
          if (!S.colonies.length || Math.random() < 0.25) {
            const c = { name: U.placeName() + ' ' + U.pick(['Prime', 'b', 'c', 'd', 'IV', 'Major', 'Minor']), pop: crew.length, founded: yearOf(S), from: s.name, mut: [...new Set(crew.flatMap((p) => p.mut || []))] };
            S.colonies.push(c);
            log(S, `Colonists from ${s.name} found a new world among the stars: ${c.name}.`, { sid: s.id, x: b.x + 2, z: b.z + 2, big: true, kind: 'space' });
          } else U.pick(S.colonies).pop += crew.length;
        }
        S.fx.events.push({ kind: 'rocket', big: true, x: b.x + 2, z: b.z + 2, bid: b.id, starship: true });
        if (S.stats.starships === 1 || S.stats.starships % 8 === 0) log(S, `A starship lifts off from ${s.name} carrying ${crew.length} colonists to another world.${S.stats.starships > 1 ? ` (${S.stats.starships} have now left.)` : ''}`, { sid: s.id, x: b.x + 2, z: b.z + 2, big: S.stats.starships === 1, kind: 'space' });
      } else {
        S.stats.launches++;
        S.fx.events.push({ kind: 'rocket', x: b.x + 2, z: b.z + 2, bid: b.id });
        if (S.stats.launches === 1) log(S, `${s.name} launches the world's first rocket into orbit!`, { sid: s.id, x: b.x + 2, z: b.z + 2, big: true, kind: 'space' });
      }
    }
  }

  // ---------- main step ----------
  function step(S, dt) {
    S.t += dt;
    for (const p of S.people) if (!p.dead) updatePerson(S, p, dt);
    if (S.people.some((p) => p.dead)) {
      S.people = S.people.filter((p) => { if (p.dead) S.cache.p.delete(p.id); return !p.dead; });
    }
    updateAnimals(S, dt);
    const tm = S.timers;
    tm.world += dt; tm.settle += dt; tm.year += dt; tm.pair += dt; tm.diffuse += dt; tm.event -= dt;
    if (tm.world >= 1) { updateWorld(S, tm.world); tm.world = 0; }
    if (tm.settle >= 1) { for (const s of S.settlements) updateSettlement(S, s, tm.settle); spaceProgram(S, tm.settle); tm.settle = 0; }
    if (tm.pair >= 5) { pairUp(S); tm.pair = 0; }
    if (tm.diffuse >= 5) {
      // Neighbouring towns slowly pick up each other's ideas.
      const alive = S.settlements.filter((s) => s.alive);
      for (const a of alive) for (const b of alive) {
        if (a === b || U.dist(a.cx, a.cz, b.cx, b.cz) > 55) continue;
        shareKnowledge(S, a, b, 0.006 * (has(b, 'printing') ? 2 : 1), null);
      }
      tm.diffuse = 0;
    }
    if (tm.event <= 0) { randomEvent(S); tm.event = YEAR * U.rand(3, 7); }
    if (tm.diffuse === 0) { diplomacy(S); burnBuildings(S, 5); }
    climate(S, dt);
    if (!S.people.length) {
      // Life ended here. Someone always comes back: star-colonists if there are any, otherwise wanderers from across the sea.
      S.extinctT += dt;
      if (S.extinctT > 12) {
        S.extinctT = 0;
        const c = S.colonies.length ? U.pick(S.colonies) : null;
        if (c) spawnTribe(S, { ...S.bestKnown }, (t) => `A ship returns from ${c.name}! Its colonists land and found ${t.name}, bringing lost knowledge home.`);
        else spawnTribe(S, null, (t) => `After a long silence, wanderers from across the sea arrive and found ${t.name} among the ruins.`);
        S.fx.events.push({ kind: 'landing', x: S.settlements[S.settlements.length - 1].cx, z: S.settlements[S.settlements.length - 1].cz });
      }
    }
    if (tm.year >= YEAR) {
      tm.year = 0;
      yearly(S);
      const n = S.people.length || 1;
      const avg = (k) => S.people.reduce((a, p) => a + p.traits[k], 0) / n;
      S.history.push({
        y: yearOf(S), pop: S.people.length, techs: Math.max(0, ...S.settlements.map((s) => Object.keys(s.known).length)),
        int: +avg('int').toFixed(3), str: +avg('str').toFixed(3), con: +avg('con').toFixed(3), era: S.globalEra,
        temp: +S.climate.temp.toFixed(2), wars: S.wars.length,
        mut: Object.fromEntries(Object.keys(MUTATIONS).map((k) => [k, +(S.people.filter((p) => mut(p, k)).length / n).toFixed(3)])),
      });
      if (S.history.length > 600) S.history.shift();
    }
  }

  // ---------- setbacks & the long run ----------
  function climate(S, dt) {
    const c = S.climate;
    c.next -= dt;
    if (c.next <= 0) {
      const r = Math.random();
      const prev = c.target;
      c.target = r < 0.3 ? U.rand(-1, -0.6) : r < 0.5 ? U.rand(0.4, 0.8) : U.rand(-0.15, 0.15);
      c.next = YEAR * U.rand(30, 80);
      if (c.target < -0.5 && prev > -0.5) log(S, 'The world grows colder. An ice age is beginning; glaciers creep down the mountains.', { big: true, kind: 'disaster' });
      else if (c.target > 0.35 && prev < 0.35) log(S, 'A warm age begins. Harvests grow rich and the snows retreat.', { big: true });
      else if (prev < -0.5 && c.target > -0.5) log(S, 'The ice age is ending. The glaciers are melting.', { big: true });
    }
    const d = c.target - c.temp;
    c.temp += Math.sign(d) * Math.min(Math.abs(d), dt / (YEAR * 12));
  }

  function diplomacy(S) {
    const alive = S.settlements.filter((s) => s.alive);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const d = U.dist(a.cx, a.cz, b.cx, b.cz);
      if (d > 70) continue;
      let r = ((a.rel[b.id] || 0) + (b.rel[a.id] || 0)) / 2;
      r *= 0.985;
      // Crowded neighbours compete for land and food; hunger breeds conflict.
      if (d < 50 && a.pop > 16 && b.pop > 16) r -= 1.3 * (a.pop + b.pop) / 70;
      if (a.stock.food < a.pop || b.stock.food < b.pop) r -= 1.5;
      if (S.climate.temp < -0.5) r -= 0.6;
      if (a.parent === b.id || b.parent === a.id) r += 0.4;
      if (Math.min(a.era, b.era) >= 7) r += 0.3; // diplomacy of advanced ages
      r = U.clamp(r, -100, 100);
      a.rel[b.id] = r; b.rel[a.id] = r;
      const war = S.wars.find((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id));
      if (!war && r < -55 && Math.random() < 0.15 && Math.min(a.era, b.era) >= 1 && !S.wars.some((w) => w.a === a.id || w.b === a.id || w.a === b.id || w.b === b.id)) {
        S.wars.push({ a: a.id, b: b.id, t0: S.t, dur: YEAR * U.rand(3, 8), dead: [0, 0], pop0: [a.pop, b.pop] });
        S.stats.wars++;
        const why = S.climate.temp < -0.5 ? 'as the ice age bites' : a.stock.food < a.pop || b.stock.food < b.pop ? 'over dwindling food' : 'over land and pride';
        log(S, `War! ${a.name} and ${b.name} take up arms against each other ${why}.`, { x: (a.cx + b.cx) / 2, z: (a.cz + b.cz) / 2, big: true, kind: 'war' });
      }
    }
    // Ending wars.
    for (const w of S.wars.slice()) {
      const a = getS(S, w.a), b = getS(S, w.b);
      const lossA = a ? 1 - a.pop / Math.max(1, w.pop0[0]) : 1, lossB = b ? 1 - b.pop / Math.max(1, w.pop0[1]) : 1;
      const over = S.t - w.t0 > w.dur || lossA > 0.4 || lossB > 0.4;
      if (!over || !a || !b) { if (!a || !b) S.wars.splice(S.wars.indexOf(w), 1); continue; }
      S.wars.splice(S.wars.indexOf(w), 1);
      a.rel[b.id] = b.rel[a.id] = 25;
      const [win, lose] = lossA > lossB ? [b, a] : [a, b];
      const loot = {};
      for (const k of ['food', 'wood', 'stone', 'metal']) { loot[k] = Math.floor(lose.stock[k] * 0.4); lose.stock[k] -= loot[k]; win.stock[k] += loot[k]; }
      const dead = w.dead[0] + w.dead[1];
      if (lose.pop <= 4) {
        // Conquered: the survivors are absorbed.
        S.people.filter((p) => p.sid === lose.id).forEach((p) => { endTask(S, p); const h = getB(S, p.home); if (h) h.residents = h.residents.filter((id) => id !== p.id); p.home = -1; p.sid = win.id; p.task = { kind: 'migrate', stage: 0, timer: 0 }; goTo(p, win.cx, win.cz); });
        log(S, `${win.name} conquers ${lose.name}. ${dead} fell in the war.`, { sid: win.id, x: lose.cx, z: lose.cz, big: true, kind: 'war' });
      } else log(S, `Peace between ${a.name} and ${b.name}. ${win.name} claims victory; ${dead} lives were lost.`, { sid: win.id, x: (a.cx + b.cx) / 2, z: (a.cz + b.cz) / 2, big: true, kind: 'war' });
    }
  }

  function burnBuildings(S, dt) {
    for (const b of S.buildings.slice()) {
      if (!b.fire) continue;
      b.fire -= dt;
      if (b.fire <= 0) {
        S.fx.events.push({ kind: 'dust', x: b.x + b.w / 2, z: b.z + b.d / 2 });
        const s = getS(S, b.sid);
        if (s && Math.random() < 0.4) log(S, `A ${b.type === 'research' ? TD.researchName(b.style).toLowerCase() : BUILDINGS[b.type].name.toLowerCase()} in ${s.name} burns to the ground.`, { sid: s.id, x: b.x + 1, z: b.z + 1, kind: 'war' });
        removeBuilding(S, b);
      }
    }
  }

  function yearly(S) {
    S.globalEra = Math.max(0, ...S.settlements.filter((s) => s.alive).map((s) => s.era));
    for (const s of S.settlements) {
      if (!s.alive) continue;
      s.popLog.push(s.pop);
      if (s.popLog.length > 6) s.popLog.shift();
      // Catastrophic loss of people can plunge a town into a dark age.
      const peak = Math.max(...s.popLog);
      if (peak >= 12 && s.pop < peak * 0.55 && S.t - s.lastDark > YEAR * 25 && Math.random() < 0.45 && s.order.length > 4) {
        s.lastDark = S.t;
        const lost = forget(S, s, U.randi(1, 3));
        if (lost.length) {
          S.stats.darkAges++;
          log(S, `${s.name} falls into a dark age. The secrets of ${lost.join(', ')} are forgotten.`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'disaster' });
        }
      }
    }
    // Families leave overcrowded towns for smaller neighbours.
    const aliveS = S.settlements.filter((s) => s.alive);
    for (const s of aliveS) {
      if (s.pop < 60) continue;
      const dest = aliveS.filter((o) => o !== s && o.pop < s.pop / 2.5 && !atWar(S, s, o) && U.dist(o.cx, o.cz, s.cx, s.cz) < 80).sort((a, b) => a.pop - b.pop)[0];
      if (!dest || Math.random() > 0.5) continue;
      const fam = S.people.filter((p) => p.sid === s.id && p.sex === 'F' && p.partner >= 0 && p.age > 18 && p.age < 45).slice(0, 2);
      const movers = [];
      fam.forEach((f) => { movers.push(f, getP(S, f.partner)); S.people.forEach((c) => { if (c.sid === s.id && c.age < 13 && c.parents.includes(f.id)) movers.push(c); }); });
      for (const p of movers) {
        if (!p) continue;
        endTask(S, p);
        const h = getB(S, p.home);
        if (h) h.residents = h.residents.filter((id) => id !== p.id);
        p.home = -1; p.sid = dest.id; p.carry = null; p.armed = false;
        p.task = { kind: 'migrate', stage: 0, timer: 0 };
        goTo(p, dest.cx + U.rand(-2, 2), dest.cz + U.rand(-2, 2));
        p.thought = `Moving to ${dest.name} for a better life`;
      }
      if (movers.length && Math.random() < 0.2) log(S, `Crowded ${s.name} sees families leave for ${dest.name}.`, { sid: dest.id, x: dest.cx, z: dest.cz });
    }

    // Colonies among the stars grow, and sometimes call home.
    for (const c of S.colonies) c.pop = Math.round(c.pop * 1.03 + 1);
    if (S.colonies.length && Math.random() < 0.06) {
      const c = U.pick(S.colonies);
      const alive = S.settlements.filter((s) => s.alive);
      const r = Math.random();
      if (r < 0.45 && alive.length) {
        alive.forEach((s) => { if (s.research) s.research.rp += TD.tech(s.research.id).cost * 0.3; });
        log(S, `A transmission arrives from ${c.name} (population ${c.pop}). Their discoveries speed up research everywhere.`, { kind: 'space' });
      } else if (r < 0.85 && alive.length) {
        const s = U.pick(alive);
        const n = U.randi(3, 6);
        for (let k = 0; k < n; k++) {
          const p = makePerson(S, s, s.cx + U.rand(-2, 2), s.cz + U.rand(-2, 2), U.rand(18, 30), null);
          for (const t of ['str', 'int', 'con']) p.traits[t] = Math.min(3, p.traits[t] + 0.15);
          p.mut = c.mut.filter(() => Math.random() < 0.5);
          if (Math.random() < 0.3) p.mut.push(U.pick(Object.keys(MUTATIONS).filter((k) => MUTATIONS[k].good)));
          p.thought = `Just arrived from ${c.name}`;
        }
        c.pop = Math.max(1, c.pop - n);
        S.fx.events.push({ kind: 'landing', x: s.cx, z: s.cz });
        log(S, `A ship from ${c.name} lands at ${s.name}. ${n} star-born settlers step out.`, { sid: s.id, x: s.cx, z: s.cz, big: true, kind: 'space' });
      } else if (S.colonies.length > 1 || Math.random() < 0.3) {
        S.colonies.splice(S.colonies.indexOf(c), 1);
        log(S, `All contact with ${c.name} has been lost.`, { kind: 'disaster' });
      }
    }
    // Forget long-dead towns once their ruins are gone.
    for (const s of S.settlements.slice()) {
      if (s.alive || S.buildings.some((b) => b.sid === s.id)) continue;
      S.settlements.splice(S.settlements.indexOf(s), 1);
      S.cache.s.delete(s.id);
      S.usedColors = S.usedColors.filter((c) => c !== s.color);
    }
  }

  // ---------- save / load ----------
  function serialize(S) {
    const { fx, cache, world, ...rest } = S;
    return JSON.stringify({ ...rest, world: W.toJSON(world) });
  }
  function deserialize(str) {
    const o = JSON.parse(str);
    o.world = W.fromJSON(o.world);
    o.people.forEach((p) => { p.task = null; p.moving = false; p.working = false; p.asleep = false; p.carry = null; p.mode = 'walk'; });
    o.buildings.forEach((b) => { if (!b.residents) b.residents = []; });
    // Older saves: fill in newer fields.
    o.climate = o.climate || { temp: 0, target: 0, next: YEAR * 40 };
    o.wars = o.wars || []; o.colonies = o.colonies || []; o.extinctT = 0;
    Object.assign(o.stats, { wars: 0, darkAges: 0, quakes: 0, ...o.stats });
    o.settlements.forEach((s) => { s.order = s.order || Object.keys(s.known); s.rel = s.rel || {}; s.popLog = s.popLog || []; s.lastDark = s.lastDark ?? -1e9; s.fut = TD.futureCount(s.known); });
    if (!o.bestKnown) { o.bestKnown = {}; o.settlements.forEach((s) => Object.assign(o.bestKnown, s.known)); }
    o.people.forEach((p) => { p.mut = p.mut || []; p.armed = false; });
    attach(o);
    return o;
  }

  G.SIM = {
    DAY, YEAR, create, step, serialize, deserialize, yearOf, tod, isNight, has, getP, getB, getS, capacity, lifeBonus, TASKS, MUTATIONS, mut, fitness,
  };
})(typeof window !== 'undefined' ? window : globalThis);
