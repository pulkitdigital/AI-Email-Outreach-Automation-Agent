import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock: { R2_PUBLIC_URL?: string } = {};
vi.mock('../../../config/env.js', () => ({ env: envMock }));

const getLeadByIdMock = vi.fn();
const updateLeadStatusMock = vi.fn();
vi.mock('../../../db/repositories/leadsRepository.js', () => ({
  getLeadById: getLeadByIdMock,
  updateLeadStatus: updateLeadStatusMock,
}));

const getCategoryByIdMock = vi.fn();
vi.mock('../../../db/repositories/categoriesRepository.js', () => ({
  getCategoryById: getCategoryByIdMock,
}));

const createPitchDeckMock = vi.fn();
const getPitchDeckByIdMock = vi.fn();
const updatePitchDeckStatusMock = vi.fn();
vi.mock('../../../db/repositories/pitchDecksRepository.js', () => ({
  createPitchDeck: createPitchDeckMock,
  getPitchDeckById: getPitchDeckByIdMock,
  updatePitchDeckStatus: updatePitchDeckStatusMock,
}));

const enqueueDeckGenerationJobMock = vi.fn();
vi.mock('../../../queue/queues.js', () => ({
  enqueueDeckGenerationJob: enqueueDeckGenerationJobMock,
}));

const putObjectMock = vi.fn();
const getStorageProviderMock = vi.fn(() => ({ putObject: putObjectMock }));
vi.mock('../../../storage/index.js', () => ({
  getStorageProvider: getStorageProviderMock,
}));

const buildDeckForLeadMock = vi.fn();
vi.mock('../deckBuilder.js', () => ({
  buildDeckForLead: buildDeckForLeadMock,
  DECK_TEMPLATE_VERSION: 'v1',
}));

const { triggerDeckGeneration, generateDeckForLead, markDeckGenerationFailed } =
  await import('../deckGenerationService.js');
const { DeckGenerationPreconditionError } = await import('../errors.js');

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    companyName: 'Acme Co',
    categoryId: 'cat-web',
    status: 'categorized',
    ...overrides,
  };
}

beforeEach(() => {
  delete envMock.R2_PUBLIC_URL;
  getLeadByIdMock.mockReset();
  updateLeadStatusMock.mockReset();
  getCategoryByIdMock.mockReset();
  createPitchDeckMock.mockReset();
  getPitchDeckByIdMock.mockReset();
  updatePitchDeckStatusMock.mockReset();
  enqueueDeckGenerationJobMock.mockReset();
  putObjectMock.mockReset();
  getStorageProviderMock.mockClear();
  buildDeckForLeadMock.mockReset();
});

describe('triggerDeckGeneration', () => {
  it('throws without creating a pitch deck or enqueueing when the lead has no category', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ categoryId: null }));

    await expect(triggerDeckGeneration('lead-1')).rejects.toThrow(DeckGenerationPreconditionError);
    expect(createPitchDeckMock).not.toHaveBeenCalled();
    expect(enqueueDeckGenerationJobMock).not.toHaveBeenCalled();
  });

  it('creates a pitch deck row and enqueues a job carrying its id', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    createPitchDeckMock.mockResolvedValue({ id: 'deck-1' });

    const result = await triggerDeckGeneration('lead-1');

    expect(result).toEqual({ pitchDeckId: 'deck-1' });
    expect(createPitchDeckMock).toHaveBeenCalledWith({
      leadId: 'lead-1',
      categoryId: 'cat-web',
      templateVersion: 'v1',
    });
    expect(enqueueDeckGenerationJobMock).toHaveBeenCalledWith({
      leadId: 'lead-1',
      pitchDeckId: 'deck-1',
    });
  });
});

