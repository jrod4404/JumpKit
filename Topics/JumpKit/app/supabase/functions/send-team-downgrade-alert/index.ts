// ============================================================
// JumpKit — Send Team Downgrade Alert Edge Function
// ============================================================
// Deploy: supabase functions deploy send-team-downgrade-alert --no-verify-jwt
// Trigger: called from ls-webhook on downgrade to free tier
// Sends: downgrade alert to owner + affected team members
// Also handles variant:'warning' for 2-day lockout warning emails
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const CORS_ORIGIN = 'https://jumpkit.app';

const rateLimitMap = new Map();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60_000) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > 20;
}

serve(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  if (isRateLimited(ip)) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });

  try {
    const { ownerId, teamId, teamName, lockDate, affectedMembers, variant } = await req.json();
    // variant: 'alert' (default) | 'warning'
    const emailVariant: 'alert' | 'warning' = variant === 'warning' ? 'warning' : 'alert';

    if (!ownerId || !teamName || !lockDate || !Array.isArray(affectedMembers)) {
      return new Response(JSON.stringify({ error: 'ownerId, teamName, lockDate, and affectedMembers required' }), { status: 400, headers });
    }

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return new Response(JSON.stringify({ ok: true, warning: 'email not sent (no API key)' }), { headers });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch owner's email
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', ownerId)
      .single();

    if (!ownerProfile?.email) {
      return new Response(JSON.stringify({ error: 'Owner profile not found' }), { status: 404, headers });
    }

    const membersBulletHtml = affectedMembers.map((m: { email: string; name?: string }) =>
      `<li style="padding:4px 0;font-size:15px;color:#7A93B4;line-height:1.7">${esc(m.name || m.email)}</li>`
    ).join('');
    // padding-left:0 + list-style-position:inside puts the bullet inline with the email text
    // so the bullets sit at the same x-baseline as the surrounding paragraph copy.
    const membersListHtml = `<ul style="margin:0 0 20px;padding-left:0;list-style:disc inside;color:#7A93B4">${membersBulletHtml}</ul>`;

    const sentResults: string[] = [];
    const errors: string[] = [];

    // Send to owner
    const ownerHtml = emailVariant === 'warning'
      ? buildWarningOwnerHTML({ teamName, lockDate, membersListHtml })
      : buildAlertOwnerHTML({ teamName, lockDate, membersListHtml });

    const ownerSubject = emailVariant === 'warning'
      ? `Reminder: JumpKit team access ending in 2 days — ${teamName}`
      : `Important: your JumpKit team members may lose access`;

    const ownerRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'JumpKit <noreply@jumpkit.app>',
        to: ownerProfile.email,
        subject: ownerSubject,
        html: ownerHtml,
      }),
    });
    if (ownerRes.ok) {
      sentResults.push(ownerProfile.email);
    } else {
      const err = await ownerRes.text();
      console.error('Resend owner error:', err);
      errors.push(`owner:${err}`);
    }

    // Send to each affected member
    for (const member of affectedMembers) {
      if (!member.email) continue;
      const memberHtml = emailVariant === 'warning'
        ? buildWarningMemberHTML({ teamName, lockDate })
        : buildAlertMemberHTML({ teamName, lockDate });

      const memberSubject = emailVariant === 'warning'
        ? `Your access to ${teamName} ends in 2 days`
        : `Important: your JumpKit team access may be changing`;

      const memberRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'JumpKit <noreply@jumpkit.app>',
          to: member.email,
          subject: memberSubject,
          html: memberHtml,
        }),
      });
      if (memberRes.ok) {
        sentResults.push(member.email);
      } else {
        const err = await memberRes.text();
        console.error('Resend member error:', err?.message || err);
        errors.push(`${member.email}:${err}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentResults, errors }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email builders ────────────────────────────────────────────────

const HEADER = `
    <!-- HEADER -->
    <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:75px;display:block;margin:0 auto 12px;opacity:0.9;position:relative;left:6px" /></a>
      <p style="margin:-15px 0 0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
    </td></tr>
    <!-- DIVIDER -->
    <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>`;

const FOOTER = `
    <!-- FOOTER -->
    <tr><td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#0a0f1a">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:54px;display:block;margin:0 auto 10px;opacity:0.8;position:relative;left:6px" /></a>
      <p style="margin:-15px 0 12px;font-size:13px;color:#4A6280">Stop searching. Start jumping.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px"><tr>
        <td style="padding:0 6px"><a href="https://x.com/jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-x.png" width="14" height="14" style="display:block;margin-top:2px" alt="X" /></td></tr></table></a></td>
        <td style="padding:0 6px"><a href="https://youtube.com/@jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-yt.png" width="17" height="17" style="display:block;margin-top:2px" alt="YouTube" /></td></tr></table></a></td>
        <td style="padding:0 6px"><a href="https://linkedin.com/company/jumpkitapp" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" style="width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:50%"><tr><td align="center" valign="middle"><img src="https://jumpkit.app/email-icons/icon-social-li.png" width="18" height="18" style="display:block;margin-top:2px" alt="LinkedIn" /></td></tr></table></a></td>
      </tr></table>
      <p style="margin:0;font-size:11px;color:#2e3d52">© 2026 JumpKit LLC. All rights reserved.</p>
    </td></tr>`;

function wrapEmail(bodyRows: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:20px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">
${HEADER}
${bodyRows}
${FOOTER}
  </table>
</body></html>`;
}

const CTA_REUPGRADE = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0">
        <tr><td align="center" style="border-radius:10px;background:linear-gradient(135deg,#50CACC,#1A4FD6)">
          <a href="https://jumpkit.app/#pricing" style="display:inline-block;padding:10px 19px;color:#ffffff;font-weight:700;font-size:1rem;text-decoration:none;border-radius:10px">
            <img src="https://jumpkit.app/email-icons/icon-jumpkit-white.png" width="18" height="18" style="vertical-align:middle;margin-right:8px;margin-bottom:2px" alt="→" />Re-upgrade to Unlimited
          </a>
        </td></tr>
      </table>`;

const CTA_UPGRADE = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0">
        <tr><td align="center" style="border-radius:10px;background:linear-gradient(135deg,#50CACC,#1A4FD6)">
          <a href="https://jumpkit.app/#pricing" style="display:inline-block;padding:10px 19px;color:#ffffff;font-weight:700;font-size:1rem;text-decoration:none;border-radius:10px">
            <img src="https://jumpkit.app/email-icons/icon-jumpkit-white.png" width="18" height="18" style="vertical-align:middle;margin-right:8px;margin-bottom:2px" alt="→" />Upgrade to Unlimited
          </a>
        </td></tr>
      </table>`;

function buildAlertOwnerHTML({ teamName, lockDate, membersListHtml }: { teamName: string; lockDate: string; membersListHtml: string }): string {
  const body = `    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">Team member access changing</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#7A93B4;line-height:1.7">
        Your JumpKit subscription has ended. Your team <strong style="color:#C8D6E8">${esc(teamName)}</strong> is limited to 5 members on the free plan.
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#7A93B4;line-height:1.7">
        The following members will lose access on <strong style="color:#f87171">${esc(lockDate)}</strong> unless you re-upgrade:
      </p>
      ${membersListHtml}
      ${CTA_REUPGRADE}
      <p style="margin:20px 0 0;font-size:13px;color:#4A6280;text-align:center;line-height:1.6">
        If you take no action, affected members will be notified 2 days before their access is removed.
      </p>
    </td></tr>`;
  return wrapEmail(body);
}

function buildAlertMemberHTML({ teamName, lockDate }: { teamName: string; lockDate: string }): string {
  const body = `    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">Your team access may be changing</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#7A93B4;line-height:1.7">
        The owner of <strong style="color:#C8D6E8">${esc(teamName)}</strong> has downgraded to the free plan. Your access to this team may be removed on <strong style="color:#f87171">${esc(lockDate)}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#7A93B4;line-height:1.7">
        Contact the team owner to restore access, or upgrade your own JumpKit account.
      </p>
      ${CTA_UPGRADE}
    </td></tr>`;
  return wrapEmail(body);
}

function buildWarningOwnerHTML({ teamName, lockDate, membersListHtml }: { teamName: string; lockDate: string; membersListHtml: string }): string {
  const body = `    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">Reminder: team access ending in 2 days</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#7A93B4;line-height:1.7">
        Your team <strong style="color:#C8D6E8">${esc(teamName)}</strong> members listed below will lose access on <strong style="color:#f87171">${esc(lockDate)}</strong>.
      </p>
      ${membersListHtml}
      ${CTA_REUPGRADE}
    </td></tr>`;
  return wrapEmail(body);
}

function buildWarningMemberHTML({ teamName, lockDate }: { teamName: string; lockDate: string }): string {
  const body = `    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">Your access to ${esc(teamName)} ends in 2 days</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#7A93B4;line-height:1.7">
        The owner of <strong style="color:#C8D6E8">${esc(teamName)}</strong> has downgraded to the free plan. Your access will be removed on <strong style="color:#f87171">${esc(lockDate)}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#7A93B4;line-height:1.7">
        Contact the team owner or upgrade your own JumpKit account to continue.
      </p>
      ${CTA_UPGRADE}
    </td></tr>`;
  return wrapEmail(body);
}
