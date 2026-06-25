// Supabase Edge Function — Lemon Squeezy webhook handler
// Deploy as: supabase functions deploy ls-webhook
// Set in Supabase secrets: LEMON_SQUEEZY_SIGNING_SECRET
// Set in Lemon Squeezy dashboard: Webhook URL = https://YOUR_PROJECT.supabase.co/functions/v1/ls-webhook
//
// TODO: Jeff — 
//   1. Create products in Lemon Squeezy ($5/mo = "core", $25/mo = "teams_jet")
//   2. Note the variant IDs for each product
//   3. Update CORE_VARIANT_IDS and TEAMS_JET_VARIANT_IDS below
//   4. Deploy this edge function
//   5. Add webhook in LS dashboard pointing to this function URL
//   6. Set LEMON_SQUEEZY_SIGNING_SECRET in Supabase Edge Function secrets

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// JumpKit Unlimited variants — both map to 'core' tier
const ANNUAL_VARIANT_ID  = '1754948'; // $99/yr
const MONTHLY_VARIANT_ID = '1754951'; // $10/mo
const CORE_VARIANT_IDS = [ANNUAL_VARIANT_ID, MONTHLY_VARIANT_ID];
const TEAMS_JET_VARIANT_IDS: string[] = []; // legacy, unused

