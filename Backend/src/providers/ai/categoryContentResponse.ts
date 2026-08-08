import { z } from 'zod';
import type { GenerateCategoryContentResult } from '@bebeyond/shared';
import { HOW_CAN_WE_HELP } from '../../modules/deckGeneration/staticContent.js';

const MAX_SERVICES = 6;

const categoryContentResponseSchema = z.object({
  services: z.array(z.string().trim().min(1)),
  relevantBenefits: z.array(z.string()),
});

/** Models sometimes wrap JSON in markdown fences despite instructions not to — strip defensively. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Parses and validates a raw AI category-content response. Guards the one thing that actually
 * matters for correctness downstream (HowCanWeHelpSlide.tsx looks its icon up by exact label
 * text — see pdf/slides/HowCanWeHelpSlide.tsx's ICONS map): relevantBenefits is filtered down to
 * only labels that are one of staticContent.ts's 8 fixed HOW_CAN_WE_HELP values, silently
 * dropping anything hallucinated — the same "drop, don't trust" treatment
 * parseCategorizationResponse gives hallucinated secondary category ids. An empty result after
 * filtering is accepted (no benefits highlighted for this category, graceful degradation — same
 * as a category with no HOW_CAN_WE_HELP_BY_CATEGORY entry today), not an error. `services` is
 * capped at MAX_SERVICES but never padded or rejected for being short of 4 — an unusually narrow
 * category getting 2-3 services is a legitimate outcome, not something to guess-fill.
 */
export function parseCategoryContentResponse(rawText: string): GenerateCategoryContentResult {
  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`AI category-content response was not valid JSON: ${(err as Error).message}`);
  }

  const parsed = categoryContentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`AI category-content response failed schema validation: ${parsed.error.message}`);
  }

  const services = parsed.data.services.slice(0, MAX_SERVICES);
  if (services.length === 0) {
    throw new Error('AI category-content response returned an empty services list');
  }

  const relevantBenefits = parsed.data.relevantBenefits.filter((label) =>
    HOW_CAN_WE_HELP.includes(label),
  );

  return { services, relevantBenefits };
}
