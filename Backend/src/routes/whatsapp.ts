import { Router } from 'express';
import {
  listWhatsAppMessages,
  listWhatsAppTemplates,
  type ListWhatsAppMessagesFilters,
} from '../db/repositories/whatsappRepository.js';

export const whatsappRouter = Router();

function parseBooleanQueryParam(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** GET /api/whatsapp/messages — the dashboard's WhatsApp section (mirrors /api/replies): every logged message, filterable by matched/unmatched and opted-in/not, paginated. */
whatsappRouter.get('/messages', async (req, res) => {
  const { matched, optedIn, page, pageSize } = req.query as Record<string, string | undefined>;

  const filters: ListWhatsAppMessagesFilters = {
    matched: parseBooleanQueryParam(matched),
    optedIn: parseBooleanQueryParam(optedIn),
  };

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));

  try {
    const result = await listWhatsAppMessages(filters, {
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
    });
    res.json({ ...result, page: pageNum, pageSize: pageSizeNum });
  } catch (err) {
    console.error('[whatsapp-route] failed to list messages:', err);
    res.status(500).json({ error: 'Failed to list WhatsApp messages — see server logs for details' });
  }
});

/** GET /api/whatsapp/templates — for the dashboard's template-send picker. `?approvalStatus=approved` is what the send box actually offers; unfiltered is used for admin/reference views. */
whatsappRouter.get('/templates', async (req, res) => {
  const { approvalStatus } = req.query as Record<string, string | undefined>;

  if (approvalStatus && !['pending', 'approved', 'rejected'].includes(approvalStatus)) {
    res.status(400).json({ error: 'approvalStatus must be one of: pending, approved, rejected' });
    return;
  }

  try {
    const templates = await listWhatsAppTemplates({
      approvalStatus: approvalStatus as 'pending' | 'approved' | 'rejected' | undefined,
    });
    res.json(templates);
  } catch (err) {
    console.error('[whatsapp-route] failed to list templates:', err);
    res.status(500).json({ error: 'Failed to list WhatsApp templates — see server logs for details' });
  }
});
