## Repo Structure (Target)

```
mvisual/
├── index.html
├── src/
│   ├── main.ts              # Entry: mount landing or visualizer
│   ├── style.css            # Global + futuristic black theme
│   ├── landing.ts           # Landing UI + search + file input
│   ├── audio/
│   │   ├── player.ts        # Play file or URL, AudioContext, AnalyserNode
│   │   └── metadata.ts     # BPM/energy/genre (from Spotify or placeholders for file)
│   ├── api/
│   │   └── spotify.ts       # Calls your backend for search + features (optional)
│   └── visualizer/
│       ├── scene.ts         # Three.js scene, camera, renderer
│       ├── effects.ts       # Effect presets (e.g. by genre/BPM/energy)
│       └── loop.ts          # Render loop, connect analyser → effect params
├── PLAN.md
└── package.json
```
