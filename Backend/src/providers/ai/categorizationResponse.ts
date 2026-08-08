import { z } from 'zod';
import type { CategorizeLeadResult } from '@bebeyond/shared';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const suggestedNewCategorySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().regex(SLUG_PATTERN, 'must be kebab-case'),
  serviceGroup: z.string().trim().min(1),
});

const categorizationResponseSchema = z.object({
  primaryCategoryId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  secondaryCategoryIds: z.array(z.string()).optional().default([]),
  // .catch(null) rather than a hard schema failure: a malformed suggestion is worth dropping
  // (falls back to the pre-existing needs_review behavior — see categorizationService.ts) but
  // isn't reason enough to distrust an otherwise well-formed primaryCategoryId/confidence.
  suggestedNewCategory: suggestedNewCategorySchema.nullable().optional().catch(null),
});

/** Models sometimes wrap JSON in markdown fences despite instructions not to — strip defensively. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

export interface CategorizationCandidate {
  id: string;
  serviceGroup: string | null;
}

/**
 * Resolves a primaryCategoryId that isn't a known candidate id — before giving up, checks whether
 * it's actually the serviceGroup slug of one of the candidates instead. The prompt (see
 * prompts/categorization.ts) shows each candidate as `id: "<uuid>", name: "..." (<serviceGroup>)`;
 * observed in production (93-lead needs_review retry, 2026-08-07) that the model sometimes echoes
 * back that parenthetical serviceGroup hint in the "primaryCategoryId" field instead of the actual
 * id — reproducibly for 'web_app_solutions', but nothing about the mechanism is specific to that
 * one category, so this checks against every candidate's serviceGroup, not just that one value.
 * Auto-corrects (logs a warning so the correction is tracked, not silently invisible) rather than
 * rejecting outright — the model's *intent* is unambiguous once a serviceGroup match is found, so
 * treating it as "unknown" and falling back to needs_review would discard a perfectly good answer.
 * Returns null (still unresolved) if there's no serviceGroup match either, so the caller can fall
 * back to the original hard-reject behavior.
 */
function resolveByServiceGroupFallback(
  value: string,
  candidates: readonly CategorizationCandidate[],
): string | null {
  const match = candidates.find((c) => c.serviceGroup === value);
  if (!match) return null;

  console.warn(
    `[categorization] AI returned serviceGroup slug "${value}" instead of a category id for ` +
      `category ${match.id} — auto-corrected`,
  );
  return match.id;
}

/**
 * Parses and validates a raw AI categorization response, guarding against the model
 * hallucinating a category id that isn't in the candidate set it was given — with one exception:
 * a returned value that exactly matches a candidate's serviceGroup (not its id) is auto-corrected
 * to that candidate's real id rather than rejected, see resolveByServiceGroupFallback above.
 * Anything else unrecognized still throws. Callers treat a throw identically to a network/API
 * failure (retry, then give up and flag for review), since a response we can't trust or resolve
 * is no better than one that never arrived.
 */
export function parseCategorizationResponse(
  rawText: string,
  candidates: readonly CategorizationCandidate[],
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

  const { confidence, secondaryCategoryIds, suggestedNewCategory } = parsed.data;
  const candidateIds = new Set(candidates.map((c) => c.id));

  let primaryCategoryId = parsed.data.primaryCategoryId;
  if (primaryCategoryId !== null && !candidateIds.has(primaryCategoryId)) {
    const resolved = resolveByServiceGroupFallback(primaryCategoryId, candidates);
    if (resolved === null) {
      throw new Error(
        `AI categorization returned an unknown primaryCategoryId: ${primaryCategoryId}`,
      );
    }
    primaryCategoryId = resolved;
  }

  const validSecondaryIds = secondaryCategoryIds
    .map((id) => {
      if (candidateIds.has(id)) return id;
      return resolveByServiceGroupFallback(id, candidates);
    })
    .filter((id): id is string => id !== null && id !== primaryCategoryId);

  // A suggestion only makes sense when the model didn't pick an existing category — matches the
  // prompt's own instruction (prompts/categorization.ts). Silently ignored rather than treated as
  // an error if the model sends both anyway (defensive, same "don't trust, don't guess" posture
  // as everything else in this parser).
  const effectiveSuggestion = primaryCategoryId === null ? (suggestedNewCategory ?? null) : null;

  return {
    categoryId: primaryCategoryId,
    confidence,
    secondaryCategoryIds: validSecondaryIds,
    method: 'ai',
    suggestedNewCategory: effectiveSuggestion,
  };
}
