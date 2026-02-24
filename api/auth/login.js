/**
 * GET /api/auth/login - redirect to Spotify authorization
 */
export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Server missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI' });
    return;
  }
  const scope = 'user-read-email';
  const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
  })}`;
  res.redirect(302, url);
}
