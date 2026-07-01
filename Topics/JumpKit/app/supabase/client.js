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
  const sessionFallback = new Map();
  return {
    async getItem(key) {
      if (window.electronAPI?.secureAuthGet) {
        const result = await window.electronAPI.secureAuthGet(key);
        if (result?.ok && result.value) return result.value;
      }
      // One-time migration from Supabase's previous default localStorage key.
      // This preserves logged-in sessions after the storage hardening update,
      // then removes the token from localStorage once secure storage accepts it.
      try {
        const legacy = localStorage.getItem(key);
        if (legacy && window.electronAPI?.secureAuthSet) {
          const migrated = await window.electronAPI.secureAuthSet(key, legacy);
          if (migrated?.ok) localStorage.removeItem(key);
          return migrated?.ok ? legacy : null;
        }
      } catch (_) {}
      // Browser/no-safeStorage fallback only. Electron release builds should use
      // safeStorage; this in-memory fallback avoids token persistence.
      return sessionFallback.get(key) || null;
    },
    async setItem(key, value) {
      if (window.electronAPI?.secureAuthSet) {
        const result = await window.electronAPI.secureAuthSet(key, value);
        if (result?.ok) {
          try { localStorage.removeItem(key); } catch (_) {}
          return;
        }
      }
      sessionFallback.set(key, value);
    },
    async removeItem(key) {
      if (window.electronAPI?.secureAuthRemove) {
        await window.electronAPI.secureAuthRemove(key).catch(() => {});
      }
      sessionFallback.delete(key);
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
