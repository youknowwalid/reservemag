import React from 'react';
import { ContentBlock } from '../../types';

interface RichTextRendererProps {
  blocks: ContentBlock[];
}

export default function RichTextRenderer({ blocks }: RichTextRendererProps) {
  if (!Array.isArray(blocks)) return null;

  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        // 'image'/'video' -- added in Stage 2 so a contributor's
        // photo_story/video submission renders through this SAME
        // component (see ContentBlock's doc comment in types.ts), not a
        // parallel rendering path. Kept deliberately simple/unstyled
        // relative to 'paragraph' below -- there's no per-block style
        // for these (ContentBlockStyle only applies to text).
        if (block.type === 'image') {
          return (
            <figure key={block.id} className="space-y-2">
              <img src={block.url} alt={block.caption || ''} className="w-full h-auto" loading="lazy" />
              {block.caption && <figcaption className="text-sm text-zinc-500 text-center">{block.caption}</figcaption>}
            </figure>
          );
        }

        if (block.type === 'video') {
          return (
            <figure key={block.id} className="space-y-2">
              <video src={block.url} controls className="w-full h-auto bg-black" />
              {block.caption && <figcaption className="text-sm text-zinc-500 text-center">{block.caption}</figcaption>}
            </figure>
          );
        }

        // 'paragraph' -- the original, unchanged rendering.
        const baseClasses = `leading-relaxed transition-all break-words`;

        const styleClasses = [
          block.style.bold ? 'font-bold' : 'font-normal',
          block.style.italic ? 'italic' : '',
          block.style.alignment === 'center' ? 'text-center' :
          block.style.alignment === 'right' ? 'text-right' :
          block.style.alignment === 'justify' ? 'text-justify' : 'text-left',
        ];

        let typeScale = 'text-lg font-serif text-zinc-300';
        if (block.style.fontSize === 'small') typeScale = 'text-sm text-zinc-400';
        if (block.style.fontSize === 'large') typeScale = 'text-2xl font-serif text-white';
        if (block.style.fontSize === 'xl') typeScale = 'text-4xl md:text-5xl font-serif text-white leading-tight';

        return (
          <p
            key={block.id}
            className={`${baseClasses} ${styleClasses.join(' ')} ${typeScale}`}
            style={{
              textDecoration: [
                block.style.underline ? 'underline' : '',
                block.style.strikethrough ? 'line-through' : ''
              ].filter(Boolean).join(' ')
            }}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
