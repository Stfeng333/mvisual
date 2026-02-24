/**
 * MVisual search proxy backend (local dev only).
 * Production uses Vercel serverless functions in /api.
 *
 * Search is powered by the free Deezer API — no credentials required.
 * Run: node server/index.js  (or npm run server)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const DEEZER_API = 'https://api.deezer.com';

function mapDeezerTrack(t) {
  const bpm = t.bpm && t.bpm > 0 ? Math.round(t.bpm) : 120;
  let energy = 0.6;
  if (typeof t.gain === 'number') {
    energy = Math.min(0.9, Math.max(0.2, (t.gain + 18) / 24));
  }
  return {
    id: String(t.id),
    name: t.title || t.title_short || 'Unknown',
    artist: t.artist?.name || 'Unknown',
    previewUrl: t.preview || null,
    bpm,
    energy,
    valence: 0.5,
    genres: [],
  };
}

/**
 * GET /api/search?q=...
 * Proxies Deezer public search API. No credentials needed.
 */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }
  try {
    const params = new URLSearchParams({ q, limit: '10', output: 'json' });
    const deezerRes = await fetch(`${DEEZER_API}/search?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!deezerRes.ok) throw new Error(`Deezer returned ${deezerRes.status}`);
    const data = await deezerRes.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const tracks = (data.data ?? []).map(mapDeezerTrack);
    res.json({ tracks });
  } catch (err) {
    console.error('Deezer search error:', err.message);
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

app.listen(PORT, () => {
  console.log(`MVisual API running at http://localhost:${PORT}/api`);
});
