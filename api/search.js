/**
 * Vercel serverless: GET /api/search?q=...
 * Spotify proxy (Client Credentials + search + audio features + preview_url).
 * Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel project Environment Variables.
 */

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API = 'https://api.spotify.com/v1';

async function getToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in Vercel env');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(SPOTIFY_ACCOUNTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function searchTracks(token, q, market = 'US') {
  const params = new URLSearchParams({
    q: String(q).trim(),
    type: 'track',
    limit: 10,
    market: market || 'US',
  });
  const res = await fetch(`${SPOTIFY_API}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
  const data = await res.json();
  return data.tracks?.items ?? [];
}

async function getAudioFeatures(token, ids) {
  if (ids.length === 0) return [];
  const res = await fetch(`${SPOTIFY_API}/audio-features?ids=${ids.slice(0, 100).join(',')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.audio_features ?? [];
}

async function getArtists(token, ids) {
  if (ids.length === 0) return [];
  const res = await fetch(`${SPOTIFY_API}/artists?ids=${ids.slice(0, 50).join(',')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists ?? [];
}

async function buildResponse(token, tracks) {
  if (tracks.length === 0) return { tracks: [] };
  const trackIds = tracks.map((t) => t.id).filter(Boolean);
  const artistIds = [...new Set(tracks.flatMap((t) => (t.artists || []).map((a) => a.id).filter(Boolean)))];
  const [featuresList, artistsList] = await Promise.all([
    getAudioFeatures(token, trackIds),
    getArtists(token, artistIds),
  ]);
  const featuresById = {};
  for (const f of featuresList) {
    if (f && f.id) featuresById[f.id] = f;
  }
  const genresByArtistId = {};
  for (const a of artistsList) {
    if (a && a.id) genresByArtistId[a.id] = a.genres || [];
  }
  return {
    tracks: tracks.map((t) => {
      const feat = featuresById[t.id];
      const artistNames = (t.artists || []).map((a) => a.name).filter(Boolean);
      const genres = [...new Set((t.artists || []).flatMap((a) => genresByArtistId[a.id] || []))];
      return {
        id: t.id,
        name: t.name || 'Unknown',
        artist: artistNames.join(', ') || 'Unknown',
        previewUrl: t.preview_url || null,
        bpm: feat && typeof feat.tempo === 'number' ? Math.round(feat.tempo) : 120,
        energy: feat && typeof feat.energy === 'number' ? feat.energy : 0.5,
        valence: feat && typeof feat.valence === 'number' ? feat.valence : 0.5,
        genres,
      };
    }),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  const market = ((req.query.market || process.env.SPOTIFY_MARKET || 'US') + '').toUpperCase().slice(0, 2);

  try {
    const token = await getToken();
    const tracks = await searchTracks(token, q, market);
    const body = await buildResponse(token, tracks);
    return res.status(200).json(body);
  } catch (err) {
    console.error('Spotify API error:', err.message);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}
