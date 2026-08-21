import React, { useRef, useState } from 'react';
import { Loader2, Upload, X, AlertCircle, Send, Save } from 'lucide-react';
import { submissionService } from '../../services/submissionService';
import { SubmissionContentType, SubmissionMediaItem } from '../../types';
import {
  validateFileTypeAndSize,
  validateVideoFileType,
  validateFileSize,
  SUBMISSION_PHOTO_MAX_BYTES,
  SUBMISSION_VIDEO_MAX_BYTES,
} from '../../lib/imageValidation';

const CONTENT_TYPES: { value: SubmissionContentType; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'photo_story', label: 'Photo Story' },
  { value: 'video', label: 'Video' },
];

interface SubmissionFormProps {
  contributorId: string;
  /** Set when this form is creating a fresh resubmission after a needs_revision verdict -- see Submission.revisionOf's doc comment in types.ts. */
  revisionOf?: string;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Create-a-submission form -- content type, title, body/caption, media
 * upload, then Save Draft (stays editable) or Submit for Review (the
 * one-way draft -> submitted transition; RLS makes the row read-only to
 * the contributor from that point on, see submissionService.submit's
 * doc comment). Media validation runs client-side BEFORE any upload
 * starts (src/lib/imageValidation.ts's SUBMISSION_PHOTO_MAX_BYTES /
 * SUBMISSION_VIDEO_MAX_BYTES, per the brief) -- the server route re-
 * checks the same limits as a backstop, never trusting the client alone.
 */
export default function SubmissionForm({ contributorId, revisionOf, onDone, onCancel }: SubmissionFormProps) {
  const [contentType, setContentType] = useState<SubmissionContentType>('article');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrls, setMediaUrls] = useState<SubmissionMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPhotoStory = contentType === 'photo_story';
  const isVideo = contentType === 'video';
  const maxPhotos = 10; // a sane ceiling for "one or more photos" -- not specified by the brief, just guards against an unbounded upload loop

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (isVideo) {
      const typeResult = validateVideoFileType(file);
      // `=== false` (not `!typeResult.ok`) -- see this project's discriminated-union narrowing convention.
      if (typeResult.ok === false) {
        setUploadError(typeResult.reason);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const sizeResult = validateFileSize(file, SUBMISSION_VIDEO_MAX_BYTES);
      if (sizeResult.ok === false) {
        setUploadError(sizeResult.reason);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    } else {
      const result = validateFileTypeAndSize(file, SUBMISSION_PHOTO_MAX_BYTES);
      if (result.ok === false) {
        setUploadError(result.reason);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (isPhotoStory && mediaUrls.length >= maxPhotos) {
        setUploadError(`Up to ${maxPhotos} photos per photo story.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setUploading(true);
    try {
      const url = await submissionService.uploadMedia(file);
      setMediaUrls((prev) => (isVideo ? [{ url }] : [...prev, { url }]));
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload the file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'A title is required.';
    if (contentType === 'article' && !body.trim()) return 'Article body text is required.';
    if ((isPhotoStory || isVideo) && mediaUrls.length === 0) return `At least one ${isVideo ? 'video' : 'photo'} upload is required.`;
    return null;
  };

  const handleSave = async (submitForReview: boolean) => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const id = await submissionService.createDraft(contributorId, {
        contentType,
        title: title.trim(),
        body: contentType === 'article' ? body.trim() : undefined,
        caption: contentType !== 'article' ? caption.trim() : undefined,
        mediaUrls,
        revisionOf,
      });
      if (submitForReview) await submissionService.submit(id);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to save this submission.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 bg-zinc-950 border border-white/5 p-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif">{revisionOf ? 'Revise Submission' : 'New Submission'}</h3>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Content Type</label>
        <div className="flex gap-2">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setContentType(t.value); setMediaUrls([]); setUploadError(null); }}
              className={`flex-1 py-3 text-[10px] uppercase tracking-widest border transition-all ${
                contentType === t.value ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent" />
      </div>

      {contentType === 'article' ? (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent" />
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Caption (optional)</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent" />
        </div>
      )}

      {(isPhotoStory || isVideo) && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">
            {isVideo ? `Video -- max ${SUBMISSION_VIDEO_MAX_BYTES / (1024 * 1024)}MB` : `Photos -- max ${SUBMISSION_PHOTO_MAX_BYTES / (1024 * 1024)}MB each, HD encouraged`}
          </label>
          <div className="flex flex-wrap gap-3">
            {mediaUrls.map((item, i) => (
              <div key={item.url} className="relative w-24 h-24 bg-black border border-white/10 group">
                {isVideo ? (
                  <video src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.url} className="w-full h-full object-cover" alt="" />
                )}
                <button
                  onClick={() => removeMedia(i)}
                  className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {(!isVideo || mediaUrls.length === 0) && (
              <button
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                className="w-24 h-24 border border-dashed border-white/10 flex items-center justify-center text-zinc-600 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept={isVideo ? 'video/*' : 'image/*'} className="hidden" onChange={handleFileChange} />
          {uploadError && (
            <div className="flex items-center gap-2 text-rose-400 text-[10px]">
              <AlertCircle size={12} /> {uploadError}
            </div>
          )}
        </div>
      )}

      {error && <div className="text-rose-400 text-xs">{error}</div>}

      <div className="flex gap-3">
        <button
          onClick={() => handleSave(false)}
          disabled={saving || uploading}
          className="flex-1 py-4 border border-white/10 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save Draft
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving || uploading}
          className="flex-1 py-4 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-reserve-accent transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Submit for Review
        </button>
      </div>
    </div>
  );
}
