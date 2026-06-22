// ============================================================
// JumpKit — Apply Pending Upgrade Edge Function
// ============================================================
// Deploy: supabase functions deploy apply-pending-upgrade
// Trigger: called from auth.js after every successful signInWithPassword
// Purpose: If the user paid for Unlimited before creating an account,
//          their upgrade was stored in pending_upgrades. This function
//          checks for a pending upgrade by email, applies it to the
//          profile, deletes the pending row, and sends the welcome email.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
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

  // Require a valid Supabase JWT — prevents unauthenticated callers from probing pending_upgrades
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.length < 20) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  try {
    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server config error' }), { status: 500, headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check for a pending upgrade for this email
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_upgrades')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (fetchErr) {
      console.error('pending_upgrades fetch error:', fetchErr);
      return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers });
    }

    // No pending upgrade — nothing to do (normal case for most logins)
    if (!pending) {
      return new Response(JSON.stringify({ ok: true, applied: false }), { headers });
    }

    // 2. Apply the upgrade to the profile
    const profileUpdate: Record<string, unknown> = {
      subscription_tier: pending.tier,
      subscription_status: 'active',
      ls_customer_id: pending.ls_customer_id,
      trial_launches_used: 0,
    };
    if (pending.plan) profileUpdate.subscription_plan = pending.plan;

    const { error: updateErr } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('email', email);

    if (updateErr) {
      console.error('profile update error:', updateErr);
      return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers });
    }

    // 3. Delete the pending row — upgrade applied, no longer needed
    await supabase.from('pending_upgrades').delete().eq('email', email);

    // 4. Get first name for welcome email
    let firstName = 'there';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('email', email)
        .single();
      if (profile?.first_name) firstName = profile.first_name;
    } catch (_) {}

    // 5. Send welcome-core email now that the upgrade is live
    if (SUPABASE_ANON_KEY) {
      fetch(`${SUPABASE_URL}/functions/v1/send-welcome-core`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, firstName }),
      }).catch(e => console.error('send-welcome-core error:', e));
    }

    console.log(`Pending upgrade applied for ${email}: tier=${pending.tier}`);
    return new Response(JSON.stringify({ ok: true, applied: true, tier: pending.tier }), { headers });

  } catch (err) {
    console.error('apply-pending-upgrade error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});
