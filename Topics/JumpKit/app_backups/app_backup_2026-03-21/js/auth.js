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

// ── View switching ─────────────────────────────────────────────────
function showView(id) {
  ['viewLogin','viewSignup','viewForgot'].forEach(v => {
    document.getElementById(v).style.display = v === id ? 'block' : 'none';
  });
}

// ── Helpers ────────────────────────────────────────────────────────
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.className = 'auth-alert ' + type;
  el.textContent = msg;
}
function clearErrors(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('error'); }
    const err = document.getElementById(id + 'Err');
    if (err) err.classList.remove('show');
  });
}
function showError(inputId, errId) {
  document.getElementById(inputId)?.classList.add('error');
  document.getElementById(errId)?.classList.add('show');
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── Login ──────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  clearErrors('loginEmail','loginPassword');
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  let ok = true;
  if (!isValidEmail(email)) { showError('loginEmail','loginEmailErr'); ok = false; }
  if (!pass) { showError('loginPassword','loginPassErr'); ok = false; }
  if (!ok) return;

  const user = DB.findUserByEmail(email);
  if (!user || user.password !== pass) {
    showAlert('loginAlert', 'Invalid email or password.', 'error'); return;
  }
  DB.setSession(user.id);
  window.location.href = 'app.html';
});

// ── Sign Up ────────────────────────────────────────────────────────
document.getElementById('signupForm').addEventListener('submit', e => {
  e.preventDefault();
  clearErrors('signupName','signupEmail','signupPassword','signupConfirm');
  const name    = document.getElementById('signupName').value.trim();
  const email   = document.getElementById('signupEmail').value.trim();
  const pass    = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  let ok = true;
  if (!name)                { showError('signupName','signupNameErr'); ok = false; }
  if (!isValidEmail(email)) { showError('signupEmail','signupEmailErr'); ok = false; }
  if (pass.length < 8)     { showError('signupPassword','signupPassErr'); ok = false; }
  if (pass !== confirm)    { showError('signupConfirm','signupConfirmErr'); ok = false; }
  if (!ok) return;

  const user = DB.createUser(name, email, pass);
  if (!user) { showAlert('signupAlert', 'An account with this email already exists.', 'error'); return; }
  DB.setSession(user.id);
  DB.seedNewUser(user.id);
  window.location.href = 'app.html';
});

// ── Forgot Password ────────────────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', e => {
  e.preventDefault();
  clearErrors('forgotEmail');
  const email = document.getElementById('forgotEmail').value.trim();
  if (!isValidEmail(email)) { showError('forgotEmail','forgotEmailErr'); return; }
  showAlert('forgotAlert', 'If that email exists, a reset link has been sent.', 'success');
});

// ── Redirect if already logged in ─────────────────────────────────
if (DB.getCurrentUser()) window.location.href = 'app.html';
