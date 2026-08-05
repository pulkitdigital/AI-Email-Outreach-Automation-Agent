import type { SendableStage } from '../../db/repositories/emailSequencesRepository.js';

export interface FallbackCopy {
  subject: string;
  paragraphs: string[];
}

/**
 * Used when AI email-copy generation fails (after its own short retry — see
 * composerService.ts) — a send must never block or get skipped just because the AI provider
 * had a bad moment. Deliberately generic but still on-brand and honest; never claims anything
 * false (e.g. never says "attached" when nothing is attached).
 *
 * Tone rules match the AI prompt (see providers/ai/prompts/emailCopy.ts): first person only, no
 * "At BeBeyond, we..." agency-pitch phrasing, no generic "I came across [Company] while
 * researching..." opener — this references the lead's own category/industry data instead. The
 * subject here is a best-effort default for 'followup'/'final' (used only if composerService has
 * no prior sent subject to build a real "Re: " continuation from — see its originalSubject
 * override); it deliberately avoids the "close the loop" / "won't follow up further" / "don't
 * want to keep filling your inbox" clichés.
 */
export function buildFallbackCopy(
  stage: SendableStage,
  companyName: string,
  primaryCategoryName: string,
): FallbackCopy {
  switch (stage) {
    case 'new':
      return {
        subject: `quick question for ${companyName}`,
        paragraphs: [
          `Reaching out because ${companyName} looks like a good fit for ${primaryCategoryName} — wanted to check whether that's something you've already got covered, or still figuring out.`,
          `I work directly with businesses like yours rather than through a typical agency setup — transparent pricing, no hidden layers, and I stick around after the work ships.`,
          `No pressure either way, just curious if it's relevant right now.`,
        ],
      };
    case 'followup':
      return {
        subject: `Re: quick question for ${companyName}`,
        paragraphs: [
          `Circling back on my note from last week — no worries if it's not on your radar right now.`,
          `If ${primaryCategoryName} is something you're thinking about for later, happy to talk through what's worked for similar businesses. If timing's off, that's completely fine too.`,
        ],
      };
    case 'final':
      return {
        subject: `Re: quick question for ${companyName}`,
        paragraphs: [
          `Haven't heard back, so I'll leave it here for now — didn't want to keep showing up in your inbox.`,
          `If things change down the line and you need a hand with ${primaryCategoryName}, my inbox is always open. Wishing you and the team well either way.`,
        ],
      };
  }
}
