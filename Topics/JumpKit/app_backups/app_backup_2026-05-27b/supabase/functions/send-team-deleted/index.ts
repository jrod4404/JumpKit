// ============================================================
// JumpKit — Send Team Deleted Notification Edge Function
// ============================================================
// Deploy:  supabase functions deploy send-team-deleted
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Called by doRemoveTeam() BEFORE Supabase deletes so member data
// is still queryable. Sends a branded email to every member and
// pending invitee of the deleted team.
//
// Input: { teamId, teamName, ownerName }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// ── Rate limiter ─────────────────────────────────────────────────
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
  if (isRateLimited(ip)) {
    return json({ error: 'Too many requests' }, 429);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { teamId, teamName, ownerName } = await req.json();
    if (!teamId || !teamName) return json({ error: 'teamId and teamName required' }, 400);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Supabase env not set — skipping');
      return json({ ok: true, warning: 'Supabase not configured' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch current team members + their profiles
    const { data: memberRowsRaw } = await supabase
      .from('team_members')
      .select('user_id, profiles(email, first_name, last_name)')
      .eq('team_id', teamId);
    const memberRows = memberRowsRaw || [];

    // 2. Fetch pending invites (not yet accepted)
    const { data: inviteRowsRaw } = await supabase
      .from('team_invites')
      .select('email')
      .eq('team_id', teamId)
      .eq('status', 'pending');
    const inviteRows = inviteRowsRaw || [];

    // 3. Fetch shared column names
    const { data: colRowsRaw } = await supabase
      .from('shared_columns')
      .select('name')
      .eq('team_id', teamId)
      .order('position');
    const colRows = colRowsRaw || [];

    const columnNames: string[] = colRows.map((c: any) => c.name);

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send');
      return json({ ok: true, warning: 'email not sent (no API key)' });
    }

    // 4. Send email to each member
    const emailPromises: Promise<any>[] = [];

    for (const row of memberRows as any[]) {
      const profile = row.profiles;
      if (!profile?.email) continue;
      const firstName = profile.first_name || '';
      emailPromises.push(sendEmail({
        to: profile.email,
        firstName,
        teamName,
        ownerName: ownerName || 'Your team owner',
        columnNames,
        isPendingInvite: false,
      }));
    }

    // 5. Send email to pending invitees
    for (const inv of inviteRows as any[]) {
      if (!inv.email) continue;
      emailPromises.push(sendEmail({
        to: inv.email,
        firstName: '',
        teamName,
        ownerName: ownerName || 'Your team owner',
        columnNames,
        isPendingInvite: true,
      }));
    }

    await Promise.allSettled(emailPromises);

    return json({ ok: true, notified: emailPromises.length });
  } catch (err: any) {
    console.error('[send-team-deleted]', err);
    return json({ error: err.message }, 500);
  }
});

// ── Send single email via Resend ──────────────────────────────────
async function sendEmail({
  to, firstName, teamName, ownerName, columnNames, isPendingInvite,
}: {
  to: string; firstName: string; teamName: string; ownerName: string;
  columnNames: string[]; isPendingInvite: boolean;
}) {
  const html = buildEmailHTML({ firstName, teamName, ownerName, columnNames, isPendingInvite });
  const subject = isPendingInvite
    ? `Your invitation to ${teamName} on JumpKit has been cancelled`
    : `Team "${teamName}" has been deleted on JumpKit`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'JumpKit <noreply@jumpkit.ai>',
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[send-team-deleted] Resend error for ${to}:`, err);
  }
}

// ── Email HTML ────────────────────────────────────────────────────
function buildEmailHTML({ firstName, teamName, ownerName, columnNames, isPendingInvite }: {
  firstName: string; teamName: string; ownerName: string;
  columnNames: string[]; isPendingInvite: boolean;
}) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi there,';
  const colListItems = columnNames.length > 0
    ? columnNames.map(n => `
        <tr><td style="padding:5px 0;font-size:13px;color:#7A93B4;line-height:1.5">
          <span style="color:#50CACC;margin-right:8px">▸</span>${esc(n)}
        </td></tr>`).join('')
    : `<tr><td style="padding:5px 0;font-size:13px;color:#7A93B4">(no shared columns)</td></tr>`;

  const bodyText = isPendingInvite
    ? `Your pending invitation to join <strong style="color:#50CACC">${esc(teamName)}</strong> has been cancelled because the team was deleted by <strong style="color:#C8D6E8">${esc(ownerName)}</strong>.`
    : `<strong style="color:#C8D6E8">${esc(ownerName)}</strong> has deleted the team <strong style="color:#50CACC">${esc(teamName)}</strong>. The following shared columns have been removed from your JumpKit:`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:40px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
      <a href="https://jumpkit.app" style="text-decoration:none">
        <img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:50px;display:block;margin:0 auto 12px;opacity:0.9"/>
      </a>
      <p style="margin:0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
    </td></tr>

    <!-- DIVIDER -->
    <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- BODY -->
    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 20px;font-size:20px;color:#C8D6E8;font-weight:600">
        ${isPendingInvite ? 'Invitation Cancelled' : 'Team Deleted'}
      </h2>
      <p style="margin:0 0 20px;font-size:15px;color:#7A93B4;line-height:1.6">${greeting}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#7A93B4;line-height:1.6">${bodyText}</p>

      ${!isPendingInvite && columnNames.length > 0 ? `
      <!-- Column list -->
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:16px 20px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#C8D6E8;text-transform:uppercase;letter-spacing:0.05em">Removed Shared Columns</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${colListItems}
        </table>
      </div>` : ''}

      <!-- Personal data note -->
      <div style="background:rgba(0,194,199,0.07);border-radius:10px;padding:14px 18px;border:1px solid rgba(0,194,199,0.15)">
        <p style="margin:0;font-size:13px;color:#50CACC;line-height:1.6">
          <strong>Your personal jumps are not affected.</strong> Only the shared columns from this team have been removed. Your own private jumps remain exactly as they were.
        </p>
      </div>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#0a0f1a">
      <a href="https://jumpkit.app" style="text-decoration:none">
        <img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:36px;display:block;margin:0 auto 10px;opacity:0.8"/>
      </a>
      <p style="margin:0 0 8px;font-size:13px;color:#4A6280">Stop searching. Start jumping.</p>
      <p style="margin:0;font-size:11px;color:#2e3d52">© 2026 JumpKit. All rights reserved.</p>
    </td></tr>

  </table>
</body></html>`;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
