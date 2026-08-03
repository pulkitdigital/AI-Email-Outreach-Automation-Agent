import { Router } from 'express';
import { listReplies, type ListRepliesFilters } from '../db/repositories/repliesRepository.js';

export const repliesRouter = Router();

/** GET /api/replies — the dashboard's global Replies view (Phase 6): every reply, with readable content, searchable, paginated. */
repliesRouter.get('/', async (req, res) => {
  const { search, page, pageSize } = req.query as Record<string, string | undefined>;

  const filters: ListRepliesFilters = {};
  if (search) filters.search = search;

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 25));

  try {
    const result = await listReplies(filters, {
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
    });
    res.json({ ...result, page: pageNum, pageSize: pageSizeNum });
  } catch (err) {
    console.error('[replies-route] failed to list replies:', err);
    res.status(500).json({ error: 'Failed to list replies — see server logs for details' });
  }
});
