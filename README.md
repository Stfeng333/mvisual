# MVisual

Futuristic music visualizer: pick a song (upload your file or, with a backend, search via Spotify), then watch visuals driven by BPM, energy, and real-time audio.

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Use **“Or upload your own file”** to choose an audio file and start the visualizer.

## Legal music

- **Upload your own file** – Always legal; audio is analyzed in the browser only.
- **Spotify search** – Optional. Uses 30-second preview URLs and metadata (BPM, energy, etc.) from the Spotify Web API. Requires a small backend (see [PLAN.md](./PLAN.md)).

## Complete Spotify search setup

You already have **Client ID** and **Client Secret** from the [Spotify for Developers](https://developer.spotify.com/dashboard) dashboard. Finish setup in three steps:

### 1. Add your credentials (never commit them)

In the project root, copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `SPOTIFY_CLIENT_ID` = your app’s Client ID  
- `SPOTIFY_CLIENT_SECRET` = your app’s Client Secret  

`.env` is gitignored so your secret stays local.

### 2. Install dependencies and run both apps

```bash
npm install
```

Then run **two terminals**:

**Terminal 1 – backend (Spotify proxy):**

```bash
npm run server
```

You should see: `MVisual Spotify API running at http://localhost:3001/api`

**Terminal 2 – frontend:**

```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). The dev server proxies `/api` to the backend, so the search bar will use your backend automatically.

### 3. Try it

Type a song or artist in the search bar. Results come from Spotify (track name, artist, 30s preview, BPM, energy, valence, genres). Click a track to start the visualizer with the preview.

- **No preview?** Tracks marked “No preview” can still be visualized: click the track, then **upload the same song** (MP3) in the card that appears. The app uses that track’s BPM and energy from Spotify to drive the visuals.
- **Production (Vercel):** See **Deploy on Vercel** below.

See [PLAN.md](./PLAN.md) for architecture.

## Deploy on Vercel

The repo includes a serverless API at `api/search.js`, so you can deploy frontend and Spotify proxy together.

1. **Push your code** to GitHub and import the project in [Vercel](https://vercel.com).
2. **Add environment variables** in the Vercel project: **Settings → Environment Variables**
   - `SPOTIFY_CLIENT_ID` = your Spotify app Client ID  
   - `SPOTIFY_CLIENT_SECRET` = your Spotify app Client Secret  
   (Use the same values as in your local `.env`.)
3. **Deploy.** Vercel will build the frontend and host `/api/search` on the same domain. The app is already configured to use `/api` in production, so search works without extra setup.

## Stack

- **Vite** + **TypeScript**
- **Three.js** for 3D visuals
- **Web Audio API** for playback and FFT analysis
