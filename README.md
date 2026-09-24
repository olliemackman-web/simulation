# Pixel World

A 3D voxel world that runs itself. Little people forage, build, farm, research, raise families and found new towns. Over time they work their way from campfires in the Stone Age to skyscrapers, rockets and starships. You don't have to do anything. Just watch.

## Watch it

**Live: https://olliemackman-web.github.io/simulation/** works on desktop and phones. On a phone, use your browser's *Add to Home Screen* option to get it full-screen.

On a phone: drag with one finger to look around, pinch to zoom, drag with two fingers to pan, and tap a person to follow them. The 📊 button opens the towns and stats panel.

To run it locally instead, open `index.html` in a browser (Chrome, Edge, Firefox or Safari). That's it. No install and no build step. Three.js loads from a CDN, so you need an internet connection.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

The world autosaves to your browser every 30 seconds, so closing the tab doesn't lose your civilisation.

## What's going on

It never ends. There's no final tech and no finished state. Progress keeps going, slows down as it gets harder, and gets knocked back by disasters.

- **People** get hungry, eat, sleep at night, pair up, have children, get sick, grow old and die.
- **Evolution**: every person inherits strength, intellect, constitution and curiosity from their parents, with small random changes. Fitter people are more likely to find partners and have more children, and frail babies are less likely to survive. Now and then a newborn gets a brand-new **mutation**: long-lived, genius, mighty, plague-resistant, fertile, cold-hardy, swift, giant (they're visibly bigger), frail or slow-witted. Helpful mutations spread through the population over generations and harmful ones die out. Ice ages favour the cold-hardy.
- **Work** is decided by each town's needs: gathering food, chopping wood, quarrying stone, mining ore, building, research, trade and, in wartime, fighting.
- **Technology never runs out.** First there are 36 technologies across 8 eras, from the Stone Age to the Space Age. After Starships it keeps going with an endless chain of future discoveries (Nanotechnology, Space Elevators, Dyson Swarms, Wormhole Theory…). Each one is harder than the last, and every five open a new age (Stellar, Galactic, Transcendent, Cosmic, Eternal, then Stellar II…).
- **Architecture evolves** from huts to log cabins, stone villas, timber frames, brick terraces, apartment blocks, glass towers, then tiered arcologies with sky gardens, floating crowns and halo rings. Town centres become space elevators that climb out of sight.
- **Setbacks**:
  - **Climate** swings between ice ages (snow creeps down the mountains, harvests shrink, people get hungrier) and warm ages.
  - **Wars** break out between crowded or hungry neighbours. Soldiers march, raid food and burn buildings. Wars end in peace or conquest.
  - **Dark ages** follow catastrophic population loss. Towns can forget technologies and have to rediscover them.
  - Wildfires, plagues, droughts and earthquakes.
- **Ruins and resettlement**: abandoned towns crumble over the years, and new settlers eventually build on the land.
- **Beyond the island**: starships found colonies on other worlds. Those colonies grow, send back discoveries, and sometimes send ships home with star-born settlers who carry new mutations. If life on the island ever dies out completely, a ship returns from the stars to restart civilisation with its lost knowledge. With no colonies, wanderers arrive from across the sea instead.
- **Roads** aren't planned. Footpaths wear in wherever people walk, and later get paved.

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

At the default 2× speed a year passes every 30 seconds. The Space Age usually arrives after 35–45 minutes. After that, new ages keep arriving more and more slowly.

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
