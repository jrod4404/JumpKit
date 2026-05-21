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

serve(async (req) => {
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
        from: 'JumpKit <noreply@jumpkit.app>',
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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">
    <tr><td style="background:linear-gradient(135deg,#1A4FD6 0%,#00C2C7 100%);padding:32px 40px;text-align:center">
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#fff">JumpKit</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75)">Stop searching. Start jumping.</p>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 12px;font-size:20px;color:#C8D6E8;font-weight:600">You've been invited! 🎉</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#7A93B4;line-height:1.6">
        <strong style="color:#C8D6E8">${esc(inviterName)}</strong> has invited you to join
        <strong style="color:#00C2C7">${esc(teamName)}</strong> on JumpKit.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px"><tr>
        <td width="50%" style="padding-right:8px">
          <a href="https://jumpkit.app/download/mac" style="display:block;padding:14px 0;background:rgba(0,194,199,0.12);border:1px solid rgba(0,194,199,0.25);border-radius:10px;text-align:center;text-decoration:none;color:#00C2C7;font-size:14px;font-weight:600">🍎 Download for macOS</a>
        </td>
        <td width="50%" style="padding-left:8px">
          <a href="https://jumpkit.app/download/win" style="display:block;padding:14px 0;background:rgba(26,79,214,0.12);border:1px solid rgba(26,79,214,0.25);border-radius:10px;text-align:center;text-decoration:none;color:#6a9ff5;font-size:14px;font-weight:600">🪟 Download for Windows</a>
        </td>
      </tr></table>
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#C8D6E8">How to join:</p>
        <ol style="margin:0;padding-left:20px;color:#7A93B4;font-size:14px;line-height:1.8">
          <li>Download and open JumpKit</li>
          <li>Click the <strong style="color:#00C2C7">Join a Team</strong> tab</li>
          <li>Enter: Org = <strong style="color:#C8D6E8">${esc(orgName)}</strong>, Team = <strong style="color:#C8D6E8">${esc(teamName)}</strong>, Password = <strong style="color:#C8D6E8">${esc(teamPassword)}</strong></li>
          <li>Sign in with your email and create a password</li>
        </ol>
      </div>
    </td></tr>
    <tr><td style="padding:20px 40px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">
      <p style="margin:0;font-size:12px;color:#4A6280"><a href="https://jumpkit.app" style="color:#00C2C7;text-decoration:none">jumpkit.app</a> · Stop searching. Start jumping.</p>
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
