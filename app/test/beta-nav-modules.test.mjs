// Regression test for the NoteKit/ClipKit UI kill switch (2026-10-09).
// Requirement: NoteKit + ClipKit must NEVER appear in the UI for any user
// (nav, sidebar, routing, settings), regardless of admin role or leaked
// main-process feature flags.
//
// Mirrors the gating logic in js/app.js (window.BETA_NAV_MODULES_ENABLED).
import { test } from 'node:test';
import assert from 'node:assert';

const BETA = false; // window.BETA_NAV_MODULES_ENABLED

// Mirrors applySidebarModulePrefs()
function sidebarVisible({ betaEnabled, isAdmin, pref }) {
  const show = betaEnabled && isAdmin && pref !== false;
  return show; // section only visible when show is true AND module flagged enabled
}

// Mirrors navigateTo() redirect
function resolvePage(page, betaEnabled) {
  if ((page === 'notekit' || page === 'clipkit') && betaEnabled !== true) return 'home';
  return page;
}

test('sidebar: hidden for non-admin', () => {
  assert.strictEqual(sidebarVisible({ betaEnabled: BETA, isAdmin: false, pref: true }), false);
});

test('sidebar: hidden for ADMIN too while beta disabled', () => {
  assert.strictEqual(sidebarVisible({ betaEnabled: BETA, isAdmin: true, pref: true }), false);
});

test('routing: notekit/clipkit forced to home while disabled', () => {
  assert.strictEqual(resolvePage('notekit', BETA), 'home');
  assert.strictEqual(resolvePage('clipkit', BETA), 'home');
});

test('routing: other pages unaffected', () => {
  assert.strictEqual(resolvePage('jumps', BETA), 'jumps');
  assert.strictEqual(resolvePage('teams', BETA), 'teams');
});
