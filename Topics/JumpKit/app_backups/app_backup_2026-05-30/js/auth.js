// ── Theme ──────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('jk_theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;

function updateAuthTheme(t) {
  document.getElementById('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('.auth-logo-img').forEach(img => {
    img.src = t === 'dark' ? 'img/logo-dark-mode.png' : 'img/logo.png';
  });
}
updateAuthTheme(savedTheme);

document.getElementById('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('jk_theme', next);
  updateAuthTheme(next);
});

// ── Tab / View switching ────────────────────────────────────────────
const TAB_VIEWS = ['viewLogin', 'viewSignup', 'viewForgot'];

function showView(id) {
  TAB_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? 'block' : 'none';
  });
  // Update tab active state
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === id);
  });
  // Reset forgot form on entry
  if (id === 'viewForgot') {
    const emailEl = document.getElementById('forgotEmail');
    const alertEl = document.getElementById('forgotAlert');
    if (emailEl) emailEl.value = '';
    if (alertEl) { alertEl.className = 'auth-alert'; alertEl.textContent = ''; }
  }
}

// Tab click
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

// ── Helpers ────────────────────────────────────────────────────────
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'auth-alert ' + type;
  el.textContent = msg;
}
function clearErrors(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
    const err = document.getElementById(id + 'Err');
    if (err) err.classList.remove('show');
  });
}
function showError(inputId, errId) {
  document.getElementById(inputId)?.classList.add('error');
  document.getElementById(errId)?.classList.add('show');
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── Redirect if already logged in ─────────────────────────────────
async function checkExistingSession() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) window.location.href = 'app.html';
  } catch (err) {
    // No session or Supabase not configured yet — remain on auth page
    console.warn('Supabase session check failed (config not set?):', err.message);
  }
}
checkExistingSession();

// ── Sign In ────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors('loginEmail', 'loginPassword');
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  let ok = true;
  if (!isValidEmail(email)) { showError('loginEmail', 'loginEmailErr'); ok = false; }
  if (!pass)                { showError('loginPassword', 'loginPassErr'); ok = false; }
  if (!ok) return;

  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.style.opacity = '0.85';
  const loginIcon = btn.querySelector('.btn-label svg');
  const loginIconHTML = loginIcon ? loginIcon.outerHTML : null;
  if (loginIcon) loginIcon.outerHTML = '<svg class="ti ti-loader-2" style="width:1.32rem;height:1.32rem;flex-shrink:0;animation:auth-spin 0.7s linear infinite"><use href="img/tabler-sprite.svg#tabler-loader-2"/></svg>';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;

    // Send welcome email — Edge Function handles the "only once" check server-side
    const userId = data?.user?.id || '';
    const firstName = data?.user?.user_metadata?.first_name || '';
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, firstName, userId })
      });
    } catch (_) {}

    window.location.href = 'app.html';
  } catch (err) {
    const msg = err.message || '';
    if (msg.toLowerCase().includes('email not confirmed')) {
      showAlert('loginAlert', 'Please check your email and click the confirmation link before signing in.', 'error');
    } else {
      showAlert('loginAlert', msg || 'Invalid email or password.', 'error');
    }
    btn.disabled = false; btn.style.opacity = '';
    const spinIcon = btn.querySelector('.btn-label svg');
    if (spinIcon && loginIconHTML) spinIcon.outerHTML = loginIconHTML;
  }
});

// ── Sign Up ────────────────────────────────────────────────────────
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors('signupFirstName', 'signupLastName', 'signupEmail', 'signupPassword', 'signupConfirm');
  const firstName = document.getElementById('signupFirstName').value.trim();
  const lastName  = document.getElementById('signupLastName').value.trim();
  const name      = `${firstName} ${lastName}`.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const pass      = document.getElementById('signupPassword').value;
  const confirm   = document.getElementById('signupConfirm').value;
  let ok = true;
  if (!firstName)           { showError('signupFirstName', 'signupFirstNameErr'); ok = false; }
  if (!lastName)            { showError('signupLastName', 'signupLastNameErr'); ok = false; }
  if (!isValidEmail(email)) { showError('signupEmail', 'signupEmailErr'); ok = false; }
  if (pass.length < 8)      { showError('signupPassword', 'signupPassErr'); ok = false; }
  if (pass !== confirm)     { showError('signupConfirm', 'signupConfirmErr'); ok = false; }
  if (!ok) return;

  const btn = e.target.querySelector('[type=submit]');
  btn.classList.add('btn-loading'); btn.disabled = true;

  try {
    // Pass first/last name as metadata — trigger auto-creates the profile row
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: 'https://jumpkit.app/confirmed'
      }
    });
    if (error) throw error;

    // Also keep localStorage mock for local DB compatibility
    DB.createUser(name, email, pass);
    const localUser = DB.findUserByEmail(email);
    if (localUser) {
      DB.setSession(localUser.id);
      DB.seedNewUser(localUser.id);
    }

    // If email confirmation is enabled, Supabase won't auto-log in — show success modal
    if (!data?.session) {
      btn.classList.remove('btn-loading'); btn.disabled = false;
      // Show modal overlay
      const overlay = document.createElement('div');
      overlay.id = 'signupSuccessOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999';
      overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:40px 36px;max-width:420px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4)">
          <div style="width:64px;height:64px;background:rgba(80,202,204,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
            <svg viewBox="0 0 24 24" fill="none" stroke="#50CACC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h2 style="color:var(--text);font-size:1.3rem;font-weight:700;margin:0 0 12px">Account Created!</h2>
          <p style="color:var(--text-muted);font-size:0.92rem;line-height:1.7;margin:0 0 28px">
            Check your email at <strong style="color:var(--text)">${email}</strong> and click the confirmation link to activate your account.
          </p>
          <button id="signupSuccessOk" style="background:linear-gradient(135deg,#50CACC,#1A4FD6);color:#fff;font-weight:700;font-size:0.95rem;padding:12px 32px;border-radius:10px;border:none;cursor:pointer;width:100%">
            Go to Sign In
          </button>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById('signupSuccessOk').addEventListener('click', () => {
        overlay.remove();
        showView('viewLogin');
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); showView('viewLogin'); }
      });
      return;
    }

    window.location.href = 'app.html';
  } catch (err) {
    showAlert('signupAlert', err.message || 'Could not create account.', 'error');
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
});

// ── Forgot Password ────────────────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors('forgotEmail');
  const email = document.getElementById('forgotEmail').value.trim();
  if (!isValidEmail(email)) { showError('forgotEmail', 'forgotEmailErr'); return; }

  try {
    await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://jumpkit.app/reset-password'
    });
  } catch (_) {
    // Silently swallow — don't reveal if email exists
  }
  showAlert('forgotAlert', 'If that email exists, a reset link has been sent.', 'success');
});

// ── Password reveal toggles ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  function wirePwToggles() {
    document.querySelectorAll('input[type="password"]:not([data-pw-wired])').forEach(input => {
      input.setAttribute('data-pw-wired', '1');
      const wrap = document.createElement('div');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pw-eye'; btn.setAttribute('tabindex', '-1');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        wrap.appendChild(btn);
      });
      wrap.appendChild(btn);
    });
  }
  wirePwToggles();
  // Re-wire when tabs switch (new fields may appear)
  document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => requestAnimationFrame(wirePwToggles)));
});


// ── Event delegation — auth view links ─────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-jaction="show-view"]');
  if (!el) return;
  showView(el.dataset.view);
});
