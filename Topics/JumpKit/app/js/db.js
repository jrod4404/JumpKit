// ── JumpKit DB (SQLite via IPC + in-memory cache) ──────────────────
// Reads come from the in-memory cache (synchronous, fast).
// Writes update the cache immediately, then fire-and-forget to SQLite via IPC.
// When electronAPI is not available (browser dev mode), falls back to localStorage.

const DB = (() => {
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ── Helpers ──────────────────────────────────────────────────────
  function lsGet(key, def) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch(_) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {}
  }

  // ── Default prefs ─────────────────────────────────────────────────
  function defaultPrefs() {
    return {
      startPage:          'home',
      notifications:      true,
      cloudBackup:        false,
      timePerClick:       10,
      dollarsPerHour:     150,
      showDescription: false,
      showHotkey:      false,
      autoArchive:        'never',
      subscriptionStatus: 'free',
      subscriptionTier:   'free',
      role:               'team-member',
      navDefaultCollapsed: false,
    };
  }

  // ── localStorage fallback helpers (browser / no-Electron) ─────────
  function lsLoadAll(userId) {
    const jumps    = lsGet(`jk_jumps_${userId}`,  []);
    const columns  = lsGet(`jk_cols_${userId}`,   []);
    const clickLog = lsGet(`jk_clicks_${userId}`, []);
    const rawPrefs = lsGet(`jk_prefs_${userId}`,  null);
    // Merge with subscription keys that used to live in plain localStorage
    const prefs = Object.assign(defaultPrefs(), rawPrefs || {}, {
      subscriptionStatus: localStorage.getItem('jk_subscription_status') || (rawPrefs?.subscriptionStatus || 'free'),
      subscriptionTier:   localStorage.getItem('jk_subscription_tier')   || (rawPrefs?.subscriptionTier   || 'free'),
      role:               localStorage.getItem('jk_role')                 || (rawPrefs?.role               || 'team-member'),
    });
    return { jumps, columns, clickLog, prefs };
  }

  return {
    // ── In-memory cache ────────────────────────────────────────────
    _cache: { jumps: [], columns: [], clickLog: [], prefs: null },
    _userId: null,

    // ── Init (called once after auth, before renderApp) ────────────
    async init(userId) {
      this._userId = userId;
      if (window.electronAPI) {
        try {
          const [jumps, columns, log, prefs] = await Promise.all([
            window.electronAPI.getJumps(userId),
            window.electronAPI.getColumns(userId),
            window.electronAPI.getClickLog(userId),
            window.electronAPI.getPrefs(userId),
          ]);
          this._cache.jumps    = (jumps    || []).map(j => ({
            ...j,
            favorite:    !!j.favorite,
            isArchived:  !!j.isArchived,
            isShared:    !!j.isShared,
          }));
          this._cache.columns  = (columns  || []).map(c => ({
            ...c,
            visible:  !!c.visible,
            isShared: !!c.isShared,
          }));
          this._cache.clickLog = log     || [];
          this._cache.prefs    = prefs   || defaultPrefs();

          // Auto-seed if this user has no personal (non-shared) columns
          const personalCols = this._cache.columns.filter(c => !c.isShared);
          if (personalCols.length === 0) {
            console.log('[DB.init] No columns found — seeding default data for', userId);
            await window.electronAPI.seedNewUser(userId);
            // Reload after seed
            const [jumps2, columns2] = await Promise.all([
              window.electronAPI.getJumps(userId),
              window.electronAPI.getColumns(userId),
            ]);
            this._cache.jumps   = (jumps2 || []).map(j => ({ ...j, favorite: !!j.favorite, isArchived: !!j.isArchived, isShared: !!j.isShared }));
            this._cache.columns = (columns2 || []).map(c => ({ ...c, visible: !!c.visible, isShared: !!c.isShared }));
          }
        } catch (err) {
          console.warn('[DB.init] IPC error, falling back to localStorage:', err);
          const fb = lsLoadAll(userId);
          this._cache.jumps    = fb.jumps;
          this._cache.columns  = fb.columns;
          this._cache.clickLog = fb.clickLog;
          this._cache.prefs    = fb.prefs;
        }
      } else {
        // Browser / dev mode — use localStorage
        const fb = lsLoadAll(userId);
        this._cache.jumps    = fb.jumps;
        this._cache.columns  = fb.columns;
        this._cache.clickLog = fb.clickLog;
        this._cache.prefs    = fb.prefs;
      }
    },

    // ── Users (localStorage — auth is Supabase-managed) ───────────
    getUsers()           { return lsGet('jk_users', []); },
    saveUsers(users)     { lsSet('jk_users', users); },
    findUserByEmail(email) { return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()); },
    createUser(name, email, password) {
      const users = this.getUsers();
      if (this.findUserByEmail(email)) return null;
      const user = { id: uid(), name, email, password, createdAt: Date.now() };
      users.push(user);
      this.saveUsers(users);
      return user;
    },
    getCurrentUserId()   { return localStorage.getItem('jk_current_user'); },
    setCurrentUserId(id) { localStorage.setItem('jk_current_user', id); },
    clearCurrentUser()   { localStorage.removeItem('jk_current_user'); },
    setSession(id)       { this.setCurrentUserId(id); },
    clearSession()       { this.clearCurrentUser(); },
    getCurrentUser() {
      const id = this.getCurrentUserId();
      return id ? this.getUsers().find(u => u.id === id) || null : null;
    },

    // ── Columns ───────────────────────────────────────────────────
    getColumns(userId) {
      return this._cache.columns.filter(c => c.userId === userId);
    },

    saveColumns(userId, cols) {
      // Replace all columns for this user in cache
      this._cache.columns = [
        ...this._cache.columns.filter(c => c.userId !== userId),
        ...cols.map(c => ({ ...c, userId })),
      ];
      // Persist to SQLite (fire-and-forget) or localStorage fallback
      if (window.electronAPI) {
        window.electronAPI.saveColumns(userId, cols).catch(e => console.warn('[DB.saveColumns]', e));
      } else {
        lsSet(`jk_cols_${userId}`, cols);
      }
    },

    createColumn(userId, name, order) {
      const col = { id: uid(), userId, name, visible: true, order, createdAt: Date.now() };
      this._cache.columns.push(col);
      this.saveColumns(userId, this.getColumns(userId));
      return col;
    },

    // ── Jumps ─────────────────────────────────────────────────────
    getJumps(userId) {
      return this._cache.jumps.filter(j => j.userId === userId);
    },

    // Internal: persist a single jump to SQLite or localStorage
    _persistJump(userId, jump) {
      if (window.electronAPI) {
        window.electronAPI.saveJump(userId, jump).catch(e => console.warn('[DB._persistJump]', e));
      } else {
        lsSet(`jk_jumps_${userId}`, this.getJumps(userId));
      }
    },

    createJump(userId, data) {
      const jump = {
        id:          data.id || uid(),
        userId,
        name:        data.name,
        url:         data.url,
        description: data.description || '',
        reason:      data.reason || '',
        columnId:    data.columnId,
        hotkey:      data.hotkey || '',
        favorite:    data.favorite || false,
        isArchived:  false,
        clickCount:  0,
        lastUsed:    null,
        createdAt:   Date.now(),
        updatedAt:   Date.now(),
        isShared:    data.isShared || false,
        teamId:      data.teamId || null,
        supabaseId:  data.supabaseId || null,
      };
      this._cache.jumps.push(jump);
      this._persistJump(userId, jump);
      return jump;
    },

    updateJump(userId, id, data) {
      const idx = this._cache.jumps.findIndex(j => j.id === id && j.userId === userId);
      if (idx < 0) return null;
      Object.assign(this._cache.jumps[idx], data, { updatedAt: Date.now() });
      this._persistJump(userId, this._cache.jumps[idx]);
      return this._cache.jumps[idx];
    },

    deleteJump(userId, id) {
      this._cache.jumps = this._cache.jumps.filter(j => !(j.id === id && j.userId === userId));
      if (window.electronAPI) {
        window.electronAPI.deleteJump(userId, id).catch(e => console.warn('[DB.deleteJump]', e));
      } else {
        lsSet(`jk_jumps_${userId}`, this.getJumps(userId));
      }
    },

    archiveJump(userId, id)   { return this.updateJump(userId, id, { isArchived: true  }); },
    unarchiveJump(userId, id) { return this.updateJump(userId, id, { isArchived: false }); },

    incrementClick(userId, id) {
      const idx = this._cache.jumps.findIndex(j => j.id === id && j.userId === userId);
      if (idx >= 0) {
        this._cache.jumps[idx].clickCount = (this._cache.jumps[idx].clickCount || 0) + 1;
        this._cache.jumps[idx].lastUsed   = Date.now();
        this._cache.jumps[idx].updatedAt  = Date.now();
        this._persistJump(userId, this._cache.jumps[idx]);
      }
      this.logClick(userId, id);
    },

    getActiveJumps(userId)   { return this.getJumps(userId).filter(j => !j.isArchived); },
    getArchivedJumps(userId) { return this.getJumps(userId).filter(j =>  j.isArchived); },

    // ── Click Log ─────────────────────────────────────────────────
    getClickLog(userId) {
      return this._cache.clickLog.filter(e => e.userId === userId);
    },

    logClick(userId, jumpId) {
      const entry = { userId, jumpId, ts: Date.now() };
      this._cache.clickLog.push(entry);
      // Trim in-memory log to 10 000 entries per user
      const userLog = this._cache.clickLog.filter(e => e.userId === userId);
      if (userLog.length > 10000) {
        const overflow = userLog.length - 10000;
        let removed = 0;
        this._cache.clickLog = this._cache.clickLog.filter(e => {
          if (e.userId === userId && removed < overflow) { removed++; return false; }
          return true;
        });
      }
      if (window.electronAPI) {
        window.electronAPI.logClick(userId, jumpId, entry.ts).catch(e => console.warn('[DB.logClick]', e));
      } else {
        lsSet(`jk_clicks_${userId}`, this.getClickLog(userId));
      }
    },

    // ── Prefs ─────────────────────────────────────────────────────
    getPrefs(userId) {
      if (this._cache.prefs && this._userId === userId) {
        return Object.assign(defaultPrefs(), this._cache.prefs);
      }
      // Fallback: read from localStorage (shouldn't normally happen after init)
      const rawPrefs = lsGet(`jk_prefs_${userId}`, null);
      return Object.assign(defaultPrefs(), rawPrefs || {}, {
        subscriptionStatus: localStorage.getItem('jk_subscription_status') || 'free',
        subscriptionTier:   localStorage.getItem('jk_subscription_tier')   || 'free',
        role:               localStorage.getItem('jk_role')                 || 'team-member',
      });
    },

    savePrefs(userId, prefs) {
      this._cache.prefs = { ...this._cache.prefs, ...prefs };
      if (window.electronAPI) {
        window.electronAPI.savePrefs(userId, this._cache.prefs).catch(e => console.warn('[DB.savePrefs]', e));
      } else {
        lsSet(`jk_prefs_${userId}`, this._cache.prefs);
      }
    },

    // ── Seed new user ─────────────────────────────────────────────
    async seedNewUser(userId) {
      if (window.electronAPI) {
        // Delegate to main process; pass platform so it can pick the right example jump
        const platform = window.electronAPI.platform || 'darwin';
        const result = await window.electronAPI.seedNewUser(userId, platform);
        if (result?.ok) {
          // Reload cache from SQLite so the app sees the seeded data
          await this.init(userId);
        }
      } else {
        // localStorage fallback seed
        const now = Date.now();
        const colDefs = [
          { name: 'Col 1',  visible: true  },
          { name: 'Col 2',  visible: true  },
          { name: 'Col 3',  visible: true  },
          { name: 'Col 4',  visible: true  },
          { name: 'Col 5',  visible: true  },
          { name: 'Col 6',  visible: true  },
          { name: 'Col 7',  visible: true  },
          { name: 'Col 8',  visible: false },
          { name: 'Col 9',  visible: false },
          { name: 'Col 10', visible: false },
        ];
        const cols = colDefs.map((def, i) => ({
          id: uid(), userId, name: def.name, visible: def.visible, order: i, createdAt: now,
        }));
        this._cache.columns = [...this._cache.columns.filter(c => c.userId !== userId), ...cols];
        lsSet(`jk_cols_${userId}`, cols);

        const isWin = window.electronAPI?.platform === 'win32';
        const jumps = [
          {
            id: uid(), userId,
            name: 'Google', url: 'www.google.com',
            description: 'Link to Google', reason: 'To show an example web jump',
            columnId: cols[0].id, hotkey: 'Ctrl+Shift+G', favorite: true,
            isArchived: false, clickCount: 0, lastUsed: null,
            createdAt: now, updatedAt: now, isShared: false, teamId: null,
          },
          isWin
            ? {
                id: uid(), userId,
                name: 'C Drive', url: 'C:\\',
                description: 'Link to C drive folder', reason: 'To show an example directory jump',
                columnId: cols[1].id, hotkey: 'Ctrl+Shift+C', favorite: true,
                isArchived: false, clickCount: 0, lastUsed: null,
                createdAt: now, updatedAt: now, isShared: false, teamId: null,
              }
            : {
                id: uid(), userId,
                name: 'Users', url: '/users',
                description: 'Link to macOS /users folder', reason: 'To show an example directory jump',
                columnId: cols[1].id, hotkey: 'Ctrl+Shift+U', favorite: true,
                isArchived: false, clickCount: 0, lastUsed: null,
                createdAt: now, updatedAt: now, isShared: false, teamId: null,
              },
        ];
        this._cache.jumps = [...this._cache.jumps.filter(j => j.userId !== userId), ...jumps];
        lsSet(`jk_jumps_${userId}`, jumps);
      }
    },
  };
})();
