// Deterministic, network-free tests for editorialQA.ts's source-vs-output
// originality check -- the backstop for editorialPromptBuilder.ts's
// "NON-NEGOTIABLE REWRITING RULE" (an article can satisfy every other
// requirement -- correct facts, correct language, correct JSON shape,
// correct length -- while staying a close paraphrase of an
// already-English source, and nothing else in the pipeline catches that).
// Run with `npm run test:editorial-qa-originality`.
//
// Fixtures are hand-written (a fictional design-studio founder, no real
// person), not generated -- these thresholds are verified against
// realistic-length, realistic-shape prose, not synthetic strings, per
// the explicit ask to confirm the check produces the right verdict on
// real-ish input, not just that the build passes. No AI call, no
// network, no real source retrieval -- runEditorialQA() is pure,
// deterministic logic.

import { runEditorialQA } from '../src/services/editorial/editorialQA';
import type { EditorialPackage } from '../src/services/editorial/editorialTypes';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS -- ${label}`);
  } else {
    failed++;
    console.log(`  FAIL -- ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  }
}

const IMAGE_URL = 'https://example.com/hero.jpg';

const SOURCE_TEXT =
  "Maria Chen founded her design studio in Copenhagen in 2019 after eight years at a large multinational agency. The studio, which she named Nordvik Studio, focuses exclusively on sustainable packaging design for boutique food and beverage brands across Scandinavia. In its first year, Nordvik Studio worked with only three clients, all small independent producers who wanted packaging that reflected their environmental values. By 2022, the studio had grown to a team of twelve designers and had expanded its client roster to include several mid-sized regional retailers. Chen has said in interviews that she left her previous agency because she felt increasingly disconnected from the environmental impact of the packaging she was creating at scale. She wanted to work directly with brands that shared her values rather than producing generic packaging for whichever client paid the most. The studio's signature style uses recycled kraft paper, soy-based inks, and minimal color palettes that photograph well on social media while remaining genuinely biodegradable. Chen has become an outspoken advocate for stricter packaging regulations in the European Union, testifying before a parliamentary committee in early 2023 about the environmental cost of single-use plastic packaging in the food industry.";

// A close paraphrase -- same sentences, same order, only a handful of
// words swapped ("founded" -> "started", "named" -> "called", etc.).
// This is exactly the failure mode the check exists to catch: it would
// pass every other QA check (correct language, real facts, reasonable
// length) while barely being rewritten at all.
const NEAR_COPY_ARTICLE =
  "Maria Chen started her design studio in Copenhagen back in 2019, after spending eight years at a big multinational agency. The studio, which she called Nordvik Studio, focuses exclusively on sustainable packaging design for boutique food and beverage brands across Scandinavia. In its first year, Nordvik Studio worked with only three clients, all small independent producers who wanted packaging that reflected their environmental values. By 2022, the studio had grown to a team of twelve designers and had expanded its client roster to include several mid-sized regional retailers. Chen has said in interviews that she left her previous agency because she felt increasingly disconnected from the environmental impact of the packaging she was creating at scale. She wanted to work directly with brands that shared her values rather than producing generic packaging for whichever client paid the most.";

// The same underlying facts (founding year, city, studio name, client
// counts, team size, motivation, materials, EU testimony), restructured
// into a genuinely different narrative shape with original sentence
// construction throughout -- what the prompt actually asks for.
const GENUINE_REWRITE_ARTICLE =
  "When Maria Chen walked away from a corporate design career eight years in the making, colleagues assumed she was chasing a bigger title elsewhere. Instead, she opened a single small office in Copenhagen. That was 2019, and the venture -- now known as Nordvik Studio -- has since become one of Scandinavia's most closely watched names in sustainable packaging. Chen built the business slowly and deliberately. Just three independent food and beverage producers signed on that first year, each drawn by a shared commitment to environmentally conscious materials over flashy branding. The studio now employs a dozen designers and counts several regional retail chains among its clients, an expansion Chen attributes to word of mouth rather than aggressive sales efforts. Her decision to leave the agency world, she has explained, came from watching packaging get produced at enormous scale with little regard for what happened to it afterward. Working only with brands that shared her priorities felt like the only honest path forward. Kraft paper, soy-based ink, and restrained color choices define the studio's visual signature -- an aesthetic that happens to translate well on social media while still breaking down naturally. Chen has since stepped into a more public role as a policy advocate, appearing before European Union lawmakers in 2023 to argue for tighter restrictions on single-use plastic in food packaging.";

function basePackage(article: string): EditorialPackage {
  return {
    title: 'A Studio Built on Restraint',
    subtitle: 'Maria Chen on packaging, principle, and policy',
    article,
    instagramHeadline: 'Design With Intention',
    instagramSubheadline: 'Inside the studio redefining sustainable packaging',
    coverKicker: 'PROFILE',
    coverSecondaryLine: 'How one studio built a business on restraint',
    caption: 'A closer look at the studio changing how brands think about packaging.',
    imageUrl: IMAGE_URL,
    imageReason: 'Strongest available candidate for a premium cover treatment.',
    sourcesUsed: ['source_1'],
    warnings: [],
  };
}

const context = {
  validSourceIds: new Set(['source_1']),
  candidateImageUrls: new Set([IMAGE_URL]),
  sourceTextsById: new Map([['source_1', SOURCE_TEXT]]),
};

function main() {
  console.log('\n=== source_originality: a close paraphrase of an English source FAILs ===');
  const nearCopyResult = runEditorialQA(basePackage(NEAR_COPY_ARTICLE), context);
  const nearCopyCheck = nearCopyResult.checks.find((c) => c.check === 'source_originality');
  assert(!!nearCopyCheck, 'the source_originality check ran');
  assert(nearCopyCheck?.severity === 'FAIL', 'a close paraphrase is FAIL, not WARNING or PASS', nearCopyCheck);
  assert(nearCopyResult.overall === 'FAIL', 'a FAIL check pulls the overall QA verdict to FAIL', nearCopyResult.overall);
  assert(nearCopyResult.status === 'NEEDS_REVIEW', 'a FAIL check pushes status to NEEDS_REVIEW, not READY', nearCopyResult.status);
  assert(nearCopyResult.confidence < 70, 'a FAIL check drops confidence below the NEEDS_REVIEW threshold', nearCopyResult.confidence);
  console.log(`  (measured overlap: ${nearCopyCheck?.message})`);

  console.log('\n=== source_originality: a genuine rewrite of the same facts PASSes ===');
  const rewriteResult = runEditorialQA(basePackage(GENUINE_REWRITE_ARTICLE), context);
  const rewriteCheck = rewriteResult.checks.find((c) => c.check === 'source_originality');
  assert(!!rewriteCheck, 'the source_originality check ran');
  assert(rewriteCheck?.severity === 'PASS', 'a substantially reworded article is PASS', rewriteCheck);
  console.log(`  (measured overlap: ${rewriteCheck?.message})`);

  console.log('\n=== source_originality: no cited source text available -> PASS (nothing to compare) ===');
  const noSourceContext = { validSourceIds: new Set(['source_1']), candidateImageUrls: new Set([IMAGE_URL]), sourceTextsById: new Map<string, string>() };
  const noSourceResult = runEditorialQA(basePackage(GENUINE_REWRITE_ARTICLE), noSourceContext);
  const noSourceCheck = noSourceResult.checks.find((c) => c.check === 'source_originality');
  assert(noSourceCheck?.severity === 'PASS', 'missing source text does not block generation -- it is treated as nothing to compare, not a failure', noSourceCheck);

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
