// ─── THEME TOGGLE ────────────────────────────────────────────
const html   = document.documentElement;
const themeSwitch = document.getElementById('themeSwitch');

const saved = localStorage.getItem('jk-theme') || 'dark';
setTheme(saved);

if (themeSwitch) {
  themeSwitch.addEventListener('change', () => {
    const next = themeSwitch.checked ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('jk-theme', next);
  });
}

function setTheme(t) {
  html.dataset.theme = t;
  if (themeSwitch) themeSwitch.checked = (t === 'dark');
  const logoSrc = t === 'dark' ? 'logo-dark.png' : 'logo-light.png';
  const navLogo = document.getElementById('navLogo');
  const footerLogo = document.getElementById('footerLogo');
  if (navLogo) navLogo.src = logoSrc;
  if (footerLogo) footerLogo.src = logoSrc;
}

// ─── MOCK ITEM CLICK ANIMATION ───────────────────────────────
document.querySelectorAll('.mock-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.mock-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// ─── EMAIL FORM ───────────────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  const form  = e.target;
  const input = form.querySelector('input[type="email"]');
  const btn   = form.querySelector('button');
  btn.textContent = '✅ You\'re on the list!';
  btn.disabled = true;
  input.disabled = true;
  input.value = '';
  input.placeholder = 'See you soon!';
}

// ─── SCROLL FADE-IN ───────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .jet-card, .step, .pricing-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ─── OFFCANVAS MENU ───────────────────────────────────────────
const offcanvas = document.getElementById('offcanvasMenu');
const menuToggleBtn = document.getElementById('menuToggle');
const menuCloseBtn = document.getElementById('menuClose');

const backdrop = document.getElementById('offcanvasBackdrop');
function openMenu() { offcanvas.classList.add('open'); backdrop.classList.add('show'); }
function closeMenu() { offcanvas.classList.remove('open'); backdrop.classList.remove('show'); }

if (menuToggleBtn) menuToggleBtn.addEventListener('click', openMenu);
if (menuCloseBtn) menuCloseBtn.addEventListener('click', closeMenu);
if (backdrop) backdrop.addEventListener('click', closeMenu);
offcanvas?.querySelectorAll('a.offcanvas-link').forEach(link => {
  link.addEventListener('click', closeMenu);
});
document.addEventListener('click', e => {
  if (!offcanvas) return;
  if (!offcanvas.classList.contains('open')) return;
  const clickedToggle = menuToggleBtn?.contains(e.target);
  const clickedInside = offcanvas.contains(e.target);
  if (!clickedInside && !clickedToggle) {
    offcanvas.classList.remove('open');
  }
});
