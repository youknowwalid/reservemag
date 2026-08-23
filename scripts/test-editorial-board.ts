// Deterministic, network/DOM-free tests for the /editorial-board page's
// dynamic member logic (src/lib/editorialBoardView.ts). Run with
// `npm run test:editorial-board`.
//
// Same reasoning as scripts/test-contributor-signup.ts:
// EditorialBoardPage.tsx calls deriveEditorialBoardView directly, and
// EditorialBoardSection.tsx (admin) calls reorderBoardMembers directly,
// so testing these functions here IS testing the real
// empty-state-vs-member-list decision and the real reorder logic, not an
// approximation of either. Never touches Supabase, auth, or the
// network.

import { deriveEditorialBoardView, sortBoardMembers, reorderBoardMembers, type EditorialBoardMemberLike } from '../src/lib/editorialBoardView';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS -- ${label}`);
  } else {
    failed++;
    console.log(`  FAIL -- ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  }
}

function member(id: string, displayOrder: number): EditorialBoardMemberLike {
  return { id, displayOrder };
}

// ---------------------------------------------------------------------------
// deriveEditorialBoardView -- the actual public-page rendering decision
// ---------------------------------------------------------------------------

function testEmptyStateWithZeroMembers() {
  console.log('\n=== deriveEditorialBoardView: zero members -> the empty state, never bracketed placeholder content ===');
  const view = deriveEditorialBoardView([]);
  assert(view.kind === 'empty', 'an empty members array produces kind: "empty"', view);
}

function testRendersMembersWhenPresent() {
  console.log('\n=== deriveEditorialBoardView: one or more members -> the sorted member list ===');
  const members = [member('a', 0), member('b', 1)];
  const view = deriveEditorialBoardView(members);
  assert(view.kind === 'members', 'a non-empty members array produces kind: "members"', view);
  if (view.kind === 'members') {
    assert(view.members.length === 2, 'both members are present, none dropped', view.members.length);
  }
}

function testMembersAreSortedByDisplayOrder() {
  console.log('\n=== deriveEditorialBoardView / sortBoardMembers: ascending by displayOrder, regardless of input order ===');
  const outOfOrder = [member('c', 2), member('a', 0), member('b', 1)];
  const sorted = sortBoardMembers(outOfOrder);
  assert(sorted.map((m) => m.id).join(',') === 'a,b,c', 'sorted ascending by displayOrder', sorted.map((m) => m.id));

  const view = deriveEditorialBoardView(outOfOrder);
  if (view.kind === 'members') {
    assert(view.members.map((m) => m.id).join(',') === 'a,b,c', 'deriveEditorialBoardView also returns them in display order', view.members.map((m) => m.id));
  } else {
    assert(false, 'expected kind: "members" for a non-empty list');
  }
}

function testSortDoesNotMutateInput() {
  console.log('\n=== sortBoardMembers: does not mutate the array it was given ===');
  const original = [member('b', 1), member('a', 0)];
  const originalOrderIds = original.map((m) => m.id).join(',');
  sortBoardMembers(original);
  assert(original.map((m) => m.id).join(',') === originalOrderIds, 'the original array\'s order is untouched');
}

// ---------------------------------------------------------------------------
// reorderBoardMembers -- the admin CRUD section's move up/down logic
// ---------------------------------------------------------------------------

function testMoveUpSwapsWithPreviousSibling() {
  console.log('\n=== reorderBoardMembers: moving a member up swaps it with its previous sibling ===');
  const members = [member('a', 0), member('b', 1), member('c', 2)];
  const reordered = reorderBoardMembers(members, 'b', 'up');
  assert(reordered.map((m) => m.id).join(',') === 'b,a,c', 'b moved above a', reordered.map((m) => m.id));
  assert(reordered.every((m, i) => m.displayOrder === i), 'displayOrder values are recomputed sequentially (0..n-1)', reordered.map((m) => m.displayOrder));
}

function testMoveDownSwapsWithNextSibling() {
  console.log('\n=== reorderBoardMembers: moving a member down swaps it with its next sibling ===');
  const members = [member('a', 0), member('b', 1), member('c', 2)];
  const reordered = reorderBoardMembers(members, 'b', 'down');
  assert(reordered.map((m) => m.id).join(',') === 'a,c,b', 'b moved below c', reordered.map((m) => m.id));
}

function testMoveUpAtTopIsANoOp() {
  console.log('\n=== reorderBoardMembers: the top member moving up is a no-op, not a crash ===');
  const members = [member('a', 0), member('b', 1)];
  const reordered = reorderBoardMembers(members, 'a', 'up');
  assert(reordered.map((m) => m.id).join(',') === 'a,b', 'ordering is unchanged when already at the top', reordered.map((m) => m.id));
}

function testMoveDownAtBottomIsANoOp() {
  console.log('\n=== reorderBoardMembers: the bottom member moving down is a no-op, not a crash ===');
  const members = [member('a', 0), member('b', 1)];
  const reordered = reorderBoardMembers(members, 'b', 'down');
  assert(reordered.map((m) => m.id).join(',') === 'a,b', 'ordering is unchanged when already at the bottom', reordered.map((m) => m.id));
}

function testReorderWithUnknownIdIsANoOp() {
  console.log('\n=== reorderBoardMembers: an unknown id is a no-op, not a crash ===');
  const members = [member('a', 0), member('b', 1)];
  const reordered = reorderBoardMembers(members, 'does-not-exist', 'up');
  assert(reordered.map((m) => m.id).join(',') === 'a,b', 'ordering is unchanged for an id that is not in the list', reordered.map((m) => m.id));
}

async function main() {
  testEmptyStateWithZeroMembers();
  testRendersMembersWhenPresent();
  testMembersAreSortedByDisplayOrder();
  testSortDoesNotMutateInput();
  testMoveUpSwapsWithPreviousSibling();
  testMoveDownSwapsWithNextSibling();
  testMoveUpAtTopIsANoOp();
  testMoveDownAtBottomIsANoOp();
  testReorderWithUnknownIdIsANoOp();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
