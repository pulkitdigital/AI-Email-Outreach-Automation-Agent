import { env } from '../../config/env.js';
import { getSetting, setSetting } from '../../db/repositories/settingsRepository.js';

const SENDER_PERSON_NAME_KEY = 'sender_person_name';
const SENDER_DESIGNATION_KEY = 'sender_designation';
const SENDER_COMPANY_NAME_KEY = 'sender_company_name';

const MAX_FIELD_LENGTH = 100;

// No env var ever existed for designation (SENDER_PERSON_NAME did) — this is the fallback used
// only if the DB row is somehow missing (pre-migration edge case), matching the migration's seed.
const DEFAULT_SENDER_DESIGNATION = 'Founder';
const DEFAULT_SENDER_COMPANY_NAME = 'BeBeyond Digital Solutions';

// Unlike scheduler_cron (read ~once per worker boot/tick), getSenderIdentity() is called up to
// 3x per outbound email — composerService (signature + AI prompt) and BrevoProvider's From-header
// — at up to DAILY_EMAIL_LIMIT/day. A short in-process cache avoids 3 DB round-trips per send
// while still picking up a Settings-page change within a minute; updateSenderIdentity() below
// also busts it immediately so a save takes effect on the very next send, not after the TTL.
const CACHE_TTL_MS = 60_000;

export interface SenderIdentity {
  name: string;
  designation: string;
  companyName: string;
}

export class InvalidSenderIdentityError extends Error {}

let cached: { value: SenderIdentity; expiresAt: number } | null = null;

function assertValidField(label: string, value: string): void {
  if (value.length === 0) {
    throw new InvalidSenderIdentityError(`${label} is required`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new InvalidSenderIdentityError(`${label} must be ${MAX_FIELD_LENGTH} characters or fewer`);
  }
}

async function loadSenderIdentity(): Promise<SenderIdentity> {
  const [name, designation, companyName] = await Promise.all([
    getSetting(SENDER_PERSON_NAME_KEY),
    getSetting(SENDER_DESIGNATION_KEY),
    getSetting(SENDER_COMPANY_NAME_KEY),
  ]);

  return {
    name: name ?? env.SENDER_PERSON_NAME,
    designation: designation ?? DEFAULT_SENDER_DESIGNATION,
    companyName: companyName ?? env.BREVO_SENDER_NAME ?? DEFAULT_SENDER_COMPANY_NAME,
  };
}

/** DB rows win over env/hardcoded fallbacks — those are only the first-run fallback (see 0012's seed). */
export async function getSenderIdentity(): Promise<SenderIdentity> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = await loadSenderIdentity();
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export interface UpdateSenderIdentityInput {
  name: string;
  designation: string;
  companyName: string;
}

/** Called by PUT /api/settings/sender-identity. Validates, persists, and refreshes the cache immediately. */
export async function updateSenderIdentity(
  input: UpdateSenderIdentityInput,
): Promise<SenderIdentity> {
  const name = input.name.trim();
  const designation = input.designation.trim();
  const companyName = input.companyName.trim();

  assertValidField('name', name);
  assertValidField('designation', designation);
  assertValidField('companyName', companyName);

  await Promise.all([
    setSetting(SENDER_PERSON_NAME_KEY, name),
    setSetting(SENDER_DESIGNATION_KEY, designation),
    setSetting(SENDER_COMPANY_NAME_KEY, companyName),
  ]);

  const value = { name, designation, companyName };
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