// Timing-safe string comparison to prevent timing attacks on signature check
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  try {
    const body = await req.text();

    // ── Lemon Squeezy signature verification ──────────────────────────────
    const signingSecret = Deno.env.get('LEMON_SQUEEZY_SIGNING_SECRET') || '';
    const signature = req.headers.get('x-signature') || '';
    if (!signingSecret) {
      console.error('ls-webhook: LEMON_SQUEEZY_SIGNING_SECRET not set');
      return new Response('Server config error', { status: 500 });
    }
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (!timingSafeEqual(signature, expected)) {
      console.error('ls-webhook: invalid signature');
      return new Response('Unauthorized', { status: 401 });
    }
    // ─────────────────────────────────────────────────────────────────────

    const payload = JSON.parse(body);
    const eventName = payload.meta?.event_name;
    const data = payload.data?.attributes;
    const customerEmail = data?.user_email;
    const variantId = String(data?.variant_id);
    const customerId = String(payload.data?.id);
    const status = data?.status; // 'active', 'cancelled', 'expired', 'past_due'

    if (!customerEmail) {
      return new Response('No email', { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Determine tier + plan from variant ID
    let tier = 'free';
    let plan: string | null = null;
    if (CORE_VARIANT_IDS.includes(variantId)) {
      tier = 'core';
      plan = variantId === ANNUAL_VARIANT_ID ? 'annual' : 'monthly';
    }
    if (TEAMS_JET_VARIANT_IDS.includes(variantId)) tier = 'teams_jet';

    // Map LS status to our status
    let subStatus = 'free';
    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      if (status === 'active') subStatus = 'active';
      else if (status === 'past_due') subStatus = 'overdue';
      else if (status === 'cancelled' || status === 'expired') {
        subStatus = 'cancelled';
        tier = 'free';
      }
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      subStatus = 'cancelled';
      tier = 'free';
    } else if (eventName === 'subscription_payment_failed') {
      subStatus = 'overdue';
    }

    // Update profile by email; select() returns updated rows so we can detect 0-row case
    const profileUpdate: Record<string, unknown> = {
      subscription_status: subStatus,
      subscription_tier: tier,
      ls_customer_id: customerId,
      trial_launches_used: 0,  // reset trial on upgrade
    };
    if (plan !== null) profileUpdate.subscription_plan = plan;
    if (tier === 'free') profileUpdate.subscription_plan = null; // clear on cancellation

    const { data: updatedRows, error } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('email', customerEmail)
      .select('id');

    if (error) {
      console.error('Supabase update error:', error);
      return new Response('DB error', { status: 500 });
    }

    // No profile exists yet — user paid before creating an account.
    // Store the upgrade so it can be applied on their first login.
    const profileExists = updatedRows && updatedRows.length > 0;
    if (!profileExists && (eventName === 'subscription_created' || eventName === 'subscription_updated') && tier !== 'free') {
      const { error: pendingErr } = await supabase
        .from('pending_upgrades')
        .upsert({ email: customerEmail, tier, plan, ls_customer_id: customerId }, { onConflict: 'email' });
      if (pendingErr) console.error('pending_upgrades upsert error:', pendingErr);
      // Send onboarding email — tells the new customer how to download + set up JumpKit
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-pending-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
        body: JSON.stringify({ email: customerEmail }),
      }).catch(e => console.error('send-pending-upgrade error:', e));
      return new Response('OK', { status: 200 });
    }

    // Look up first name + profile ID for personalized emails and lockout logic
    let firstName = 'there';
    let profileId: string | null = null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name')
        .eq('email', customerEmail)
        .single();
      if (profile?.first_name) firstName = profile.first_name;
      if (profile?.id) profileId = profile.id;
    } catch (_) {}

    // ── Downgrade lockout: identify over-cap team members ───────────
    if (tier === 'free' && profileExists && profileId) {
      try {
        // 1. Get all teams owned by this user
        const { data: ownedTeams = [] } = await supabase
          .from('teams')
          .select('id, name')
          .eq('owner_id', profileId);

        for (const team of ownedTeams) {
          // 2. Get all team_members ordered by created_at ASC
          const { data: allMembers = [] } = await supabase
            .from('team_members')
            .select('id, user_id, profiles(email, first_name, last_name)')
            .eq('team_id', team.id)
            .order('created_at', { ascending: true });

          // 3. Keep first 5 (owner counts as position 1 since owner IS in team_members)
          //    members at positions 6+ get lock_at = now() + 14 days
          if (allMembers.length <= 5) continue;

          const overCapMembers = allMembers.slice(5);
          const lockAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          const lockDate = new Date(lockAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

          const overCapIds = overCapMembers.map((m: { id: string }) => m.id);
          const { error: lockErr } = await supabase
            .from('team_members')
            .update({ lock_at: lockAt })
            .in('id', overCapIds);

          if (lockErr) {
            console.error('lockout update error for team:', lockErr?.message || lockErr);
            continue;
          }

          // 4. If any affected members, call send-team-downgrade-alert
          const affectedMembers = overCapMembers
            .map((m: { user_id: string; profiles?: { email?: string; first_name?: string; last_name?: string } }) => {
              const p = m.profiles;
              if (!p?.email) return null;
              const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
              return { email: p.email, name: name || p.email };
            })
            .filter(Boolean);

          if (affectedMembers.length > 0) {
            fetch(`${SUPABASE_URL_VAL}/functions/v1/send-team-downgrade-alert`, {
              method: 'POST',
              headers: emailHeaders,
              body: JSON.stringify({
                ownerId: profileId,
                teamId: team.id,
                teamName: team.name,
                lockDate,
                affectedMembers,
                variant: 'alert',
              }),
            }).catch(e => console.error('send-team-downgrade-alert error:', e));
          }
        }
      } catch (lockoutErr) {
        console.error('Downgrade lockout error:', lockoutErr);
      }
    }

    // ── Re-upgrade: clear any pending locks for this owner's teams ─
    if (tier !== 'free' && subStatus === 'active' && profileId) {
      try {
        const { data: ownerTeams = [] } = await supabase
          .from('teams')
          .select('id')
          .eq('owner_id', profileId);

        if (ownerTeams.length > 0) {
          const teamIds = ownerTeams.map((t: { id: string }) => t.id);
          const { error: clearErr } = await supabase
            .from('team_members')
            .update({ locked: false, lock_at: null, lock_notified_2day: false })
            .in('team_id', teamIds)
            .or('locked.eq.true,lock_at.not.is.null');

          if (clearErr) console.error('Re-upgrade lock clear error:', clearErr);
          else console.log(`Cleared locks for ${teamIds.length} owner team(s)`);
        }
      } catch (clearErr) {
        console.error('Re-upgrade lock clear error:', clearErr);
      }
    }

    const SUPABASE_URL_VAL = Deno.env.get('SUPABASE_URL') || '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const emailHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` };

    // Send transactional email based on event
    if (eventName === 'subscription_created' && subStatus === 'active' && tier !== 'free') {
      // Welcome to Core
      fetch(`${SUPABASE_URL_VAL}/functions/v1/send-welcome-core`, {
        method: 'POST',
        headers: emailHeaders,
        body: JSON.stringify({ email: customerEmail, firstName }),
      }).catch(e => console.error('send-welcome-core error:', e));
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      // Cancellation notice
      fetch(`${SUPABASE_URL_VAL}/functions/v1/send-cancellation`, {
        method: 'POST',
        headers: emailHeaders,
        body: JSON.stringify({ email: customerEmail, firstName }),
      }).catch(e => console.error('send-cancellation error:', e));
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Error', { status: 500 });
  }
});
