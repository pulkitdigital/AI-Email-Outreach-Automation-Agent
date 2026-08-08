const CONTACT = {
  email: 'info@bebeyond.digital',
  phone: '+91 99 1867 1867',
  website: 'https://www.bebeyond.digital/',
  websiteLabel: 'www.bebeyond.digital',
};

/**
 * HTML-escapes any text interpolated into the email template — both AI-generated copy and
 * lead-controlled fields (companyName, contactName come from ingested data, which is
 * untrusted). Never insert raw text into renderEmailHtml() without this.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderEmailInput {
  greetingName: string;
  paragraphs: string[];
  unsubscribeUrl: string;
  /** Click-to-WhatsApp link (see modules/whatsapp/clickToWhatsapp.ts) — omitted/null renders no WhatsApp line, the same as before this existed. Behind WHATSAPP_CTA_ENABLED, default off. */
  whatsappCtaUrl?: string | null;
  /** DB-driven (falls back to env/hardcoded defaults) — see modules/senderIdentity/senderIdentityService.ts. Fetched once by the caller (composerService.ts) rather than read here, so a single compose only hits the DB/cache once. */
  senderName: string;
  senderDesignation: string;
  senderCompanyName: string;
}

/**
 * Wraps AI-generated (or fallback) copy in a fixed structure: greeting, body, signature block,
 * opt-out line. The signature and opt-out link are always present here, regardless of what the
 * AI returned — this is the compliance guarantee, enforced by never letting the AI touch this
 * function's output.
 *
 * Deliberately minimal HTML — no table layout, no background-color, no brand colors/logo
 * styling, no styled "Unsubscribe" button. bebeyond.digital has no prior sending history and
 * cold outreach needs to read as a genuine 1:1 email (what a person would type directly in
 * Gmail), not a bulk-marketing template — that structural difference (table wrapper, colored
 * CTA-style links, "You're receiving this because..." boilerplate) is exactly the kind of
 * pattern Gmail's Promotions-tab classifier keys on. The opt-out mechanism itself (the token/URL
 * from unsubscribeToken.ts) is unchanged — only its visual/textual presentation is: it's a plain
 * inline link inside a natural sentence, not a labeled button.
 */
export function renderEmailHtml(input: RenderEmailInput): string {
  const paragraphsHtml = input.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');

  const whatsappHtml = input.whatsappCtaUrl
    ? `<p>Prefer WhatsApp? You can message us there instead: <a href="${escapeHtml(input.whatsappCtaUrl)}">${escapeHtml(input.whatsappCtaUrl)}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #202124;">
    <p>Hi ${escapeHtml(input.greetingName)},</p>
    ${paragraphsHtml}
    ${whatsappHtml}
    <p>Best,<br />
    ${escapeHtml(input.senderName)}<br />
    ${escapeHtml(input.senderDesignation)}, ${escapeHtml(input.senderCompanyName)}<br />
    ${escapeHtml(CONTACT.email)} | ${escapeHtml(CONTACT.phone)}<br />
    <a href="${CONTACT.website}">${CONTACT.websiteLabel}</a></p>
    <p>If you'd rather not hear from us, just reply and let me know — or <a href="${escapeHtml(input.unsubscribeUrl)}">opt out here</a>.</p>
  </body>
</html>`;
}

/**
 * Renders a manually-edited email body (Feature B: per-send "edit before sending" override) as
 * HTML. Unlike renderEmailHtml, this does NOT add its own greeting/signature/unsubscribe
 * scaffold — the text passed in here already went through renderEmailText once (the dashboard
 * shows the user exactly what composeEmail() produced, including that scaffold, for editing), so
 * re-adding it would duplicate the footer. Escapes HTML and preserves line breaks; imposes no
 * other structure on the edited content.
 */
export function renderPlainTextAsHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/\n/g, '<br />');
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #202124;">
    ${escaped}
  </body>
</html>`;
}

export function renderEmailText(input: RenderEmailInput): string {
  const lines = [
    `Hi ${input.greetingName},`,
    '',
    ...input.paragraphs.flatMap((p) => [p, '']),
    ...(input.whatsappCtaUrl ? [`Prefer WhatsApp? You can message us there: ${input.whatsappCtaUrl}`, ''] : []),
    'Best,',
    input.senderName,
    `${input.senderDesignation}, ${input.senderCompanyName}`,
    `${CONTACT.email} | ${CONTACT.phone}`,
    CONTACT.website,
    '',
    `If you'd rather not hear from us, just reply and let me know — or opt out here: ${input.unsubscribeUrl}`,
  ];
  return lines.join('\n');
}
