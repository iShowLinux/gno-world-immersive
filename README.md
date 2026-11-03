# GNO.WORLD — Immersive

Standalone, self-contained Three.js experience: a high-resolution lunar surface
and a walkable space station interior with an EVA mode. Built as a portable
reference for gno.world developers — no build step, no binary art assets, no
network calls. Everything (terrain, textures, sky, station) is generated
procedurally in the browser.

## Run it

Any static file server works. From this directory:

```sh
python -m http.server 8080
# or: npx serve .
```

Then open <http://localhost:8080>.

ES modules require http(s) — opening `index.html` straight from disk won't work.

## Controls

| Input | Action |
| --- | --- |
| Click | Capture the mouse (pointer lock) |
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint (Moon) / fast thrust (EVA) |
| `Space` | Jump on the Moon; thrust up in EVA |
| `E` | Enter / leave the airlock (ISS, at the aft hatch) |
| `1` / `2` | Switch between Moon and ISS |
| `Esc` | Release the mouse |

## Scenes

**Moon** — 1 km of procedural terrain at 512×512 segments, a 320-crater field
seeded deterministically, 2K albedo with vector-drawn crater rims and a derived
normal map. Earth hangs over the horizon with a cloud layer and atmosphere rim;
a landed module, a flag, scattered rocks and drifting dust fill the scene.
Gravity is the real lunar 1.62 m/s².

**ISS** — a 14 m pressurized module with panel walls, equipment racks,
handrails, ceiling lights and a floor. Three portholes are real openings punched
through the wall geometry (the glass sits in the hole), and a nadir window in
the floor near the forward end looks straight down at Earth — stand over it and
look down. Walk to the aft hatch and press `E` to step outside: zero-g drift
around the truss, solar wings and radiators with Earth filling the sky.

## How it's built

```
index.html          shell + import map
css/style.css       overlay and HUD
js/
  main.js           renderer, camera, pointer lock, input, scene switching
  moon.js           terrain heightfield, crater grid, props, lunar controller
  iss.js            module interior, punched-wall geometry, EVA controller
  textures.js       canvas-generated albedo/normal/sky/station textures
  noise.js          deterministic value noise + fBm (2D and 3D)
  vendor/           three.js r160 + PointerLockControls (vendored, offline)
```

No frameworks, no bundler. `three` is resolved through an import map to the
vendored module, so the repo works offline and can be dropped into any static
host or an existing page.

## Bringing it to gno.world

The globe on gno.world is already a Three.js scene, so these scenes can be added
as new views:

- Mount `index.html` as a standalone page (or an iframe) behind an "Enter" action.
- Or import `js/moon.js` / `js/iss.js` and add their scenes to the existing
  globe's scene graph — both export `buildMoon()` / `buildISS()` returning
  `{ scene, start(camera), update(dt, input, camera) }`.
- The camera and renderer are the only shared objects; nothing else is global.

## Performance notes

Terrain and textures are generated once at load (a few seconds on first paint —
the overlay shows the status). The moon scene is ~524 k triangles; the ISS is
light. Both run at 60 fps on an M-series laptop or a current phone. Shadow maps
are 2048² and follow the player.

## License

MIT — do what you want with it.
