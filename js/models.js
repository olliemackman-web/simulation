// Voxel models for buildings. Each model is a list of boxes in local tile units:
// [x, y, z, w, h, d, color, flag]  (x/z from the building's min corner, y up from its base)
// flag: 0 solid, 1 window light, 2 glow light (always bright)
// Emitters (smoke, fire, blades...) are returned separately in local coordinates.
(function (G) {
  const U = G.U;

  function mix(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
  const shade = (c, f) => mix(c, f > 1 ? 0xffffff : 0x000000, f > 1 ? f - 1 : 1 - f);

  function builder() {
    const boxes = [], emit = [];
    const api = {
      boxes, emit,
      box(x, y, z, w, h, d, c, flag = 0) { boxes.push([x, y, z, w, h, d, c, flag]); return api; },
      // centred on (cx,cz)
      cbox(cx, y, cz, w, h, d, c, flag = 0) { boxes.push([cx - w / 2, y, cz - d / 2, w, h, d, c, flag]); return api; },
      // stepped pyramid roof
      roof(cx, y, cz, w, d, steps, stepH, c, shrinkZ = true) {
        for (let i = 0; i < steps; i++) {
          const k = 1 - i / steps;
          api.cbox(cx, y + i * stepH, cz, w * k, stepH, shrinkZ ? d * k : d, shade(c, 1 - i * 0.04));
        }
        return api;
      },
      // gable roof: shrinks along one axis only
      gable(cx, y, cz, w, d, steps, stepH, c) {
        for (let i = 0; i < steps; i++) {
          const k = 1 - i / steps;
          api.cbox(cx, y + i * stepH, cz, w, stepH, d * k, shade(c, 1 - i * 0.05));
        }
        return api;
      },
      // windows around a rectangular body, one row at height y
      windows(x, z, w, d, y, size, gap, c, flag = 1) {
        const t = 0.03;
        for (let px = x + gap; px + size <= x + w - gap * 0.5; px += size + gap) {
          api.box(px, y, z - t, size, size, t, c, flag);
          api.box(px, y, z + d, size, size, t, c, flag);
        }
        for (let pz = z + gap; pz + size <= z + d - gap * 0.5; pz += size + gap) {
          api.box(x - t, y, pz, t, size, size, c, flag);
          api.box(x + w, y, pz, t, size, size, c, flag);
        }
        return api;
      },
      flag(x, y, z, h, c) {
        api.box(x, y, z, 0.05, h, 0.05, 0x5a4a3a);
        api.box(x + 0.05, y + h - 0.3, z, 0.35, 0.22, 0.03, c);
        return api;
      },
      smoke(x, y, z, rate = 1, dark = false) { emit.push({ k: 'smoke', x, y, z, rate, dark }); return api; },
      fire(x, y, z, size = 1) { emit.push({ k: 'fire', x, y, z, size }); return api; },
      blades(x, y, z) { emit.push({ k: 'blades', x, y, z }); return api; },
      sheep(x, z, w, d) { emit.push({ k: 'sheep', x, z, w, d }); return api; },
      rocket(x, y, z) { emit.push({ k: 'rocket', x, y, z }); return api; },
    };
    return api;
  }

  const WIN = (style) => (style >= 7 ? 0x9ff3ff : style >= 5 ? 0xfff1b0 : 0xffb347);

  // ---------- houses (2x2) ----------
  function house(m, style, tc, v) {
    const win = WIN(style);
    switch (style) {
      case 0: { // round thatched hut
        m.cbox(1, 0, 1, 1.2, 0.45, 1.2, 0xb89a5a).cbox(1, 0, 0.38, 0.3, 0.35, 0.05, 0x3a2a1a);
        m.roof(1, 0.45, 1, 1.5, 1.5, 4, 0.16, mix(0xc8a860, tc, 0.25));
        break;
      }
      case 1: { // log cabin
        m.box(0.25, 0, 0.35, 1.5, 0.75, 1.3, 0x8b5a2b);
        for (let y = 0.15; y < 0.7; y += 0.2) m.box(0.23, y, 0.33, 1.54, 0.04, 1.34, 0x6b4220);
        m.box(0.85, 0, 0.32, 0.3, 0.45, 0.03, 0x3a2a1a).box(0.35, 0.35, 0.32, 0.22, 0.2, 0.03, win, 1);
        m.gable(1, 0.75, 1, 1.75, 1.55, 4, 0.14, mix(0x7a4a2a, tc, 0.4));
        m.smoke(1.45, 1.2, 1.2, 0.3);
        break;
      }
      case 2: { // mud-brick
        m.box(0.2, 0, 0.2, 1.6, 0.85, 1.6, 0xcdb48a).box(0.15, 0.85, 0.15, 1.7, 0.1, 1.7, 0xb89f76);
        m.box(0.85, 0, 0.17, 0.3, 0.5, 0.03, 0x4a3520);
        m.windows(0.2, 0.2, 1.6, 1.6, 0.45, 0.2, 0.35, win);
        m.cbox(1, 0.95, 1, 0.8, 0.25, 0.8, mix(0xcdb48a, tc, 0.5));
        break;
      }
      case 3: { // classical villa
        m.box(0.15, 0, 0.15, 1.7, 0.12, 1.7, 0xd8d0bc).box(0.25, 0.12, 0.3, 1.5, 0.9, 1.4, 0xece6d4);
        m.box(0.3, 0.12, 0.16, 0.1, 0.9, 0.1, 0xffffff).box(1.6, 0.12, 0.16, 0.1, 0.9, 0.1, 0xffffff);
        m.windows(0.25, 0.3, 1.5, 1.4, 0.5, 0.2, 0.3, win);
        m.box(0.85, 0.12, 0.27, 0.3, 0.5, 0.03, 0x5a3a20);
        m.roof(1, 1.02, 1, 1.8, 1.7, 3, 0.16, mix(0xc0553a, tc, 0.35));
        break;
      }
      case 4: { // medieval timber-frame
        m.box(0.25, 0, 0.25, 1.5, 0.65, 1.5, 0x9a9a92).box(0.18, 0.65, 0.18, 1.64, 0.65, 1.64, 0xf0ead8);
        for (const x of [0.18, 0.95, 1.78]) m.box(x, 0.65, 0.16, 0.05, 0.65, 0.03, 0x4a3020);
        m.box(0.18, 0.95, 0.16, 1.64, 0.05, 0.03, 0x4a3020);
        m.windows(0.25, 0.25, 1.5, 1.5, 0.3, 0.18, 0.4, win).windows(0.18, 0.18, 1.64, 1.64, 0.85, 0.18, 0.4, win);
        m.gable(1, 1.3, 1, 1.8, 1.8, 5, 0.15, mix(0x5a3a2a, tc, 0.4));
        m.box(1.4, 1.3, 1.3, 0.2, 0.9, 0.2, 0x7a6a5a).smoke(1.5, 2.25, 1.4, 0.5);
        break;
      }
      case 5: { // industrial brick terrace
        const h = 2 + v * 0.6;
        m.box(0.15, 0, 0.15, 1.7, h, 1.7, 0xa0442f).box(0.1, h, 0.1, 1.8, 0.12, 1.8, 0x6a2e20);
        for (let y = 0.3; y < h - 0.2; y += 0.55) m.windows(0.15, 0.15, 1.7, 1.7, y, 0.2, 0.25, win);
        m.box(0.85, 0, 0.12, 0.3, 0.45, 0.03, 0x3a2418);
        m.box(1.3, h, 1.3, 0.25, 0.6, 0.25, 0x7a3a2a).smoke(1.42, h + 0.65, 1.42, 0.6, true);
        m.cbox(0.6, h + 0.12, 0.6, 0.5, 0.08, 0.5, mix(0x6a2e20, tc, 0.5));
        break;
      }
      case 6: { // modern apartments
        const floors = 6 + Math.floor(v * 5), fh = 0.5;
        m.box(0.15, 0, 0.15, 1.7, floors * fh, 1.7, 0xc9cdd2);
        for (let f = 0; f < floors; f++) {
          const y = f * fh + 0.15;
          m.box(0.12, y, 0.25, 0.03, 0.22, 1.5, 0x3f5a70, 1).box(1.85, y, 0.25, 0.03, 0.22, 1.5, 0x3f5a70, 1);
          m.box(0.25, y, 0.12, 1.5, 0.22, 0.03, 0x3f5a70, 1).box(0.25, y, 1.85, 1.5, 0.22, 0.03, 0x3f5a70, 1);
        }
        m.cbox(1, floors * fh, 1, 0.8, 0.3, 0.6, 0x9aa0a6).cbox(1, floors * fh + 0.3, 1, 1.9, 0.06, 1.9, mix(0x888888, tc, 0.6));
        break;
      }
      default: { // future tower
        const floors = 11 + Math.floor(v * 8), fh = 0.5, H = floors * fh;
        m.cbox(1, 0, 1, 1.4, H, 1.4, 0x9fc6d8);
        for (let f = 1; f < floors; f += 2) m.cbox(1, f * fh, 1, 1.5, 0.06, 1.5, 0xf2f6f8);
        for (const [x, z] of [[0.28, 0.28], [1.72, 0.28], [0.28, 1.72], [1.72, 1.72]]) m.cbox(x, 0, z, 0.07, H + 0.2, 0.07, tc, 2);
        for (let f = 0; f < floors; f += 1) m.windows(0.3, 0.3, 1.4, 1.4, f * fh + 0.2, 0.18, 0.12, win);
        m.cbox(1, H, 1, 1.2, 0.15, 1.2, 0x3f9f4a).cbox(1, H + 0.15, 1, 0.2, 0.2, 0.2, 0x3f8f3a).cbox(1, H + 0.35, 1, 0.6, 0.4, 0.6, 0x4fbf5a);
      }
    }
  }

  // ---------- town centres (3x3) ----------
  function center(m, style, tc) {
    const win = WIN(style);
    switch (style) {
      case 0: {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          m.cbox(1.5 + Math.cos(a) * 0.5, 0, 1.5 + Math.sin(a) * 0.5, 0.18, 0.12, 0.18, 0x8a8a8a);
        }
        m.cbox(1.5, 0, 1.5, 0.5, 0.08, 0.12, 0x5a3a1a).cbox(1.5, 0, 1.5, 0.12, 0.1, 0.5, 0x5a3a1a);
        m.fire(1.5, 0.1, 1.5, 1);
        m.cbox(0.4, 0, 0.4, 0.2, 1.3, 0.2, 0x7a5030).cbox(0.4, 1.0, 0.4, 0.28, 0.2, 0.28, tc).cbox(0.4, 0.6, 0.4, 0.26, 0.15, 0.26, 0xe0c080);
        for (const [x, z] of [[2.5, 0.6], [0.6, 2.4], [2.4, 2.4]]) m.cbox(x, 0, z, 0.3, 0.14, 0.18, 0x6a4a2a);
        break;
      }
      case 1: {
        m.box(0.3, 0, 0.6, 2.4, 0.8, 1.8, 0x8b5a2b);
        m.gable(1.5, 0.8, 1.5, 2.6, 2.0, 5, 0.14, mix(0x7a4a2a, tc, 0.45));
        m.box(1.3, 0, 0.57, 0.4, 0.55, 0.03, 0x3a2a1a).windows(0.3, 0.6, 2.4, 1.8, 0.4, 0.2, 0.5, win);
        m.fire(0.35, 0.05, 0.3, 0.7).flag(2.7, 0, 0.3, 1.8, tc);
        break;
      }
      case 2: {
        m.box(0.1, 0, 0.1, 2.8, 0.45, 2.8, 0xcdb48a).box(0.45, 0.45, 0.45, 2.1, 0.45, 2.1, 0xc2a87e).box(0.8, 0.9, 0.8, 1.4, 0.45, 1.4, 0xb89e74);
        m.box(1.05, 1.35, 1.05, 0.9, 0.55, 0.9, mix(0xcdb48a, tc, 0.55)).fire(1.5, 1.9, 1.5, 0.6);
        m.box(1.3, 0, 0.07, 0.4, 0.4, 0.03, 0x3a2a1a);
        break;
      }
      case 3: {
        m.box(0.1, 0, 0.1, 2.8, 0.2, 2.8, 0xd8d0bc).box(0.5, 0.2, 0.6, 2.0, 1.2, 1.7, 0xf0ead8);
        for (let x = 0.3; x <= 2.7; x += 0.4) m.box(x, 0.2, 0.25, 0.12, 1.2, 0.12, 0xffffff);
        m.box(0.2, 1.4, 0.15, 2.6, 0.12, 2.3, 0xe8e2d0).roof(1.5, 1.52, 1.35, 2.6, 2.3, 3, 0.15, mix(0xc0553a, tc, 0.35), false);
        m.windows(0.5, 0.6, 2.0, 1.7, 0.7, 0.25, 0.35, win).flag(1.5, 1.95, 1.35, 0.9, tc);
        break;
      }
      case 4: {
        m.box(0.35, 0, 0.35, 2.3, 1.6, 2.3, 0x8f8f88);
        for (let x = 0.35; x < 2.6; x += 0.46) { m.box(x, 1.6, 0.35, 0.23, 0.2, 0.2, 0x8f8f88).box(x, 1.6, 2.45, 0.23, 0.2, 0.2, 0x8f8f88); }
        for (const [x, z] of [[0.1, 0.1], [2.3, 0.1], [0.1, 2.3], [2.3, 2.3]]) {
          m.box(x, 0, z, 0.6, 2.2, 0.6, 0x9a9a92).roof(x + 0.3, 2.2, z + 0.3, 0.7, 0.7, 3, 0.2, mix(0x4a4a6a, tc, 0.6));
        }
        m.box(1.25, 0, 0.32, 0.5, 0.7, 0.03, 0x3a2a1a).windows(0.35, 0.35, 2.3, 2.3, 1.0, 0.15, 0.55, win);
        m.flag(1.5, 1.6, 1.5, 1.4, tc);
        break;
      }
      case 5: {
        m.box(0.2, 0, 0.4, 2.6, 1.6, 2.2, 0xa0442f).box(0.15, 1.6, 0.35, 2.7, 0.12, 2.3, 0x6a2e20);
        m.windows(0.2, 0.4, 2.6, 2.2, 0.35, 0.22, 0.3, win).windows(0.2, 0.4, 2.6, 2.2, 1.0, 0.22, 0.3, win);
        m.box(1.15, 0, 1.15, 0.7, 3.3, 0.7, 0xb0543f).box(1.1, 3.3, 1.1, 0.8, 0.1, 0.8, 0x6a2e20);
        m.box(1.25, 2.7, 1.12, 0.5, 0.5, 0.03, 0xf8f4e0, 1).roof(1.5, 3.4, 1.5, 0.8, 0.8, 3, 0.2, mix(0x3a4a5a, tc, 0.5));
        m.flag(1.5, 4.0, 1.5, 0.8, tc);
        break;
      }
      case 6: {
        m.box(0.2, 0, 0.2, 2.6, 2.2, 2.6, 0xd4d8dc);
        for (let y = 0.2; y < 2.1; y += 0.5) m.windows(0.2, 0.2, 2.6, 2.6, y, 0.28, 0.12, 0x3f5a70);
        m.box(1.0, 2.2, 1.0, 1.0, 3.2, 1.0, 0xbfc6cc);
        for (let y = 2.4; y < 5.3; y += 0.4) m.windows(1.0, 1.0, 1.0, 1.0, y, 0.2, 0.1, win);
        m.flag(1.5, 5.4, 1.5, 0.9, tc);
        break;
      }
      default: {
        m.cbox(1.5, 0, 1.5, 2.8, 0.3, 2.8, 0xe8eef2).cbox(1.5, 0.3, 1.5, 1.6, 2.0, 1.6, 0x9fc6d8);
        m.cbox(1.5, 2.3, 1.5, 1.0, 5, 1.0, 0xe8eef2).cbox(1.5, 7.3, 1.5, 0.5, 3, 0.5, 0xe8eef2).cbox(1.5, 10.3, 1.5, 0.12, 1.5, 0.12, tc, 2);
        for (let y = 1; y < 10; y += 1.5) m.cbox(1.5, 2 + y * 0.8, 1.5, 1.8 - y * 0.1, 0.08, 1.8 - y * 0.1, tc, 2);
        m.windows(0.7, 0.7, 1.6, 1.6, 0.8, 0.25, 0.15, WIN(7)).windows(0.7, 0.7, 1.6, 1.6, 1.6, 0.25, 0.15, WIN(7));
      }
    }
  }

  function research(m, style, tc) {
    const win = WIN(style);
    if (style <= 3) { // library with columns and stepped dome
      m.box(0.2, 0, 0.2, 2.6, 0.2, 2.6, 0xd8d0bc).box(0.5, 0.2, 0.7, 2.0, 1.1, 1.6, 0xe6dcc0);
      for (let x = 0.4; x <= 2.6; x += 0.44) m.box(x, 0.2, 0.35, 0.12, 1.1, 0.12, 0xffffff);
      m.box(0.3, 1.3, 0.3, 2.4, 0.12, 2.1, 0xd0c6aa);
      for (let i = 0; i < 4; i++) m.cbox(1.5, 1.42 + i * 0.16, 1.4, 1.3 - i * 0.3, 0.16, 1.3 - i * 0.3, mix(0x6a8a9a, tc, 0.3));
      m.windows(0.5, 0.7, 2.0, 1.6, 0.6, 0.22, 0.35, win);
    } else if (style <= 5) { // university
      m.box(0.2, 0, 0.3, 2.6, 1.8, 2.4, style === 4 ? 0x9a8f7a : 0x9a4a35);
      m.windows(0.2, 0.3, 2.6, 2.4, 0.3, 0.2, 0.3, win).windows(0.2, 0.3, 2.6, 2.4, 1.0, 0.2, 0.3, win);
      m.gable(1.5, 1.8, 1.5, 2.7, 2.5, 4, 0.18, mix(0x4a4a5a, tc, 0.3));
      m.box(0.2, 0, 0.1, 0.6, 3.2, 0.6, style === 4 ? 0x8a806a : 0x8a3a28).roof(0.5, 3.2, 0.4, 0.7, 0.7, 4, 0.25, mix(0x4a4a5a, tc, 0.4));
      m.box(0.35, 2.4, 0.08, 0.3, 0.3, 0.03, 0xf0f0e0, 1);
    } else if (style === 6) { // laboratory with dish
      m.box(0.2, 0, 0.2, 2.6, 1.6, 2.6, 0xf0f2f4);
      m.windows(0.2, 0.2, 2.6, 2.6, 0.3, 0.3, 0.15, 0x3f5a70, 1).windows(0.2, 0.2, 2.6, 2.6, 1.0, 0.3, 0.15, 0x3f5a70, 1);
      m.cbox(2.1, 1.6, 2.1, 0.12, 0.6, 0.12, 0x888888).cbox(2.1, 2.2, 2.1, 0.9, 0.1, 0.9, 0xdddddd).cbox(2.1, 2.3, 2.1, 0.6, 0.08, 0.6, 0xcccccc);
      m.cbox(0.9, 1.6, 0.9, 0.8, 0.4, 0.8, mix(0xcccccc, tc, 0.5));
    } else { // glass campus dome
      for (let i = 0; i < 6; i++) m.cbox(1.5, i * 0.35, 1.5, 2.8 - i * 0.42, 0.35, 2.8 - i * 0.42, i % 2 ? 0x9fd6e8 : 0xbfe6f0, i === 5 ? 2 : 0);
      m.cbox(1.5, 0, 1.5, 2.9, 0.06, 2.9, tc, 2);
      m.windows(0.25, 0.25, 2.5, 2.5, 0.12, 0.2, 0.2, WIN(7));
    }
  }

  const MODELS = {
    house: (m, b, s, v) => house(m, b.style, s.color, v),
    center: (m, b, s) => center(m, b.style, s.color),
    research: (m, b, s) => research(m, b.style, s.color),
    field: (m, b) => {
      const g = b.growth;
      const col = g >= 0.75 ? 0xe0c050 : mix(0x5f9e3a, 0xa8c050, g / 0.75);
      const h = 0.06 + g * 0.35;
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) for (let r = 0; r < 3; r++) m.box(x + 0.12 + r * 0.3, 0, z + 0.15, 0.16, h, 0.7, col);
    },
    pasture: (m, b) => {
      for (let t = 0; t <= 3; t += 0.5) {
        m.box(t - 0.03, 0, -0.03, 0.06, 0.3, 0.06, 0x7a5a3a).box(t - 0.03, 0, 2.97, 0.06, 0.3, 0.06, 0x7a5a3a);
        m.box(-0.03, 0, t - 0.03, 0.06, 0.3, 0.06, 0x7a5a3a).box(2.97, 0, t - 0.03, 0.06, 0.3, 0.06, 0x7a5a3a);
      }
      m.box(0, 0.2, -0.02, 3, 0.04, 0.04, 0x8a6a4a).box(0, 0.2, 2.98, 3, 0.04, 0.04, 0x8a6a4a).box(-0.02, 0.2, 0, 0.04, 0.04, 3, 0x8a6a4a).box(2.98, 0.2, 0, 0.04, 0.04, 3, 0x8a6a4a);
      m.sheep(0.3, 0.3, 2.4, 2.4);
    },
    granary: (m, b, s) => {
      for (let i = 0; i < 5; i++) m.cbox(1, i * 0.25, 1, 1.2 + (i === 2 ? 0.1 : 0), 0.25, 1.2 + (i === 2 ? 0.1 : 0), i % 2 ? 0xc8a878 : 0xd4b688);
      m.roof(1, 1.25, 1, 1.3, 1.3, 4, 0.14, mix(0xa06a3a, s.color, 0.3));
    },
    smithy: (m, b, s) => {
      m.box(0.2, 0, 0.3, 1.6, 0.8, 1.4, 0x8a8278).gable(1, 0.8, 1, 1.7, 1.5, 3, 0.14, mix(0x5a4a3a, s.color, 0.3));
      m.box(1.35, 0.8, 1.2, 0.3, 0.8, 0.3, 0x6a6258).smoke(1.5, 1.65, 1.35, 1, true);
      m.cbox(1, 0, 0.1, 0.3, 0.2, 0.2, 0x333333).fire(0.5, 0.05, 0.15, 0.5);
    },
    market: (m, b, s) => {
      const cols = [0xe05050, 0xe0c040, 0x50a0e0, 0x60c060, s.color, 0xe08040];
      let k = 0;
      for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) {
        const px = 0.25 + x * 0.9, pz = 0.4 + z * 1.3;
        m.box(px, 0, pz, 0.7, 0.35, 0.5, 0x9a7a52);
        m.box(px - 0.05, 0.55, pz - 0.05, 0.8, 0.06, 0.6, cols[k++ % cols.length]);
        m.box(px, 0.35, pz, 0.05, 0.2, 0.05, 0x5a4a3a).box(px + 0.65, 0.35, pz, 0.05, 0.2, 0.05, 0x5a4a3a);
        m.box(px + 0.15, 0.35, pz + 0.15, 0.4, 0.08, 0.2, cols[(k + 2) % cols.length]);
      }
    },
    temple: (m, b, s) => {
      m.box(0, 0, 0, 3, 0.2, 3, 0xd8d0bc).box(0.2, 0.2, 0.2, 2.6, 0.2, 2.6, 0xe0d8c4);
      for (let x = 0.3; x <= 2.7; x += 0.4) { m.box(x, 0.4, 0.3, 0.14, 1.4, 0.14, 0xffffff).box(x, 0.4, 2.56, 0.14, 1.4, 0.14, 0xffffff); }
      for (let z = 0.7; z <= 2.3; z += 0.4) { m.box(0.3, 0.4, z, 0.14, 1.4, 0.14, 0xffffff).box(2.56, 0.4, z, 0.14, 1.4, 0.14, 0xffffff); }
      m.box(0.7, 0.4, 0.7, 1.6, 1.3, 1.6, 0xefe8d8).box(0.2, 1.8, 0.2, 2.6, 0.15, 2.6, 0xe8e2d0);
      m.gable(1.5, 1.95, 1.5, 2.7, 2.6, 4, 0.14, mix(0xd8d0bc, s.color, 0.2));
      m.cbox(1.5, 2.5, 1.5, 0.3, 0.5, 0.3, 0xf0c040, 2).fire(0.45, 0.4, 0.15, 0.4).fire(2.55, 0.4, 0.15, 0.4);
    },
    windmill: (m, b, s) => {
      for (let i = 0; i < 6; i++) m.cbox(1, i * 0.4, 1, 1.2 - i * 0.1, 0.4, 1.2 - i * 0.1, i % 2 ? 0xe8e0cc : 0xded6c0);
      m.roof(1, 2.4, 1, 0.8, 0.8, 3, 0.18, mix(0x6a4a3a, s.color, 0.3));
      m.box(0.85, 0, 0.39, 0.3, 0.5, 0.03, 0x4a3520).box(0.9, 1.3, 0.47, 0.2, 0.2, 0.03, WIN(4), 1);
      m.blades(1, 2.3, 0.3);
    },
    factory: (m, b, s) => {
      m.box(0.1, 0, 0.3, 2.8, 1.2, 2.4, 0x8a3a2a);
      for (let x = 0.1; x < 2.8; x += 0.7) m.box(x, 1.2, 0.3, 0.7, 0.4, 2.4, 0x6a6a6a).box(x + 0.35, 1.2, 0.3, 0.35, 0.2, 2.4, 0x7a7a7a);
      m.windows(0.1, 0.3, 2.8, 2.4, 0.4, 0.3, 0.2, WIN(5));
      m.box(2.2, 0, 2.2, 0.4, 3.6, 0.4, 0x7a3a2a).smoke(2.4, 3.65, 2.4, 2, true);
      m.box(0.4, 0, 2.2, 0.35, 3.0, 0.35, 0x7a3a2a).smoke(0.58, 3.05, 2.38, 1.6, true);
      m.box(1.1, 0, 0.27, 0.8, 0.7, 0.03, 0x444444).box(0.1, 1.6, 0.3, 2.8, 0.06, 0.1, s.color);
    },
    power: (m, b, s) => {
      const r = [1.5, 1.35, 1.2, 1.1, 1.05, 1.08, 1.15];
      r.forEach((w, i) => m.cbox(1.9, i * 0.5, 1.9, w, 0.5, w, i % 2 ? 0xc8ccd0 : 0xd6dade));
      m.smoke(1.9, 3.6, 1.9, 3, false);
      m.box(0.1, 0, 0.1, 1.2, 1.2, 1.6, 0x9aa0a6).windows(0.1, 0.1, 1.2, 1.6, 0.5, 0.2, 0.2, WIN(6));
      m.box(0.4, 1.2, 0.3, 0.2, 1.5, 0.2, 0x8a8a8a).box(0.4, 2.7, 0.3, 0.2, 0.1, 0.2, 0xe05050, 2);
      m.box(0.1, 1.2, 1.0, 1.2, 0.08, 0.1, s.color);
    },
    hospital: (m, b, s) => {
      m.box(0.2, 0, 0.2, 2.6, 2.4, 2.6, 0xf4f6f8);
      for (let y = 0.3; y < 2.3; y += 0.5) m.windows(0.2, 0.2, 2.6, 2.6, y, 0.25, 0.2, 0x7aa0c0, 1);
      m.cbox(1.5, 2.4, 1.5, 1.0, 0.08, 0.3, 0xe03030, 2).cbox(1.5, 2.4, 1.5, 0.3, 0.08, 1.0, 0xe03030, 2);
      m.box(1.1, 0, 0.17, 0.8, 0.6, 0.03, 0x88aacc).box(0.2, 2.2, 0.17, 2.6, 0.12, 0.03, s.color);
    },
    launchpad: (m, b, s) => {
      m.box(0, 0, 0, 4, 0.2, 4, 0x8a8e92).box(1.4, 0.2, 1.4, 1.2, 0.06, 1.2, 0x4a4e52);
      m.box(2.9, 0.2, 1.7, 0.4, 5.2, 0.4, 0xd05030);
      for (let y = 0.8; y < 5.2; y += 0.8) m.box(2.6, y, 1.85, 0.35, 0.06, 0.1, 0xa04020);
      m.box(0.2, 0.2, 0.2, 0.8, 0.6, 0.6, 0xe8e8e8).box(0.2, 0.8, 0.2, 0.8, 0.05, 0.6, s.color);
      m.rocket(2, 0.26, 2);
    },
    reactor: (m, b, s) => {
      m.box(0.1, 0, 0.1, 2.8, 0.5, 2.8, 0xe0e6ea);
      const ring = 12;
      for (let k = 0; k < ring; k++) {
        const a = (k / ring) * Math.PI * 2;
        m.cbox(1.5 + Math.cos(a) * 1.0, 0.5, 1.5 + Math.sin(a) * 1.0, 0.5, 0.6, 0.5, 0xb8c4cc);
      }
      m.cbox(1.5, 0.5, 1.5, 0.8, 0.9, 0.8, 0x7ff7ff, 2).cbox(1.5, 1.4, 1.5, 1.2, 0.1, 1.2, s.color, 2);
    },
  };

  function build(b, s) {
    const m = builder();
    const v = U.hash(b.id * 7 + 3);
    (MODELS[b.type] || MODELS.house)(m, b, s, v);
    return m;
  }

  G.MODELS = { build, mix, shade };
})(typeof window !== 'undefined' ? window : globalThis);
