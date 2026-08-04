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
 */
export function buildFallbackCopy(
  stage: SendableStage,
  companyName: string,
  primaryCategoryName: string,
): FallbackCopy {
  switch (stage) {
    case 'new':
      return {
        subject: `A quick note for ${companyName}`,
        paragraphs: [
          `I'm reaching out from BeBeyond Digital Solutions — we work as a digital partner for businesses like ${companyName}, not a typical agency. Transparent pricing, real results over hype, and support that continues after a project ships.`,
          `Based on what I've seen of ${companyName}, ${primaryCategoryName} looked like a strong fit for where we could help most.`,
          `Happy to share more if useful — no pressure either way.`,
        ],
      };
    case 'followup':
      return {
        subject: `Following up — ${companyName}`,
        paragraphs: [
          `Just following up on my note from earlier this week — wanted to check if it's useful to connect, or if now just isn't the right time.`,
          `Either way, happy to answer any questions.`,
        ],
      };
    case 'final':
      return {
        subject: `Last note — ${companyName}`,
        paragraphs: [
          `I'll leave this here for now — didn't want to keep following up without a clear signal it's useful.`,
          `If anything changes, feel free to reach out any time — happy to pick this back up whenever it suits you.`,
        ],
      };
  }
}
