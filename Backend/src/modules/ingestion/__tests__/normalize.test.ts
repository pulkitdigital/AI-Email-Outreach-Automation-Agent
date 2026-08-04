import { describe, expect, it } from 'vitest';
import { computeMergePatch, isValidEmail, normalizeEmail } from '../normalize.js';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  John.Doe@Example.COM  ')).toBe('john.doe@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('Jane@Example.com');
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.domain.co.in')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing-domain@')).toBe(false);
    expect(isValidEmail('@missing-local.com')).toBe(false);
    expect(isValidEmail('has spaces@example.com')).toBe(false);
  });
});

describe('computeMergePatch', () => {
  const blank = {
    companyName: null,
    contactName: null,
    phone: null,
    website: null,
    industry: null,
    country: null,
    region: null,
  };

  it('fills every blank field when the existing record is entirely empty', () => {
    const patch = computeMergePatch(blank, {
      companyName: 'Acme Co',
      phone: '+91 99 1867 1867',
    });
    expect(patch).toEqual({ companyName: 'Acme Co', phone: '+91 99 1867 1867' });
  });

  it('never overwrites an existing non-blank value, even with a different incoming value', () => {
    const existing = { ...blank, companyName: 'Original Co' };
    const patch = computeMergePatch(existing, { companyName: 'Different Co' });
    expect(patch).toEqual({});
  });

  it('only fills the specific fields that are blank, leaving populated ones alone', () => {
    const existing = { ...blank, companyName: 'Acme Co', phone: null };
    const patch = computeMergePatch(existing, { companyName: 'Should Be Ignored', phone: '12345' });
    expect(patch).toEqual({ phone: '12345' });
  });

  it('treats an empty string and whitespace-only existing value as blank', () => {
    const existing = { ...blank, companyName: '', website: '   ' };
    const patch = computeMergePatch(existing, { companyName: 'Acme Co', website: 'acme.com' });
    expect(patch).toEqual({ companyName: 'Acme Co', website: 'acme.com' });
  });

  it('does not apply a blank/whitespace-only incoming value', () => {
    const patch = computeMergePatch(blank, { companyName: '   ', phone: undefined });
    expect(patch).toEqual({});
  });

  it('trims the incoming value before applying it', () => {
    const patch = computeMergePatch(blank, { companyName: '  Acme Co  ' });
    expect(patch).toEqual({ companyName: 'Acme Co' });
  });

  it('returns an empty patch when both existing and incoming are blank', () => {
    expect(computeMergePatch(blank, {})).toEqual({});
  });

  it('returns an empty patch when there is nothing to merge (existing already fully populated)', () => {
    const existing = {
      companyName: 'Acme Co',
      contactName: 'Jane Doe',
      phone: '12345',
      website: 'acme.com',
      industry: 'Retail',
      country: 'India',
      region: 'UP',
    };
    const patch = computeMergePatch(existing, {
      companyName: 'Other Co',
      contactName: 'John Smith',
      phone: '67890',
      website: 'other.com',
      industry: 'Tech',
      country: 'USA',
      region: 'CA',
    });
    expect(patch).toEqual({});
  });
});
