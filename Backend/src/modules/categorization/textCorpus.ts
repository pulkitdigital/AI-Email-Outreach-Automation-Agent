import type { CategorizationRuleMatchField } from '@bebeyond/shared';

export interface LeadTextFields {
  industry?: string | null;
  companyName?: string | null;
  website?: string | null;
  rawData?: Record<string, unknown> | null;
}

function flattenRawData(rawData: Record<string, unknown> | null | undefined): string {
  if (!rawData) return '';
  return Object.values(rawData)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v))
    .join(' ');
}

/** Builds the per-field search corpus a categorization rule is matched against. */
export function buildCorpus(lead: LeadTextFields): Record<CategorizationRuleMatchField, string> {
  const industry = lead.industry ?? '';
  const companyName = lead.companyName ?? '';
  const website = lead.website ?? '';
  const rawData = flattenRawData(lead.rawData);
  const any = [industry, companyName, website, rawData].filter(Boolean).join(' ');

  return {
    industry,
    company_name: companyName,
    website,
    raw_data: rawData,
    any,
  };
}
