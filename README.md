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

## Optional: Spotify search

1. Create an app at [Spotify for Developers](https://developer.spotify.com/dashboard) and get **Client ID** and **Client Secret**.
2. Build a backend that:
   - Uses Client Credentials to get an access token.
   - Proxies `GET /search?q=...` and returns track list with `previewUrl`, `bpm`, `energy`, `valence`, `genres`.
3. In the browser console (or in code before loading the app), set your backend base URL:

   ```js
   window.__MVISUAL_SPOTIFY_API__ = 'https://your-backend.vercel.app/api';
   ```

   Then reload. The search bar will call `GET ${__MVISUAL_SPOTIFY_API__}/search?q=...` and expect JSON like:

   ```json
   {
     "tracks": [
       {
         "id": "spotify-track-id",
         "name": "Track Name",
         "artist": "Artist Name",
         "previewUrl": "https://p.scdn.co/...",
         "bpm": 128,
         "energy": 0.8,
         "valence": 0.6,
         "genres": ["edm", "house"]
       }
     ]
   }
   ```

See [PLAN.md](./PLAN.md) for full architecture and tool list.

## Stack

- **Vite** + **TypeScript**
- **Three.js** for 3D visuals
- **Web Audio API** for playback and FFT analysis
