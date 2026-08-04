/**
 * Normalization + dedup-merge decisions. Pure functions only, deliberately kept free of any DB
 * or I/O dependency so they're cheap to unit test — this is the most error-prone part of
 * ingestion per project requirements (a wrong merge decision silently corrupts good lead data).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * The lead columns eligible for fill-in-the-blanks merging. Deliberately excludes identity/
 * system fields (email, status, category_id, ingestion_job_id, raw_data, ...) — those are never
 * merge targets, only these free-text contact/profile fields are.
 */
export const MERGEABLE_LEAD_FIELDS = [
  'companyName',
  'contactName',
  'phone',
  'website',
  'industry',
  'country',
  'region',
] as const;

export type MergeableLeadField = (typeof MERGEABLE_LEAD_FIELDS)[number];

export type MergeableLeadFields = Record<MergeableLeadField, string | null>;

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Decides which fields of an already-existing lead should be updated when a duplicate email is
 * ingested again. Rule: fill blanks with new non-blank data; NEVER overwrite an existing
 * non-blank value, even if the incoming value differs. Returns only the fields that should
 * change — an empty object means "nothing to merge, existing record already has everything".
 */
export function computeMergePatch(
  existing: MergeableLeadFields,
  incoming: Partial<Record<MergeableLeadField, string | null | undefined>>,
): Partial<Record<MergeableLeadField, string>> {
  const patch: Partial<Record<MergeableLeadField, string>> = {};

  for (const field of MERGEABLE_LEAD_FIELDS) {
    const existingValue = existing[field];
    const incomingValue = incoming[field];

    if (isBlank(existingValue) && !isBlank(incomingValue)) {
      patch[field] = incomingValue!.trim();
    }
  }

  return patch;
}
