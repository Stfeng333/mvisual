# MVisual

A real-time music visualizer that synchronizes visual effects with the beats and vocals of a song. Fractal lightning bolts fire on transients, neon waveform lanes pulse and shift color with high beats, and the whole palette evolves with the energy of the track.
Search for any song via Deezer or upload a local audio file to get started.

---

## Running locally

**1. Install dependencies (once)**
```bash
npm install
```

**2. Start the backend proxy** (proxies Deezer search to avoid CORS)
```bash
npm run server
```
Expected output: `MVisual API running at http://localhost:3001/api`

**3. Start the frontend** (new terminal)
```bash
npm run dev
```
Open `http://localhost:5173`. Vite automatically proxies `/api` requests to port 3001.

**Production build**
```bash
npm run build   # output → dist/
npm run preview # preview the built output locally
```
Deploying to Vercel works out of the box — `api/search.js` is picked up as a serverless function.

---

## Why Spotify was not used

Spotify was the obvious first choice for track search and audio previews. In **November 2024**, Spotify deprecated two critical API endpoints:

- **`preview_url`** — the 30-second MP3 preview needed for in-browser playback without a Premium account.
- **`audio-features`** — per-track BPM, energy, and valence that would have driven the visualizer's reactivity.

**Deezer** was chosen as the replacement. Its public search API requires no credentials, still returns working 30-second MP3 preview URLs, and includes BPM and gain metadata per track.

---

## Legal

- **Audio previews** are 30-second clips served directly from Deezer's CDN under their public API terms. No audio is stored or redistributed by this project.
- **No Spotify content** is used or accessed.
- This project is for personal and educational use. Deezer's public API is rate-limited by IP and is free for non-commercial use per their [API terms](https://developers.deezer.com/termsofuse).

---

## Tech stack

| Layer | Technology |
|---|---|
| Build tool | [Vite 8](https://vitejs.dev) |
| Language | TypeScript 5 |
| 3D / GPU rendering | [Three.js](https://threejs.org) — WebGL, RawShaderMaterial, GLSL |
| Audio analysis | [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — `AnalyserNode`, FFT 2048 |
| Track search & previews | [Deezer public API](https://developers.deezer.com/api) — no auth required |
| Local dev proxy | Express 4 |
| Production proxy | Vercel serverless functions |

---

## Project structure

```
├── api/
│   └── search.js          # Vercel serverless function — Deezer search proxy
├── server/
│   └── index.js           # Express dev server — same proxy logic for local use
├── src/
│   ├── main.ts            # App entry point — wires landing → visualizer
│   ├── landing.ts         # Search UI, file upload, Deezer track card rendering
│   ├── style.css          # Global styles
│   ├── audio/
│   │   └── player.ts      # Web Audio context, AnalyserNode, playback control
│   └── visualizer/
│       ├── scene.ts       # Three.js scene, orthographic camera, renderer setup
│       ├── loop.ts        # Render loop — reads FFT and ticks effects each frame
│       ├── effects.ts     # Orchestrator — drop detection, hue drift, coordinates sub-systems
│       ├── lightning.ts   # Fractal lightning renderer — beat-synced branching bolts (GLSL)
│       └── vocal.ts       # Neon waveform lanes — vocal/beat reactive, color-shifting (GLSL)
├── public/                # Static assets
├── index.html
├── vite.config.ts
└── tsconfig.json
```
