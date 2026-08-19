// Robust extraction of a single top-level JSON object out of an AI
// response's plain text. Editorial generation no longer requests
// `response_format: json_object` (see editorialGenerationService.ts's
// header comment) -- Tabitoken is documented as OpenAI-compatible, not the
// OpenAI API itself, and relying on provider-specific structured-output
// support is exactly the kind of dependency this pass removes. The model
// is instructed to return only JSON, but real-world responses still show
// up in a few shapes:
//
//   A) pure JSON                          {"title": "...", ...}
//   B) JSON inside a ```json fence        ```json\n{...}\n```
//   C) JSON preceded by a short sentence  Here is the article:\n{...}
//   D) JSON followed by a short sentence  {...}\nLet me know if you'd like changes.
//
// A regex-only approach (e.g. matching from the first `{` to the last `}`)
// breaks the moment there's a `}` inside a string value or trailing prose
// after the object -- which is common, since article/caption text is full
// of punctuation. This scans character-by-character, tracking string and
// escape state and brace depth, so it finds the *actual* matching closing
// brace for the first top-level `{`, regardless of what's inside the
// strings or what follows it.

/**
 * Locates and parses the first top-level JSON object in `text`. Returns
 * `null` (never throws) if no `{...}` region parses as valid JSON -- the
 * caller is expected to treat that as a generation failure, not attempt a
 * second AI request to repair it (see editorialGenerationService.ts).
 */
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // The braces balanced but the content still wasn't valid JSON
          // (e.g. a stray `{` inside unescaped text before the real
          // object starts). Keep scanning from the next `{` rather than
          // giving up immediately.
          return extractJsonObject(text.slice(i + 1));
        }
      }
    }
  }

  // Ran out of text with braces still open (truncated response) -- no
  // valid top-level object to return.
  return null;
}
