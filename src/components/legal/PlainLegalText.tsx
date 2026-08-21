import React from 'react';

// Renders plain, non-markdown legal text (no #/**/- syntax in the
// source -- see legalContent.ts's header comment) by inferring structure
// purely from LINE SHAPE: a lone line matching "N. Title" becomes a
// heading, and a run of two-or-more short, unpunctuated lines becomes a
// list. This never adds, removes, reorders, or rewords a single
// character of the input -- every word that goes in comes out, just
// wrapped in a heading/list/paragraph tag chosen by pattern-matching.
//
// This is deliberately NOT a markdown parser -- the source has no
// markdown syntax to interpret, and inventing markdown characters that
// weren't in the supplied text would be exactly the kind of "editing"
// the text this component exists to avoid.

const HEADING_PATTERN = /^\d+\.\s+\S/;
const LAST_UPDATED_PATTERN = /^Last Updated:/i;
const MAX_LIST_LINE_LENGTH = 100;

function isListLine(line: string): boolean {
  return line.length <= MAX_LIST_LINE_LENGTH && !/[.:]$/.test(line);
}

/** A line with no lowercase letters at all -- in this document, that's only ever the opening document-title line ("PRIVACY POLICY"), never anything mid-sentence (even "THE RESERVE" always sits inside a mixed-case sentence). Used only for the first block. */
function isAllCaps(line: string): boolean {
  return /[A-Z]/.test(line) && !/[a-z]/.test(line);
}

interface Block {
  type: 'title' | 'meta' | 'heading' | 'list' | 'paragraph';
  lines: string[];
}

function parseBlocks(text: string): Block[] {
  // Blank-line-separated blocks, exactly as the source paragraphs are
  // already delimited -- no re-wrapping of sentences.
  const rawBlocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return rawBlocks.map((block, index) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    // Presentational-only special cases -- same exact text, just the two
    // lines every legal doc opens with (title, then its date) get
    // typography matching what they are, instead of rendering as plain
    // body paragraphs indistinguishable from the rest.
    if (index === 0 && lines.length === 1 && isAllCaps(lines[0])) {
      return { type: 'title', lines };
    }
    if (lines.length === 1 && LAST_UPDATED_PATTERN.test(lines[0])) {
      return { type: 'meta', lines };
    }
    if (lines.length === 1 && HEADING_PATTERN.test(lines[0])) {
      return { type: 'heading', lines };
    }
    if (lines.length > 1 && lines.every(isListLine)) {
      return { type: 'list', lines };
    }
    return { type: 'paragraph', lines };
  });
}

export default function PlainLegalText({ text }: { text: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        if (block.type === 'title') {
          return (
            <h1 key={i} className="text-4xl font-serif text-white">
              {block.lines[0]}
            </h1>
          );
        }
        if (block.type === 'meta') {
          return (
            <p key={i} className="text-[10px] uppercase tracking-widest text-zinc-600">
              {block.lines[0]}
            </p>
          );
        }
        if (block.type === 'heading') {
          return (
            <h2 key={i} className="text-2xl font-serif text-white pt-8 first:pt-0">
              {block.lines[0]}
            </h2>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="list-disc list-inside space-y-1 text-zinc-400 leading-relaxed">
              {block.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          );
        }
        // Multi-line paragraph blocks (rare in this document) are joined
        // with a space -- the wrapped lines are still exactly the same
        // words, just no longer split across separate <p> tags.
        return (
          <p key={i} className="text-zinc-400 leading-relaxed">
            {block.lines.join(' ')}
          </p>
        );
      })}
    </div>
  );
}
