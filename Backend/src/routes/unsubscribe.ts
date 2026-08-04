import { Router } from 'express';
import { getLeadById, updateLeadStatus } from '../db/repositories/leadsRepository.js';
import { getEmailProvider } from '../providers/email/index.js';
import { verifyUnsubscribeToken } from '../modules/emailComposer/unsubscribeToken.js';

export const unsubscribeRouter = Router();

function renderPage(message: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #2B2B2B;">
    <h2><span style="color:#FB8500;">Be</span><span style="color:#219EBC;">Beyond</span> Digital Solutions</h2>
    <p>${message}</p>
  </body>
</html>`;
}

/**
 * Public link, clicked by real recipients from their email client — not a JSON API. Marking
 * the lead do_not_contact here always wins regardless of current status (unlike most other
 * status transitions in this codebase, which protect against regressing an in-progress lead —
 * an unsubscribe is a user-initiated, compliance-relevant action that must always take effect).
 */
unsubscribeRouter.get('/:leadId/:token', async (req, res) => {
  const { leadId, token } = req.params;

  let isValid: boolean;
  try {
    isValid = verifyUnsubscribeToken(leadId, token);
  } catch (err) {
    console.error(
      '[unsubscribe-route] token verification failed (likely UNSUBSCRIBE_SECRET not configured):',
      err,
    );
    res
      .status(500)
      .send(
        renderPage(
          'Something went wrong on our end — please email us directly at info@bebeyond.digital to unsubscribe.',
        ),
      );
    return;
  }

  if (!isValid) {
    res.status(400).send(renderPage('This unsubscribe link is invalid.'));
    return;
  }

  try {
    const lead = await getLeadById(leadId);
    if (!lead) {
      res.status(404).send(renderPage('We could not find this subscription.'));
      return;
    }

    await updateLeadStatus(leadId, 'do_not_contact');

    // Best-effort provider-level suppression (secondary safety net) — never blocks the
    // authoritative DB update above; see EmailProvider.handleUnsubscribe's doc comment.
    try {
      await getEmailProvider().handleUnsubscribe(lead.email);
    } catch (err) {
      console.error(
        `[unsubscribe-route] provider-level suppression failed for lead ${leadId} (DB is still authoritative):`,
        err,
      );
    }

    res.send(renderPage("You've been unsubscribed and will not receive further emails from us."));
  } catch (err) {
    console.error(`[unsubscribe-route] failed to process unsubscribe for lead ${leadId}:`, err);
    res
      .status(500)
      .send(
        renderPage(
          'Something went wrong on our end — please email us directly at info@bebeyond.digital to unsubscribe.',
        ),
      );
  }
});
