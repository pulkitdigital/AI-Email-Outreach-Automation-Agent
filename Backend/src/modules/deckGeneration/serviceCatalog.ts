import type { ServiceGroup } from '@bebeyond/shared';
import { BRAND_COLORS } from './brand.js';

export interface ServiceCategoryContent {
  /** Matches categories.slug (Backend/src/db/migrations/0002_categorization.sql). */
  slug: string;
  serviceGroup: ServiceGroup;
  displayName: string;
  services: string[];
  /** Alternating teal/orange per the reference deck's "Our Services" slide (page 7). */
  accentColor: string;
}

/** Verbatim from the reference deck's "Our Services" slide (NEW_PITCH_DECK.pdf, page 7). */
export const SERVICE_CATEGORIES: ServiceCategoryContent[] = [
  {
    slug: 'digital-marketing',
    serviceGroup: 'digital_marketing',
    displayName: 'Digital Marketing',
    services: [
      'SMM',
      'Performance Marketing',
      'Branding',
      'GMB',
      'SEO / GEO',
      'Influencer Marketing',
    ],
    accentColor: BRAND_COLORS.teal,
  },
  {
    slug: 'web-app-solutions',
    serviceGroup: 'web_app_solutions',
    displayName: 'Web & App Solutions',
    services: [
      'Website',
      'E-commerce Website',
      'App Development',
      'Shopify Website',
      'WhatsApp Automation',
    ],
    accentColor: BRAND_COLORS.orange,
  },
  {
    slug: 'creative-services',
    serviceGroup: 'creative_services',
    displayName: 'Creative Services',
    services: [
      'Logo Design',
      'Design Creatives',
      'Video Editing',
      'Photoshoot & Videoshoot',
      'Ad Shoot Listing',
    ],
    accentColor: BRAND_COLORS.teal,
  },
  {
    slug: 'marketplace-commerce',
    serviceGroup: 'marketplace_commerce',
    displayName: 'Marketplace & Commerce',
    services: ['E-commerce Marketplace Setup', 'Amazon, Flipkart, Meesho, Myntra'],
    accentColor: BRAND_COLORS.orange,
  },
];

/**
 * Moves the lead's primary category to the front (so it renders first/emphasized on the "Our
 * Services" slide) while preserving the relative order of the rest — a pure function so the
 * personalization logic is unit-testable without touching pptxgenjs at all.
 */
export function orderCategoriesForLead(
  categories: ServiceCategoryContent[],
  primarySlug: string | null,
): ServiceCategoryContent[] {
  if (!primarySlug) return categories;

  const primaryIndex = categories.findIndex((c) => c.slug === primarySlug);
  if (primaryIndex === -1) return categories;

  const primary = categories[primaryIndex]!;
  const rest = categories.filter((_, i) => i !== primaryIndex);
  return [primary, ...rest];
}
