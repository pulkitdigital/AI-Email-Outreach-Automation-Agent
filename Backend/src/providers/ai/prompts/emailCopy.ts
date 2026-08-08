import type { GenerateEmailCopyInput } from '@bebeyond/shared';

const STAGE_INSTRUCTIONS: Record<GenerateEmailCopyInput['stage'], string> = {
  new: `This is the FIRST email this lead has ever received from us. Introduce yourself briefly and mention the relevant service category (see below) as something you help with. Do not claim anything is attached to this email — there is no attachment. Keep it warm, specific to their business, and not a generic mass-email tone. 2-3 short paragraphs.`,
  followup: `This is a DAY-3 FOLLOW-UP. The lead already received your first email and has not replied. Reference that naturally (e.g. "circling back on my note from last week") — do NOT re-explain who you are or repeat the full pitch again. Keep it short: a brief, low-pressure nudge, maybe one new angle or question. Write a FRESH closing line each time — do not reuse a stock phrase like "close the loop", "I won't follow up further", or "I don't want to keep filling your inbox"; say it plainly instead, in your own words. 1-2 short paragraphs.`,
  final: `This is the FINAL email in the sequence (day 7), sent because the lead hasn't responded to either prior email. Be clear that this is the last outreach on this topic, stay polite and low-pressure (no guilt-tripping, no urgency tactics), and leave the door open for them to reach out whenever it suits them. Write a FRESH closing line each time, in plain words — avoid stock phrases like "close the loop" or "won't follow up further". 1-2 short paragraphs.`,
};

/**
 * Two real few-shot examples (redacted to a placeholder company) modeling the target voice: a
 * founder emailing one specific lead directly, not an agency broadcasting a pitch. Every rule
 * below exists because an earlier, unguided version of this prompt reliably produced the opposite
 * — see the BEFORE/AFTER comparison this prompt was rewritten from. Keep these in sync if the
 * rules below change; a prompt with rules but no worked example drifts back to generic phrasing
 * far more easily than one with both.
 */
const FEW_SHOT_EXAMPLES = `Example of the FIRST email done well (note: first person throughout, no "At [Company] Digital Solutions, we..." pitch language, references something specific about the lead instead of a generic "researching companies" opener, keeps it conversational and short):

---
Subject: quick question, Aditya
Hi Aditya,
Was looking through a few dev shops in India and came across Aditya Tech Solutions — good focus on web and app work.
Quick question: is marketing (SEO, ads, landing pages) something you handle in-house, or do you bring in outside help when client work picks up?
Asking because I do this for a couple of dev teams already — usually stepping in when their own bandwidth gets stretched during delivery.
No pressure either way, just curious if it's relevant right now.
---

Example of a FOLLOW-UP done well (short, references the earlier note without repeating the pitch, plain non-templated closing line):

---
Subject: Re: quick question, Aditya
Hi Aditya,
Just circling back on my note from last week — no worries if it's not on your radar right now.
If digital marketing capacity is something you're thinking about for later this year, happy to talk through what's worked for other dev teams. If timing's off, that's completely fine too.
---`;

/** Shared prompt text for both Gemini and OpenAI — keeps the two providers behaviorally consistent. */
export function buildEmailCopyPrompt(input: GenerateEmailCopyInput): string {
  const leadSummaryLines = [
    `Company name: ${input.companyName}`,
    input.contactName ? `Contact name: ${input.contactName}` : null,
    input.industry ? `Industry: ${input.industry}` : null,
    `Best-fit service category: ${input.primaryCategoryName} (${input.primaryCategoryServices.join(', ')})`,
  ].filter((line): line is string => line !== null);

  return `You are ${input.senderName}, ${input.senderDesignation} at ${input.senderCompanyName}, writing a cold outreach email directly to one lead, on behalf of ${input.senderCompanyName}, a digital agency based in Prayagraj, India. Our positioning: "Forget the typical agency model — we're your digital partner, part of your team, invested in your growth." Differentiators: transparent pricing (no hidden costs), real results over hype, honest communication, long-term support that continues after a project ships.

Tone: warm, direct, confident but not salesy. Short paragraphs, contractions, reads like something typed straight into Gmail to one specific person — not a mail-merge template. No exclamation-point-heavy hype, no "unlock your potential"-style clichés, no fake urgency.

HARD RULES (violating any of these makes the output unusable — the person who wrote the examples below never breaks them):
1. Write in FIRST PERSON only ("I help...", "I work with...", "I do this for..."). Never write in third person about the company ("At BeBeyond, we...", "BeBeyond Digital Solutions offers...") — the email is from a person, not a company.
2. Never open with "I came across [Company] while researching software companies in India" or any equivalent generic-research boilerplate. Instead, reference something specific and concrete from the lead information below (their industry, what they focus on, or the service category that's the best fit) — make it read like you actually looked at their business, not a template variable.
3. Do not include a greeting line (e.g. "Hi [Name],") or a sign-off/signature — those are added separately, outside your output.
4. For a follow-up or final email: never reuse a stock closing phrase like "close the loop", "I won't follow up further", or "I don't want to keep filling your inbox" — write a plain, fresh version of that idea in your own words instead. Do not re-introduce yourself or repeat the full first-email pitch.
5. Keep it short — see the per-stage instruction below for exact paragraph count.

${FEW_SHOT_EXAMPLES}

${STAGE_INSTRUCTIONS[input.stage]}

Lead information:
${leadSummaryLines.join('\n')}

Respond with ONLY a JSON object in exactly this shape, no other text, no markdown fences:
{
  "subject": "<a short, specific, non-clickbait subject line>",
  "bodyParagraphs": ["<paragraph 1>", "<paragraph 2>", "..."]
}`;
}
