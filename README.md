# Pixel World

A 3D voxel world that runs itself. Little people forage, build, farm, research, raise families and found new towns. Over time they work their way from campfires in the Stone Age to skyscrapers, rockets and starships. You don't have to do anything. Just watch.

## Run it

Open `index.html` in a browser (Chrome, Edge, Firefox or Safari). That's it. No install and no build step. Three.js loads from a CDN, so you need an internet connection.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

The world autosaves to your browser every 30 seconds, so closing the tab doesn't lose your civilisation.

## What's going on

- **People** get hungry, eat, sleep at night, pair up, have children, get sick, grow old and die. Each person has inherited traits (strength, intellect, constitution, curiosity) that mutate a little every generation, so the population slowly evolves. Skills improve with practice, and children pick up some of their parents' know-how.
- **Work** is decided by each town's needs: gathering food (berries, hunting, fishing, farms, pastures), chopping wood, quarrying stone, mining ore, building, research and trade.
- **Technology**: 38 techs across 8 eras (Stone, Tribal, Bronze, Iron, Medieval, Industrial, Modern, Space). Research comes from thinkers, learning by doing and "eureka" moments. Ideas also spread between neighbouring towns and along trade routes.
- **Building**: towns plan and construct houses, farms, granaries, libraries, markets, temples, windmills, factories, power plants, hospitals, fusion reactors and launch pads. Old buildings get rebuilt in the style of each new era.
- **Roads** aren't planned. Footpaths wear in wherever people walk a lot, and later get paved with stone and then asphalt.
- **Colonies**: when a town grows big enough, some families leave to found a new settlement.
- **Events**: wildfires, plagues, droughts, bountiful harvests and wandering strangers.
- **Endgame**: rocket launches, then starships carrying colonists off-world.

## Controls (all optional)

| | |
|---|---|
| Auto camera | On by default. It flies between towns, follows people and jumps to big events |
| Drag / right-drag / scroll | Orbit / pan / zoom (auto camera comes back after 90 s idle) |
| Click a person | Follow them and see their traits, skills and thoughts |
| Click a town in the list | Fly there |
| `Space`, `1`–`5` | Pause, speed 1× / 2× / 5× / 15× / 40× |
| `C` | Toggle the auto camera |
| New world | Start over with a freshly generated island |

At the default 2× speed a year passes every 30 seconds. The Space Age usually arrives after about 35–45 minutes.

## Code

| File | What it does |
|---|---|
| `js/sim.js` | The simulation: people, jobs, families, towns, research, colonies, events |
| `js/tech.js` | Tech tree and building catalogue |
| `js/world.js` | Island terrain generation |
| `js/models.js` | Voxel models for every building in every era |
| `js/render.js` | Three.js instanced renderer, day/night, smoke, rockets |
| `js/camera.js` | Cinematic auto-director and orbit controls |
| `js/ui.js`, `js/main.js` | HUD, main loop, autosave |
| `tools/headless.js` | Runs the sim without graphics for balance testing: `node tools/headless.js 100` |
