// ─── THEME TOGGLE ────────────────────────────────────────────
const html   = document.documentElement;
const themeSwitch = document.getElementById('themeSwitch');
const navThemeSwitch = document.getElementById('navThemeSwitch');

const saved = localStorage.getItem('jk-theme') || 'dark';
setTheme(saved);

if (themeSwitch) {
  themeSwitch.addEventListener('change', () => {
    const next = themeSwitch.checked ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('jk-theme', next);
  });
}
if (navThemeSwitch) {
  navThemeSwitch.addEventListener('change', () => {
    const next = navThemeSwitch.checked ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('jk-theme', next);
  });
}

function setTheme(t) {
  html.dataset.theme = t;
  if (themeSwitch) themeSwitch.checked = (t === 'dark');
  if (navThemeSwitch) navThemeSwitch.checked = (t === 'dark');
  const logoSrc = t === 'dark' ? 'logo-dark.png' : 'logo-light.png';
  const navLogo = document.getElementById('navLogo');
  const footerLogo = document.getElementById('footerLogo');
  try { if (navLogo) navLogo.src = logoSrc; } catch(e){}
  try { if (footerLogo) footerLogo.src = logoSrc; } catch(e){}
}

// ─── MOCK ITEM CLICK ANIMATION ───────────────────────────────
document.querySelectorAll('.mock-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.mock-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// ─── EMAIL FORM ───────────────────────────────────────────────
const SUPABASE_URL  = 'https://iuexwdjnqfidcwvwbgwr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZXh3ZGpucWZpZGN3dndiZ3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTA1MTksImV4cCI6MjA4OTY4NjUxOX0.N-m3Kxb4EKITOHmJ3tJuQuvZ1LVnWzStFtarCxxvmO0';

async function handleSubmit(e) {
  e.preventDefault();
  const form  = e.target;
  const input = form.querySelector('input[type="email"]');
  const btn   = form.querySelector('button');

  const email = input.value.trim();
  btn.textContent = 'Signing up...';
  btn.disabled = true;
  input.disabled = true;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.duplicate) {
        btn.textContent = "You're already signed up!";
        input.value = '';
        input.placeholder = 'See you soon!';
      } else {
        btn.textContent = "✅ You're on the list!";
        input.value = '';
        input.placeholder = 'See you soon!';
      }
    } else {
      throw new Error('Server error');
    }
  } catch {
    btn.textContent = 'Something went wrong — try again';
    btn.disabled = false;
    input.disabled = false;
  }
}

// ─── SCROLL FADE-IN ───────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .jet-card, .step, .pricing-card, .stats-chart-demo, .stats-bar-inline').forEach(el => {
  el.classList.add('fade-up');
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

// ─── TESTIMONIAL CAROUSEL ─────────────────────────────────────
(function() {
  const track = document.getElementById('testimonialTrack');
  const viewport = track ? track.closest('.testimonial-viewport') : null;
  const dotsContainer = document.getElementById('testimonialDots');
  if (!track || !viewport) return;

  const slides = track.querySelectorAll('.testimonial-slide');
  let current = 0;
  let autoTimer;
  let dragStartX = null;
  let isDragging = false;

  // Build dots
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsContainer.querySelectorAll('.testimonial-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
    resetAuto();
  }

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1), 9000);
  }

  window.testimonialMove = function(dir) { goTo(current + dir); };

  // Mouse drag
  viewport.addEventListener('mousedown', e => { dragStartX = e.clientX; isDragging = true; });
  viewport.addEventListener('mousemove', e => { if (isDragging) e.preventDefault(); });
  viewport.addEventListener('mouseup', e => {
    if (!isDragging) return;
    const diff = dragStartX - e.clientX;
    if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
    isDragging = false;
  });
  viewport.addEventListener('mouseleave', () => { isDragging = false; });

  // Touch swipe
  viewport.addEventListener('touchstart', e => { dragStartX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener('touchend', e => {
    if (dragStartX === null) return;
    const diff = dragStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
    dragStartX = null;
  });

  // Cursor style
  viewport.style.cursor = 'grab';
  viewport.addEventListener('mousedown', () => viewport.style.cursor = 'grabbing');
  viewport.addEventListener('mouseup',   () => viewport.style.cursor = 'grab');

  resetAuto();
})();

// ─── SCROLL TO TOP BUTTON ─────────────────────────────────────
(function() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  });
})();

// ─── LIGHTBOX ─────────────────────────────────────────────────
function openLightboxThemed(wrap) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const selector = theme === 'light' ? '.hero-screenshot-light' : '.hero-screenshot-dark';
  const img = wrap.querySelector(selector) || wrap.querySelector('img');
  if (!img) return;
  // Use absolute src (img.src) which the browser has already resolved
  const src = img.currentSrc || img.src;
  if (!src) return;
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  lbImg.src = '';          // force reload
  lbImg.src = src;
  lbImg.alt = img.alt;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
