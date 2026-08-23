// Pure, dependency-injected core of the two admin Authors-table row
// actions -- "Edit User" and "Delete User" -- extracted out of
// contributorService.ts specifically so it has NO import of ./supabase
// (which reads import.meta.env, undefined under the tsx test runner --
// same reason otpVerification.ts exists as its own file, see that file's
// header comment). Each function here builds the EXACT patch object sent
// to Supabase and nothing else, which is what makes both of these
// directly, meaningfully testable
// (scripts/test-contributor-admin-actions.ts): the patch shape itself is
// the proof that "Edit User" can only ever touch identity/contact
// columns, and that "Delete User" can only ever touch this one
// contributors row's status/email/phone_number -- never bio, category,
// specialty tags, social links, or (critically) the `articles` table at
// all, which is what actually guarantees an already-published byline
// survives a contributor's removal (see removeContributorTombstone's
// doc comment).

export interface ContributorUpdateResult {
  error: { message: string } | null;
}

/** Production callers pass `(id, patch) => supabase.from('contributors').update(patch).eq('id', id)`; tests pass a fake that just records the call. */
export type UpdateContributorFn = (id: string, patch: Record<string, unknown>) => Promise<ContributorUpdateResult>;

/** Fields an admin may correct via the Authors table's "Edit User" action -- deliberately NOT bio/category/city/country/specialtyTags/socialMediaUrls, which stay contributor-self-service only (per the brief: this is for basic identity/contact correction, e.g. fixing a typo, not editing the contributor's own editorial profile). */
export interface AdminIdentityEditInput {
  fullName: string;
  profilePhotoUrl: string;
  email: string;
  phoneNumber: string;
}

/** The exact, and ONLY, columns "Edit User" ever writes. */
export function buildAdminIdentityEditPatch(input: AdminIdentityEditInput): Record<string, unknown> {
  return {
    full_name: input.fullName,
    profile_photo_url: input.profilePhotoUrl,
    email: input.email,
    phone_number: input.phoneNumber,
  };
}

export async function adminUpdateContributorIdentity(updateFn: UpdateContributorFn, id: string, input: AdminIdentityEditInput): Promise<void> {
  const { error } = await updateFn(id, buildAdminIdentityEditPatch(input));
  if (error) throw new Error(error.message);
}

/**
 * The exact, and ONLY, columns "Delete User" ever writes -- `status`
 * flips to 'removed' (the signal every contributorRouting.ts gate and
 * the tightened RLS write-policies from the
 * expand_contributor_profile_and_removal_lock migration key off of) and
 * email/phone_number are cleared. `full_name` is deliberately absent
 * from this patch -- untouched, not cleared -- both because the admin
 * Authors table needs it to show WHO was removed (not just that some
 * anonymous row was), and because an already-published article's byline
 * is a separate text snapshot (`articles.author`, set once at publish
 * time -- see buildArticleRowFromSubmission) that was never going to
 * change either way, whatever this patch does or doesn't touch.
 */
export function buildContributorRemovalPatch(): Record<string, unknown> {
  return { status: 'removed', email: null, phone_number: null };
}

export async function removeContributorTombstone(updateFn: UpdateContributorFn, id: string): Promise<void> {
  const { error } = await updateFn(id, buildContributorRemovalPatch());
  if (error) throw new Error(error.message);
}
