import { describe, expect, it } from 'vitest';
import { orderCategoriesForLead, SERVICE_CATEGORIES } from '../serviceCatalog.js';

describe('orderCategoriesForLead', () => {
  it('moves the primary category to the front', () => {
    const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, 'marketplace-commerce');
    expect(ordered[0]?.slug).toBe('marketplace-commerce');
    expect(ordered).toHaveLength(SERVICE_CATEGORIES.length);
  });

  it('preserves the relative order of the remaining categories', () => {
    const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, 'creative-services');
    const remaining = ordered.slice(1).map((c) => c.slug);
    const expectedRemaining = SERVICE_CATEGORIES.filter((c) => c.slug !== 'creative-services').map(
      (c) => c.slug,
    );
    expect(remaining).toEqual(expectedRemaining);
  });

  it('returns the original order unchanged when primarySlug is null', () => {
    const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, null);
    expect(ordered).toEqual(SERVICE_CATEGORIES);
  });

  it('returns the original order unchanged when primarySlug matches nothing', () => {
    const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, 'not-a-real-category');
    expect(ordered).toEqual(SERVICE_CATEGORIES);
  });

  it('does not mutate the input array', () => {
    const original = [...SERVICE_CATEGORIES];
    orderCategoriesForLead(SERVICE_CATEGORIES, 'web-app-solutions');
    expect(SERVICE_CATEGORIES).toEqual(original);
  });

  it('is a no-op when the primary category is already first', () => {
    const ordered = orderCategoriesForLead(SERVICE_CATEGORIES, SERVICE_CATEGORIES[0]?.slug ?? null);
    expect(ordered).toEqual(SERVICE_CATEGORIES);
  });
});
