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
- `SPOTIFY_REDIRECT_URI` = where Spotify sends users after login (see below)

`.env` is gitignored so your secret stays local.

**Redirect URI (required for 30s previews):** In the [Spotify Dashboard](https://developer.spotify.com/dashboard) → your app → **Settings** → add a **Redirect URI**:

- **Local:** `http://127.0.0.1:3001/api/auth/callback`  
- **Vercel:** `https://YOUR-PROJECT.vercel.app/api/auth/callback`  

Set `SPOTIFY_REDIRECT_URI` in `.env` to that exact value.

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

### 3. Enable 30s previews (log in with Spotify)

Spotify only returns 30-second preview URLs when the request uses a **user token**, not the app-only (Client Credentials) token. So:

1. **Log in with Spotify** – On the app, click **“Log in”** next to “Log in with Spotify to play 30s previews.” You’ll be sent to Spotify, then back to the app.  
2. **Search and play** – After logging in, search for a song and click a result. Tracks that have previews will play the 30s clip and start the visualizer.

If you don’t log in, search still works but preview URLs will be missing (you’ll see “No preview” and can upload your own file instead).

- **No preview?** Some tracks have no preview in Spotify’s catalog. Click the track and **upload the same song** (MP3) in the card that appears to use that track’s BPM and energy for the visualizer.
- **Production (Vercel):** See **Deploy on Vercel** below.

See [PLAN.md](./PLAN.md) for architecture.

## Deploy on Vercel

The repo includes a serverless API at `api/search.js`, so you can deploy frontend and Spotify proxy together.

1. **Push your code** to GitHub and import the project in [Vercel](https://vercel.com).
2. **Add environment variables** in the Vercel project: **Settings → Environment Variables**
   - `SPOTIFY_CLIENT_ID` = your Spotify app Client ID  
   - `SPOTIFY_CLIENT_SECRET` = your Spotify app Client Secret  
   - `SPOTIFY_REDIRECT_URI` = `https://YOUR-PROJECT.vercel.app/api/auth/callback` (replace with your Vercel URL)  
   Add that same URL as a **Redirect URI** in your [Spotify app settings](https://developer.spotify.com/dashboard).
3. **Deploy.** Vercel will build the frontend and host `/api/search` and `/api/auth/login`, `/api/auth/callback` on the same domain. Users can log in with Spotify to get 30s previews.

## Stack

- **Vite** + **TypeScript**
- **Three.js** for 3D visuals
- **Web Audio API** for playback and FFT analysis
