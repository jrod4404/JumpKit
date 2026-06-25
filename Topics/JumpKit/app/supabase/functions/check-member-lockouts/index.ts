// ============================================================
// JumpKit — Check Member Lockouts Edge Function
// ============================================================
// Deploy: supabase functions deploy check-member-lockouts --no-verify-jwt
// Schedule: run daily via Supabase cron or pg_cron
// Purpose:
//   1. Apply locks to team_members where lock_at has passed
//   2. Send 2-day warning emails for members about to be locked
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_ORIGIN = 'https://jumpkit.app';

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const SUPABASE_URL_VAL = Deno.env.get('SUPABASE_URL') || '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const emailHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` };

    let lockedCount = 0;
    let warnedCount = 0;

    // ── Step 1: Apply locks where lock_at <= now() ────────────────
    const { data: toApplyLock = [], error: lockFetchErr } = await supabase
      .from('team_members')
      .select('id, user_id, team_id')
      .eq('locked', false)
      .not('lock_at', 'is', null)
      .lte('lock_at', new Date().toISOString());

    if (lockFetchErr) {
      console.error('Error fetching members to lock:', lockFetchErr);
    } else if (toApplyLock.length > 0) {
      const idsToLock = toApplyLock.map((r: { id: string }) => r.id);
      const { error: lockUpdateErr } = await supabase
        .from('team_members')
        .update({ locked: true })
        .in('id', idsToLock);

      if (lockUpdateErr) {
        console.error('Error applying locks:', lockUpdateErr);
      } else {
        lockedCount = idsToLock.length;
        console.log(`Locked ${lockedCount} team members`);
      }
    }

    // ── Step 2: Send 2-day warnings ───────────────────────────────
    // Find members where lock_at is within next 2 days and warning not yet sent
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: toWarn = [], error: warnFetchErr } = await supabase
      .from('team_members')
      .select('id, user_id, team_id, lock_at')
      .eq('locked', false)
      .eq('lock_notified_2day', false)
      .not('lock_at', 'is', null)
      .lte('lock_at', twoDaysFromNow)
      .gt('lock_at', new Date().toISOString()); // not already expired

    if (warnFetchErr) {
      console.error('Error fetching members to warn:', warnFetchErr);
    } else if (toWarn.length > 0) {
      // Group by team_id for batch processing
      const byTeam: Record<string, Array<{ id: string; user_id: string; lock_at: string }>> = {};
      for (const row of toWarn) {
        if (!byTeam[row.team_id]) byTeam[row.team_id] = [];
        byTeam[row.team_id].push({ id: row.id, user_id: row.user_id, lock_at: row.lock_at });
      }

      for (const [teamId, members] of Object.entries(byTeam)) {
        // Fetch team name + owner
        const { data: team } = await supabase
          .from('teams')
          .select('id, name, owner_id')
          .eq('id', teamId)
          .single();

        if (!team) continue;

        // Fetch affected member profiles
        const memberUserIds = members.map(m => m.user_id);
        const { data: memberProfs = [] } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name')
          .in('id', memberUserIds);

        const profById: Record<string, { email: string; first_name?: string; last_name?: string }> = {};
        memberProfs.forEach((p: { id: string; email: string; first_name?: string; last_name?: string }) => { profById[p.id] = p; });

        const affectedMembers = members
          .map(m => {
            const p = profById[m.user_id];
            if (!p?.email) return null;
            const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
            return { email: p.email, name: name || p.email };
          })
          .filter(Boolean);

        if (affectedMembers.length === 0) continue;

        // Use first member's lock_at as the lockDate for display
        const lockDate = new Date(members[0].lock_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Call send-team-downgrade-alert with variant:'warning'
        try {
          await fetch(`${SUPABASE_URL_VAL}/functions/v1/send-team-downgrade-alert`, {
            method: 'POST',
            headers: emailHeaders,
            body: JSON.stringify({
              ownerId: team.owner_id,
              teamId: team.id,
              teamName: team.name,
              lockDate,
              affectedMembers,
              variant: 'warning',
            }),
          });
        } catch (e) {
          console.error('send-team-downgrade-alert error for team:', e?.message || e);
        }

        // Mark as warned
        const warnIds = members.map(m => m.id);
        const { error: warnUpdateErr } = await supabase
          .from('team_members')
          .update({ lock_notified_2day: true })
          .in('id', warnIds);

        if (warnUpdateErr) {
          console.error('Error setting lock_notified_2day for team:', warnUpdateErr?.message || warnUpdateErr);
        } else {
          warnedCount += warnIds.length;
        }
      }
    }

    console.log(`check-member-lockouts: locked=${lockedCount}, warned=${warnedCount}`);
    return new Response(JSON.stringify({ ok: true, locked: lockedCount, warned: warnedCount }), { headers });
  } catch (err) {
    console.error('check-member-lockouts error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});
