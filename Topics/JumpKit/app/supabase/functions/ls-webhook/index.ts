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
// Variant 1445234 = $99/yr, Variant 1742152 = $10/mo
const CORE_VARIANT_IDS = ['1754948', '1754951']; // Annual: 1754948, Monthly: 1754951
const TEAMS_JET_VARIANT_IDS: string[] = []; // legacy, unused

serve(async (req) => {
  try {
    const body = await req.text();
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

    // Determine tier from variant ID
    let tier = 'free';
    if (CORE_VARIANT_IDS.includes(variantId)) tier = 'core';
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
    const { data: updatedRows, error } = await supabase
      .from('profiles')
      .update({
        subscription_status: subStatus,
        subscription_tier: tier,
        ls_customer_id: customerId,
        trial_launches_used: 0  // reset trial on upgrade
      })
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
        .upsert({ email: customerEmail, tier, ls_customer_id: customerId }, { onConflict: 'email' });
      if (pendingErr) console.error('pending_upgrades upsert error:', pendingErr);
      // Send onboarding email — tells the new customer how to download + set up JumpKit
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-pending-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
        body: JSON.stringify({ email: customerEmail }),
      }).catch(e => console.error('send-pending-upgrade error:', e));
      return new Response('OK', { status: 200 });
    }

    // Look up first name for personalized emails
    let firstName = 'there';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('email', customerEmail)
        .single();
      if (profile?.first_name) firstName = profile.first_name;
    } catch (_) {}

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
