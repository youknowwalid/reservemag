import React, { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Upload, AlertCircle } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { contributorService } from '../../services/contributorService';
import { ContributorCategory, SPECIALTY_TAGS, SpecialtyTag } from '../../types';
import ContributorWelcomeModal from '../../components/contribute/ContributorWelcomeModal';
import { resolveProfilePageRedirect } from '../../lib/contributorRouting';
import { validateProfileCompletionInput, BIO_MAX_LENGTH } from '../../lib/profileValidation';
import {
  validateFileTypeAndSize,
  validateImageResolution,
  CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES,
  CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH,
  CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT,
} from '../../lib/imageValidation';

const CATEGORIES: { value: ContributorCategory; label: string }[] = [
  { value: 'journalist', label: 'Journalist' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'videographer', label: 'Videographer' },
  { value: 'other', label: 'Other' },
];

// Step 3 -- required profile completion. Every field here is required
// together EXCEPT social links (all five -- Instagram, Facebook,
// LinkedIn, X/Twitter, Website/Other -- are optional; see
// profileValidation.ts's ProfileCompletionFormInput doc comment for why
// that changed from "Instagram required, others optional"); the
// dashboard is unreachable until this submits successfully (see
// ContributorProtectedRoute). On success, shows the Step 4
// "Congratulations" modal before handing off to the dashboard.
export default function ContributorProfilePage() {
  const { user, contributor, emailConfirmed, isRemoved, loading, refreshContributor } = useContributor();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [category, setCategory] = useState<ContributorCategory>('journalist');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [specialtyTags, setSpecialtyTags] = useState<SpecialtyTag[]>([]);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [validatingPhoto, setValidatingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // resolveProfilePageRedirect is THE fix's core assertion, directly
  // unit-tested (scripts/test-contributor-signup.ts): an unconfirmed
  // contributor (real state -- user.email_confirmed_at, not just "did
  // they land here from the right screen") is bounced to the
  // verification step even if they navigate straight to this URL.
  if (!loading) {
    const redirect = resolveProfilePageRedirect({ hasUser: Boolean(user), emailConfirmed, hasContributor: Boolean(contributor), isRemoved });
    if (redirect) return <Navigate to={redirect} replace />;
  }

  const toggleTag = (tag: SpecialtyTag) => {
    setSpecialtyTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    const syncResult = validateFileTypeAndSize(file, CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES);
    // `=== false` (not `!syncResult.ok`) so the discriminated union narrows correctly under this project's non-strict tsconfig.
    if (syncResult.ok === false) {
      setPhotoError(syncResult.reason);
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setValidatingPhoto(true);
    const resolutionResult = await validateImageResolution(file, CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH, CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT);
    setValidatingPhoto(false);
    // `=== false` (not `!resolutionResult.ok`) -- same narrowing reason as above.
    if (resolutionResult.ok === false) {
      setPhotoError(resolutionResult.reason);
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) return;

    const socialMediaUrls = {
      ...(instagramUrl.trim() ? { instagram: instagramUrl.trim() } : {}),
      ...(facebookUrl.trim() ? { facebook: facebookUrl.trim() } : {}),
      ...(linkedinUrl.trim() ? { linkedin: linkedinUrl.trim() } : {}),
      ...(twitterUrl.trim() ? { twitter: twitterUrl.trim() } : {}),
      ...(websiteUrl.trim() ? { website: websiteUrl.trim() } : {}),
    };

    const validation = validateProfileCompletionInput({
      fullName,
      phoneNumber,
      hasPhoto: Boolean(photoFile),
      bio,
      city,
      country,
      specialtyTags,
      socialMediaUrls,
    });
    if (validation.ok === false) {
      setError(validation.reason);
      return;
    }

    setSubmitting(true);
    try {
      const profilePhotoUrl = await contributorService.uploadProfilePhoto(photoFile!, user.id);
      await contributorService.completeProfile(user.id, user.email || '', {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        category,
        profilePhotoUrl,
        bio: bio.trim(),
        city: city.trim(),
        country: country.trim(),
        specialtyTags,
        socialMediaUrls,
      });
      await refreshContributor();
      setShowWelcome(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to save your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-24 space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif">Complete Your Profile</h1>
          <p className="text-sm text-zinc-500">Every field below is required before your dashboard unlocks, except social links.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
                placeholder="+1 555 123 4567"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
                placeholder="e.g. Dubai"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Country</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
                placeholder="e.g. United Arab Emirates"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Short Professional Bio</label>
              <span className={`text-[10px] ${bio.length > BIO_MAX_LENGTH ? 'text-rose-400' : 'text-zinc-600'}`}>
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
              maxLength={BIO_MAX_LENGTH}
              rows={3}
              className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent resize-none"
              placeholder="2-3 sentences about your work and beat."
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Category</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`py-3 text-[10px] uppercase tracking-widest border transition-all ${
                    category === c.value ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Areas of Interest -- select at least one</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SPECIALTY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`py-3 text-[10px] uppercase tracking-widest border transition-all ${
                    specialtyTags.includes(tag) ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500 hover:text-white'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">
              Profile Photo -- min {CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH}x{CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT}px, max {CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES / (1024 * 1024)}MB
            </label>
            <div
              onClick={() => !validatingPhoto && fileInputRef.current?.click()}
              className="relative aspect-square max-w-xs bg-zinc-950 border border-white/10 overflow-hidden cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Profile preview" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
                  {validatingPhoto ? <Loader2 className="animate-spin" size={24} /> : <Upload size={24} />}
                  <span className="text-[10px] uppercase tracking-widest">{validatingPhoto ? 'Checking photo...' : 'Choose a photo'}</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            {photoError && (
              <div className="flex items-center gap-2 text-rose-400 text-[10px]">
                <AlertCircle size={12} /> {photoError}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Social Links (all optional)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="Instagram -- https://instagram.com/..."
              />
              <input
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="Facebook -- https://facebook.com/..."
              />
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="LinkedIn -- https://linkedin.com/in/..."
              />
              <input
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="X / Twitter -- https://x.com/..."
              />
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent md:col-span-2"
                placeholder="Website / Other -- https://..."
              />
            </div>
          </div>

          {error && <div className="text-rose-400 text-xs">{error}</div>}

          <button
            type="submit"
            disabled={submitting || validatingPhoto}
            className="w-full py-4 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-reserve-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            Complete Profile
          </button>
        </form>
      </div>
      <Footer />

      {showWelcome && <ContributorWelcomeModal onContinue={() => navigate('/contribute/dashboard')} />}
    </div>
  );
}
