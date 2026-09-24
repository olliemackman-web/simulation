// Terrain generation and tile queries. Pure data.
(function (G) {
  const U = G.U;
  const T = { WATER: 0, SAND: 1, GRASS: 2, ROCK: 3, SNOW: 4 };
  const R = { NONE: 0, TREE: 1, BUSH: 2, BOULDER: 3, ORE: 4 };
  const N = 128;
  const SEA = 8;
  const ARRAYS = { h: Uint8Array, type: Uint8Array, res: Uint8Array, amt: Float32Array, grow: Float32Array, traffic: Float32Array, road: Uint8Array, occ: Int32Array, fire: Float32Array };

  function generate(seed) {
    const noise = U.makeNoise(seed);
    const noise2 = U.makeNoise(seed * 7 + 13);
    const rng = U.seeded(seed * 31 + 5);
    const w = { N, seed, sea: SEA };
    for (const k in ARRAYS) w[k] = new ARRAYS[k](N * N);
    w.occ.fill(-1);

    // Raw elevation, then quantile-map so every seed gets a balanced island.
    const raw = new Float32Array(N * N), mo = new Float32Array(N * N);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const nx = x / N - 0.5, nz = z / N - 0.5;
        const d = Math.sqrt(nx * nx + nz * nz) * 2;
        const ridge = 1 - Math.abs(noise2.fbm(x / 20 + 50, z / 20 + 50, 4) * 2 - 1);
        raw[i] = noise.fbm(x / 30, z / 30, 5) + ridge * 0.12 - Math.pow(d, 2.2) * 0.45;
        mo[i] = noise2.fbm(x / 20 + 200, z / 20 - 100, 4);
      }
    }
    const rank = (arr) => {
      const order = Array.from(arr.keys()).sort((a, b) => arr[a] - arr[b]);
      const q = new Float32Array(arr.length);
      order.forEach((k, r) => (q[k] = r / arr.length));
      return q;
    };
    const qe = rank(raw), qm = rank(mo);
    // quantile -> height bands: water < .38, sand, grass, rock, snow
    const bands = [[0, 1], [0.38, 8], [0.42, 10], [0.86, 19], [0.96, 25], [1, 32]];
    for (let i = 0; i < N * N; i++) {
      const q = qe[i];
      let b = 0;
      while (b < bands.length - 2 && q >= bands[b + 1][0]) b++;
      const [q0, h0] = bands[b], [q1, h1] = bands[b + 1];
      w.h[i] = Math.floor(h0 + ((q - q0) / (q1 - q0)) * (h1 - h0));
    }
    // Moisture + types + resources.
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const h = w.h[i];
        const m = qm[i];
        let t;
        if (h < SEA) t = T.WATER;
        else if (h <= SEA + 1 && nearWater(w, x, z, 2)) t = T.SAND;
        else if (h >= 25) t = T.SNOW;
        else if (h >= 19) t = T.ROCK;
        else t = T.GRASS;
        w.type[i] = t;
        const r = rng();
        if (t === T.GRASS) {
          if (m > 0.45 && r < (m - 0.4) * 0.9) { w.res[i] = R.TREE; w.grow[i] = 1; w.amt[i] = 1; }
          else if (r > 0.97) { w.res[i] = R.BUSH; w.amt[i] = 5; w.grow[i] = 1; }
          else if (r > 0.955 && h > 13) { w.res[i] = R.BOULDER; w.amt[i] = 12; }
          else if (r < 0.04) { w.res[i] = R.TREE; w.grow[i] = 1; w.amt[i] = 1; }
        } else if (t === T.ROCK) {
          if (r < 0.1) { w.res[i] = R.BOULDER; w.amt[i] = 20; }
          else if (r < 0.16) { w.res[i] = R.ORE; w.amt[i] = 40; }
          else if (r < 0.2 && h < 22) { w.res[i] = R.TREE; w.grow[i] = 1; w.amt[i] = 1; }
        } else if (t === T.SAND && r < 0.03) { w.res[i] = R.BOULDER; w.amt[i] = 8; }
      }
    }
    return w;
  }

  function nearWater(w, x, z, r) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
      if (w.h[zz * N + xx] < SEA) return true;
    }
    return false;
  }

  const idx = (x, z) => z * N + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const isLand = (w, i) => w.type[i] !== T.WATER;

  // Spiral-ish ring search around (cx,cz) for a tile satisfying pred. Returns index or -1.
  function findNear(w, cx, cz, maxR, pred) {
    cx = Math.floor(cx); cz = Math.floor(cz);
    if (inb(cx, cz) && pred(idx(cx, cz))) return idx(cx, cz);
    for (let r = 1; r <= maxR; r++) {
      const cand = [];
      for (let k = -r; k <= r; k++) {
        cand.push([cx + k, cz - r], [cx + k, cz + r]);
        if (k > -r && k < r) cand.push([cx - r, cz + k], [cx + r, cz + k]);
      }
      // Random start keeps agents from all picking the identical tile.
      const off = Math.floor(Math.random() * cand.length);
      for (let j = 0; j < cand.length; j++) {
        const [x, z] = cand[(j + off) % cand.length];
        if (!inb(x, z)) continue;
        const i = idx(x, z);
        if (pred(i)) return i;
      }
    }
    return -1;
  }

  function toJSON(w) {
    const o = { N: w.N, seed: w.seed, sea: w.sea };
    for (const k in ARRAYS) o[k] = Array.from(w[k], (v) => (k === 'traffic' || k === 'amt' || k === 'grow' || k === 'fire' ? Math.round(v * 100) / 100 : v));
    return o;
  }
  function fromJSON(o) {
    const w = { N: o.N, seed: o.seed, sea: o.sea };
    for (const k in ARRAYS) w[k] = ARRAYS[k].from(o[k] || new Array(N * N).fill(k === 'occ' ? -1 : 0));
    return w;
  }

  G.WORLD = { T, R, N, SEA, generate, idx, inb, isLand, findNear, nearWater, toJSON, fromJSON };
})(typeof window !== 'undefined' ? window : globalThis);
