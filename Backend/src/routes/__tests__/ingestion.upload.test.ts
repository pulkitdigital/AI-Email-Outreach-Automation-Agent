import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = { MAX_UPLOAD_FILE_SIZE_MB: 200 };
vi.mock('../../config/env.js', () => ({ env: envMock }));

const createIngestionJobMock = vi.fn();
const completeIngestionJobMock = vi.fn();
const getIngestionJobByIdMock = vi.fn();
const listRecentIngestionJobsMock = vi.fn();
vi.mock('../../db/repositories/ingestionJobsRepository.js', () => ({
  createIngestionJob: createIngestionJobMock,
  completeIngestionJob: completeIngestionJobMock,
  getIngestionJobById: getIngestionJobByIdMock,
  listRecentIngestionJobs: listRecentIngestionJobsMock,
}));

const extractDriveIdFromUrlMock = vi.fn();
vi.mock('../../integrations/googleDrive/driveClient.js', () => ({
  extractDriveIdFromUrl: extractDriveIdFromUrlMock,
}));

const enqueueIngestionJobMock = vi.fn();
vi.mock('../../queue/queues.js', () => ({
  enqueueIngestionJob: enqueueIngestionJobMock,
}));

const putObjectMock = vi.fn();
const getStorageProviderMock = vi.fn(() => ({ putObject: putObjectMock }));
vi.mock('../../storage/index.js', () => ({
  getStorageProvider: getStorageProviderMock,
}));

const { ingestionRouter } = await import('../ingestion.js');

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    sourceType: 'csv',
    sourceReference: 'test.csv',
    ...overrides,
  };
}

describe('POST /api/ingestion/upload', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use('/api/ingestion', ingestionRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    createIngestionJobMock.mockReset().mockResolvedValue(baseJob());
    completeIngestionJobMock.mockReset().mockResolvedValue(undefined);
    enqueueIngestionJobMock.mockReset().mockResolvedValue(undefined);
    putObjectMock.mockReset().mockResolvedValue(undefined);
    getStorageProviderMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function uploadCsv() {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['name,email\nA,a@example.com'], { type: 'text/csv' }),
      'test.csv',
    );
    return fetch(`${baseUrl}/api/ingestion/upload`, { method: 'POST', body: form });
  }

  it('only enqueues the job after the storage write has resolved, never before', async () => {
    const events: string[] = [];
    let resolvePutObject: () => void = () => {};
    putObjectMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePutObject = () => {
            events.push('putObject resolved');
            resolve();
          };
        }),
    );
    enqueueIngestionJobMock.mockImplementation(async () => {
      events.push('enqueue called');
    });

    const responsePromise = uploadCsv();

    // Give the request time to reach the (still-pending) storage write.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(enqueueIngestionJobMock).not.toHaveBeenCalled();

    resolvePutObject();
    const res = await responsePromise;

    expect(res.status).toBe(202);
    expect(events).toEqual(['putObject resolved', 'enqueue called']);
  });

  it('returns 500, marks the job failed, and never enqueues when the storage write fails', async () => {
    putObjectMock.mockRejectedValue(new Error('disk full'));

    const res = await uploadCsv();

    expect(res.status).toBe(500);
    expect(enqueueIngestionJobMock).not.toHaveBeenCalled();
    expect(completeIngestionJobMock).toHaveBeenCalledWith('job-1', 'failed');
  });
});
