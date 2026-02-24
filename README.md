# MVisual

Futuristic music visualizer. Search for a song or upload your own file — visuals react to BPM, energy, and real-time audio.

## Run locally

Two terminals are required: one for the API backend, one for the frontend dev server.

**Terminal 1 — backend:**
```bash
npm install
npm run server
```
You should see: `MVisual API running at http://localhost:3001/api`

**Terminal 2 — frontend:**
```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). The Vite dev server proxies `/api` to the backend automatically.

## How it works

- **Search** — Type a song name. The backend queries the [Deezer public API](https://developers.deezer.com/api) (no credentials required) and returns results with 30s preview URLs. Click a result to play and visualize.
- **Upload** — Pick any local audio file. Audio is analyzed in the browser only; nothing is uploaded anywhere.

## Deploy on Vercel

1. Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
2. Deploy. The `api/search.js` serverless function is picked up automatically — no environment variables needed.

## Stack

- **Vite** + **TypeScript**
- **Three.js** for 3D visuals
- **Web Audio API** for real-time FFT analysis
- **Deezer API** for track search and 30s previews
