import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateEmailCopyMock = vi.fn();
vi.mock('../../../providers/ai/index.js', () => ({
  getAIProvider: () => ({ generateEmailCopy: generateEmailCopyMock }),
}));

vi.mock('../../senderIdentity/senderIdentityService.js', () => ({
  getSenderIdentity: () =>
    Promise.resolve({ name: 'Pulkit', designation: 'Founder', companyName: 'BeBeyond Digital Solutions' }),
}));

const { composeEmail } = await import('../composerService.js');

const baseInput = {
  leadId: 'lead-1',
  companyName: 'Acme Co',
  contactName: 'Jane Doe',
  industry: 'Retail',
  primaryCategoryName: 'Digital Marketing',
  primaryCategoryServices: ['SMM', 'SEO / GEO'],
  stage: 'new' as const,
  unsubscribeUrl: 'https://example.com/unsubscribe/lead-1/token',
};

beforeEach(() => {
  generateEmailCopyMock.mockReset();
});

describe('composeEmail', () => {
  it('uses AI-generated copy when the AI call succeeds', async () => {
    generateEmailCopyMock.mockResolvedValue({
      subject: 'AI subject line',
      bodyParagraphs: ['AI paragraph one.', 'AI paragraph two.'],
    });

    const result = await composeEmail(baseInput);

    expect(result.usedAiCopy).toBe(true);
    expect(result.subject).toBe('AI subject line');
    expect(result.html).toContain('AI paragraph one.');
    expect(result.text).toContain('AI paragraph two.');
  });

  it('falls back to the static template when the AI call fails, without throwing', async () => {
    generateEmailCopyMock.mockRejectedValue(new Error('AI API timeout'));

    const result = await composeEmail(baseInput);

    expect(result.usedAiCopy).toBe(false);
    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.html).toContain('Acme Co');
  });

  it('never claims a deck is attached in the fallback copy for the new stage', async () => {
    generateEmailCopyMock.mockRejectedValue(new Error('AI API timeout'));

    const result = await composeEmail(baseInput);

    expect(result.text.toLowerCase()).not.toContain('attached');
  });

  it('always includes the signature and unsubscribe link regardless of copy source', async () => {
    generateEmailCopyMock.mockResolvedValue({ subject: 'Hi', bodyParagraphs: ['Body.'] });

    const result = await composeEmail(baseInput);

    expect(result.html).toContain('info@bebeyond.digital');
    expect(result.html).toContain(baseInput.unsubscribeUrl);
  });

  it('greets by contact name when available, and falls back to "there" when not', async () => {
    generateEmailCopyMock.mockResolvedValue({ subject: 'Hi', bodyParagraphs: ['Body.'] });

    const withName = await composeEmail(baseInput);
    expect(withName.text).toContain('Hi Jane Doe,');

    const withoutName = await composeEmail({ ...baseInput, contactName: null });
    expect(withoutName.text).toContain('Hi there,');
  });
});
