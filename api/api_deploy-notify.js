import { Resend } from 'resend';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Only notify on production deployments that succeeded
  const { type, payload } = body;
  if (type !== 'deployment.succeeded') {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  const projectName = payload?.project?.name || 'unknown project';
  const deployUrl = payload?.deployment?.url || '';
  const branch = payload?.deployment?.meta?.githubCommitRef || 'main';
  const commitMsg = payload?.deployment?.meta?.githubCommitMessage || '—';
  const deployedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  if (!process.env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no resend key' }), { status: 200 });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Portfolio OS <noreply@ai-engineer.app>',
      to: process.env.OWNER_EMAIL || 'lukepekala@gmail.com',
      subject: `Deployed: ${projectName}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body{margin:0;padding:0;background:#080808;font-family:'JetBrains Mono',monospace;}
.w{max-width:480px;margin:0 auto;padding:32px 24px;}
.logo{font-size:11px;color:#484848;letter-spacing:.06em;margin-bottom:24px;}
.title{font-size:16px;font-weight:600;color:#f0f0f0;letter-spacing:-.01em;margin-bottom:16px;}
.box{border:1px solid #1e1e1e;border-radius:4px;overflow:hidden;margin-bottom:20px;}
.row{display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #141414;font-size:11px;}
.row:last-child{border-bottom:none;}
.key{color:#484848;}
.val{color:#888;text-align:right;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.val.green{color:#3d9970;}
.link{display:inline-block;margin-top:4px;padding:7px 16px;background:#1e1e1e;border-radius:3px;font-size:11px;color:#888;text-decoration:none;}
.foot{margin-top:20px;font-size:10px;color:#2a2a2a;line-height:1.7;}
</style></head>
<body><div class="w">
  <div class="logo">ai-engineer.app / deploy</div>
  <div class="title">✓ ${projectName} deployed</div>
  <div class="box">
    <div class="row"><span class="key">project</span><span class="val green">${projectName}</span></div>
    <div class="row"><span class="key">branch</span><span class="val">${branch}</span></div>
    <div class="row"><span class="key">commit</span><span class="val">${commitMsg}</span></div>
    <div class="row"><span class="key">url</span><span class="val">${deployUrl ? 'https://'+deployUrl : '—'}</span></div>
    <div class="row"><span class="key">deployed at</span><span class="val">${deployedAt}</span></div>
  </div>
  ${deployUrl ? `<a href="https://${deployUrl}" class="link">Open deployment ↗</a>` : ''}
  <div class="foot">Sent by Portfolio OS deploy webhook</div>
</div></body>
</html>`,
    });
  } catch (e) {
    console.error('Deploy notify failed:', e.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
