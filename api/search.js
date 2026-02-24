/**
 * Vercel serverless: GET /api/search?q=...
 *
 * Uses the Deezer public API for track search and 30-second preview URLs.
 * Deezer requires no authentication and preview_url is still fully supported.
 *
 * NOTE: Spotify deprecated preview_url (Nov 2024) and audio-features (Nov 2024),
 * so Deezer is the only reliable free source for 30s previews as of early 2025.
 *
 * Deezer docs: https://developers.deezer.com/api/search
 */

const DEEZER_API = 'https://api.deezer.com';

/**
 * Search Deezer for tracks matching the query.
 * Returns the raw Deezer track objects.
 */
async function searchDeezer(q, limit = 10) {
  const params = new URLSearchParams({
    q: String(q).trim(),
    limit: String(limit),
    output: 'json',
  });
  const res = await fetch(`${DEEZER_API}/search?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Deezer search failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Deezer error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.data ?? [];
}

/**
 * Map a raw Deezer track to the shape the frontend expects.
 * Deezer track fields used:
 *   id, title, artist.name, preview (30s mp3 URL), bpm, gain
 */
function mapDeezerTrack(t) {
  // Deezer includes bpm when known; fall back to 120.
  const bpm = t.bpm && t.bpm > 0 ? Math.round(t.bpm) : 120;

  // Deezer's `gain` is a loudness value in dB (typically -15 to 5).
  // Normalise it to an approximate 0–1 energy proxy so the visualizer
  // behaves sensibly even without Spotify audio features.
  let energy = 0.6;
  if (typeof t.gain === 'number') {
    // gain range roughly -18 to +6; map to 0.2–0.9
    energy = Math.min(0.9, Math.max(0.2, (t.gain + 18) / 24));
  }

  return {
    id: String(t.id),
    name: t.title || t.title_short || 'Unknown',
    artist: t.artist?.name || 'Unknown',
    previewUrl: t.preview || null,   // direct 30s mp3, CORS-enabled
    bpm,
    energy,
    valence: 0.5,  // Deezer has no valence equivalent; use neutral default
    genres: [],    // Deezer genre requires a separate /genre call; skip for now
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });

  try {
    const raw = await searchDeezer(q, 10);
    const tracks = raw.map(mapDeezerTrack);
    return res.status(200).json({ tracks });
  } catch (err) {
    console.error('Deezer search error:', err.message);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}
