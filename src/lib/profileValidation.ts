// Pure, DOM/network-free validation for the Step 3 profile-completion
// form (ContributorProfilePage.tsx) -- extracted the same way
// contributorRouting.ts's resolve*Redirect functions were, so the actual
// "which fields are required, which aren't" rule is directly unit-tested
// (scripts/test-profile-completion.ts) rather than only implicit in
// component behavior. No import of ./supabase, so it's safe to import
// under the tsx test runner (see otpVerification.ts's header comment for
// why that specific import would crash there).
//
// Deliberately does NOT validate the profile photo itself -- that's
// File-based, async (imageValidation.ts's validateImageResolution needs
// a real Image()/browser), and already covered by its own tests. This
// module only checks whether a photo was chosen at all (`hasPhoto`).

import { isValidHttpUrl } from './imageValidation';
import { SPECIALTY_TAGS, type SpecialtyTag } from '../types';

/** 2-3 sentences, per the brief -- enforced here AND client-side by the form's live character counter, matching the `contributors_bio_length_check` CHECK constraint (migration: expand_contributor_profile_and_removal_lock) as the server-side backstop. */
export const BIO_MAX_LENGTH = 300;

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface SocialMediaUrlsInput {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}

export interface ProfileCompletionFormInput {
  fullName: string;
  phoneNumber: string;
  hasPhoto: boolean;
  bio: string;
  city: string;
  country: string;
  specialtyTags: string[];
  /**
   * ALL optional -- changed from "Instagram required, others optional".
   * Every key here may be absent/empty; a profile can be completed with
   * zero social links filled in. Any key that IS filled in must still be
   * a well-formed http(s) URL, though (a typo'd link is still a bug).
   */
  socialMediaUrls: SocialMediaUrlsInput;
}

const SOCIAL_PLATFORM_LABELS: Record<keyof SocialMediaUrlsInput, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'X/Twitter',
  website: 'Website/Other',
};

/**
 * The full validation gate for Step 3's submit button -- every field is
 * required together EXCEPT social links (see ProfileCompletionFormInput's
 * doc comment), checked in the same order the form lays them out so a
 * user fixing errors top-to-bottom never has to jump around.
 */
export function validateProfileCompletionInput(input: ProfileCompletionFormInput): ValidationResult {
  if (!input.fullName.trim() || !input.phoneNumber.trim()) {
    return { ok: false, reason: 'Full name and phone number are required.' };
  }
  if (!input.hasPhoto) {
    return { ok: false, reason: 'A profile photo is required.' };
  }
  const trimmedBio = input.bio.trim();
  if (!trimmedBio) {
    return { ok: false, reason: 'A short professional bio is required.' };
  }
  if (trimmedBio.length > BIO_MAX_LENGTH) {
    return { ok: false, reason: `Bio must be ${BIO_MAX_LENGTH} characters or fewer.` };
  }
  if (!input.city.trim() || !input.country.trim()) {
    return { ok: false, reason: 'City and country are required.' };
  }
  if (input.specialtyTags.length === 0) {
    return { ok: false, reason: 'Select at least one area of interest.' };
  }
  if (input.specialtyTags.some((tag) => !SPECIALTY_TAGS.includes(tag as SpecialtyTag))) {
    return { ok: false, reason: 'One or more selected areas of interest are invalid.' };
  }
  for (const key of Object.keys(input.socialMediaUrls) as (keyof SocialMediaUrlsInput)[]) {
    const value = input.socialMediaUrls[key];
    if (value && value.trim() && !isValidHttpUrl(value)) {
      return { ok: false, reason: `The ${SOCIAL_PLATFORM_LABELS[key]} URL is not a valid link.` };
    }
  }
  return { ok: true };
}
