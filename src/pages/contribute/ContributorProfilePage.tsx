import React, { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Upload, AlertCircle } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { contributorService } from '../../services/contributorService';
import { ContributorCategory } from '../../types';
import ContributorWelcomeModal from '../../components/contribute/ContributorWelcomeModal';
import {
  validateFileTypeAndSize,
  validateImageResolution,
  isValidHttpUrl,
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

// Step 2 -- required profile completion. Every field here is required
// together (no partial save); the dashboard is unreachable until this
// submits successfully (see ContributorProtectedRoute). On success, shows
// the Step 3 "Congratulations" modal before handing off to the dashboard.
export default function ContributorProfilePage() {
  const { user, contributor, loading, refreshContributor } = useContributor();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [category, setCategory] = useState<ContributorCategory>('journalist');
  const [instagramUrl, setInstagramUrl] = useState('');
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

  if (!loading && !user) return <Navigate to="/contribute" replace />;
  if (!loading && contributor) return <Navigate to="/contribute/dashboard" replace />;

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
    if (!fullName.trim() || !phoneNumber.trim()) {
      setError('Full name and phone number are required.');
      return;
    }
    if (!photoFile) {
      setError('A profile photo is required.');
      return;
    }
    if (!instagramUrl.trim() || !isValidHttpUrl(instagramUrl)) {
      setError('A valid Instagram URL is required (e.g. https://instagram.com/yourhandle).');
      return;
    }
    if (twitterUrl.trim() && !isValidHttpUrl(twitterUrl)) {
      setError('The X/Twitter URL is not a valid link.');
      return;
    }
    if (websiteUrl.trim() && !isValidHttpUrl(websiteUrl)) {
      setError('The website URL is not a valid link.');
      return;
    }

    setSubmitting(true);
    try {
      const profilePhotoUrl = await contributorService.uploadProfilePhoto(photoFile, user.id);
      await contributorService.completeProfile(user.id, user.email || '', {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        category,
        profilePhotoUrl,
        socialMediaUrls: {
          instagram: instagramUrl.trim(),
          ...(twitterUrl.trim() ? { twitter: twitterUrl.trim() } : {}),
          ...(websiteUrl.trim() ? { website: websiteUrl.trim() } : {}),
        },
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
          <p className="text-sm text-zinc-500">Every field below is required before your dashboard unlocks.</p>
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
                placeholder="Not OTP-verified -- entered as-is"
                required
              />
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Instagram URL (required)</label>
              <input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="https://instagram.com/..."
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">X / Twitter URL (optional)</label>
              <input
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="https://x.com/..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Website / Other URL (optional)</label>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none focus:border-reserve-accent"
                placeholder="https://..."
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
