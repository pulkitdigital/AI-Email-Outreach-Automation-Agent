const BRAND_ORANGE = '#FB8500';
const BRAND_TEAL = '#219EBC';
const CONTACT = {
  companyName: 'BeBeyond Digital Solutions',
  email: 'info@bebeyond.digital',
  phone: '+91 99 1867 1867',
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
}

/**
 * Wraps AI-generated (or fallback) copy in a fixed structure: greeting, body, signature block,
 * unsubscribe footer. The signature and unsubscribe link are always present here, regardless
 * of what the AI returned — this is the compliance guarantee, enforced by never letting the AI
 * touch this function's output.
 */
export function renderEmailHtml(input: RenderEmailInput): string {
  const paragraphsHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #2B2B2B;">${escapeHtml(p)}</p>`,
    )
    .join('\n');

  const whatsappHtml = input.whatsappCtaUrl
    ? `<p style="margin: 0 0 16px; font-size: 15px; color: #2B2B2B;">Prefer WhatsApp? <a href="${escapeHtml(input.whatsappCtaUrl)}" style="color: ${BRAND_TEAL};">Message us there</a> instead.</p>`
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="margin: 0; padding: 0; background-color: #FFFFFF; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 24px;">
          <p style="margin: 0 0 16px; font-size: 15px; color: #2B2B2B;">Hi ${escapeHtml(input.greetingName)},</p>
          ${paragraphsHtml}
          ${whatsappHtml}
          <p style="margin: 24px 0 4px; font-size: 15px; color: #2B2B2B;">Best,</p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #2B2B2B;">
            <strong style="color: ${BRAND_ORANGE};">Be</strong><strong style="color: ${BRAND_TEAL};">Beyond</strong> Digital Solutions<br />
            ${escapeHtml(CONTACT.email)} &nbsp;|&nbsp; ${escapeHtml(CONTACT.phone)}
          </p>
          <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 16px 0;" />
          <p style="margin: 0; font-size: 11px; color: #8A8A8A;">
            You're receiving this because your business was identified as a potential fit for our services.
            <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${BRAND_TEAL};">Unsubscribe</a> to stop receiving emails from us.
          </p>
        </td>
      </tr>
    </table>
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
  <body style="margin: 0; padding: 0; background-color: #FFFFFF; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 24px; font-size: 15px; line-height: 1.6; color: #2B2B2B;">
          ${escaped}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderEmailText(input: RenderEmailInput): string {
  const lines = [
    `Hi ${input.greetingName},`,
    '',
    ...input.paragraphs.flatMap((p) => [p, '']),
    ...(input.whatsappCtaUrl ? [`Prefer WhatsApp? Message us: ${input.whatsappCtaUrl}`, ''] : []),
    'Best,',
    `${CONTACT.companyName}`,
    `${CONTACT.email} | ${CONTACT.phone}`,
    '',
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ];
  return lines.join('\n');
}
