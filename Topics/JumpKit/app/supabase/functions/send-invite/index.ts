// ============================================================
// JumpKit — Send Invite Edge Function
// ============================================================
// Deploy to Supabase Edge Functions:
//   supabase functions deploy send-invite
//
// Set the following secrets in your Supabase dashboard:
//   RESEND_API_KEY — your Resend.com API key
//
// The function:
//   1. Receives { email, teamId, invitedBy, orgName, teamName, teamPassword }
//   2. Sends a branded invite email via Resend
//   3. Inserts a row into team_invites (if not already done by the client)
// ============================================================

// NOTE: This is a Deno-based Supabase Edge Function.
// It runs in the Supabase infrastructure, not in Node.js.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

    const { email, teamId, invitedBy, orgName, teamName, teamPassword } = await req.json();

    if (!email || !teamId) {
      return new Response(JSON.stringify({ error: 'email and teamId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Look up inviter's email for display
    let inviterName = 'Your team owner';
    if (invitedBy && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', invitedBy)
        .single();
      if (profile?.email) inviterName = profile.email;
    }

    // Build email HTML from template (inline for Edge Function simplicity)
    const html = buildEmailHTML({
      inviterName,
      teamName: teamName || 'your team',
      orgName: orgName || 'your organization',
      teamPassword: teamPassword || '(ask your team owner)',
    });

    // Send via Resend
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
        // TODO: Jeff fill this in — replace with your verified Resend sender domain
        from: 'JumpKit <noreply@jumpkit.ai>',
        to: email,
        subject: `You've been invited to join ${teamName} on JumpKit`,
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

function buildEmailHTML({ inviterName, teamName, orgName, teamPassword }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:40px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:50px;display:inline-block;margin:0 8px 12px 0;opacity:0.9" /></a>
      <p style="margin:0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
    </td></tr>

    <!-- DIVIDER -->
    <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- BODY -->
    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 36px;font-size:20px;color:#C8D6E8;font-weight:600">You've been invited! 🎉</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#7A93B4;line-height:1.6">
        <strong style="color:#C8D6E8">${esc(inviterName)}</strong> has invited you to join
        <strong style="color:#50CACC">${esc(teamName)}</strong> on JumpKit.
      </p>

      <!-- Download buttons -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px"><tr>
        <td width="50%" style="padding-right:8px">
          <a href="https://jumpkit.app" style="display:block;padding:14px 0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;text-align:center;text-decoration:none;color:#C8D6E8;font-size:14px;font-weight:600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8.286 7.008c-3.216 0 -4.286 3.23 -4.286 5.92c0 3.229 2.143 8.072 4.286 8.072c1.165 -.05 1.799 -.538 3.214 -.538c1.406 0 1.607 .538 3.214 .538s4.286 -3.229 4.286 -5.381c-.03 -.011 -2.649 -.434 -2.679 -3.23c-.02 -2.335 2.589 -3.179 2.679 -3.228c-1.096 -1.606 -3.162 -2.113 -3.75 -2.153c-1.535 -.12 -3.032 1.077 -3.75 1.077c-.729 0 -2.036 -1.077 -3.214 -1.077z" /><path d="M12 4a2 2 0 0 0 2 -2a2 2 0 0 0 -2 2" /></svg>
            Download for macOS
          </a>
        </td>
        <td width="50%" style="padding-left:8px">
          <a href="https://jumpkit.app" style="display:block;padding:14px 0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;text-align:center;text-decoration:none;color:#C8D6E8;font-size:14px;font-weight:600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.8 20l-12 -1.5c-1 -.1 -1.8 -.9 -1.8 -1.9v-9.2c0 -1 .8 -1.8 1.8 -1.9l12 -1.5c1.2 -.1 2.2 .8 2.2 1.9v12.1c0 1.2 -1.1 2.1 -2.2 1.9z" /><path d="M12 5l0 14" /><path d="M4 12l16 0" /></svg>
            Download for Windows
          </a>
        </td>
      </tr></table>

      <!-- How to join -->
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#C8D6E8">How to join:</p>
        <ol style="margin:0;padding-left:20px;color:#7A93B4;font-size:14px;line-height:1.8">
          <li>Download and open JumpKit</li>
          <li>Create your account (or sign in if you already have one)</li>
          <li>Click <strong style="color:#50CACC">Join a Team</strong> from the Account page</li>
          <li>Input the <strong style="color:#50CACC">${esc(teamName)}</strong> password = <strong style="color:#50CACC">${esc(teamPassword)}</strong></li>
        </ol>
      </div>

      <!-- Benefits -->
      <div style="margin-top:20px;background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#C8D6E8">Then enjoy instant access to:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5;vertical-align:middle">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.74 122.88" width="16" height="16" style="vertical-align:middle;margin-right:8px;fill:#50CACC"><path d="M3.07,79.92c4.32,1.19,29.57,17.12,32.69,10.85c0.32-0.64,2.87-6.24,2.87-6.27l13.62,3.47c0.44,1.39-5.97,12.95-7.23,14.27c-1.6,1.68-3.21,2.68-4.93,3.57C34.31,108.79,6.82,94.12,0,93.16L3.07,79.92L3.07,79.92z M75.85,119.82c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93c0.31-0.83,1.07-1.31,1.7-1.07L75.85,119.82L75.85,119.82z M86.79,112.13c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93s1.07-1.31,1.7-1.07L86.79,112.13L86.79,112.13z M87.12,100.47c0.63,0.24,0.89,1.1,0.58,1.93c-0.31,0.83-1.07,1.31-1.7,1.07l-18.78-7.03c-0.63-0.24-0.89-1.1-0.58-1.93c0.31-0.83,1.07-1.31,1.7-1.07L87.12,100.47L87.12,100.47z M22.26,22.99c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L22.26,22.99L22.26,22.99z M19.79,12.13c-0.66-0.15-1.03-0.97-0.83-1.83c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L19.79,12.13L19.79,12.13z M25.69,3.15C25.03,3,24.66,2.18,24.85,1.32c0.19-0.86,0.88-1.44,1.54-1.29l19.56,4.41c0.66,0.15,1.03,0.97,0.83,1.83c-0.19,0.86-0.88,1.44-1.54,1.29L25.69,3.15L25.69,3.15z M38.97,47.21l-2.86,17.67c-0.58,6.69-0.63,11.89,5.95,15c3.44,1.62,4.32,1.42,8.12,2.06l19.27-0.42c1.04-0.02,26.34,11.02,28.43,12.43l7.83-9.36c1.1-1.31-25.7-14.04-29.63-15.46c-18.65-6.72-20.64,10.5-16.9-15.51c3.75,2.9,6.93,3.62,13.62,5.39c8.01,1.1,11.41-0.86,17.65-3.7l9.22-4.57l-7.14-10.84l-7.05,4.2c-0.26,0.12-0.92,0.45-2.08,1.01c-2.92,1.07-5.25,1.95-7.25,1.26c-6.64-2.32-12.06-12.07-29.81-11.45c-24.69,0.86-22.32-2.09-38.63,17.42l9.79,7.55c7.7-9.21,8.39-11.43,20.79-12.61C38.52,47.24,38.74,47.23,38.97,47.21L38.97,47.21L38.97,47.21z M59.12,9.04c6.83-3.12,14.89-0.11,18,6.72c3.12,6.83,0.11,14.89-6.72,18c-6.83,3.12-14.89,0.11-18-6.72C49.28,20.21,52.29,12.15,59.12,9.04L59.12,9.04z"/></svg>
            Shared team jumps — your whole team's most-used links, one click away
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5;vertical-align:middle">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 7v5l3 3" /></svg>
            Save hours a week — stop hunting for the same links every day
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5;vertical-align:middle">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
            Always in sync — when your team updates a link, you get it instantly
          </td></tr>
        </table>
      </div>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#0a0f1a">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:36px;display:block;margin:0 auto 10px;opacity:0.8" /></a>
      <p style="margin:0 0 12px;font-size:13px;color:#4A6280">Stop searching. Start jumping.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px"><tr>
        <td style="padding:0 6px">
          <a href="https://x.com/jumpkitapp" style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%;text-align:center;line-height:32px;text-decoration:none">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#7A93B4" style="vertical-align:middle;margin-top:9px"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.849L1.254 2.25H8.08l4.261 5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
        </td>
        <td style="padding:0 6px">
          <a href="https://youtube.com/@jumpkitapp" style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%;text-align:center;line-height:32px;text-decoration:none">
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7A93B4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:7px"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#7A93B4" stroke="none"/></svg>
          </a>
        </td>
        <td style="padding:0 6px">
          <a href="https://linkedin.com/company/jumpkitapp" style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%;text-align:center;line-height:32px;text-decoration:none">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7A93B4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:6px"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M8 11l0 5" /><path d="M8 8l0 .01" /><path d="M12 16l0 -5" /><path d="M16 16v-3a2 2 0 0 0 -4 0" /></svg>
          </a>
        </td>
      </tr></table>
      <p style="margin:0;font-size:11px;color:#2e3d52">© 2026 JumpKit. All rights reserved.</p>
    </td></tr>

  </table>
</body></html>`;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
