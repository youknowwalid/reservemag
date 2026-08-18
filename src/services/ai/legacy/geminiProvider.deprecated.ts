// DEPRECATED -- NOT IMPORTED ANYWHERE. Kept for historical reference only.
//
// This was the Reserve Editorial Engine's original AI implementation,
// calling Google's Gemini API directly from server.ts's `/api/ai/ingest`
// handler. It has been superseded by the Tabitoken-backed provider
// abstraction in ../tabitokenProvider.ts (active entry point: ../index.ts)
// and must NOT be reintroduced as the editorial AI provider -- the Gemini
// integration was never functional in this environment (GEMINI_API_KEY was
// never set) and the architecture now standardizes on the
// AIProvider interface so the backend can be swapped without touching
// callers.
//
// This file is isolated here -- rather than deleted outright -- purely so a
// rollback doesn't require reconstructing the original prompt/parsing
// logic from git history. The `@google/genai` package remains listed in
// package.json, but nothing in the active code path imports it or this
// file. Safe to delete once the Tabitoken integration has proven itself.

import { GoogleGenAI } from '@google/genai';

export interface LegacyGeminiDraft {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  articleBlocks: Array<{ type?: string; text?: string }>;
}

/** @deprecated Superseded by src/services/ai/tabitokenProvider.ts. Not called anywhere. */
export async function generateArticleDraftWithGemini(
  prompt: string,
  title?: string,
  category?: string,
): Promise<LegacyGeminiDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured on the server.');

  const ai = new GoogleGenAI({ apiKey });
  const finalTopicPrompt = `You are an expert editorial writer for The Reserve Magazine, a luxury editorial publication focused on Asian fashion, culture, and high-end lifestyle.

Generate a highly polished, deep, and beautifully stylized magazine feature article based on this user prompt: "${prompt.trim()}".

${title ? `Target title: "${String(title).trim()}".` : ''}
Category: "${category || 'Culture'}".

Return ONLY a valid JSON object:
{
  "title": "Elegant display headline",
  "excerpt": "One or two sentence hook",
  "category": "${category || 'Culture'}",
  "date": "Month day, year",
  "readTime": "7 min",
  "articleBlocks": [
    { "type": "header", "text": "Section Heading" },
    { "type": "paragraph", "text": "Rich editorial paragraph" },
    { "type": "quote", "text": "Pull quote" }
  ]
}`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    contents: finalTopicPrompt,
    config: { responseMimeType: 'application/json' },
  });
  const responseText = response.text?.trim();
  if (!responseText) throw new Error('Generative draft output is empty.');

  return JSON.parse(responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
}
