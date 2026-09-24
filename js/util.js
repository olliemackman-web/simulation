// Shared helpers: math, randomness, noise, names. No DOM / THREE dependencies.
(function (G) {
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  U.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  U.weightedPick = (items, weightFn) => {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, weightFn(it)); total += w; return w; });
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };

  // Deterministic hash for per-tile visual variation.
  U.hash = (n) => {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967296;
  };

  U.seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Value noise with smooth interpolation + fractal sum.
  U.makeNoise = (seed) => {
    const rng = U.seeded(seed);
    const P = 256, perm = new Uint8Array(P * 2), vals = new Float32Array(P);
    for (let i = 0; i < P; i++) { perm[i] = i; vals[i] = rng(); }
    for (let i = P - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < P; i++) perm[P + i] = perm[i];
    const v = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
    const s = (t) => t * t * (3 - 2 * t);
    const noise2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      const u = s(xf), w = s(yf);
      return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), w);
    };
    const fbm = (x, y, oct = 5) => {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) { sum += noise2(x * freq, y * freq) * amp; norm += amp; amp *= 0.5; freq *= 2.03; }
      return sum / norm;
    };
    return { noise2, fbm };
  };

  const SYL = ['ka', 'lo', 'mi', 'ra', 'to', 'ne', 'su', 'ha', 'ri', 'ba', 'de', 'yo', 'ul', 'an', 'es', 'or',
    'ti', 'ma', 'ze', 'vi', 'la', 'no', 'ek', 'tha', 'jo', 'ru', 'fi', 'go', 'sa', 'ven', 'dal', 'mor', 'kel', 'wyn', 'ist', 'bri'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  U.personName = () => {
    const n = Math.random() < 0.6 ? 2 : 3;
    let s = '';
    for (let i = 0; i < n; i++) s += U.pick(SYL);
    return cap(s);
  };
  const PLACE_END = ['ia', 'heim', 'ton', 'dor', 'mar', 'ros', 'var', 'holm', 'wick', 'grad', 'ora', 'esh'];
  U.placeName = () => cap(U.pick(SYL) + U.pick(SYL) + U.pick(PLACE_END));

  U.TRIBE_COLORS = [0xe0503c, 0x3c7fe0, 0xe0b43c, 0x9b4de0, 0x2fbf8a, 0xe07a2f, 0xe04f9b, 0x4fd0e0,
    0x8fbf2f, 0xbf6a4f, 0x6f6fe0, 0xd0d04f];

  G.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
