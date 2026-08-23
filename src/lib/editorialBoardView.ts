// Pure, DOM/network-free logic behind the /editorial-board page's
// dynamic member section and the admin CRUD section's reorder controls
// -- extracted the same way contributorRouting.ts's resolve*Redirect
// functions are, so it's directly unit-testable
// (scripts/test-editorial-board.ts) without rendering React or touching
// Supabase. EditorialBoardPage.tsx calls deriveEditorialBoardView
// directly, so testing it here IS testing the real
// empty-state-vs-member-list decision, not an approximation of it.

export interface EditorialBoardMemberLike {
  id: string;
  displayOrder: number;
}

/** Ascending by displayOrder -- the admin-controlled publication order. */
export function sortBoardMembers<T extends EditorialBoardMemberLike>(members: T[]): T[] {
  return [...members].sort((a, b) => a.displayOrder - b.displayOrder);
}

export type EditorialBoardView<T> =
  | { kind: 'empty' }
  | { kind: 'members'; members: T[] };

/**
 * THE actual rendering decision for the public page: zero board members
 * -> an empty state, never the bracketed `[NAME]/[TITLE/ROLE]/[bio]`
 * placeholder text the brief explicitly said must never reach a real
 * visitor. One or more members -> the sorted list.
 */
export function deriveEditorialBoardView<T extends EditorialBoardMemberLike>(members: T[]): EditorialBoardView<T> {
  const sorted = sortBoardMembers(members);
  if (sorted.length === 0) return { kind: 'empty' };
  return { kind: 'members', members: sorted };
}

/**
 * Moves the member with the given `id` one position up or down among its
 * siblings (by current displayOrder), and returns the FULL list with
 * freshly-recomputed sequential displayOrder values (0..n-1) -- what the
 * admin CRUD section's "move up"/"move down" buttons call before
 * persisting. Already-at-the-edge moves (top member moving up, bottom
 * member moving down) and an unknown id are no-ops that return the
 * original ordering unchanged, not a crash or an out-of-range write.
 */
export function reorderBoardMembers<T extends EditorialBoardMemberLike>(members: T[], id: string, direction: 'up' | 'down'): T[] {
  const sorted = sortBoardMembers(members);
  const index = sorted.findIndex((m) => m.id === id);
  if (index === -1) return sorted;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return sorted;

  const reordered = [...sorted];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return reordered.map((m, i) => ({ ...m, displayOrder: i }));
}
