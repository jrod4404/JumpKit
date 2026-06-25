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
        from: 'JumpKit <noreply@jumpkit.app>',
        to: email,
        subject: "You're on the JumpKit waitlist 🚀",
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:20px auto;background:#0E1827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09)">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(180deg,#060C15 0%,#0E1827 100%);padding:32px 40px;text-align:center">
      <a href="https://jumpkit.app" style="text-decoration:none"><img src="https://jumpkit.app/logo-dark-mode.png" alt="JumpKit" style="height:75px;display:inline-block;margin:0 8px 12px 0;opacity:0.9;position:relative;left:6px" /></a>
      <p style="margin:-15px 0 0;font-size:14px;color:#C8D6E8;opacity:0.9">Stop searching. Start jumping.</p>
    </td></tr>

    <!-- DIVIDER -->
    <tr><td style="height:1px;background:rgba(255,255,255,0.06);padding:0;font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- BODY -->
    <tr><td style="padding:36px 40px">
      <h2 style="margin:0 0 16px;font-size:20px;color:#C8D6E8;font-weight:600">You're on the list! 🎉</h2>
      <p style="margin:0 0 28px;font-size:15px;color:#7A93B4;line-height:1.7">
        Thanks for signing up! We'll reach out the moment JumpKit is ready for you.
      </p>

      <!-- What to expect -->
      <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px 24px;border:1px solid rgba(255,255,255,0.06);margin-bottom:28px">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#C8D6E8">Here's what you're soon getting access to:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-jumpkit.png" width="16" height="16" style="vertical-align:middle;margin-right:8px" alt="→" /> Instant access to your most-used links &amp; file shares
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-clock.png" width="16" height="16" style="vertical-align:middle;margin-right:8px" alt="⏱" /> Save hours every week — stop hunting for the same resources
          </td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#7A93B4;line-height:1.5">
            <img src="https://jumpkit.app/email-icons/icon-refresh.png" width="16" height="16" style="vertical-align:middle;margin-right:8px" alt="↻" /> Share jumps with your whole team — always in sync
          </td></tr>
        </table>
      </div>

      <p style="margin:0;font-size:0.82rem;color:#4A6280;line-height:1.6">In the meantime, visit <a href="https://jumpkit.app" style="color:#50CACC;text-decoration:none">jumpkit.app</a> to learn more.</p>
    </td></tr>

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
    </td></tr>

  </table>
</body></html>`,
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
