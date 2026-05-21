// ============================================================
// JumpKit — Send Feedback Edge Function
// ============================================================
// Deploy to Supabase Edge Functions:
//   supabase functions deploy send-feedback
//
// Set the following secrets in your Supabase dashboard:
//   RESEND_API_KEY — your Resend.com API key
//
// The function:
//   1. Receives { name, email, category, message }
//   2. Sends a branded feedback email to support@jumpkit.ai via Resend
// ============================================================

// NOTE: This is a Deno-based Supabase Edge Function.
// It runs in the Supabase infrastructure, not in Node.js.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { name, email, category, message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = buildFeedbackHTML({ name, email, category, message });

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return new Response(JSON.stringify({ ok: true, warning: 'email not sent (no API key)' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JumpKit Feedback <noreply@jumpkit.ai>',
        to: 'support@jumpkit.ai',
        reply_to: email || undefined,
        subject: `[JumpKit Feedback] ${category || 'General'} — from ${name || email || 'Anonymous'}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

function buildFeedbackHTML({ name, email, category, message }) {
  const categoryColor = {
    'Bug': '#e05c5c',
    'Positive Feedback': '#00C2C7',
    'Negative Feedback': '#e08c1a',
    'Feature Request': '#6a9ff5',
    'Other': '#7A93B4',
  }[category] || '#7A93B4';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">
    <tr><td style="background:linear-gradient(135deg,#1A4FD6 0%,#00C2C7 100%);padding:32px 40px;text-align:center">
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#fff">JumpKit</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75)">User Feedback</p>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <div style="display:inline-block;padding:4px 12px;background:${categoryColor}22;border:1px solid ${categoryColor}55;border-radius:20px;font-size:12px;font-weight:600;color:${categoryColor};margin-bottom:20px">${esc(category || 'General')}</div>
      <h2 style="margin:0 0 20px;font-size:18px;color:#C8D6E8;font-weight:600">New feedback received</h2>
      <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#7A93B4;width:80px;vertical-align:top">From</td>
          <td style="padding:8px 0;font-size:13px;color:#C8D6E8;font-weight:500">${esc(name || 'Anonymous')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#7A93B4;vertical-align:top">Email</td>
          <td style="padding:8px 0;font-size:13px;color:#C8D6E8">${esc(email || '—')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#7A93B4;vertical-align:top">Category</td>
          <td style="padding:8px 0;font-size:13px;color:${categoryColor};font-weight:600">${esc(category || '—')}</td>
        </tr>
      </table>
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#7A93B4;text-transform:uppercase;letter-spacing:0.5px">Message</p>
        <p style="margin:0;font-size:14px;color:#C8D6E8;line-height:1.7;white-space:pre-wrap">${esc(message)}</p>
      </div>
    </td></tr>
    <tr><td style="padding:20px 40px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">
      <p style="margin:0;font-size:12px;color:#4A6280"><a href="https://jumpkit.app" style="color:#00C2C7;text-decoration:none">jumpkit.app</a> · Stop searching. Start jumping.</p>
    </td></tr>
  </table>
</body></html>`;
}
