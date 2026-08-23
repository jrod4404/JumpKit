// ============================================================
// JumpKit Supabase Client
// Initializes and exports the supabase client singleton.
// Loaded after supabase-js CDN and config.js
// ============================================================

// supabaseJs is loaded via CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// It exposes window.supabase (the library)
const { createClient } = window.supabase;

function _supabaseAuthStorageKey(url) {
  try {
    const ref = new URL(url).hostname.split('.')[0];
    return `sb-${ref}-auth-token`;
  } catch (_) {
    return 'sb-jumpkit-auth-token';
  }
}

const SUPABASE_AUTH_STORAGE_KEY = _supabaseAuthStorageKey(SUPABASE_URL);

function _createSecureAuthStorage() {
  // NOTE: safeStorage (Electron keychain) is intentionally bypassed until the app
  // is notarized. On non-notarized builds, macOS re-prompts keychain access on every
  // login because the code signature changes between builds. localStorage is sufficient
  // here — Electron's renderer isolation protects it from other apps.
  // Re-enable safeStorage paths once notarization is set up.
  return {
    getItem(key) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    },
    removeItem(key) {
      try { localStorage.removeItem(key); } catch (_) {}
    },
  };
}

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: _createSecureAuthStorage(),
    autoRefreshToken: true,
    detectSessionInUrl: false,  // Electron doesn't use URL-based auth
  },
});

// Export as global for use in all other JS files
window.supabaseClient = supabaseClient;
