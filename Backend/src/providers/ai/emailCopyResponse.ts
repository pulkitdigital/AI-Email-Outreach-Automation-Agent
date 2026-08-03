import { z } from 'zod';
import type { GenerateEmailCopyResult } from '@bebeyond/shared';

const emailCopyResponseSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  bodyParagraphs: z.array(z.string().trim().min(1)).min(1).max(6),
});

/** Models sometimes wrap JSON in markdown fences despite instructions not to — strip defensively. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Parses and validates a raw AI email-copy response. Throws on any failure (malformed JSON,
 * schema mismatch) — callers (composerService) catch this and fall back to a static template
 * rather than ever sending a malformed/empty email.
 */
export function parseEmailCopyResponse(rawText: string): GenerateEmailCopyResult {
  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`AI email copy response was not valid JSON: ${(err as Error).message}`);
  }

  const parsed = emailCopyResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI email copy response failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