describe('generateDeckForLead', () => {
  it('builds, uploads, and marks the deck ready, then advances the lead to deck_generated', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    getPitchDeckByIdMock.mockResolvedValue({ id: 'deck-1' });
    getCategoryByIdMock.mockResolvedValue({ id: 'cat-web', slug: 'web-app-solutions' });
    buildDeckForLeadMock.mockResolvedValue(Buffer.from('pptx-bytes'));

    await generateDeckForLead('lead-1', 'deck-1');

    expect(buildDeckForLeadMock).toHaveBeenCalledWith({
      companyName: 'Acme Co',
      primaryCategorySlug: 'web-app-solutions',
    });
    expect(putObjectMock).toHaveBeenCalledWith(
      'pitch-decks/lead-1/deck-1.pptx',
      expect.any(Buffer),
      expect.stringContaining('presentationml'),
    );
    expect(updatePitchDeckStatusMock).toHaveBeenCalledWith('deck-1', {
      status: 'generating',
      generationError: null,
    });
    expect(updatePitchDeckStatusMock).toHaveBeenCalledWith(
      'deck-1',
      expect.objectContaining({ status: 'ready', fileKey: 'pitch-decks/lead-1/deck-1.pptx' }),
    );
    expect(updateLeadStatusMock).toHaveBeenCalledWith('lead-1', 'deck_generated');
  });

  it('uses the R2 public URL when configured', async () => {
    envMock.R2_PUBLIC_URL = 'https://cdn.example.com/';
    getLeadByIdMock.mockResolvedValue(baseLead());
    getPitchDeckByIdMock.mockResolvedValue({ id: 'deck-1' });
    getCategoryByIdMock.mockResolvedValue({ id: 'cat-web', slug: 'web-app-solutions' });
    buildDeckForLeadMock.mockResolvedValue(Buffer.from('pptx-bytes'));

    await generateDeckForLead('lead-1', 'deck-1');

    expect(updatePitchDeckStatusMock).toHaveBeenCalledWith(
      'deck-1',
      expect.objectContaining({
        fileUrl: 'https://cdn.example.com/pitch-decks/lead-1/deck-1.pptx',
      }),
    );
  });

  it('falls back to the backend download route when no public URL is configured', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    getPitchDeckByIdMock.mockResolvedValue({ id: 'deck-1' });
    getCategoryByIdMock.mockResolvedValue({ id: 'cat-web', slug: 'web-app-solutions' });
    buildDeckForLeadMock.mockResolvedValue(Buffer.from('pptx-bytes'));

    await generateDeckForLead('lead-1', 'deck-1');

    expect(updatePitchDeckStatusMock).toHaveBeenCalledWith(
      'deck-1',
      expect.objectContaining({ fileUrl: '/api/decks/deck-1/download' }),
    );
  });

  it('does not advance a lead that has already progressed past categorized', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));
    getPitchDeckByIdMock.mockResolvedValue({ id: 'deck-1' });
    getCategoryByIdMock.mockResolvedValue({ id: 'cat-web', slug: 'web-app-solutions' });
    buildDeckForLeadMock.mockResolvedValue(Buffer.from('pptx-bytes'));

    await generateDeckForLead('lead-1', 'deck-1');

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });

  it('marks the pitch deck failed and rethrows when the build fails, without touching lead status', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead());
    getPitchDeckByIdMock.mockResolvedValue({ id: 'deck-1' });
    getCategoryByIdMock.mockResolvedValue({ id: 'cat-web', slug: 'web-app-solutions' });
    buildDeckForLeadMock.mockRejectedValue(new Error('pptxgenjs exploded'));

    await expect(generateDeckForLead('lead-1', 'deck-1')).rejects.toThrow('pptxgenjs exploded');

    expect(updatePitchDeckStatusMock).toHaveBeenCalledWith('deck-1', {
      status: 'failed',
      generationError: 'pptxgenjs exploded',
    });
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });

  it('throws DeckGenerationPreconditionError without touching the pitch deck if the lead lost its category', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ categoryId: null }));

    await expect(generateDeckForLead('lead-1', 'deck-1')).rejects.toThrow(
      DeckGenerationPreconditionError,
    );
    expect(getPitchDeckByIdMock).not.toHaveBeenCalled();
    expect(updatePitchDeckStatusMock).not.toHaveBeenCalled();
  });
});

describe('markDeckGenerationFailed', () => {
  it('flags a categorized lead as needs_review with the deck-generation-failed reason', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'categorized' }));

    await markDeckGenerationFailed('lead-1');

    expect(updateLeadStatusMock).toHaveBeenCalledWith(
      'lead-1',
      'needs_review',
      'deck_generation_failed',
    );
  });

  it('leaves an already-progressed lead untouched', async () => {
    getLeadByIdMock.mockResolvedValue(baseLead({ status: 'in_sequence' }));

    await markDeckGenerationFailed('lead-1');

    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });
});
