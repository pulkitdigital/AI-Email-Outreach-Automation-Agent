import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLeadByIdMock = vi.fn();
const updateLeadFieldsMock = vi.fn();
const updateLeadStatusMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: getLeadByIdMock,
  updateLeadFields: updateLeadFieldsMock,
  updateLeadStatus: updateLeadStatusMock,
}));

const enqueueCategorizationJobMock = vi.fn();
vi.mock('../../../queue/queues.js', () => ({
  enqueueCategorizationJob: enqueueCategorizationJobMock,
}));

const { confirmLead } = await import('../leadReviewService.js');
const { LeadReviewPreconditionError } = await import('../errors.js');

const needsReviewLead = { id: 'lead-1', status: 'needs_review' };

beforeEach(() => {
  getLeadByIdMock.mockReset().mockResolvedValue(needsReviewLead);
  updateLeadFieldsMock.mockReset();
  updateLeadStatusMock.mockReset().mockResolvedValue({ ...needsReviewLead, status: 'new' });
  enqueueCategorizationJobMock.mockReset();
});

describe('confirmLead', () => {
  it('applies the patch, moves the lead to new, and enqueues categorization', async () => {
    const patch = { companyName: 'Fixed Co' };

    const result = await confirmLead('lead-1', patch);

    expect(updateLeadFieldsMock).toHaveBeenCalledWith('lead-1', patch);
    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'new', null);
    expect(enqueueCategorizationJobMock).toHaveBeenCalledWith({ leadId: 'lead-1' });
    expect(result.status).toBe('new');
  });

  it('rejects confirming a lead that is not in needs_review', async () => {
    getLeadByIdMock.mockResolvedValue({ id: 'lead-1', status: 'in_sequence' });

    await expect(confirmLead('lead-1', {})).rejects.toThrow(LeadReviewPreconditionError);
    expect(updateLeadFieldsMock).not.toHaveBeenCalled();
    expect(enqueueCategorizationJobMock).not.toHaveBeenCalled();
  });

  it('throws when the lead does not exist', async () => {
    getLeadByIdMock.mockResolvedValue(null);

    await expect(confirmLead('missing', {})).rejects.toThrow(/not found/);
    expect(enqueueCategorizationJobMock).not.toHaveBeenCalled();
  });
});
