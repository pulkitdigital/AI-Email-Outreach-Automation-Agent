import { z } from 'zod';
import type { ClassifyCategoryResult } from '@bebeyond/shared';

const SERVICE_GROUPS = [
  'digital_marketing',
  'web_app_solutions',
  'creative_services',
  'marketplace_commerce',
] as const;

const categoryClassificationResponseSchema = z.object({
  serviceGroup: z.enum(SERVICE_GROUPS),
  rules: z
    .array(
      z.object({
        matchField: z.enum(['industry', 'any']),
        pattern: z.string().trim().min(1),
        weight: z.number().min(0.35).max(0.6),
      }),
    )
    .min(3)
    .max(5),
});

/** Models sometimes wrap JSON in markdown fences despite instructions not to — strip defensively. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Parses and validates a raw AI category-classification response, guarding against the model
 * hallucinating a serviceGroup outside the 4 fixed values (schema-enforced via z.enum, same
 * pattern parseCategorizationResponse uses to guard against a hallucinated category id) or
 * proposing rules outside the seed convention (matchField/weight range). Throws on any failure
 * (malformed JSON, schema mismatch) — callers treat that identically to a network/API failure:
 * retry, then give up rather than trust an unvalidated result.
 */
export function parseCategoryClassificationResponse(rawText: string): ClassifyCategoryResult {
  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(
      `AI category classification response was not valid JSON: ${(err as Error).message}`,
    );
  }

  const parsed = categoryClassificationResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `AI category classification response failed schema validation: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}
