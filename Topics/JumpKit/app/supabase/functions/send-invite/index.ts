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
        .select('first_name,last_name,email')
        .eq('id', invitedBy)
        .single();
      if (profile?.first_name) {
        inviterName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
      } else if (profile?.email) {
        inviterName = profile.email;
      }
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
            🍎 Download for macOS
          </a>
        </td>
        <td width="50%" style="padding-left:8px">
          <a href="https://jumpkit.app" style="display:block;padding:14px 0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;text-align:center;text-decoration:none;color:#C8D6E8;font-size:14px;font-weight:600">
            🪟 Download for Windows
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
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#50CACC;margin-right:8px">⚡</span> Shared team jumps — your whole team's most-used links, one click away
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#50CACC;margin-right:8px">⏱</span> Save hours a week — stop hunting for the same links every day
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <span style="color:#50CACC;margin-right:8px">🔄</span> Always in sync — when your team updates a link, you get it instantly
          </td></tr>
        </table>
      </div>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#0a0f1a">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:36px;display:block;margin:0 auto 10px;opacity:0.8" /></a>
      <p style="margin:0 0 12px;font-size:13px;color:#4A6280">Stop searching. Start jumping.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px"><tr>
        <td style="padding:0 8px">
          <a href="https://x.com/jumpkitapp" style="font-size:12px;color:#4A6280;text-decoration:none">X / Twitter</a>
        </td>
        <td style="padding:0 8px;color:#2e3d52">·</td>
        <td style="padding:0 8px">
          <a href="https://youtube.com/@jumpkitapp" style="font-size:12px;color:#4A6280;text-decoration:none">YouTube</a>
        </td>
        <td style="padding:0 8px;color:#2e3d52">·</td>
        <td style="padding:0 8px">
          <a href="https://linkedin.com/company/jumpkitapp" style="font-size:12px;color:#4A6280;text-decoration:none">LinkedIn</a>
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
