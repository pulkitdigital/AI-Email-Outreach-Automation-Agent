import { beforeEach, describe, expect, it, vi } from 'vitest';

// ingestionWorker.ts constructs a real BullMQ Worker (and, transitively, a real Redis connection)
// at module load time — mock both so importing it in a test never touches the network.
vi.mock('../../connection.js', () => ({ redisConnection: {} }));
vi.mock('bullmq', () => ({
  Worker: class {
    on() {
      return this;
    }
  },
  Queue: class {
    add() {
      return Promise.resolve();
    }
  },
}));

const getObjectMock = vi.fn();
const deleteObjectMock = vi.fn();
const getStorageProviderMock = vi.fn(() => ({
  getObject: getObjectMock,
  deleteObject: deleteObjectMock,
}));
vi.mock('../../../storage/index.js', () => ({
  getStorageProvider: getStorageProviderMock,
}));

const expandToLeafFilesMock = vi.fn();
const processLeafFileMock = vi.fn();
vi.mock('../../../modules/ingestion/pipeline.js', () => ({
  expandToLeafFiles: expandToLeafFilesMock,
  processLeafFile: processLeafFileMock,
}));

const runDriveIngestionJobMock = vi.fn();
vi.mock('../../../modules/ingestion/driveIngestion.js', () => ({
  runDriveIngestionJob: runDriveIngestionJobMock,
}));

const completeIngestionJobMock = vi.fn();
const getIngestionJobByIdMock = vi.fn();
const markIngestionJobStartedMock = vi.fn();
const resetIngestionJobCountersMock = vi.fn();
vi.mock('../../../db/repositories/ingestionJobsRepository.js', () => ({
  completeIngestionJob: completeIngestionJobMock,
  getIngestionJobById: getIngestionJobByIdMock,
  markIngestionJobStarted: markIngestionJobStartedMock,
  resetIngestionJobCounters: resetIngestionJobCountersMock,
}));

const { processUploadJob, IngestionFileMissingError } = await import('../ingestionWorker.js');

describe('processUploadJob', () => {
  beforeEach(() => {
    getObjectMock.mockReset();
    deleteObjectMock.mockReset().mockResolvedValue(undefined);
    getStorageProviderMock.mockClear();
    expandToLeafFilesMock.mockReset();
    processLeafFileMock.mockReset();
    markIngestionJobStartedMock.mockReset().mockResolvedValue(undefined);
  });

  it('throws a distinct IngestionFileMissingError, without ever parsing, when the staged object cannot be read back', async () => {
    getObjectMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );

    await expect(
      processUploadJob({
        type: 'upload',
        jobId: 'job-1',
        storageKey: 'ingestion-uploads/job-1/missing.csv',
        originalFileName: 'missing.csv',
      }),
    ).rejects.toThrow(IngestionFileMissingError);

    expect(expandToLeafFilesMock).not.toHaveBeenCalled();
    expect(markIngestionJobStartedMock).not.toHaveBeenCalled();
  });

  it('processes normally when the staged object is present', async () => {
    getObjectMock.mockResolvedValue(Buffer.from('name,email\nA,a@example.com'));
    expandToLeafFilesMock.mockReturnValue({
      files: [{ path: 'missing.csv', buffer: Buffer.from('x') }],
      warnings: [],
    });
    processLeafFileMock.mockResolvedValue(undefined);

    await processUploadJob({
      type: 'upload',
      jobId: 'job-1',
      storageKey: 'ingestion-uploads/job-1/ok.csv',
      originalFileName: 'ok.csv',
    });

    expect(markIngestionJobStartedMock).toHaveBeenCalledWith('job-1', 1);
    expect(processLeafFileMock).toHaveBeenCalledWith('job-1', 'missing.csv', expect.any(Buffer));
    expect(deleteObjectMock).toHaveBeenCalledWith('ingestion-uploads/job-1/ok.csv');
  });
});
