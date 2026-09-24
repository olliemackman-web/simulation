// Technology tree + building catalogue. Pure data.
(function (G) {
  const ERAS = ['Stone Age', 'Tribal Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Industrial Age', 'Modern Age', 'Space Age'];

  // cost = research points. req = prerequisite tech ids.
  const TECHS = [
    // 0 Stone Age
    { id: 'fire', name: 'Fire', era: 0, cost: 25, req: [], desc: 'Cooked food and warmth at night.' },
    { id: 'stone_tools', name: 'Stone Tools', era: 0, cost: 35, req: [], desc: 'Faster gathering.' },
    { id: 'shelter', name: 'Shelter', era: 0, cost: 40, req: ['fire'], desc: 'Simple huts to live in.' },
    { id: 'hunting', name: 'Hunting', era: 0, cost: 55, req: ['stone_tools'], desc: 'Spears to hunt deer.' },
    { id: 'fishing', name: 'Fishing', era: 0, cost: 55, req: ['stone_tools'], desc: 'Catch fish from the shore.' },
    { id: 'language', name: 'Oral Tradition', era: 0, cost: 60, req: ['fire'], desc: 'Elders pass knowledge on faster.' },
    // 1 Tribal
    { id: 'agriculture', name: 'Agriculture', era: 1, cost: 130, req: ['stone_tools', 'language'], desc: 'Farm fields of grain.' },
    { id: 'pottery', name: 'Pottery', era: 1, cost: 110, req: ['fire'], desc: 'Granaries store more food.' },
    { id: 'carpentry', name: 'Carpentry', era: 1, cost: 130, req: ['stone_tools', 'shelter'], desc: 'Wooden cabins.' },
    { id: 'husbandry', name: 'Animal Husbandry', era: 1, cost: 160, req: ['agriculture', 'hunting'], desc: 'Pastures with sheep.' },
    { id: 'weaving', name: 'Weaving', era: 1, cost: 120, req: ['agriculture'], desc: 'Clothing: healthier, longer lives.' },
    // 2 Bronze
    { id: 'mining', name: 'Mining', era: 2, cost: 240, req: ['stone_tools', 'carpentry'], desc: 'Dig ore from the mountains.' },
    { id: 'masonry', name: 'Masonry', era: 2, cost: 260, req: ['mining'], desc: 'Stone buildings.' },
    { id: 'bronze', name: 'Bronze Working', era: 2, cost: 320, req: ['mining', 'fire'], desc: 'Metal tools and a smithy.' },
    { id: 'wheel', name: 'The Wheel', era: 2, cost: 280, req: ['carpentry'], desc: 'Carts: carry more, move faster.' },
    { id: 'writing', name: 'Writing', era: 2, cost: 330, req: ['pottery', 'language'], desc: 'Libraries speed up research.' },
    // 3 Iron / Classical
    { id: 'iron', name: 'Iron Working', era: 3, cost: 520, req: ['bronze'], desc: 'Stronger tools.' },
    { id: 'mathematics', name: 'Mathematics', era: 3, cost: 520, req: ['writing'], desc: 'Numbers, geometry, planning.' },
    { id: 'currency', name: 'Currency', era: 3, cost: 480, req: ['writing', 'wheel'], desc: 'Markets and traders between towns.' },
    { id: 'architecture', name: 'Architecture', era: 3, cost: 620, req: ['masonry', 'mathematics'], desc: 'Temples and larger homes.' },
    { id: 'medicine', name: 'Medicine', era: 3, cost: 560, req: ['writing', 'weaving'], desc: 'People live longer.' },
    // 4 Medieval
    { id: 'engineering', name: 'Engineering', era: 4, cost: 950, req: ['architecture', 'iron'], desc: 'Windmills and big works.' },
    { id: 'sailing', name: 'Sailing', era: 4, cost: 850, req: ['carpentry', 'mathematics'], desc: 'Boats for fishing and travel.' },
    { id: 'astronomy', name: 'Astronomy', era: 4, cost: 1000, req: ['mathematics'], desc: 'Universities.' },
    { id: 'printing', name: 'Printing Press', era: 4, cost: 1100, req: ['engineering', 'currency'], desc: 'Knowledge spreads quickly.' },
    // 5 Industrial
    { id: 'steam', name: 'Steam Power', era: 5, cost: 1800, req: ['engineering', 'iron'], desc: 'Engines!' },
    { id: 'industry', name: 'Industrialization', era: 5, cost: 2100, req: ['steam', 'printing'], desc: 'Factories and brick towns.' },
    { id: 'electricity', name: 'Electricity', era: 5, cost: 2400, req: ['steam', 'astronomy'], desc: 'Power plants, street lights.' },
    // 6 Modern
    { id: 'combustion', name: 'Combustion Engine', era: 6, cost: 3200, req: ['industry'], desc: 'Cars on the roads.' },
    { id: 'modern_medicine', name: 'Modern Medicine', era: 6, cost: 3300, req: ['medicine', 'electricity'], desc: 'Hospitals. Much longer lives.' },
    { id: 'skyscrapers', name: 'Steel & Concrete', era: 6, cost: 3600, req: ['industry', 'electricity'], desc: 'Apartment towers.' },
    { id: 'computers', name: 'Computers', era: 6, cost: 4200, req: ['electricity', 'mathematics'], desc: 'Research labs go digital.' },
    // 7 Space
    { id: 'rocketry', name: 'Rocketry', era: 7, cost: 6000, req: ['computers', 'combustion'], desc: 'Launch pads and rockets.' },
    { id: 'fusion', name: 'Fusion Power', era: 7, cost: 7000, req: ['computers', 'skyscrapers'], desc: 'Clean limitless energy.' },
    { id: 'ai', name: 'Artificial Intelligence', era: 7, cost: 8000, req: ['computers'], desc: 'Thinking machines help research.' },
    { id: 'starships', name: 'Starships', era: 7, cost: 12000, req: ['rocketry', 'fusion', 'ai'], desc: 'Colonists leave for the stars.' },
  ];
  // Later eras take longer to research.
  TECHS.forEach((t) => (t.cost = Math.round(t.cost * [1, 1, 1, 1.1, 1.35, 1.5, 1.6, 1.7][t.era])));
  const TECH = {};
  TECHS.forEach((t) => (TECH[t.id] = t));

  // Building catalogue. cost(era) -> {wood, stone, metal}; work = builder-seconds.
  const E = (era, arr) => arr[Math.min(era, arr.length - 1)];
  const BUILDINGS = {
    center: { w: 3, d: 3, name: 'Town Centre',
      cost: (e) => E(e, [{}, { wood: 15 }, { wood: 10, stone: 15 }, { wood: 10, stone: 25 }, { wood: 15, stone: 30, metal: 4 }, { stone: 40, metal: 10 }, { stone: 50, metal: 20 }, { stone: 60, metal: 35 }]),
      work: (e) => 15 + e * 10 },
    house: { w: 2, d: 2, name: 'House', tech: 'shelter',
      cost: (e) => E(e, [{ wood: 5 }, { wood: 12 }, { wood: 6, stone: 10 }, { wood: 6, stone: 14 }, { wood: 10, stone: 14, metal: 2 }, { stone: 20, metal: 5 }, { stone: 30, metal: 12 }, { stone: 40, metal: 20 }]),
      work: (e) => 8 + e * 4,
      capacity: (e) => (e <= 7 ? E(e, [3, 4, 5, 6, 6, 10, 18, 28]) : 28 + (e - 7) * 10) },
    field: { w: 3, d: 3, name: 'Farm Field', tech: 'agriculture', cost: () => ({ wood: 4 }), work: () => 6 },
    pasture: { w: 3, d: 3, name: 'Pasture', tech: 'husbandry', cost: () => ({ wood: 10 }), work: () => 8 },
    granary: { w: 2, d: 2, name: 'Granary', tech: 'pottery', cost: (e) => (e < 2 ? { wood: 15 } : { wood: 10, stone: 15 }), work: () => 14 },
    research: { w: 3, d: 3, name: 'Library', tech: 'writing', cost: (e) => E(e, [{}, {}, { wood: 15, stone: 20 }, { wood: 15, stone: 30 }, { wood: 20, stone: 40, metal: 5 }, { stone: 50, metal: 15 }, { stone: 60, metal: 30 }, { stone: 70, metal: 45 }]), work: (e) => 20 + e * 6 },
    smithy: { w: 2, d: 2, name: 'Smithy', tech: 'bronze', cost: () => ({ wood: 15, stone: 15 }), work: () => 16 },
    market: { w: 3, d: 3, name: 'Market', tech: 'currency', cost: () => ({ wood: 25, stone: 20 }), work: () => 22 },
    temple: { w: 3, d: 3, name: 'Temple', tech: 'architecture', cost: () => ({ stone: 50, metal: 4 }), work: () => 40 },
    windmill: { w: 2, d: 2, name: 'Windmill', tech: 'engineering', cost: () => ({ wood: 30, stone: 15, metal: 3 }), work: () => 25 },
    factory: { w: 3, d: 3, name: 'Factory', tech: 'industry', cost: () => ({ stone: 50, metal: 25 }), work: () => 45 },
    power: { w: 3, d: 3, name: 'Power Plant', tech: 'electricity', cost: () => ({ stone: 60, metal: 40 }), work: () => 55 },
    hospital: { w: 3, d: 3, name: 'Hospital', tech: 'modern_medicine', cost: () => ({ stone: 60, metal: 30 }), work: () => 50 },
    launchpad: { w: 4, d: 4, name: 'Launch Pad', tech: 'rocketry', cost: () => ({ stone: 80, metal: 80 }), work: () => 80 },
    reactor: { w: 3, d: 3, name: 'Fusion Reactor', tech: 'fusion', cost: () => ({ stone: 80, metal: 90 }), work: () => 90 },
  };

  // Research building name by era.
  const RESEARCH_NAMES = ['Elders\' Circle', 'Elders\' Circle', 'Library', 'Library', 'University', 'University', 'Laboratory', 'Research Campus', 'Quantum Institute'];
  const researchName = (e) => RESEARCH_NAMES[Math.min(e, RESEARCH_NAMES.length - 1)];
  const researchMult = (e) => [1, 1, 1.6, 1.8, 2.4, 2.7, 3.4, 4.5][Math.min(e, 7)] * (e > 7 ? 1 + 0.08 * Math.min(e - 7, 10) : 1);

  // ---------- Endless future technology ----------
  // After Starships the tree continues forever: a chain of ever-harder discoveries,
  // and every four of them opens a new age with new architecture.
  const FUTURE_NAMES = ['Nanotechnology', 'Arcologies', 'Space Elevators', 'Quantum Computing', 'Weather Control', 'Antimatter Engines',
    'Terraforming', 'Orbital Rings', 'Genetic Mastery', 'Mind-Machine Link', 'Dyson Swarms', 'Wormhole Theory', 'Matter Replication',
    'Stellar Engineering', 'Time Crystals', 'Hyperspace', 'Living Cities', 'Consciousness Transfer', 'Galactic Cartography', 'Star Lifting'];
  const FUTURE_AGES = ['Stellar Age', 'Galactic Age', 'Transcendent Age', 'Cosmic Age', 'Eternal Age'];
  const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
  const eraName = (e) => {
    if (e < ERAS.length) return ERAS[e];
    const k = e - ERAS.length;
    const base = FUTURE_AGES[k % FUTURE_AGES.length];
    const lap = Math.floor(k / FUTURE_AGES.length);
    return lap ? `${base} ${roman(lap + 1)}` : base;
  };
  const futureCache = {};
  function future(n) {
    if (futureCache[n]) return futureCache[n];
    const L = FUTURE_NAMES.length;
    const lap = Math.floor((n - 1) / L);
    const t = {
      id: 'f' + n, n, future: true,
      name: FUTURE_NAMES[(n - 1) % L] + (lap ? ' ' + roman(lap + 1) : ''),
      era: 8 + Math.floor((n - 1) / 5),
      cost: Math.round(16000 * Math.pow(1.13, n - 1)),
      req: [n === 1 ? 'starships' : 'f' + (n - 1)],
      desc: 'A leap beyond anything before it.',
    };
    return (futureCache[n] = t);
  }
  const tech = (id) => TECH[id] || (id && id[0] === 'f' && +id.slice(1) > 0 ? future(+id.slice(1)) : null);
  const futureCount = (known) => { let n = 0; while (known['f' + (n + 1)]) n++; return n; };
  // Everything a town could research next.
  const available = (known) => {
    const out = TECHS.filter((t) => !known[t.id] && t.req.every((r) => known[r]));
    if (known.starships) out.push(future(futureCount(known) + 1));
    return out;
  };

  G.TECHDATA = { ERAS, TECHS, TECH, BUILDINGS, RESEARCH_NAMES, researchName, researchMult, eraName, tech, future, futureCount, available };
})(typeof window !== 'undefined' ? window : globalThis);
