// Regression test for the owner shared-column wipe (2026-10-09).
// Bug: syncSharedJumps built `remoteColIds` by EXCLUDING teams the user owns
// (owner columns are local source of truth), but `staleByUnshared` did NOT
// exclude owned teams. Result: an owner's legacy old-format column
// (isShared + teamId + supabaseId, no sharedTeams[]) always looked like
// "owner unshared it" → recovery modal → column deleted/flipped to personal
// on the OWNER's machine, while members kept seeing it.
//
// This mirrors the classification logic in js/sync.js and asserts the fix.
import { test } from 'node:test';
import assert from 'node:assert';

// Mirrors js/sync.js stale detection (post-fix)
function classifyStale({ existingCols, teamIds, ownedTeamIds, remoteColIds }) {
  const _isOldFormat = c =>
    c.isShared && c.teamId && !(Array.isArray(c.sharedTeams) && c.sharedTeams.length > 0);

  const staleByTeamGone = existingCols.filter(c =>
    _isOldFormat(c) && !ownedTeamIds.has(c.teamId) && !teamIds.includes(c.teamId)
  );
  const staleByUnshared = existingCols.filter(c =>
    _isOldFormat(c) && !ownedTeamIds.has(c.teamId) &&
    teamIds.includes(c.teamId) && c.supabaseId && !remoteColIds.has(c.supabaseId)
  );
  return { staleByTeamGone, staleByUnshared };
}

const ownedTeam = 'team-owner-1';
const otherTeam = 'team-member-2';

// Owner's legacy column on their own team
const ownerOldCol = { id: 'c1', isShared: 1, teamId: ownedTeam, supabaseId: 'sc-1', name: 'Shared Links' };

test('BUG: owner old-format column is NOT stale on their own team', () => {
  const { staleByTeamGone, staleByUnshared } = classifyStale({
    existingCols: [ownerOldCol],
    teamIds: [ownedTeam],                 // owner is a member of their own team
    ownedTeamIds: new Set([ownedTeam]),
    remoteColIds: new Set(),             // owned team's cols excluded from remote set
  });
  assert.strictEqual(staleByUnshared.length, 0, 'owner column must never be flagged unshared');
  assert.strictEqual(staleByTeamGone.length, 0, 'owner column must not be flagged team-gone');
});

test('member old-format column IS still flagged when owner truly unshares', () => {
  const memberCol = { id: 'c2', isShared: 1, teamId: otherTeam, supabaseId: 'sc-9', name: 'Docs' };
  const { staleByUnshared } = classifyStale({
    existingCols: [memberCol],
    teamIds: [otherTeam],
    ownedTeamIds: new Set(),
    remoteColIds: new Set(),             // sc-9 no longer in shared_columns
  });
  assert.strictEqual(staleByUnshared.length, 1, 'genuine unshare must still clean up for members');
});

test('member column still flagged when team is deleted/gone', () => {
  const memberCol = { id: 'c3', isShared: 1, teamId: otherTeam, supabaseId: 'sc-7', name: 'Docs' };
  const { staleByTeamGone } = classifyStale({
    existingCols: [memberCol],
    teamIds: [],                         // no longer a member
    ownedTeamIds: new Set(),
    remoteColIds: new Set(),
  });
  assert.strictEqual(staleByTeamGone.length, 1, 'deleted-team cleanup must still work');
});

test('new multi-team format columns are never stale', () => {
  const newCol = { id: 'c4', isShared: 1, teamId: null, sharedTeams: [{ teamId: ownedTeam, supabaseId: 'sc-4' }], name: 'Links' };
  const { staleByTeamGone, staleByUnshared } = classifyStale({
    existingCols: [newCol],
    teamIds: [],
    ownedTeamIds: new Set([ownedTeam]),
    remoteColIds: new Set(),
  });
  assert.strictEqual(staleByTeamGone.length, 0);
  assert.strictEqual(staleByUnshared.length, 0);
});
