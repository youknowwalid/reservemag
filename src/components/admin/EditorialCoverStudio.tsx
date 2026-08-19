import React, { useMemo, useState } from 'react';
import { CheckCircle2, Image as ImageIcon, RotateCcw } from 'lucide-react';

export interface CoverStudioPackage {
  title: string;
  coverKicker: string;
  coverSecondaryLine: string;
  imageUrl: string;
  imageReason: string;
}

interface EditorialCoverStudioProps {
  value: CoverStudioPackage;
  onChange: (next: CoverStudioPackage) => void;
}

/** Deterministic visual review stage. It never calls AI or writes to the network. */
export default function EditorialCoverStudio({ value, onChange }: EditorialCoverStudioProps) {
  const [mode, setMode] = useState<'portrait' | 'landscape'>('portrait');
  const [draft, setDraft] = useState(value);
  const original = useMemo(() => value, [value]);

  const update = (patch: Partial<CoverStudioPackage>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
  };
  const reset = () => { setDraft(original); onChange(original); };
  const title = draft.title.trim() || 'Untitled Editorial';
  const kicker = draft.coverKicker.trim();
  const secondary = draft.coverSecondaryLine.trim();

  return <section className="space-y-5 border border-white/10 bg-black/30 p-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-reserve-accent"><ImageIcon size={13} /> Stage 2 — Cover Studio</div>
        <h3 className="mt-1 text-lg font-serif">THE RESERVE visual treatment</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">Review the real source image and refine the cover copy before publication. Changes here do not make another AI request.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMode('portrait')} className={`px-3 py-2 text-[9px] uppercase tracking-widest border ${mode === 'portrait' ? 'border-white bg-white text-black' : 'border-white/10 text-zinc-500'}`}>Instagram 4:5</button>
        <button type="button" onClick={() => setMode('landscape')} className={`px-3 py-2 text-[9px] uppercase tracking-widest border ${mode === 'landscape' ? 'border-white bg-white text-black' : 'border-white/10 text-zinc-500'}`}>Web 16:9</button>
        <button type="button" onClick={reset} className="p-2 border border-white/10 text-zinc-500 hover:text-white" title="Reset cover copy"><RotateCcw size={13} /></button>
      </div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <div className="flex justify-center bg-zinc-950/70 border border-white/5 p-4 min-h-[520px] items-center">
        <div className={`relative overflow-hidden bg-zinc-800 shadow-2xl ${mode === 'portrait' ? 'aspect-[4/5] w-full max-w-[430px]' : 'aspect-[16/9] w-full max-w-[760px]'}`}>
          {draft.imageUrl ? <img src={draft.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs">No source image selected</div>}
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute inset-x-0 top-0 px-[7%] pt-[5%] text-white">
            <div className="text-[clamp(8px,1.3vw,15px)] font-light tracking-[0.28em]">the</div>
            <div className="text-[clamp(22px,5.5vw,62px)] leading-[0.8] font-serif font-semibold tracking-[-0.045em]">RESERVE</div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-black/65 px-[7%] pb-[7%] pt-[8%] text-white">
            {kicker && <div className="mb-2 text-[clamp(8px,1.15vw,13px)] uppercase tracking-[0.18em] text-white/80">{kicker}</div>}
            <div className="max-w-[92%] text-[clamp(22px,4.6vw,58px)] leading-[0.92] font-serif tracking-[-0.03em]">{title}</div>
            {secondary && <div className="mt-3 max-w-[82%] text-[clamp(9px,1.35vw,16px)] leading-snug text-white/85">{secondary}</div>}
          </div>
          <div className="absolute bottom-[3%] right-[7%] text-[8px] uppercase tracking-[0.18em] text-white/65">THE RESERVE</div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2"><label className="block text-[9px] uppercase tracking-widest text-zinc-500">Cover Kicker</label><input value={draft.coverKicker} onChange={(e) => update({ coverKicker: e.target.value })} maxLength={80} className="w-full border border-white/10 bg-black p-3 text-sm outline-none focus:border-white/30" /></div>
        <div className="space-y-2"><label className="block text-[9px] uppercase tracking-widest text-zinc-500">Cover Headline</label><textarea value={draft.title} onChange={(e) => update({ title: e.target.value })} maxLength={120} rows={3} className="w-full resize-none border border-white/10 bg-black p-3 text-sm leading-relaxed outline-none focus:border-white/30" /></div>
        <div className="space-y-2"><label className="block text-[9px] uppercase tracking-widest text-zinc-500">Secondary Line</label><textarea value={draft.coverSecondaryLine} onChange={(e) => update({ coverSecondaryLine: e.target.value })} maxLength={160} rows={3} className="w-full resize-none border border-white/10 bg-black p-3 text-sm leading-relaxed outline-none focus:border-white/30" /></div>
        <div className="border border-white/10 bg-zinc-950 p-4 space-y-2"><div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-emerald-400"><CheckCircle2 size={12} /> Source image locked to recommendation</div><p className="text-[11px] leading-relaxed text-zinc-500">{draft.imageReason || 'No image rationale supplied by the editorial engine.'}</p>{draft.imageUrl && <div className="truncate font-mono text-[9px] text-zinc-600">{draft.imageUrl}</div>}</div>
        <div className="border-l border-white/10 pl-4 text-[10px] leading-relaxed text-zinc-500"><strong className="text-zinc-300">Publishing rule:</strong> the selected source image is used when you press <em>Confirm &amp; Publish Now</em>. This stage never calls Tabitoken.</div>
      </div>
    </div>
  </section>;
}
