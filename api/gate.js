import { Resend } from 'resend';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function appendToSheet(values) {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!serviceEmail || !rawKey || !sheetId) return;

  const privateKey = rawKey.replace(/\\n/g, '\n');

  // Build JWT for Google OAuth
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({
    iss: serviceEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const sigInput = `${header}.${claim}`;

  // Import key and sign
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

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${sigInput}.${sig}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await tokenRes.json();

  // Append row
  const range = 'Signups!A:E';
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    }
  );
}

function welcomeEmail(email, appName) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body{margin:0;padding:0;background:#080808;font-family:-apple-system,'Segoe UI',sans-serif;}
.w{max-width:520px;margin:0 auto;padding:40px 24px;}
.logo{font-family:'JetBrains Mono',monospace;font-size:12px;color:#484848;letter-spacing:.06em;margin-bottom:32px;}
h1{font-size:22px;font-weight:600;color:#f0f0f0;letter-spacing:-.02em;margin-bottom:8px;}
p{font-size:14px;line-height:1.75;color:#888;margin:0 0 16px;}
.apps{border:1px solid #1e1e1e;border-radius:5px;overflow:hidden;margin:20px 0;}
.app-row{padding:9px 14px;border-bottom:1px solid #161616;font-size:12px;color:#686868;display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;}
.app-row:last-child{border-bottom:none;}
.app-dot{width:6px;height:6px;border-radius:50%;background:#484848;flex-shrink:0;}
.app-live{font-size:9px;color:#666;margin-left:auto;}
.cta{display:inline-block;padding:10px 22px;background:#f0f0f0;color:#080808;border-radius:3px;font-size:12px;font-weight:600;text-decoration:none;margin:4px 0 20px;}
.div{height:1px;background:#141414;margin:20px 0;}
.foot{font-size:11px;color:#2a2a2a;line-height:1.7;}
.foot a{color:#484848;}
</style></head>
<body><div class="w">
  <div class="logo">luke-pekala / portfolio-os</div>
  <h1>You're in.</h1>
  <p>All apps are unlocked. You accessed via <strong style="color:#d4d4d4">${appName}</strong> — everything else is open too.</p>
  <div class="apps">
    <div class="app-row"><div class="app-dot"></div>StyleGuard<span class="app-live">live iframe</span></div>
    <div class="app-row"><div class="app-dot"></div>Glossary Kit<span class="app-live">deploy pending</span></div>
    <div class="app-row"><div class="app-dot"></div>Annotately<span class="app-live">deploy pending</span></div>
    <div class="app-row"><div class="app-dot"></div>DocSearch Pro<span class="app-live">deploy pending</span></div>
    <div class="app-row"><div class="app-dot"></div>MarkFlow<span class="app-live">deploy pending</span></div>
    <div class="app-row"><div class="app-dot"></div>+ more deploying soon</div>
  </div>
  <a href="${process.env.NEXT_PUBLIC_URL || 'https://portfolio-os.vercel.app'}" class="cta">Open Portfolio OS →</a>
  <div class="div"></div>
  <div class="foot">
    You'll receive one email when a new tool ships — nothing else.<br>
    <a href="#">Unsubscribe</a> at any time.
  </div>
</div></body>
</html>`;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, appId, appName, ts, type = 'unlock' } = body;
  if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

  const timestamp = ts || new Date().toISOString();

  // Save to Google Sheets (fire and don't block on failure)
  try {
    await appendToSheet([email, appName || appId || 'global', type, timestamp, appId || '']);
  } catch (e) {
    console.error('Sheets append failed:', e.message);
  }

  // Send welcome email via Resend (only for unlock type, not notify)
  if (type === 'unlock' && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Luke Pekala <hello@ai-engineer.app>',
        to: email,
        subject: "You're in — Portfolio OS unlocked",
        html: welcomeEmail(email, appName || 'the portfolio'),
      });

      // Notify owner
      await resend.emails.send({
        from: 'Portfolio OS <noreply@ai-engineer.app>',
        to: process.env.OWNER_EMAIL || 'lukepekala@gmail.com',
        subject: `New signup: ${email}`,
        html: `<div style="background:#080808;padding:24px;font-family:monospace;font-size:13px;color:#888;max-width:400px;margin:0 auto;border-radius:4px;">
          <div style="color:#d4d4d4;margin-bottom:8px;">New Portfolio OS signup</div>
          <div>Email: <strong style="color:#f0f0f0">${email}</strong></div>
          <div>Via: ${appName || appId || 'global'}</div>
          <div>Type: ${type}</div>
          <div>Time: ${new Date(timestamp).toLocaleString()}</div>
        </div>`,
      });
    } catch (e) {
      console.error('Resend failed:', e.message);
    }
  }

  return json({ ok: true });
}
