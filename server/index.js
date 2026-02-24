/**
 * MVisual Spotify proxy backend.
 * Keeps Client ID and Client Secret server-side; frontend calls this for search.
 *
 * Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env (see .env.example).
 * Run: node server/index.js  (or npm run server)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getToken, searchTracks, buildSearchResponse } from './spotify.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

/**
 * GET /api/search?q=...
 * Returns { tracks: [{ id, name, artist, previewUrl, bpm, energy, valence, genres }] }
 */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  try {
    const token = await getToken();
    const tracks = await searchTracks(token, q);
    const payload = await buildSearchResponse(token, tracks);
    res.json(payload);
  } catch (err) {
    console.error('Spotify search error:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Search failed',
    });
  }
});

app.listen(PORT, () => {
  console.log(`MVisual Spotify API running at http://localhost:${PORT}/api`);
});
