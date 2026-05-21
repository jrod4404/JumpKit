// ── JumpKit DB (localStorage) ───────────────────────────────────────
const DB = (() => {
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  return {
    // ── Users ─────────────────────────────────────────────────────
    getUsers()           { return JSON.parse(localStorage.getItem('jk_users') || '[]'); },
    saveUsers(users)     { localStorage.setItem('jk_users', JSON.stringify(users)); },
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
    getColumns(userId)        { return JSON.parse(localStorage.getItem(`jk_cols_${userId}`) || '[]'); },
    saveColumns(userId, cols) { localStorage.setItem(`jk_cols_${userId}`, JSON.stringify(cols)); },
    createColumn(userId, name, order) {
      const col = { id: uid(), userId, name, visible: true, order, createdAt: Date.now() };
      const cols = this.getColumns(userId);
      cols.push(col);
      this.saveColumns(userId, cols);
      return col;
    },

    // ── Jumps ─────────────────────────────────────────────────────
    getJumps(userId)         { return JSON.parse(localStorage.getItem(`jk_jumps_${userId}`) || '[]'); },
    saveJumps(userId, jumps) { localStorage.setItem(`jk_jumps_${userId}`, JSON.stringify(jumps)); },
    createJump(userId, data) {
      const jumps = this.getJumps(userId);
      const jump = {
        id: uid(), userId,
        name: data.name, url: data.url, description: data.description || '',
        reason: data.reason || '', columnId: data.columnId,
        hotkey: data.hotkey || '', favorite: data.favorite || false,
        isArchived: false, clickCount: 0, lastUsed: null,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      jumps.push(jump);
      this.saveJumps(userId, jumps);
      return jump;
    },
    updateJump(userId, id, data) {
      const jumps = this.getJumps(userId);
      const i = jumps.findIndex(j => j.id === id);
      if (i < 0) return null;
      Object.assign(jumps[i], data, { updatedAt: Date.now() });
      this.saveJumps(userId, jumps);
      return jumps[i];
    },
    deleteJump(userId, id) {
      this.saveJumps(userId, this.getJumps(userId).filter(j => j.id !== id));
    },
    archiveJump(userId, id)   { return this.updateJump(userId, id, { isArchived: true }); },
    unarchiveJump(userId, id) { return this.updateJump(userId, id, { isArchived: false }); },
    incrementClick(userId, id) {
      const jumps = this.getJumps(userId);
      const j = jumps.find(j => j.id === id);
      if (j) { j.clickCount = (j.clickCount || 0) + 1; j.lastUsed = Date.now(); j.updatedAt = Date.now(); }
      this.saveJumps(userId, jumps);
      this.logClick(userId, id);
    },
    getClickLog(userId)       { return JSON.parse(localStorage.getItem(`jk_clicks_${userId}`) || '[]'); },
    saveClickLog(userId, log) { localStorage.setItem(`jk_clicks_${userId}`, JSON.stringify(log)); },
    logClick(userId, jumpId)  {
      const log = this.getClickLog(userId);
      log.push({ jumpId, ts: Date.now() });
      if (log.length > 10000) log.splice(0, log.length - 10000);
      this.saveClickLog(userId, log);
    },
    getActiveJumps(userId)   { return this.getJumps(userId).filter(j => !j.isArchived); },
    getArchivedJumps(userId) { return this.getJumps(userId).filter(j => j.isArchived); },

    // ── Prefs ─────────────────────────────────────────────────────
    getPrefs(userId) {
      const raw = localStorage.getItem(`jk_prefs_${userId}`);
      return Object.assign({
        startPage: 'home', notifications: true, cloudBackup: false,
        timePerClick: 10, dollarsPerHour: 50,
        showDescription: false, showHotkey: false, autoArchive: 'never'
      }, raw ? JSON.parse(raw) : {});
    },
    savePrefs(userId, prefs) { localStorage.setItem(`jk_prefs_${userId}`, JSON.stringify(prefs)); },

    // ── Seed default columns + example jumps for a brand-new user ──
    seedNewUser(userId) {
      const now = Date.now();
      // Col 1-7 visible, Col 8-10 hidden
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
        id: uid(), userId, name: def.name, visible: def.visible,
        order: i, createdAt: now,
      }));
      this.saveColumns(userId, cols);

      const col1Id = cols[0].id;
      const col2Id = cols[1].id;
      const isWin  = window.electronAPI?.platform === 'win32';

      const jumps = [
        {
          id: uid(), userId,
          name: 'Google',
          url: 'www.google.com',
          description: 'Link to Google',
          reason: 'To show an example web jump',
          columnId: col1Id,
          hotkey: 'Ctrl+Shift+G', favorite: true,
          isArchived: false, clickCount: 0, lastUsed: null,
          createdAt: now, updatedAt: now,
        },
        isWin
          ? {
              id: uid(), userId,
              name: 'C Drive',
              url: 'C:\\',
              description: 'Link to C drive folder',
              reason: 'To show an example directory jump',
              columnId: col2Id,
              hotkey: 'Ctrl+Shift+C', favorite: true,
              isArchived: false, clickCount: 0, lastUsed: null,
              createdAt: now, updatedAt: now,
            }
          : {
              id: uid(), userId,
              name: 'Users',
              url: '/users',
              description: 'Link to macOS /users folder',
              reason: 'To show an example directory jump',
              columnId: col2Id,
              hotkey: 'Ctrl+Shift+U', favorite: true,
              isArchived: false, clickCount: 0, lastUsed: null,
              createdAt: now, updatedAt: now,
            },
      ];
      this.saveJumps(userId, jumps);
    },
  };
})();
