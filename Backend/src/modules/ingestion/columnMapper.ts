import { distance } from 'fastest-levenshtein';
import type { MergeableLeadField } from './normalize.js';

export type TargetField = 'email' | MergeableLeadField;

export const TARGET_FIELDS: TargetField[] = [
  'email',
  'companyName',
  'contactName',
  'phone',
  'website',
  'industry',
  'country',
  'region',
];

/** Header variations we've seen in the wild, normalized (lowercase, non-alphanumeric collapsed to spaces). */
const FIELD_SYNONYMS: Record<TargetField, string[]> = {
  email: ['email', 'e mail', 'email address', 'emailaddress', 'mail', 'mail id', 'e mail id'],
  companyName: [
    'company',
    'company name',
    'companyname',
    'business',
    'business name',
    'organization',
    'organisation',
    'org',
    'firm',
    'firm name',
  ],
  contactName: [
    'name',
    'contact',
    'contact name',
    'full name',
    'fullname',
    'person',
    'contact person',
    'poc',
    'point of contact',
  ],
  phone: [
    'phone',
    'phone number',
    'mobile',
    'contact number',
    'telephone',
    'tel',
    'cell',
    'mobile number',
  ],
  website: ['website', 'url', 'web', 'site', 'web address', 'domain', 'website url'],
  industry: ['industry', 'sector', 'category', 'business type', 'niche', 'vertical'],
  country: ['country'],
  region: ['region', 'state', 'city', 'location', 'area'],
};

/** If the top two candidate fields for a header (or two headers claiming the same field) score within this margin, treat it as ambiguous rather than guessing. */
const AMBIGUITY_MARGIN = 0.15;
/** Minimum similarity score to even consider a fuzzy match — below this, the header is just unmapped. */
const MIN_MATCH_SCORE = 0.55;

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FieldMatchCandidate {
  field: TargetField;
  score: number;
}

function scoreHeaderAgainstField(normalizedHeader: string, field: TargetField): number {
  let bestDistance = Infinity;
  for (const synonym of FIELD_SYNONYMS[field]) {
    if (normalizedHeader === synonym) return 1;
    const d = distance(normalizedHeader, synonym);
    if (d < bestDistance) bestDistance = d;
  }
  const maxLen = Math.max(normalizedHeader.length, 3);
  return 1 - bestDistance / maxLen;
}

function matchHeaderToFields(header: string): FieldMatchCandidate[] {
  const normalized = normalizeHeader(header);
  if (!normalized) return [];

  return TARGET_FIELDS.map((field) => ({
    field,
    score: scoreHeaderAgainstField(normalized, field),
  }))
    .filter((c) => c.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);
}

export interface AmbiguousMapping {
  header: string;
  candidateFields: TargetField[];
}

export interface ColumnMappingResult {
  /** target field -> source header, only for confident, unambiguous matches. */
  mapping: Partial<Record<TargetField, string>>;
  /** Headers/fields deliberately left unmapped because the match was ambiguous — logged for manual review, never guessed. */
  ambiguous: AmbiguousMapping[];
  emailColumnFound: boolean;
}

/**
 * Fuzzy-maps CSV/XLSX column headers to known lead fields. Never guesses on a close call —
 * ambiguous headers (or two headers both plausibly claiming the same field) are left unmapped
 * and reported via `ambiguous`, per the ingestion requirement to flag rather than silently
 * guess. Callers must check `emailColumnFound`: without a confident email mapping, no lead rows
 * can be built from the file at all (leads.email is NOT NULL).
 */
export function mapColumns(headers: string[]): ColumnMappingResult {
  const ambiguous: AmbiguousMapping[] = [];
  const claimsByField: Record<TargetField, Array<{ header: string; score: number }>> = {
    email: [],
    companyName: [],
    contactName: [],
    phone: [],
    website: [],
    industry: [],
    country: [],
    region: [],
  };

  for (const header of headers) {
    const candidates = matchHeaderToFields(header);
    if (candidates.length === 0) continue;

    const top = candidates[0]!;
    const contenders = candidates.filter((c) => top.score - c.score < AMBIGUITY_MARGIN);

    if (contenders.length > 1) {
      ambiguous.push({ header, candidateFields: contenders.map((c) => c.field) });
      continue;
    }

    claimsByField[top.field].push({ header, score: top.score });
  }

  const mapping: Partial<Record<TargetField, string>> = {};

  for (const field of TARGET_FIELDS) {
    const claims = claimsByField[field].sort((a, b) => b.score - a.score);
    if (claims.length === 0) continue;

    if (claims.length === 1 || claims[0]!.score - claims[1]!.score >= AMBIGUITY_MARGIN) {
      mapping[field] = claims[0]!.header;
    } else {
      ambiguous.push({
        header: claims.map((c) => c.header).join(' / '),
        candidateFields: [field],
      });
    }
  }

  return { mapping, ambiguous, emailColumnFound: Boolean(mapping.email) };
}
