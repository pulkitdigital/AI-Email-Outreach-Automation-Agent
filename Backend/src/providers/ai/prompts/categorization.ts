import type { CategorizeLeadInput } from '@bebeyond/shared';

/** Shared prompt text for both Gemini and OpenAI — keeps the two providers behaviorally consistent. */
export function buildCategorizationPrompt(input: CategorizeLeadInput): string {
  const categoryList = input.candidateCategories
    .map((c) => `- id: "${c.id}", name: "${c.name}"${c.serviceGroup ? ` (${c.serviceGroup})` : ''}`)
    .join('\n');

  const leadSummaryLines = [
    input.companyName ? `Company name: ${input.companyName}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    input.website ? `Website: ${input.website}` : null,
    Object.keys(input.rawData ?? {}).length > 0
      ? `Other known data: ${JSON.stringify(input.rawData)}`
      : null,
  ].filter((line): line is string => line !== null);

  return `You are classifying a sales lead for BeBeyond Digital Solutions, a digital agency, into the single best-fit service category, plus optionally 1-2 secondary categories that are also a plausible fit.

Available categories (choose only from this list, using the exact "id" values shown):
${categoryList}

Lead information:
${leadSummaryLines.length > 0 ? leadSummaryLines.join('\n') : '(no additional information available)'}

Respond with ONLY a JSON object in exactly this shape, no other text, no markdown fences:
{
  "primaryCategoryId": "<one of the ids listed above, or null if genuinely no category fits>",
  "confidence": <number between 0 and 1 — how confident you are in the primary category>,
  "secondaryCategoryIds": [<0 to 2 additional ids from the list above that are also a plausible fit>]
}`;
}
