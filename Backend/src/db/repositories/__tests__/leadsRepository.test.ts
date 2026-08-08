import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }));
const poolQueryMock = vi.fn();

vi.mock('../../pool.js', () => ({
  pool: { connect: connectMock, query: poolQueryMock },
}));

const { upsertLead, updateLeadStatus, setLeadStatusManually, hardDeleteLead } = await import(
  '../leadsRepository.js'
);

function baseExisting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    email: 'a@b.com',
    emailNormalized: 'a@b.com',
    companyName: null,
    contactName: null,
    phone: null,
    website: null,
    industry: null,
    country: null,
    region: null,
    ingestionJobId: 'job-0',
    sourceFile: 'old.csv',
    categoryId: null,
    status: 'new',
    reviewReason: null,
    extractionConfidence: null,
    rawData: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('upsertLead', () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockClear();
    releaseMock.mockClear();
    poolQueryMock.mockReset();
  });

  it('creates a new lead when the insert hits no conflict', async () => {
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [baseExisting({ companyName: 'Acme Co' })] }) // INSERT ... RETURNING
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await upsertLead({
      email: 'a@b.com',
      emailNormalized: 'a@b.com',
      companyName: 'Acme Co',
      ingestionJobId: 'job-1',
      sourceFile: 'new.csv',
      rawData: {},
      status: 'new',
    });

    expect(result.wasCreated).toBe(true);
    expect(result.mergedFields).toEqual([]);
    expect(result.alreadyContacted).toBe(false);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('merges only the blank fields into an existing lead on conflict, without overwriting populated ones', async () => {
    const existing = baseExisting({ companyName: null, phone: '111' });
    const merged = { ...existing, companyName: 'Acme Co' };

    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT DO NOTHING -> conflict, no row
      .mockResolvedValueOnce({ rows: [existing] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // already-contacted EXISTS check
      .mockResolvedValueOnce({ rows: [merged] }) // UPDATE ... RETURNING
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await upsertLead({
      email: 'a@b.com',
      emailNormalized: 'a@b.com',
      companyName: 'Acme Co', // fills the blank
      phone: '999', // existing already has '111' — must NOT be overwritten
      ingestionJobId: 'job-1',
      sourceFile: 'new.csv',
      rawData: {},
      status: 'new',
    });

    expect(result.wasCreated).toBe(false);
    expect(result.mergedFields).toEqual(['companyName']);
    expect(result.record.companyName).toBe('Acme Co');
    expect(result.alreadyContacted).toBe(false);

    // Verify the UPDATE's SET clause only targeted company_name, not phone (RETURNING lists
    // every column including phone, so check the SET clause specifically, not the whole SQL).
    const updateCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE leads'),
    );
    const setClause = (updateCall?.[0] as string).split('WHERE')[0];
    expect(setClause).toContain('company_name');
    expect(setClause).not.toContain('phone');
  });

  it('issues no UPDATE at all when the existing lead already has every field populated', async () => {
    const existing = baseExisting({
      companyName: 'Existing Co',
      contactName: 'Jane Doe',
      phone: '111',
      website: 'existing.com',
      industry: 'Retail',
      country: 'India',
      region: 'UP',
    });

    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // conflict
      .mockResolvedValueOnce({ rows: [existing] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ exists: true }] }) // already-contacted EXISTS check
      .mockResolvedValueOnce(undefined); // COMMIT (no UPDATE issued)

    const result = await upsertLead({
      email: 'a@b.com',
      emailNormalized: 'a@b.com',
      companyName: 'Different Co',
      ingestionJobId: 'job-1',
      sourceFile: 'new.csv',
      rawData: {},
      status: 'new',
    });

    expect(result.wasCreated).toBe(false);
    expect(result.mergedFields).toEqual([]);
    expect(result.record).toEqual(existing);
    expect(result.alreadyContacted).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(5);
    expect(
      queryMock.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE leads'),
      ),
    ).toBe(false);

    // Cheap EXISTS check, not a join — and scoped to this existing lead's id.
    const existsCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('EXISTS'),
    );
    expect(existsCall?.[0]).toContain('sent_emails_log');
    expect(existsCall?.[0]).not.toMatch(/\bJOIN\b/i);
    expect(existsCall?.[1]).toEqual([existing.id]);
  });

  it('rolls back and releases the client if a query fails mid-transaction', async () => {
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error('connection reset')); // INSERT fails

    await expect(
      upsertLead({
        email: 'a@b.com',
        emailNormalized: 'a@b.com',
        ingestionJobId: 'job-1',
        sourceFile: 'new.csv',
        rawData: {},
        status: 'new',
      }),
    ).rejects.toThrow('connection reset');

    expect(queryMock.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});

describe('updateLeadStatus', () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it('guards its WHERE clause against overwriting a manually-set protected terminal status', async () => {
    poolQueryMock.mockResolvedValue({ rows: [baseExisting({ status: 'converted' })] });

    await updateLeadStatus('lead-1', 'deck_generated');

    const [sql, params] = poolQueryMock.mock.calls[0]!;
    expect(sql).toContain('status_manually_set');
    expect(params).toEqual(['lead-1', 'deck_generated', true, null, ['converted', 'not_interested', 'unsubscribed']]);
  });

  it('resolves to null when the guard blocks the update (no matching row returned)', async () => {
    poolQueryMock.mockResolvedValue({ rows: [] });

    const result = await updateLeadStatus('lead-1', 'completed');

    expect(result).toBeNull();
  });
});

describe('setLeadStatusManually', () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it('sets status, marks status_manually_set, and clears review_reason unconditionally', async () => {
    poolQueryMock.mockResolvedValue({
      rows: [baseExisting({ status: 'converted', statusManuallySet: true, reviewReason: null })],
    });

    const result = await setLeadStatusManually('lead-1', 'converted');

    const [sql, params] = poolQueryMock.mock.calls[0]!;
    expect(sql).toContain('status_manually_set = true');
    expect(sql).not.toContain('AND NOT'); // no protected-status guard on the manual path
    expect(params).toEqual(['lead-1', 'converted']);
    expect(result?.status).toBe('converted');
  });
});

describe('hardDeleteLead', () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it('issues a real DELETE against the row', async () => {
    poolQueryMock.mockResolvedValue({ rows: [baseExisting()] });

    const result = await hardDeleteLead('lead-1');

    const [sql, params] = poolQueryMock.mock.calls[0]!;
    expect(sql).toContain('DELETE FROM leads');
    expect(params).toEqual(['lead-1']);
    expect(result?.id).toBe('lead-1');
  });

  it('resolves to null when no row matched (already gone)', async () => {
    poolQueryMock.mockResolvedValue({ rows: [] });

    const result = await hardDeleteLead('lead-1');

    expect(result).toBeNull();
  });
});
