import { z } from 'zod';
import type { CategorizeLeadResult } from '@bebeyond/shared';

const categorizationResponseSchema = z.object({
  primaryCategoryId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  secondaryCategoryIds: z.array(z.string()).optional().default([]),
});

/** Models sometimes wrap JSON in markdown fences despite instructions not to — strip defensively. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Parses and validates a raw AI categorization response, guarding against the model
 * hallucinating a category id that isn't in the candidate set it was given. Throws on any
 * failure (malformed JSON, schema mismatch, unknown id) — callers treat that identically to a
 * network/API failure (retry, then give up and flag for review), since a response we can't
 * trust is no better than one that never arrived.
 */
export function parseCategorizationResponse(
  rawText: string,
  candidateIds: ReadonlySet<string>,
): CategorizeLeadResult {
  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`AI categorization response was not valid JSON: ${(err as Error).message}`);
  }

  const parsed = categorizationResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI categorization response failed schema validation: ${parsed.error.message}`);
  }

  const { primaryCategoryId, confidence, secondaryCategoryIds } = parsed.data;

  if (primaryCategoryId !== null && !candidateIds.has(primaryCategoryId)) {
    throw new Error(
      `AI categorization returned an unknown primaryCategoryId: ${primaryCategoryId}`,
    );
  }

  const validSecondaryIds = secondaryCategoryIds.filter(
    (id) => candidateIds.has(id) && id !== primaryCategoryId,
  );

  return {
    categoryId: primaryCategoryId,
    confidence,
    secondaryCategoryIds: validSecondaryIds,
    method: 'ai',
  };
}
