import { describe, expect, it } from 'vitest';
import { mapColumns } from '../columnMapper.js';

describe('mapColumns', () => {
  it('confidently maps a clean, unambiguous header set', () => {
    const { mapping, ambiguous, emailColumnFound } = mapColumns([
      'Email',
      'Company Name',
      'Contact Name',
      'Phone Number',
      'Website',
      'Industry',
      'Country',
      'Region',
    ]);

    expect(emailColumnFound).toBe(true);
    expect(mapping.email).toBe('Email');
    expect(mapping.companyName).toBe('Company Name');
    expect(mapping.contactName).toBe('Contact Name');
    expect(mapping.phone).toBe('Phone Number');
    expect(mapping.website).toBe('Website');
    expect(mapping.industry).toBe('Industry');
    expect(mapping.country).toBe('Country');
    expect(mapping.region).toBe('Region');
    expect(ambiguous).toEqual([]);
  });

  it('maps common real-world header variations (underscore, hyphen, casing)', () => {
    const { mapping, emailColumnFound } = mapColumns(['email_address', 'BUSINESS NAME']);
    expect(emailColumnFound).toBe(true);
    expect(mapping.email).toBe('email_address');
    expect(mapping.companyName).toBe('BUSINESS NAME');
  });

  it('flags two headers that both confidently claim the same field as ambiguous, rather than guessing', () => {
    const { mapping, ambiguous, emailColumnFound } = mapColumns(['Email', 'E-mail Address']);

    // Both headers score a near-exact match against the 'email' synonym list — neither should
    // be silently picked over the other.
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous.some((a) => a.candidateFields.includes('email'))).toBe(true);
    expect(mapping.email).toBeUndefined();
    expect(emailColumnFound).toBe(false);
  });

  it('leaves a header with no reasonable match unmapped without flagging it as ambiguous', () => {
    const { mapping, ambiguous } = mapColumns(['Email', 'Notes']);
    expect(mapping.email).toBe('Email');
    expect(Object.values(mapping)).not.toContain('Notes');
    expect(ambiguous).toEqual([]);
  });

  it('reports emailColumnFound: false when no header maps to email', () => {
    const { emailColumnFound, mapping } = mapColumns(['Company Name', 'Phone Number']);
    expect(emailColumnFound).toBe(false);
    expect(mapping.email).toBeUndefined();
  });
});
