// ============================================================
// JumpKit — Send Cancellation Email Edge Function
// ============================================================
// Deploy: supabase functions deploy send-cancellation
// Trigger: called from ls-webhook when subscription_cancelled or subscription_expired fires
// Sends: branded cancellation email to lost paid user
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const CORS_ORIGIN = 'https://jumpkit.app';

const rateLimitMap = new Map();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60_000) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > 10;
}

serve(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  if (isRateLimited(ip)) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });

  try {
    const { email, firstName } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers });

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return new Response(JSON.stringify({ ok: true, warning: 'email not sent (no API key)' }), { headers });
    }

    const html = buildCancellationHTML({ firstName: firstName || 'there' });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'JumpKit <noreply@jumpkit.app>',
        to: email,
        subject: 'Your JumpKit Core subscription has ended',
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: err }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});

function buildCancellationHTML({ firstName }: { firstName: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:20px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:50px;display:block;margin:0 auto 12px;opacity:0.9" /></a>
      <p style="margin:0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
    </td></tr>

    <!-- DIVIDER -->
    <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- BODY -->
    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">We'll miss you, ${firstName}.</h2>
      <p style="margin:0 0 28px;font-size:15px;color:#7A93B4;line-height:1.7">
        Your JumpKit Unlimited subscription has ended. Your account has been moved back to the free tier — your personal jumps are still saved and accessible.
      </p>

      <!-- What you still have -->
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06);margin-bottom:24px">
        <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#C8D6E8">What you still have access to:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-check-white.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> All your saved jumps &amp; data retained
          </td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-check-white.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> 250 launches · 2 teams · 5 members · 10 jumps / team
          </td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-check-white.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> Personal ROI dashboard
          </td></tr>
        </table>
      </div>

      <!-- What you lost -->
      <div style="background:rgba(248,113,113,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(248,113,113,0.12);margin-bottom:28px">
        <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#C8D6E8">No longer included:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#f87171;margin-right:10px;font-weight:700">✕</span> Unlimited jump launches
          </td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#f87171;margin-right:10px;font-weight:700">✕</span> Unlimited teams, members &amp; jumps
          </td></tr>
          <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#f87171;margin-right:10px;font-weight:700">✕</span> Team ROI dashboard
          </td></tr>
        </table>
      </div>

      <!-- Re-subscribe CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto">
        <tr><td align="center" style="border-radius:10px;background:linear-gradient(135deg,#50CACC,#1A4FD6)">
          <a href="https://jumpkit.app" style="display:inline-block;padding:14px 32px;color:#ffffff;font-weight:700;font-size:1rem;text-decoration:none;border-radius:10px">
            <img src="https://jumpkit.app/email-icons/icon-jumpkit-white.png" width="18" height="18" style="vertical-align:middle;margin-right:8px;margin-bottom:2px" alt="→" />Reactivate Core
          </a>
        </td></tr>
      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#0a0f1a">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:36px;display:block;margin:0 auto 10px;opacity:0.8" /></a>
      <p style="margin:0 0 12px;font-size:13px;color:#4A6280">Stop searching. Start jumping.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px"><tr>
        <td style="padding:0 6px"><a href="https://x.com/jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-x.png" width="14" height="14" style="display:block;margin-top:2px" alt="X" /></td></tr></table></a></td>
        <td style="padding:0 6px"><a href="https://youtube.com/@jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-yt.png" width="17" height="17" style="display:block;margin-top:2px" alt="YouTube" /></td></tr></table></a></td>
        <td style="padding:0 6px"><a href="https://linkedin.com/company/jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-li.png" width="18" height="18" style="display:block;margin-top:2px" alt="LinkedIn" /></td></tr></table></a></td>
      </tr></table>
      <p style="margin:0;font-size:11px;color:#2e3d52">© 2026 JumpKit. All rights reserved.</p>
    </td></tr>

  </table>
</body></html>`;
}
