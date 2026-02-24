# MVisual

A real-time music visualizer built with Three.js and the Web Audio API. Search for any song or upload a local audio file

---

## Running locally

Two terminals are required: one for the Express proxy backend, one for the Vite frontend dev server.

**Step 1 — Install dependencies (once):**
```bash
npm install
```

**Step 2 — Start the backend proxy:**
```bash
npm run server
```
You should see: `MVisual API running at http://localhost:3001/api`

**Step 3 — Start the frontend (new terminal):**
```bash
npm run dev
```

Open the URL shown in your terminal (typically `http://localhost:5173`). Vite proxies all `/api` requests to port 3001 automatically — no manual CORS setup needed.

**Build for production:**
```bash
npm run build
```
Output goes to `dist/`. Preview the production build with `npm run preview`.

---

## Why Spotify was not used

Spotify was the obvious first choice for track search and audio previews. However, in **November 2024** Spotify deprecated and removed two critical API endpoints:

- **`preview_url`** — the 30-second MP3 preview that made in-browser playback possible without a Spotify Premium account.
- **`audio-features`** — BPM, energy, valence, danceability, and other per-track analytics that would have been the backbone of the visualizer's reactivity.

Because of that, the project diverged to using Deezer API

**Deezer** was chosen as the replacement since it's public search API requires no credentials, returns 30-second MP3 preview URLs that still work, and includes BPM and gain metadata per track.

---

## Tech stack

| Layer | Technology |
|---|---|
| Build tool | [Vite 8](https://vitejs.dev) |
| Language | TypeScript 5 |
| 3D / GPU rendering | [Three.js](https://threejs.org) (WebGL, ShaderMaterial, GLSL) |
| Audio analysis | [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — `AnalyserNode`, FFT |
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
│   ├── main.ts            # App entry point
│   ├── landing.ts         # Search UI, file upload, track card rendering
│   ├── style.css          # Global styles
│   ├── audio/
│   │   └── player.ts      # Web Audio context, AnalyserNode, playback control
│   └── visualizer/
│       ├── scene.ts       # Three.js scene, orthographic camera, renderer setup
│       ├── loop.ts        # Render loop — ticks effects and reads FFT each frame
│       ├── effects.ts     # Beat-reactive particle system (smoke, jets, shockwaves)
│       └── vocal.ts       # Vocal-reactive aurora ribbon effect (GLSL shader)
├── public/                # Static assets
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## No credentials, no accounts needed

Running locally or deploying to Vercel requires zero API keys, tokens, or sign-ups. The Deezer public search endpoint (`https://api.deezer.com/search`) is open and rate-limited only by IP at generous thresholds for personal use.
