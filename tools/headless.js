// Runs the simulation without graphics for balance testing: node tools/headless.js [years] [seed] [every] [quiet]
require('../js/util.js'); require('../js/tech.js'); require('../js/world.js'); require('../js/sim.js');
const years = +process.argv[2] || 60, seed = +process.argv[3] || 1234, every = +process.argv[4] || 10, quiet = process.argv[5] === 'q';
const S = SIM.create(seed);
const dt = 0.1, t0 = Date.now();
const kinds = {};
for (let y = 1; y <= years; y++) {
  for (let k = 0; k < SIM.YEAR / dt; k++) step();
  if (y % every === 0) {
    const alive = S.settlements.filter((s) => s.alive);
    const h = S.history[S.history.length - 1] || {};
    const muts = h.mut ? Object.entries(h.mut).filter(([, v]) => v > 0.02).map(([k, v]) => `${k}:${Math.round(v * 100)}%`).join(' ') : '';
    console.log(`Y${y} pop=${S.people.length} towns=${alive.length} era=${S.globalEra} maxTech=${Math.max(0, ...alive.map((s) => Object.keys(s.known).length))} temp=${S.climate.temp.toFixed(2)} wars=${S.wars.length} colonies=${S.colonies.length} int=${h.int} con=${h.con} str=${h.str} ${muts}`);
  }
}
function step() {
  SIM.step(S, dt);
  S.fx.tiles.clear(); S.fx.bld.clear(); S.fx.removed.length = 0;
  for (const e of S.fx.events) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; if (!quiet && (e.big || e.kind === 'era') && e.kind !== 'tech') console.log(`  [Y${e.y}] ${e.text}`); }
  S.fx.events.length = 0;
}
console.log('events', kinds, 'stats', S.stats, 'time', Date.now() - t0, 'ms', 'save', SIM.serialize(S).length);
