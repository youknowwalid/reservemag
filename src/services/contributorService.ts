import { supabase } from '../lib/supabase';
import { Contributor, ContributorCategory } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';
import {
  adminUpdateContributorIdentity,
  removeContributorTombstone,
  type AdminIdentityEditInput,
} from '../lib/contributorAdminActions';

export type { AdminIdentityEditInput };

const TABLE = 'contributors';
const PHOTO_BUCKET = 'contributor-photos';

function rowToContributor(row: any): Contributor {
  return {
    id: row.id,
    accountType: row.account_type,
    authUserId: row.auth_user_id,
    email: row.email ?? '',
    fullName: row.full_name,
    phoneNumber: row.phone_number ?? '',
    category: row.category,
    profilePhotoUrl: row.profile_photo_url,
    bio: row.bio ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
    specialtyTags: row.specialty_tags ?? [],
    socialMediaUrls: row.social_media_urls ?? {},
    legacyDesignation: row.legacy_designation,
    legacyRole: row.legacy_role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface ProfileCompletionInput {
  fullName: string;
  phoneNumber: string;
  category: ContributorCategory;
  profilePhotoUrl: string;
  bio: string;
  city: string;
  country: string;
  specialtyTags: string[];
  /** ALL optional now (was: Instagram required, others optional) -- see profileValidation.ts's ProfileCompletionFormInput doc comment. */
  socialMediaUrls: { instagram?: string; facebook?: string; linkedin?: string; twitter?: string; website?: string };
}


export const contributorService = {
  /**
   * Uploads a profile photo to the contributor-photos bucket, scoped
   * under the contributor's own auth.uid() folder -- required by that
   * bucket's storage.objects RLS policies (see the add_contributors
   * migration), and never the shared `media` bucket admin uploads use
   * (that bucket's write policy requires is_admin(), which a contributor
   * never has).
   */
  async uploadProfilePhoto(file: File, uid: string): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const storagePath = `${uid}/profile-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  },

  /**
   * Creates this contributor's row -- the one and only write of Stage 1's
   * profile-completion step (no partial/draft save; every field is
   * required together EXCEPT social links, which are all optional -- see
   * Contributor's doc comment in types.ts and
   * profileValidation.ts's validateProfileCompletionInput, which the
   * caller runs before this is ever reached).
   * `auth_user_id`/`email` come from the authenticated session, never
   * from the form, so a contributor can't misrepresent either. `id`
   * itself is NOT set here -- it defaults to a fresh uuid (see the
   * merge_legacy_authors_into_contributors migration, which decoupled it
   * from auth_user_id so legacy/no-login rows could exist too);
   * `account_type` also defaults ('registered'), correctly, since this
   * path only ever runs for a real signup.
   */
  async completeProfile(uid: string, email: string, input: ProfileCompletionInput): Promise<void> {
    const { error } = await supabase.from(TABLE).insert({
      auth_user_id: uid,
      email,
      full_name: input.fullName,
      phone_number: input.phoneNumber,
      category: input.category,
      profile_photo_url: input.profilePhotoUrl,
      bio: input.bio,
      city: input.city,
      country: input.country,
      specialty_tags: input.specialtyTags,
      social_media_urls: input.socialMediaUrls,
    });
    if (error) throw error;
  },

  /** The signed-in contributor's own row (looked up by their Supabase Auth uid, NOT this table's own `id` -- see auth_user_id's doc comment in types.ts), or null if they haven't completed their profile yet (or aren't a contributor at all). Relies on the "reads own row" RLS policy -- never pass another user's uid here expecting it to work. */
  async getOwnProfile(uid: string): Promise<Contributor | null> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('auth_user_id', uid).maybeSingle();
      if (error) throw error;
      return data ? rowToContributor(data) : null;
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `${TABLE}/auth_user_id=${uid}`);
      return null;
    }
  },

  /** Admin-only in practice (RLS only returns other contributors' rows to is_admin() callers -- a non-admin gets just their own row back, if any, matching the "reads own row or admin reads all" policy). Powers the admin Contributors directory. */
  async getAllContributors(): Promise<Contributor[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToContributor);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  /** Admin-only in practice, same RLS reasoning as getAllContributors. Server-side ilike search on full_name/phone_number so the admin directory's search bar doesn't need to fetch every row and filter client-side. */
  async searchContributors(query: string): Promise<Contributor[]> {
    const trimmed = query.trim();
    if (!trimmed) return contributorService.getAllContributors();
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .or(`full_name.ilike.%${trimmed}%,phone_number.ilike.%${trimmed}%`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToContributor);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  /** Admin-only in practice (RLS), same as getAllContributors/searchContributors. Reads email/phone_number -- never call this from public-facing code (see getPublicAuthorById below for that). */
  async getContributorById(id: string): Promise<Contributor | null> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToContributor(data) : null;
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `${TABLE}/${id}`);
      return null;
    }
  },

  /**
   * The ONE public-facing read in this service -- used by ArticlePage.tsx's
   * Author Profile Card, which any anonymous site visitor can open.
   * Queries `contributors_public` (a view exposing only safe-to-publish
   * columns -- never email/phone_number/auth_user_id, see the
   * add_contributors_public_view migration), not the `contributors`
   * table directly: that table's RLS only allows a row's own owner or an
   * admin to read it, which would silently break this card for every
   * anonymous visitor if queried directly.
   */
  async getPublicAuthorById(id: string): Promise<Contributor | null> {
    try {
      const { data, error } = await supabase.from('contributors_public').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToContributor(data) : null;
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `contributors_public/${id}`);
      return null;
    }
  },

  /**
   * Admin "Edit User" action -- name/photo/contact correction ONLY (see
   * AdminIdentityEditInput's doc comment for why bio/category/location/
   * specialtyTags/socialMediaUrls are deliberately excluded from this
   * input type, and therefore never touched by this call). Admin-only in
   * practice: the "contributor updates own row or admin updates" RLS
   * policy only lets a non-owner write here via is_admin(). Thin wrapper
   * around contributorAdminActions.ts's adminUpdateContributorIdentity --
   * that's where the actual patch shape lives (and where it's tested,
   * per scripts/test-contributor-admin-actions.ts), kept in a file with
   * no import of ./supabase so it's testable outside a Vite runtime,
   * same reasoning as contributorAuth.ts's verifyContributorSignupOtp /
   * otpVerification.ts.
   */
  async adminUpdateIdentity(id: string, input: AdminIdentityEditInput): Promise<void> {
    return adminUpdateContributorIdentity(async (rowId, patch) => supabase.from(TABLE).update(patch).eq('id', rowId), id, input);
  },

  /**
   * Admin "Delete User" action -- an app-level access lock, not a row
   * deletion (see Contributor's `status` doc comment in types.ts for the
   * full reasoning: the row is a tombstone, same pattern as an existing
   * `account_type: 'legacy'` row, and an already-published article's
   * byline is never at risk either way since `articles.author` is a text
   * snapshot, not a live join). This is the ONLY write that sets
   * `status = 'removed'` -- from that point on, the
   * expand_contributor_profile_and_removal_lock migration's RLS changes
   * mean this contributor's own (still technically valid) Supabase Auth
   * session can no longer update this row, submit content, or edit a
   * submission, even though the row itself, and their name on any
   * already-published article, remain exactly as they were. Thin wrapper
   * around contributorAdminActions.ts's removeContributorTombstone, same
   * testability reasoning as adminUpdateIdentity above.
   */
  async removeContributor(id: string): Promise<void> {
    return removeContributorTombstone(async (rowId, patch) => supabase.from(TABLE).update(patch).eq('id', rowId), id);
  },
};
