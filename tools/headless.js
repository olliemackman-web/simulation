// Runs the simulation without graphics for balance testing: node tools/headless.js [years] [seed]
require('../js/util.js'); require('../js/tech.js'); require('../js/world.js'); require('../js/sim.js');
const years = +process.argv[2] || 60, seed = +process.argv[3] || 1234;
const S = SIM.create(seed);
const dt = 0.1, t0 = Date.now();
let lastLog = 0;
for (let y = 1; y <= years; y++) {
  for (let k = 0; k < SIM.YEAR / dt; k++) step();
  if (y % 5 === 0) {
    const alive = S.settlements.filter((s) => s.alive);
    console.log(`Y${y} pop=${S.people.length} towns=${alive.length} bld=${S.buildings.length} era=${S.globalEra} ` +
      alive.map((s) => `${s.name}[p${s.pop} e${s.era} t${Object.keys(s.known).length} f${s.stock.food|0} w${s.stock.wood|0} s${s.stock.stone|0} m${s.stock.metal|0} ${s.research ? s.research.id + ':' + (s.research.rp|0) : '-'} want:${s.wanted?.type||'-'}]`).join(' '));
  }
}
function step() {
  SIM.step(S, dt);
  S.fx.tiles.clear(); S.fx.bld.clear(); S.fx.removed.length = 0;
  for (const e of S.fx.events) if (e.big || e.kind === 'tech') console.log(`  [Y${e.y}] ${e.text}`);
  S.fx.events.length = 0;
}
const roads = S.world.road.reduce((a, r) => a + (r ? 1 : 0), 0);
console.log('roads', roads, 'births', S.stats.births, 'deaths', S.stats.deaths, 'animals', S.animals.length, 'time', Date.now() - t0, 'ms');
console.log('history tail', S.history.slice(-2));
console.log('save size', SIM.serialize(S).length);
