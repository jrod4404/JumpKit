// Supabase Edge Function — Waitlist Signup
// Deploy: supabase functions deploy waitlist-signup
// Secrets needed: RESEND_API_KEY (already set), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://jumpkit.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already signed up
    const { data: existing } = await supabase
      .from('waitlist')
      .select('email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ duplicate: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Store email in waitlist table
    const { error: dbError } = await supabase
      .from('waitlist')
      .insert({ email: normalizedEmail });

    if (dbError) {
      console.error('DB error:', dbError);
      return new Response(JSON.stringify({ error: 'DB error' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Send confirmation email via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JumpKit <noreply@jumpkit.ai>',
        to: email,
        subject: "You're on the JumpKit waitlist 🚀",
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #1a1a2e;">
            <img src="https://jumpkit.app/logo-light.png" alt="JumpKit" style="height: 36px; width: auto; margin-bottom: 32px;" />
            <h1 style="font-size: 1.6rem; margin: 0 0 12px;">You're on the list. ⚡</h1>
            <p style="font-size: 1rem; color: #444; line-height: 1.6;">
              Thanks for signing up! We'll let you know the moment JumpKit is ready to launch.
            </p>
            <p style="font-size: 1rem; color: #444; line-height: 1.6;">
              JumpKit gives you instant access to your most-used links & file shares, plus local AI that never sends your data to the cloud.
            </p>
            <p style="margin-top: 32px; font-size: 0.9rem; color: #888;">
              — The JumpKit Team<br/>
              <a href="https://jumpkit.app" style="color: #00C2C7;">jumpkit.app</a>
            </p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendErr = await resendRes.text();
      console.error('Resend error:', resendErr);
      // Don't fail the whole request — email is stored, just log the issue
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
