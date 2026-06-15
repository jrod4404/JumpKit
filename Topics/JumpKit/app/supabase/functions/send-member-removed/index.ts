// ============================================================
// JumpKit — Send Member Removed Edge Function
// ============================================================
// Deploy to Supabase Edge Functions:
//   supabase functions deploy send-member-removed
//
// Secrets required (already set from existing functions):
//   RESEND_API_KEY — your Resend.com API key
//
// The function:
//   1. Receives { memberEmail, memberName, teamName, ownerName }
//   2. Sends a branded "you've been removed" email to the removed member via Resend
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// ── Simple in-memory rate limiter (per IP, 10 requests/min) ─────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 10;
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > maxRequests;
}

serve(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://jumpkit.app' },
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { memberEmail, memberName, teamName, ownerName } = await req.json();

    if (!memberEmail || !teamName) {
      return new Response(JSON.stringify({ error: 'memberEmail and teamName are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = buildEmailHTML({ memberName, teamName, ownerName });

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return new Response(JSON.stringify({ ok: true, warning: 'email not sent (no API key)' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JumpKit <noreply@jumpkit.app>',
        to: memberEmail,
        subject: `You've been removed from ${teamName} on JumpKit`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHTML({ memberName, teamName, ownerName }) {
  const firstName = memberName ? memberName.split(' ')[0] : 'there';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" width="620" style="margin:40px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
    <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:50px;display:inline-block;margin:0 8px 12px 0;opacity:0.9" /></a>
    <p style="margin:0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- BODY -->
  <tr><td style="padding:36px 40px">
    <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">You've been removed from a team</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#7A93B4;line-height:1.6">
      Hi <strong style="color:#C8D6E8">${esc(firstName)}</strong>, you have been removed from the team
      <strong style="color:#50CACC">${esc(teamName)}</strong>${ownerName ? ` by <strong style="color:#C8D6E8">${esc(ownerName)}</strong>` : ''}.
    </p>

    <!-- What changed -->
    <div style="background:rgba(248,113,113,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(248,113,113,0.12);margin-bottom:20px">
      <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#C8D6E8">What changed:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <span style="color:#f87171;margin-right:10px;font-weight:700;font-size:18px;line-height:1">✕</span> Access to shared team jumps and columns removed
        </td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <span style="color:#f87171;margin-right:10px;font-weight:700;font-size:18px;line-height:1">✕</span> Team no longer appears on your Teams page
        </td></tr>
      </table>
    </div>

    <!-- What's safe -->
    <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px">
      <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#C8D6E8">Your personal jumps are not affected:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <img src="https://jumpkit.app/email-icons/icon-check-turquoise.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> All your private jumps remain exactly as they were
        </td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <img src="https://jumpkit.app/email-icons/icon-check-turquoise.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> Your account and subscription are unchanged
        </td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <img src="https://jumpkit.app/email-icons/icon-check-turquoise.png" width="14" height="14" style="vertical-align:middle;margin-right:10px" alt="✓" /> You can still join or create other teams
        </td></tr>
      </table>
    </div>

    <!-- Info note -->
    <div style="background:rgba(80,202,204,0.06);border-radius:10px;padding:16px 20px;border:1px solid rgba(80,202,204,0.15)">
      <p style="margin:0;font-size:13px;color:#7A93B4;line-height:1.6">
        If you believe this was a mistake, please contact the team owner directly or reach out to us at
        <a href="mailto:help@jumpkit.app" style="color:#50CACC;text-decoration:none">help@jumpkit.app</a>.
      </p>
    </div>
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
    <p style="margin:0;font-size:11px;color:#2e3d52">© 2026 JumpKit LLC. All rights reserved.</p>
  </td></tr>

</table>
</body></html>`;
}
