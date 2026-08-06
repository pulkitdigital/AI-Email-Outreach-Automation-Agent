import { describe, expect, it } from 'vitest';
import { HOW_CAN_WE_HELP, HOW_CAN_WE_HELP_BY_CATEGORY, orderBenefitsForLead } from '../staticContent.js';

describe('orderBenefitsForLead', () => {
  it('moves the primary category\'s mapped benefits to the front, in the mapping\'s own order', () => {
    const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, 'digital-marketing');
    expect(ordered.slice(0, 3)).toEqual(HOW_CAN_WE_HELP_BY_CATEGORY['digital-marketing']);
    expect(ordered).toHaveLength(HOW_CAN_WE_HELP.length);
  });

  it('preserves the relative order of the remaining benefits', () => {
    const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, 'web-app-solutions');
    const frontSet = new Set(HOW_CAN_WE_HELP_BY_CATEGORY['web-app-solutions']);
    const remaining = ordered.filter((label) => !frontSet.has(label));
    const expectedRemaining = HOW_CAN_WE_HELP.filter((label) => !frontSet.has(label));
    expect(remaining).toEqual(expectedRemaining);
  });

  it('contains exactly the same set of benefits as the input, just reordered', () => {
    const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, 'creative-services');
    expect([...ordered].sort()).toEqual([...HOW_CAN_WE_HELP].sort());
  });

  it('produces a different order for different categories', () => {
    const digitalMarketing = orderBenefitsForLead(HOW_CAN_WE_HELP, 'digital-marketing');
    const marketplace = orderBenefitsForLead(HOW_CAN_WE_HELP, 'marketplace-commerce');
    expect(digitalMarketing).not.toEqual(marketplace);
  });

  it('returns the original order unchanged when primarySlug is null', () => {
    const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, null);
    expect(ordered).toEqual(HOW_CAN_WE_HELP);
  });

  it('returns the original order unchanged when primarySlug matches nothing', () => {
    const ordered = orderBenefitsForLead(HOW_CAN_WE_HELP, 'not-a-real-category');
    expect(ordered).toEqual(HOW_CAN_WE_HELP);
  });

  it('does not mutate the input array', () => {
    const original = [...HOW_CAN_WE_HELP];
    orderBenefitsForLead(HOW_CAN_WE_HELP, 'web-app-solutions');
    expect(HOW_CAN_WE_HELP).toEqual(original);
  });

  it('every category in HOW_CAN_WE_HELP_BY_CATEGORY maps only to real HOW_CAN_WE_HELP labels', () => {
    for (const labels of Object.values(HOW_CAN_WE_HELP_BY_CATEGORY)) {
      for (const label of labels) {
        expect(HOW_CAN_WE_HELP).toContain(label);
      }
    }
  });
});
