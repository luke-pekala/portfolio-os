export const config = { runtime: 'edge' };

async function getSheetData(range) {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!serviceEmail || !rawKey || !sheetId) return [];

  const privateKey = rawKey.replace(/\\n/g, '\n');

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({
    iss: serviceEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const sigInput = `${header}.${claim}`;
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${sigInput}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await tokenRes.json();

  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const data = await dataRes.json();
  return data.values || [];
}

export default async function handler(req) {
  // Password check
  const pw = req.headers.get('x-admin-password');
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [signupRows, openRows] = await Promise.all([
      getSheetData('Signups!A:E'),
      getSheetData('Opens!A:D'),
    ]);

    // Parse signups — columns: email, appName, type, ts, appId
    const emails = signupRows.map(r => ({
      email:   r[0] || '',
      appName: r[1] || '',
      type:    r[2] || 'unlock',
      ts:      r[3] || '',
      appId:   r[4] || '',
    })).filter(e => e.email && e.email.includes('@'));

    // Parse opens — columns: appId, email, ts, country
    const opens = openRows.map(r => ({
      appId:   r[0] || '',
      email:   r[1] || '',
      ts:      r[2] || '',
      country: r[3] || '',
      // Derive display name from appId
      appName: r[0] ? r[0].replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase()) : '',
    })).filter(o => o.appId);

    return new Response(JSON.stringify({ emails, opens }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, emails: [], opens: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
