/**
 * Spotify Web API: token (Client Credentials) and search + audio features.
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in env.
 */

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API = 'https://api.spotify.com/v1';

let cachedToken = null;
let tokenExpiry = 0;

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw Object.assign(new Error(`Missing env: ${name}. Add it to .env (see .env.example).`), { statusCode: 500 });
  return v;
}

/**
 * Get an access token using Client Credentials flow.
 */
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = getEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = getEnv('SPOTIFY_CLIENT_SECRET');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(SPOTIFY_ACCOUNTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Spotify token failed: ${res.status} ${text}`), { statusCode: res.status });
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Search tracks; returns raw Spotify track objects.
 * Spotify Search API: limit 0-10, and market is required for preview_url to be returned.
 */
async function searchTracks(token, q, market = 'US') {
  const params = new URLSearchParams({
    q: String(q).trim(),
    type: 'track',
    limit: 10,
    market: market || 'US',
  });
  const url = `${SPOTIFY_API}/search?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const errBody = JSON.parse(text);
      console.error('Spotify search error body:', errBody);
    } catch {
      console.error('Spotify search response:', text);
    }
    throw Object.assign(new Error(`Spotify search failed: ${res.status}`), { statusCode: res.status });
  }

  const data = await res.json();
  return data.tracks?.items ?? [];
}

/**
 * Get audio features for up to 100 track IDs.
 */
async function getAudioFeatures(token, ids) {
  if (ids.length === 0) return [];
  const url = `${SPOTIFY_API}/audio-features?ids=${ids.slice(0, 100).join(',')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.audio_features ?? [];
}

/**
 * Get artists (for genres); up to 50 IDs.
 */
async function getArtists(token, ids) {
  if (ids.length === 0) return [];
  const url = `${SPOTIFY_API}/artists?ids=${ids.slice(0, 50).join(',')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists ?? [];
}

/**
 * Build the response shape the frontend expects: { tracks: [...] }
 */
async function buildSearchResponse(token, tracks) {
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

  const result = tracks.map((t) => {
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
  });

  return { tracks: result };
}

export { getToken, searchTracks, buildSearchResponse };
