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
  btn.classList.add('btn-loading'); btn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    window.location.href = 'app.html';
  } catch (err) {
    const msg = err.message || '';
    if (msg.toLowerCase().includes('email not confirmed')) {
      showAlert('loginAlert', 'Please check your email and click the confirmation link before signing in.', 'error');
    } else {
      showAlert('loginAlert', msg || 'Invalid email or password.', 'error');
    }
    btn.classList.remove('btn-loading'); btn.disabled = false;
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
      options: { data: { first_name: firstName, last_name: lastName } }
    });
    if (error) throw error;

    // Also keep localStorage mock for local DB compatibility
    DB.createUser(name, email, pass);
    const localUser = DB.findUserByEmail(email);
    if (localUser) {
      DB.setSession(localUser.id);
      DB.seedNewUser(localUser.id);
    }

    // If email confirmation is enabled, Supabase won't auto-log in — show check-email message
    if (!data?.session) {
      showAlert('signupAlert', '✅ Account created! Check your email and click the confirmation link to activate your account.', 'success');
      btn.classList.remove('btn-loading'); btn.disabled = false;
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
    await supabaseClient.auth.resetPasswordForEmail(email);
  } catch (_) {
    // Silently swallow — don't reveal if email exists
  }
  showAlert('forgotAlert', 'If that email exists, a reset link has been sent.', 'success');
});
