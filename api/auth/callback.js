/**
 * GET /api/auth/callback?code=... - exchange code for token, redirect to frontend with token in hash
 */
export default async function handler(req, res) {
  const code = req.query.code;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
  const frontendUrl = baseUrl.replace(/\/$/, '');

  if (!code) {
    res.redirect(302, frontendUrl + '?error=missing_code');
    return;
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    res.redirect(302, frontendUrl + '?error=server_config');
    return;
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
      res.redirect(302, frontendUrl + '?error=' + encodeURIComponent(data.error_description || data.error));
      return;
    }
    const hash = new URLSearchParams({
      access_token: data.access_token,
      expires_in: String(data.expires_in || 3600),
    }).toString();
    res.redirect(302, frontendUrl + (frontendUrl.includes('?') ? '&' : '?') + 'auth=1#' + hash);
  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect(302, frontendUrl + '?error=exchange_failed');
  }
}
