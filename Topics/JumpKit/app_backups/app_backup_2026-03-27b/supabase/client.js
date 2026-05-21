// ============================================================
// JumpKit Supabase Client
// Initializes and exports the supabase client singleton.
// Loaded after supabase-js CDN and config.js
// ============================================================

// supabaseJs is loaded via CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// It exposes window.supabase (the library)
const { createClient } = window.supabase;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,  // Electron doesn't use URL-based auth
  },
});

// Export as global for use in all other JS files
window.supabaseClient = supabaseClient;
