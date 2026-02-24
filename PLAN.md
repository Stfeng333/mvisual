# MVisual – Plan & Tools

## What We’re Building

- **Landing**: Futuristic, mostly black screen; title **MVisual**; centered search bar to choose a song.
- **Visualizer**: After a song is chosen, full-screen black with high-quality visuals driven by the track’s **genre**, **BPM**, and **energy** (reactive and more complex than a simple NCS-style bubble).

---

## Legal Way to Access Music

We use two approaches, both legal:

1. **User upload (recommended, no keys)**  
   User selects an audio file from their device. We never host or stream; we only analyze in the browser with the Web Audio API. No copyright issues.

2. **Spotify (optional)**  
   - Use **Spotify Web API** for **search** and **audio features** (BPM, energy, danceability, valence, etc.).  
   - Use **30-second preview URLs** from the API for playback (allowed by Spotify’s terms).  
   - We do **not** stream full tracks; for full-length songs we rely on “upload your file” or the 30s preview only.  
   - **Catch:** The API needs a **Client ID** and **Client Secret**. The secret cannot live in the frontend. So “Spotify search” requires a small **backend** (e.g. serverless function) that you run and that calls Spotify; the app will call your backend. Details below.

---

## Tools You Need (All Free)

| Tool | Purpose | Where to get it |
|------|--------|------------------|
| **Node.js** | Run `npm`, Vite, build | [nodejs.org](https://nodejs.org) (LTS) |
| **Browser** | Test (Chrome/Edge recommended for Web Audio + WebGL) | Already have |
| **Web Audio API** | Analyze audio (waveform, FFT, reactivity) | Built into the browser |
| **Three.js** | 3D / canvas visuals | Already installed |
| **Spotify for Developers** (optional) | Search + BPM/energy/genre for tracks | [developer.spotify.com](https://developer.spotify.com) → Dashboard → Create App → Client ID + Client Secret |
| **Backend for Spotify** (optional) | Hide Client Secret, proxy API calls | e.g. Vercel / Netlify serverless function, or any small Node server |

You do **not** need to download anything else for the core app (upload + visualizer). Spotify + backend are only for the optional “search by song name” flow.

---

## Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────┐
│  Landing (futuristic black UI)                               │
│  - Title: "MVisual"                                          │
│  - Search bar (Spotify search when backend configured)       │
│  - "Or upload your own file"                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Song chosen (from search or file)                           │
│  - Audio: preview URL (Spotify) or file (upload)             │
│  - Metadata: BPM, energy, genres (from Spotify or estimated)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Visualizer (full-screen black)                              │
│  - Three.js scene                                            │
│  - Web Audio AnalyserNode → FFT / time domain                │
│  - Effects driven by: BPM, energy, genre, real-time levels   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps (Order)

1. **Landing page** – Black futuristic layout, “MVisual” title, search bar, upload option.  
2. **Audio pipeline** – Playback from file or preview URL; connect to `AudioContext` and `AnalyserNode`.  
3. **Visualizer shell** – Three.js full-screen scene, render loop, basic reactive shape (e.g. sphere or particles) driven by FFT.  
4. **Metadata-driven effects** – Use BPM (tempo), energy, and genre to pick or blend effects (e.g. speed of pulses, color palette, intensity).  
5. **Spotify (optional)** – Backend that uses Client ID + Secret; frontend calls backend for search + audio features + preview URL.

---

## Your Action Items (When You Want Spotify Search)

1. Go to [Spotify for Developers](https://developer.spotify.com/dashboard).  
2. Log in (or create account).  
3. **Create an app** → note **Client ID** and **Client Secret**.  
4. Add **Redirect URI** if you use OAuth (e.g. `http://localhost:5173/callback` for dev). For “app-only” (search + features + preview), **Client Credentials** flow is enough and only the backend needs the secret.  
5. Later: add a small backend (e.g. Vercel serverless) that:  
   - Gets a token with Client ID + Client Secret.  
   - Proxies search and “get audio features” (and optionally “get track” for preview URL).  
   - Returns JSON to the frontend; frontend never sees the secret.

Until then, the app works fully with **“Upload your own file”**.

---

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

We’ll implement in this order and wire everything step by step.
