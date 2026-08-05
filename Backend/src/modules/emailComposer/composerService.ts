import { getAIProvider } from '../../providers/ai/index.js';
import { buildFallbackCopy } from './fallbackTemplates.js';
import { renderEmailHtml, renderEmailText } from './emailTemplate.js';
import type { ComposeEmailInput, ComposedEmail } from './types.js';

/**
 * Composes one sequence-stage email for a lead: tries AI-generated copy first, falls back to a
 * static on-brand template if the AI call fails for any reason (never blocks a send on an AI
 * hiccup — see Docs/ARCHITECTURE.md § 4). Either way, the final HTML/text is built by
 * emailTemplate.ts, which always includes the signature block and unsubscribe link regardless
 * of what the copy source produced.
 */
export async function composeEmail(input: ComposeEmailInput): Promise<ComposedEmail> {
  let subject: string;
  let paragraphs: string[];
  let usedAiCopy: boolean;

  try {
    const aiResult = await getAIProvider().generateEmailCopy({
      companyName: input.companyName,
      contactName: input.contactName ?? undefined,
      industry: input.industry ?? undefined,
      primaryCategoryName: input.primaryCategoryName,
      primaryCategoryServices: input.primaryCategoryServices,
      stage: input.stage,
    });
    subject = aiResult.subject;
    paragraphs = aiResult.bodyParagraphs;
    usedAiCopy = true;
  } catch (err) {
    console.warn(
      `[composer] AI email copy generation failed for lead ${input.leadId} (stage ${input.stage}), using fallback template:`,
      err,
    );
    const fallback = buildFallbackCopy(input.stage, input.companyName, input.primaryCategoryName);
    subject = fallback.subject;
    paragraphs = fallback.paragraphs;
    usedAiCopy = false;
  }

  // 'followup'/'final' must read as a continuation of the SAME thread the lead already got a
  // 'new'-stage email in, not a fresh unrelated email — so their subject is never left to the AI
  // (or the fallback template) to invent. This overrides whatever subject either source produced.
  if (input.stage !== 'new' && input.originalSubject) {
    subject = `Re: ${input.originalSubject}`;
  }

  const greetingName = input.contactName?.trim() || 'there';

  const html = renderEmailHtml({
    greetingName,
    paragraphs,
    unsubscribeUrl: input.unsubscribeUrl,
    whatsappCtaUrl: input.whatsappCtaUrl,
  });
  const text = renderEmailText({
    greetingName,
    paragraphs,
    unsubscribeUrl: input.unsubscribeUrl,
    whatsappCtaUrl: input.whatsappCtaUrl,
  });

  return { subject, html, text, usedAiCopy };
}
