import type { GenerateEmailCopyInput } from '@bebeyond/shared';

const STAGE_INSTRUCTIONS: Record<GenerateEmailCopyInput['stage'], string> = {
  new: `This is the FIRST email this lead has ever received from us. Introduce BeBeyond Digital Solutions briefly, and introduce the relevant service category (see below) as something we specialize in that could help their business. Do not claim anything is attached to this email — there is no attachment. Keep it warm, specific to their business, and not a generic mass-email tone. 2-3 short paragraphs.`,
  followup: `This is a DAY-3 FOLLOW-UP. The lead already received our first email introducing BeBeyond and has not replied. Reference that naturally (e.g. "following up on my note from earlier this week") — do NOT re-explain who BeBeyond is or repeat the full pitch again. Keep it short: a brief, low-pressure nudge, maybe one new angle or question. 1-2 short paragraphs.`,
  final: `This is the FINAL email in the sequence (day 7), sent because the lead hasn't responded to either prior email. Be clear that this is the last outreach on this topic, stay polite and low-pressure (no guilt-tripping, no urgency tactics), and leave the door open for them to reach out whenever it suits them. 1-2 short paragraphs.`,
};

/** Shared prompt text for both Gemini and OpenAI — keeps the two providers behaviorally consistent. */
export function buildEmailCopyPrompt(input: GenerateEmailCopyInput): string {
  const leadSummaryLines = [
    `Company name: ${input.companyName}`,
    input.contactName ? `Contact name: ${input.contactName}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    `Best-fit service category: ${input.primaryCategoryName} (${input.primaryCategoryServices.join(', ')})`,
  ].filter((line): line is string => line !== null);

  return `You are writing a cold outreach email on behalf of BeBeyond Digital Solutions, a digital agency based in Prayagraj, India. Our positioning: "Forget the typical agency model — we're your digital partner, part of your team, invested in your growth." Differentiators: transparent pricing (no hidden costs), real results over hype, honest communication, long-term support that continues after a project ships.

Tone: warm, direct, confident but not salesy. No exclamation-point-heavy hype, no "unlock your potential"-style clichés, no fake urgency.

${STAGE_INSTRUCTIONS[input.stage]}

Lead information:
${leadSummaryLines.join('\n')}

Respond with ONLY a JSON object in exactly this shape, no other text, no markdown fences:
{
  "subject": "<a short, specific, non-clickbait subject line>",
  "bodyParagraphs": ["<paragraph 1>", "<paragraph 2>", "..."]
}

Do not include a greeting line (e.g. "Hi [Name],") or a sign-off/signature — those are added separately. Write only the body paragraphs themselves.`;
}
