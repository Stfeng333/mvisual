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
 * GET /api/auth/login
 * Redirects user to Spotify authorization. After login, Spotify redirects to /api/auth/callback.
 */
app.get('/api/auth/login', (_req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Server missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI' });
  }
  const scope = 'user-read-email'; // minimal scope; catalog + preview work without extra scope
  const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
  })}`;
  res.redirect(302, url);
});

/**
 * GET /api/auth/callback?code=...
 * Exchanges code for token, redirects to frontend with access_token in hash.
 */
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  const frontendUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
  if (!code) {
    return res.redirect(frontendUrl + '?error=missing_code');
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(frontendUrl + '?error=server_config');
  }
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) {
      return res.redirect(frontendUrl + '?error=' + encodeURIComponent(data.error_description || data.error));
    }
    const hash = new URLSearchParams({
      access_token: data.access_token,
      expires_in: String(data.expires_in || 3600),
    }).toString();
    res.redirect(302, frontendUrl + (frontendUrl.includes('?') ? '&' : '?') + 'auth=1#' + hash);
  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect(frontendUrl + '?error=exchange_failed');
  }
});

/**
 * GET /api/search?q=...&market=US (optional)
 * If Authorization: Bearer <user_token> is sent, uses that (returns preview_url).
 * Otherwise uses Client Credentials (preview_url often null).
 */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }
  const market = (req.query.market || process.env.SPOTIFY_MARKET || 'US').toUpperCase().slice(0, 2);

  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim();
    }
    if (!token) {
      token = await getToken();
    }
    const tracks = await searchTracks(token, q, market);
    const payload = await buildSearchResponse(token, tracks, market);
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
