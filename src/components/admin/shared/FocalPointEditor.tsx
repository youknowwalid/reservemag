import React, { useState } from 'react';

// Shared focal-point/crop editor, extracted from the article editor's
// "Mobile Hero Crop Position" tool (StoriesSection.tsx) so the same
// interaction (drag or slide within a fixed-aspect preview frame to pick
// a cover-fit focal point, expressed as a 0-100 percentage per axis) is
// not duplicated between the article editor and the Instagram Banner
// panel. StoriesSection.tsx's original tool was inline JSX+handlers, not
// a component -- there was nothing importable to reuse directly, so this
// generalizes that exact interaction rather than leaving two divergent
// copies of the same drag math.
//
// `axis="horizontal"` reproduces the article editor's original behavior
// exactly (only X changes; Y is passed straight through unmodified) --
// StoriesSection.tsx is refactored to use this in that mode with zero
// change to its persisted `mobileCropX` field or resulting CSS output.
// `axis="both"` (the Instagram Banner panel's mode) additionally lets Y
// move, since the banner's fixed 1080x1350 frame crops arbitrary source
// photos on both axes, not just horizontally.

export interface FocalPointEditorProps {
  imageUrl: string;
  /** 0-100. */
  x: number;
  /** 0-100. Ignored for dragging/display purposes when axis="horizontal" (rendered fixed at its given value), but still passed back unchanged on every onChange call. */
  y: number;
  onChange: (x: number, y: number) => void;
  axis?: 'both' | 'horizontal';
  /** CSS aspect-ratio string for the preview frame, e.g. "4/5". */
  aspectRatio?: string;
  title?: string;
  helpText?: string;
}

export default function FocalPointEditor({
  imageUrl,
  x,
  y,
  onChange,
  axis = 'both',
  aspectRatio = '4/5',
  title = 'Crop Position',
  helpText = 'Define the focal point.',
}: FocalPointEditorProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    const relativeX = point.clientX - rect.left;
    const nextX = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
    if (axis === 'horizontal') {
      onChange(Math.round(nextX), y);
      return;
    }
    const relativeY = point.clientY - rect.top;
    const nextY = Math.max(0, Math.min(100, (relativeY / rect.height) * 100));
    onChange(Math.round(nextX), Math.round(nextY));
  };

  const displayY = axis === 'horizontal' ? 50 : y;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-serif text-white uppercase tracking-widest">{title}</h3>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{helpText}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
            {axis === 'horizontal' ? `X-Offset: ${x}%` : `X: ${x}% Y: ${y}%`}
          </div>
          <button
            onClick={() => onChange(50, 50)}
            className="text-[9px] uppercase tracking-widest text-reserve-accent hover:text-white transition-colors"
          >
            Reset to Center
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div
            className={`relative w-full max-w-[300px] mx-auto bg-zinc-950 border border-white/10 overflow-hidden group shadow-2xl ${
              axis === 'horizontal' ? 'cursor-ew-resize' : 'cursor-move'
            }`}
            style={{ aspectRatio }}
            onMouseDown={(e) => {
              setIsDragging(true);
              handleDrag(e);
            }}
            onMouseMove={(e) => {
              if (isDragging) handleDrag(e);
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={(e) => {
              setIsDragging(true);
              handleDrag(e);
            }}
            onTouchMove={(e) => {
              if (isDragging) handleDrag(e);
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <img
              src={imageUrl}
              className="w-full h-full object-cover pointer-events-none select-none"
              style={{ objectPosition: `${x}% ${displayY}%` }}
              alt="Crop Preview"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 border border-white/20 pointer-events-none" />
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 border border-white/10">
              <span className="text-[8px] uppercase tracking-[0.2em] text-white">Preview Frame</span>
            </div>
            {/* Guide lines -- rule-of-thirds grid, both axes when axis="both", vertical-only when horizontal-only (matching the original tool). */}
            <div
              className={`absolute inset-0 grid pointer-events-none opacity-20 transition-opacity group-hover:opacity-40 ${
                axis === 'horizontal' ? 'grid-cols-3' : 'grid-cols-3 grid-rows-3'
              }`}
            >
              <div className="border-r border-white col-start-1" />
              <div className="border-r border-white col-start-2" />
              {axis === 'both' && (
                <>
                  <div className="border-b border-white row-start-1 col-span-3 row-span-1" style={{ gridRow: 1, gridColumn: '1 / -1' }} />
                  <div className="border-b border-white" style={{ gridRow: 2, gridColumn: '1 / -1' }} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="p-6 bg-black/40 border border-white/5 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
                <span>Left</span>
                <span>Center</span>
                <span>Right</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={x}
                onChange={(e) => onChange(parseInt(e.target.value, 10), y)}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-reserve-accent"
              />
            </div>

            {axis === 'both' && (
              <div className="space-y-4">
                <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
                  <span>Top</span>
                  <span>Middle</span>
                  <span>Bottom</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={y}
                  onChange={(e) => onChange(x, parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-reserve-accent"
                />
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-widest text-zinc-300 font-bold">Positioning Guidelines</h4>
              <ul className="space-y-2">
                <li className="flex gap-3 text-[10px] text-zinc-500 leading-relaxed uppercase">
                  <span className="text-reserve-accent">→</span>
                  Drag the image or use the slider{axis === 'both' ? 's' : ''} to center the primary subject.
                </li>
                <li className="flex gap-3 text-[10px] text-zinc-500 leading-relaxed uppercase">
                  <span className="text-reserve-accent">→</span>
                  Use the Rule of Thirds guides to help frame the focal point.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
