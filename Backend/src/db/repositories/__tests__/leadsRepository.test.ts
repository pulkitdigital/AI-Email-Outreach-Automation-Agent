import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }));

vi.mock('../../pool.js', () => ({
  pool: { connect: connectMock, query: vi.fn() },
}));

const { upsertLead } = await import('../leadsRepository.js');

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
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('merges only the blank fields into an existing lead on conflict, without overwriting populated ones', async () => {
    const existing = baseExisting({ companyName: null, phone: '111' });
    const merged = { ...existing, companyName: 'Acme Co' };

    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT DO NOTHING -> conflict, no row
      .mockResolvedValueOnce({ rows: [existing] }) // SELECT ... FOR UPDATE
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
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(
      queryMock.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE leads'),
      ),
    ).toBe(false);
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
