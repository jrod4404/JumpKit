// ── JumpKit DB (SQLite via IPC + in-memory cache) ──────────────────
// Reads come from the in-memory cache (synchronous, fast).
// Writes update the cache immediately, then fire-and-forget to SQLite via IPC.
// When electronAPI is not available (browser dev mode), falls back to localStorage.

const DB = (() => {
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ── Seed lock — prevents duplicate seeding in same session ───────
  const _seededThisSession = new Set();

  // ── Init in-flight lock — deduplicates concurrent DB.init() calls ─
  // If two callers invoke init() for the same userId simultaneously,
  // the second waits on the first's Promise instead of running a parallel
  // init that can race past the seed guard and double-seed.
  const _initInFlight = new Map(); // userId → Promise

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
      dollarsPerHour:     50,
      showDescription:  false,
      showHotkey:       false,
      showColTeamName:  true,
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
    // subscription/role are intentionally not read from localStorage — always
    // use window._supabaseProfile (in-memory) to prevent paywall tampering.
    const prefs = Object.assign(defaultPrefs(), rawPrefs || {});
    return { jumps, columns, clickLog, prefs, hasPrefs: !!rawPrefs };
  }

  function normalizeLegacyRows(rows, userId) {
    return (Array.isArray(rows) ? rows : []).map(r => ({ ...r, userId }));
  }

  function hasPersonalData(rows) {
    return (Array.isArray(rows) ? rows : []).some(r => !r.isShared);
  }

  function hasLegacyData(legacy) {
    return hasPersonalData(legacy?.columns) || hasPersonalData(legacy?.jumps);
  }

  function normalizeSnapshotRows(rows, userId) {
    return (Array.isArray(rows) ? rows : []).map(r => ({ ...r, userId }));
  }

  async function restoreLegacyLocalStorageToSQLite(userId, legacy) {
    if (!window.electronAPI || !legacy || !hasLegacyData(legacy)) return false;
    const columns  = normalizeLegacyRows(legacy.columns, userId);
    const jumps    = normalizeLegacyRows(legacy.jumps, userId);
    const clickLog = normalizeLegacyRows(legacy.clickLog, userId);

    try {
      if (window.electronAPI.saveColumn) {
        for (const col of columns) await window.electronAPI.saveColumn(userId, col);
      } else if (window.electronAPI.saveColumns) {
        await window.electronAPI.saveColumns(userId, columns);
      }
      for (const jump of jumps) await window.electronAPI.saveJump(userId, jump);
      for (const entry of clickLog) {
        await window.electronAPI.logClick(userId, entry.jumpId, entry.ts || Date.now(), entry.jumpName || null);
      }
      if (legacy.hasPrefs && window.electronAPI.savePrefs) {
        await window.electronAPI.savePrefs(userId, legacy.prefs);
      }
      console.info('[DB.init] Restored legacy localStorage JumpKit data into SQLite.');
      return true;
    } catch (err) {
      console.warn('[DB.init] Legacy localStorage restore failed:', err);
      return false;
    }
  }

  return {
    // ── In-memory cache ────────────────────────────────────────────
    _cache: { jumps: [], columns: [], clickLog: [], prefs: null },
    _userId: null,
    _sqliteAvailable: true,

    _saveLocalFallback(userId) {
      if (!userId) return;
      lsSet(`jk_cols_${userId}`, this.getColumns(userId));
      lsSet(`jk_jumps_${userId}`, this.getJumps(userId));
      lsSet(`jk_clicks_${userId}`, this.getClickLog(userId));
      if (this._cache.prefs) lsSet(`jk_prefs_${userId}`, this._cache.prefs);
    },

    _markSqliteUnavailable(reason) {
      if (this._sqliteAvailable) console.warn('[DB] SQLite unavailable; using local fallback:', reason || 'unknown');
      this._sqliteAvailable = false;
    },

    async persistUserData(userId) {
      if (!userId) return false;
      const columns = this.getColumns(userId);
      const jumps = this.getJumps(userId);
      const prefs = this._cache.prefs;
      const _persistArchived = jumps.filter(j => j.isArchived).map(j => j.name);
      console.log('[ARCHIVE-DEBUG] persistUserData: about to write archived =', _persistArchived, new Error().stack.split('\n')[2]?.trim());

      // Always write the local fallback first. It is harmless when SQLite works,
      // and it protects imports when a packaged/dev build cannot load better-sqlite3.
      this._saveLocalFallback(userId);

      if (window.electronAPI && this._sqliteAvailable !== false) {
        try {
          if (window.electronAPI.saveColumns) {
            const result = await window.electronAPI.saveColumns(userId, columns);
            if (result && result.ok === false) throw new Error(result.reason || 'saveColumns failed');
          }
          for (const jump of jumps) {
            if (window.electronAPI.saveJump) {
              const result = await window.electronAPI.saveJump(userId, jump);
              if (result && result.ok === false) throw new Error(result.reason || `saveJump failed for ${jump.id}`);
            }
          }
          if (prefs && window.electronAPI.savePrefs) {
            const result = await window.electronAPI.savePrefs(userId, prefs);
            if (result && result.ok === false) throw new Error(result.reason || 'savePrefs failed');
          }
        } catch (err) {
          this._markSqliteUnavailable(err.message || err);
          // Local fallback was already written above, so persistence is still ok.
          return true;
        }
      }
      return true;
    },

    async saveRecoverySnapshot(userId, reason = 'manual') {
      if (!userId) return false;
      try {
        const archived = this.getJumps(userId).filter(j => j.isArchived).map(j => j.name);
        console.log(`[ARCHIVE-DEBUG] saveRecoverySnapshot(${reason}): archived in cache =`, archived);
        const snapshot = {
          version: 1,
          reason,
          savedAt: new Date().toISOString(),
          userId,
          // Personal only — exclude team/shared jumps so they don't get
          // re-injected into SQLite as ghost entries on restore.
          jumps:   this.getJumps(userId).filter(j => !j.teamId),
          columns: this.getColumns(userId).filter(c => !c.teamId),
          clickLog: this.getClickLog(userId),
          prefs: this.getPrefs(userId),
        };
        if (!hasLegacyData(snapshot) && !snapshot.clickLog.length) return false;
        if (window.electronAPI?.saveRecoverySnapshot && this._sqliteAvailable !== false) {
          const result = await window.electronAPI.saveRecoverySnapshot(userId, snapshot);
          if (result?.ok) return true;
          this._markSqliteUnavailable(result?.reason || 'saveRecoverySnapshot failed');
        }
        // Browser/no-SQLite mode deliberately does not persist recovery snapshots
        // to localStorage because snapshots can contain jump URLs and click history.
        return false;
      } catch (_) {
        return false;
      }
    },

    async _restoreRecoverySnapshot(userId) {
      let snapshot = null;
      try {
        if (window.electronAPI?.getRecoverySnapshot && this._sqliteAvailable !== false) {
          const result = await window.electronAPI.getRecoverySnapshot(userId);
          if (result?.ok) snapshot = result.snapshot;
        }
      } catch (_) {}
      if (!snapshot || snapshot.userId !== userId) return false;
      const snapArchivedNames = (snapshot.jumps || []).filter(j => j.isArchived).map(j => j.name);
      console.log('[ARCHIVE-DEBUG] _restoreRecoverySnapshot: snapshot archived =', snapArchivedNames);
      console.log('[ARCHIVE-DEBUG] _restoreRecoverySnapshot: cache has personal data?', hasPersonalData(this._cache.columns), hasPersonalData(this._cache.jumps));

      // Strip any team-linked rows that may have been saved by older versions.
      const snapColumns = normalizeSnapshotRows(snapshot.columns, userId).filter(c => !c.teamId);
      const snapJumps   = normalizeSnapshotRows(snapshot.jumps, userId).filter(j => !j.teamId);
      const snapClickLog = normalizeSnapshotRows(snapshot.clickLog, userId);
      let restored = false;

      // If the local machine looks empty after a forced remote logout/login, restore
      // the last known local dataset before first-run seeding or rendering can make
      // the account appear reset.
      if (!hasPersonalData(this._cache.columns) && !hasPersonalData(this._cache.jumps) && (hasPersonalData(snapColumns) || hasPersonalData(snapJumps))) {
        this._cache.columns = snapColumns;
        this._cache.jumps = snapJumps.map(j => ({ ...j, favorite: !!j.favorite, isArchived: !!j.isArchived, isShared: !!j.isShared }));
        if (window.electronAPI) {
          if (window.electronAPI.saveColumns) await window.electronAPI.saveColumns(userId, snapColumns);
          for (const jump of this._cache.jumps) await window.electronAPI.saveJump(userId, jump);
        } else {
          lsSet(`jk_cols_${userId}`, snapColumns);
          lsSet(`jk_jumps_${userId}`, this._cache.jumps);
        }
        restored = true;
      }

      // Stats are independently valuable. Restore only when the current click log is
      // empty to avoid duplicates.
      if ((!this._cache.clickLog || this._cache.clickLog.length === 0) && snapClickLog.length) {
        this._cache.clickLog = snapClickLog;
        if (window.electronAPI) {
          for (const entry of snapClickLog) {
            await window.electronAPI.logClick(userId, entry.jumpId, entry.ts || Date.now(), entry.jumpName || null);
          }
        } else {
          lsSet(`jk_clicks_${userId}`, snapClickLog);
        }
        restored = true;
      }

      if (!this._cache.prefs && snapshot.prefs) {
        this._cache.prefs = Object.assign(defaultPrefs(), snapshot.prefs);
        if (window.electronAPI?.savePrefs) await window.electronAPI.savePrefs(userId, this._cache.prefs);
        else lsSet(`jk_prefs_${userId}`, this._cache.prefs);
      }

      return restored;
    },

    async _repairRenderablePersonalData(userId) {
      let changed = false;
      let personalJumps = this._cache.jumps.filter(j => j.userId === userId && !j.isShared);
      if (!personalJumps.length) return false;

      const isRecoveredCol = c => c.name === 'Recovered' || String(c.id || '').startsWith('recovered_');
      let userCols = this._cache.columns.filter(c => c.userId === userId);
      let personalCols = userCols.filter(c => !c.isShared);
      const recoveredCols = personalCols.filter(isRecoveredCol);
      const realPersonalCols = personalCols.filter(c => !isRecoveredCol(c));

      // If repeated failed-import/recovery cycles created several Recovered cols,
      // collapse them into one so the UI doesn't show piles of the same jump.
      let primaryRecovered = recoveredCols[0] || null;
      if (recoveredCols.length > 1) {
        const recoveredIds = new Set(recoveredCols.map(c => c.id));
        personalJumps.forEach(j => {
          if (recoveredIds.has(j.columnId)) j.columnId = primaryRecovered.id;
        });
        const removeIds = new Set(recoveredCols.slice(1).map(c => c.id));
        this._cache.columns = this._cache.columns.filter(c => !(c.userId === userId && removeIds.has(c.id)));
        changed = true;
      }

      userCols = this._cache.columns.filter(c => c.userId === userId);
      personalCols = userCols.filter(c => !c.isShared);
      const visibleRealCol = realPersonalCols.find(c => c.visible) || realPersonalCols[0] || null;
      let validColIds = new Set(userCols.map(c => c.id));

      if (personalCols.length === 0) {
        primaryRecovered = {
          id: `recovered_${Date.now()}`,
          userId,
          name: 'Recovered',
          visible: true,
          order: 0,
          createdAt: Date.now(),
          isShared: false,
          teamId: null,
          supabaseId: null,
        };
        this._cache.columns.push(primaryRecovered);
        validColIds.add(primaryRecovered.id);
        personalCols = [primaryRecovered];
        changed = true;
      }

      // Keep columns with personal jumps visible; hidden columns made imported data
      // look missing even though Home counted the jumps.
      const jumpColIds = new Set(personalJumps.map(j => j.columnId).filter(Boolean));
      this._cache.columns.forEach(c => {
        if (c.userId === userId && !c.isShared && jumpColIds.has(c.id) && !c.visible) {
          c.visible = true;
          changed = true;
        }
      });

      validColIds = new Set(this._cache.columns.filter(c => c.userId === userId).map(c => c.id));
      personalCols = this._cache.columns.filter(c => c.userId === userId && !c.isShared);
      primaryRecovered = personalCols.find(isRecoveredCol) || null;
      const fallbackCol = visibleRealCol || personalCols.find(c => c.visible) || personalCols[0];

      personalJumps.forEach(j => {
        if (!j.columnId || !validColIds.has(j.columnId)) {
          j.columnId = fallbackCol.id;
          changed = true;
        }
      });

      // Dedupe recovered junk from repeated failed imports. Prefer the non-Recovered
      // copy if one exists elsewhere; otherwise keep a single copy in Recovered.
      const recoveredIds = new Set(personalCols.filter(isRecoveredCol).map(c => c.id));
      const nonRecoveredKeys = new Set();
      const norm = v => String(v || '').trim().toLowerCase();
      const jumpKey = j => norm(j.url) || `name:${norm(j.name)}`;
      this._cache.jumps
        .filter(j => j.userId === userId && !j.isShared && !recoveredIds.has(j.columnId))
        .forEach(j => { const key = jumpKey(j); if (key) nonRecoveredKeys.add(key); });

      const seenRecovered = new Set();
      const duplicateRecoveredIds = new Set();
      this._cache.jumps
        .filter(j => j.userId === userId && !j.isShared && recoveredIds.has(j.columnId))
        .forEach(j => {
          const key = jumpKey(j);
          if (!key) return;
          if (nonRecoveredKeys.has(key) || seenRecovered.has(key)) duplicateRecoveredIds.add(j.id);
          else seenRecovered.add(key);
        });
      if (duplicateRecoveredIds.size > 0) {
        this._cache.jumps = this._cache.jumps.filter(j => !(j.userId === userId && duplicateRecoveredIds.has(j.id)));
        changed = true;
      }

      if (!changed) return false;
      this._saveLocalFallback(userId);
      const colsForUser = this._cache.columns.filter(c => c.userId === userId);
      if (window.electronAPI && this._sqliteAvailable !== false) {
        if (window.electronAPI.saveColumns) await window.electronAPI.saveColumns(userId, colsForUser);
        for (const jump of this._cache.jumps.filter(j => j.userId === userId && !j.isShared)) {
          await window.electronAPI.saveJump(userId, jump);
        }
        for (const id of duplicateRecoveredIds || []) {
          if (window.electronAPI.deleteJump) await window.electronAPI.deleteJump(userId, id);
        }
      }
      return true;
    },

    async _removeOrphanSharedJumps(userId) {
      const validColumnIds = new Set(this._cache.columns
        .filter(c => c.userId === userId)
        .map(c => c.id));
      const orphanSharedIds = this._cache.jumps
        .filter(j => j.userId === userId && !j.isArchived && (j.isShared || j.teamId) && (!j.columnId || !validColumnIds.has(j.columnId)))
        .map(j => j.id);
      if (!orphanSharedIds.length) return false;

      this._cache.jumps = this._cache.jumps.filter(j => !(j.userId === userId && orphanSharedIds.includes(j.id)));
      this._saveLocalFallback(userId);
      if (window.electronAPI && this._sqliteAvailable !== false) {
        for (const id of orphanSharedIds) await window.electronAPI.deleteJump(userId, id);
      }
      console.info(`[DB.repair] Removed ${orphanSharedIds.length} orphan shared/team jump(s).`);
      return true;
    },

    // ── Init (called once after auth, before renderApp) ────────────
    async init(userId) {
      // Deduplicate concurrent calls for the same userId
      if (_initInFlight.has(userId)) {

        return _initInFlight.get(userId);
      }
      const initPromise = this._doInit(userId);
      _initInFlight.set(userId, initPromise);
      initPromise.finally(() => _initInFlight.delete(userId));
      return initPromise;
    },

    async _doInit(userId) {
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
          const _initArchived = this._cache.jumps.filter(j => j.userId === userId && j.isArchived).map(j => j.name);
          console.log('[ARCHIVE-DEBUG] init: loaded from SQLite, archived =', _initArchived);

          // If Electron IPC exists but SQLite is unavailable, getters return empty
          // arrays. In that case use the same local fallback as browser mode.
          const localFallback = lsLoadAll(userId);
          if (!hasPersonalData(this._cache.columns) && !hasPersonalData(this._cache.jumps) && hasLegacyData(localFallback)) {
            this._markSqliteUnavailable('empty electron data with local fallback present');
            this._cache.jumps    = normalizeLegacyRows(localFallback.jumps, userId).map(j => ({ ...j, favorite: !!j.favorite, isArchived: !!j.isArchived, isShared: !!j.isShared }));
            this._cache.columns  = normalizeLegacyRows(localFallback.columns, userId).map(c => ({ ...c, visible: !!c.visible, isShared: !!c.isShared }));
            this._cache.clickLog = normalizeLegacyRows(localFallback.clickLog, userId);
            this._cache.prefs    = localFallback.prefs || defaultPrefs();
          }

          // Safety net for older/web builds: if SQLite has no personal data but
          // legacy localStorage still does, restore it into SQLite before any
          // first-run seeding or cleanup can make the app look empty.
          const legacy = lsLoadAll(userId);
          if (!hasPersonalData(this._cache.columns) && !hasPersonalData(this._cache.jumps) && hasLegacyData(legacy)) {
            const restored = await restoreLegacyLocalStorageToSQLite(userId, legacy);
            if (restored) {
              const [restoredJumps, restoredColumns, restoredLog, restoredPrefs] = await Promise.all([
                window.electronAPI.getJumps(userId),
                window.electronAPI.getColumns(userId),
                window.electronAPI.getClickLog(userId),
                window.electronAPI.getPrefs(userId),
              ]);
              this._cache.jumps    = (restoredJumps   || []).map(j => ({ ...j, favorite: !!j.favorite, isArchived: !!j.isArchived, isShared: !!j.isShared }));
              this._cache.columns  = (restoredColumns || []).map(c => ({ ...c, visible: !!c.visible, isShared: !!c.isShared }));
              this._cache.clickLog = restoredLog      || [];
              this._cache.prefs    = restoredPrefs    || defaultPrefs();
            }
          }

          await this._restoreRecoverySnapshot(userId);
          await this._repairRenderablePersonalData(userId);
          await this._removeOrphanSharedJumps(userId);

          // After a successful SQLite load (with data), remove stale localStorage
          // fallback keys. They were written when SQLite was unavailable and now
          // cause false "empty electron data with local fallback present" warnings.
          // Only clear when SQLite is confirmed available and has personal data.
          if (this._sqliteAvailable !== false && (hasPersonalData(this._cache.columns) || hasPersonalData(this._cache.jumps))) {
            try {
              [`jk_cols_${userId}`, `jk_jumps_${userId}`, `jk_clicks_${userId}`, `jk_prefs_${userId}`]
                .forEach(k => localStorage.removeItem(k));
              console.info('[DB] Cleared localStorage fallback — SQLite is source of truth.');
            } catch (_) {}
          }

          // Backfill jumpName on existing click log entries where it's missing
          // This preserves names for currently-existing jumps if they're deleted later
          let _backfillDirty = false;
          this._cache.clickLog.forEach(e => {
            if (!e.jumpName) {
              const _j = this._cache.jumps.find(j => j.id === e.jumpId);
              if (_j?.name) { e.jumpName = _j.name; _backfillDirty = true; }
            }
          });
          if (_backfillDirty && window.electronAPI?.logClickName) {
            // Persist backfilled names to SQLite
            this._cache.clickLog.filter(e => e.jumpName && e.id).forEach(e => {
              window.electronAPI.logClickName(userId, e.id, e.jumpName).catch(() => {});
            });
          }

          // Auto-seed if this user has no personal (non-shared) columns.
          // Re-fetch columns fresh only when SQLite is available. If SQLite is
          // unavailable, the cache already contains the local fallback data;
          // overwriting it with empty IPC results makes the Jumps page render blank.
          if (this._sqliteAvailable !== false) {
            const freshCols = await window.electronAPI.getColumns(userId);
            this._cache.columns = (freshCols || []).map(c => ({ ...c, visible: !!c.visible, isShared: !!c.isShared }));
          }
          const personalCols = this._cache.columns.filter(c => !c.isShared);

          // Check seeded_at from Supabase profiles instead of localStorage.
          // This prevents re-seeding across devices and after localStorage clears.
          let alreadySeeded = _seededThisSession.has(userId);
          if (!alreadySeeded && window.supabaseClient && window._supabaseUser) {
            try {
              const { data: seedCheck } = await window.supabaseClient
                .from('profiles').select('seeded_at').eq('id', userId).single();
              alreadySeeded = !!seedCheck?.seeded_at;
            } catch (_) { /* offline or Supabase unavailable — fall through, columns check is the primary guard */ }
          }

          if (personalCols.length === 0 && !alreadySeeded) {
            _seededThisSession.add(userId);

            await window.electronAPI.seedNewUser(userId);
            // Mark seeded in Supabase (fire-and-forget)
            if (window.supabaseClient && window._supabaseUser) {
              window.supabaseClient.from('profiles')
                .update({ seeded_at: new Date().toISOString() })
                .eq('id', userId)
                .then(() => {})
                .catch(() => {});
            }
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
          await this._restoreRecoverySnapshot(userId);
          await this._repairRenderablePersonalData(userId);
        }
      } else {
        // Browser / dev mode — use localStorage
        const fb = lsLoadAll(userId);
        this._cache.jumps    = fb.jumps;
        this._cache.columns  = fb.columns;
        this._cache.clickLog = fb.clickLog;
        this._cache.prefs    = fb.prefs;
        await this._restoreRecoverySnapshot(userId);
        await this._repairRenderablePersonalData(userId);
        await this._removeOrphanSharedJumps(userId);
        if (!hasPersonalData(this._cache.columns) && !hasPersonalData(this._cache.jumps) && !_seededThisSession.has(userId)) {
          _seededThisSession.add(userId);
          await this.seedNewUser(userId);
        }
      }
    },

    // ── Users (localStorage — auth is Supabase-managed) ───────────
    getUsers()           { return lsGet('jk_users', []); },
    saveUsers(users)     { lsSet('jk_users', users); },
    findUserByEmail(email) { return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()); },
    createUser(name, email, password, forceId = null) {
      const users = this.getUsers();
      if (this.findUserByEmail(email)) return null;
      const user = { id: forceId || uid(), name, email, createdAt: Date.now() }; // password intentionally excluded — auth is Supabase-managed
      users.push(user);
      this.saveUsers(users);
      return user;
    },
    migrateLocalStorageUserId(oldId, newId) {
      if (!oldId || !newId || oldId === newId) return;
      ['jumps', 'cols', 'clicks', 'prefs'].forEach(kind => {
        const oldKey = `jk_${kind}_${oldId}`;
        const newKey = `jk_${kind}_${newId}`;
        const val = lsGet(oldKey, null);
        if (!val || localStorage.getItem(newKey)) return;
        const migrated = Array.isArray(val) ? val.map(row => ({ ...row, userId: newId })) : val;
        lsSet(newKey, migrated);
      });
    },
    // NOTE: jk_current_user localStorage key has been removed.
    // The canonical user ID always comes from window._supabaseUser (in-memory Supabase session).
    // Supabase handles its own session persistence via persistSession:true in client.js.
    getCurrentUserId()   { return window._supabaseUser?.id || null; },
    setCurrentUserId(_)  { /* no-op: Supabase session owns this */ },
    clearCurrentUser()   { /* no-op: supabaseClient.auth.signOut() owns this */ },
    setSession(_)        { /* no-op: Supabase session owns this */ },
    clearSession()       { /* no-op: supabaseClient.auth.signOut() owns this */ },
    getCurrentUser() {
      const id = this.getCurrentUserId();
      return id ? this.getUsers().find(u => u.id === id) || null : null;
    },

    // ── Columns ───────────────────────────────────────────────────
    getColumns(userId) {
      return this._cache.columns
        .filter(c => c.userId === userId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    saveColumns(userId, cols) {
      // Replace all columns for this user in cache
      this._cache.columns = [
        ...this._cache.columns.filter(c => c.userId !== userId),
        ...cols.map(c => ({ ...c, userId })),
      ];
      // Persist to local fallback always, then SQLite when available.
      this._saveLocalFallback(userId);
      if (window.electronAPI && this._sqliteAvailable !== false) {
        window.electronAPI.saveColumns(userId, cols).then(result => {
          if (result && result.ok === false) this._markSqliteUnavailable(result.reason || 'saveColumns failed');
        }).catch(e => this._markSqliteUnavailable(e.message || e));
      }
    },

    _persistColumn(userId, col) {
      lsSet(`jk_cols_${userId}`, this.getColumns(userId));
      if (window.electronAPI?.saveColumn && this._sqliteAvailable !== false) {
        window.electronAPI.saveColumn(userId, col).then(result => {
          if (result && result.ok === false) this._markSqliteUnavailable(result.reason || 'saveColumn failed');
        }).catch(e => this._markSqliteUnavailable(e.message || e));
      } else if (window.electronAPI?.saveColumns && this._sqliteAvailable !== false) {
        window.electronAPI.saveColumns(userId, this.getColumns(userId)).then(result => {
          if (result && result.ok === false) this._markSqliteUnavailable(result.reason || 'saveColumns failed');
        }).catch(e => this._markSqliteUnavailable(e.message || e));
      }
    },

    createColumn(userId, name, order) {
      const col = { id: uid(), userId, name, visible: true, order, createdAt: Date.now(), isShared: false, teamId: null, supabaseId: null };
      this._cache.columns.push(col);
      // Single-column upsert avoids destructive bulk-replace races during imports/sync.
      this._persistColumn(userId, col);
      return col;
    },

    // ── Jumps ─────────────────────────────────────────────────────
    getJumps(userId) {
      return this._cache.jumps.filter(j => j.userId === userId);
    },

    // Internal: persist a single jump to SQLite or localStorage
    _persistJump(userId, jump) {
      lsSet(`jk_jumps_${userId}`, this.getJumps(userId).filter(j => !j.teamId));
      if (window.electronAPI && this._sqliteAvailable !== false) {
        window.electronAPI.saveJump(userId, jump).then(result => {
          if (result && result.ok === false) this._markSqliteUnavailable(result.reason || 'saveJump failed');
        }).catch(e => this._markSqliteUnavailable(e.message || e));
      }
    },

    createJump(userId, data) {
      const validColumnIds = new Set(this.getColumns(userId).map(c => c.id));
      if (!data.columnId || !validColumnIds.has(data.columnId)) {
        console.warn('[DB.createJump] blocked orphan jump create: invalid columnId');
        return null;
      }
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
      if (Object.prototype.hasOwnProperty.call(data, 'isArchived')) {
        const j = this._cache.jumps.find(j => j.id === id && j.userId === userId);
        console.log(`[ARCHIVE-DEBUG] updateJump: ${j?.name} → isArchived=${data.isArchived}`, new Error().stack.split('\n')[2]?.trim());
      }
      const idx = this._cache.jumps.findIndex(j => j.id === id && j.userId === userId);
      if (idx < 0) return null;
      if (Object.prototype.hasOwnProperty.call(data, 'columnId')) {
        const validColumnIds = new Set(this.getColumns(userId).map(c => c.id));
        if (!data.columnId || !validColumnIds.has(data.columnId)) {
          console.warn('[DB.updateJump] blocked orphan jump update: invalid columnId');
          return null;
        }
      }
      Object.assign(this._cache.jumps[idx], data, { updatedAt: Date.now() });
      this._persistJump(userId, this._cache.jumps[idx]);
      return this._cache.jumps[idx];
    },

    deleteJump(userId, id) {
      this._cache.jumps = this._cache.jumps.filter(j => !(j.id === id && j.userId === userId));
      lsSet(`jk_jumps_${userId}`, this.getJumps(userId));
      if (window.electronAPI && this._sqliteAvailable !== false) {
        window.electronAPI.deleteJump(userId, id).then(result => {
          if (result && result.ok === false) this._markSqliteUnavailable(result.reason || 'deleteJump failed');
        }).catch(e => this._markSqliteUnavailable(e.message || e));
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
      const _clickedJump = this._cache.jumps.find(j => j.id === id);
      this.logClick(userId, id, _clickedJump?.name || null);
    },

    getActiveJumps(userId)   { return this.getJumps(userId).filter(j => !j.isArchived); },
    getRenderableActiveJumps(userId) {
      const validColumnIds = new Set(this.getColumns(userId).map(c => c.id));
      return this.getActiveJumps(userId).filter(j => j.columnId && validColumnIds.has(j.columnId));
    },
    getArchivedJumps(userId) { return this.getJumps(userId).filter(j =>  j.isArchived); },

    // ── Click Log ─────────────────────────────────────────────────
    getClickLog(userId) {
      return this._cache.clickLog.filter(e => e.userId === userId);
    },

    logClick(userId, jumpId, jumpName) {
      const entry = { userId, jumpId, ts: Date.now(), jumpName: jumpName || null };
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
        window.electronAPI.logClick(userId, jumpId, entry.ts, jumpName).catch(e => console.warn('[DB.logClick]', e));
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
      // NOTE: subscription/role are intentionally excluded — must come from
      // window._supabaseProfile only to prevent client-side paywall tampering.
      const rawPrefs = lsGet(`jk_prefs_${userId}`, null);
      return Object.assign(defaultPrefs(), rawPrefs || {});
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
