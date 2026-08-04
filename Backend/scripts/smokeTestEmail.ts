/**
 * One-off manual smoke test: composes a real email (fallback template path, since no AI key is
 * configured in this environment — that's a fair, real code path, not a mock) and writes the
 * rendered HTML/text so it can be visually inspected. Also round-trips the unsubscribe token.
 * Not part of the automated suite. Run: npx tsx Backend/scripts/smokeTestEmail.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeEmail } from '../src/modules/emailComposer/composerService.js';
import {
  buildUnsubscribeUrl,
  verifyUnsubscribeToken,
} from '../src/modules/emailComposer/unsubscribeToken.js';
import { TMP_DIR } from '../src/config/paths.js';

async function main() {
  const leadId = 'smoke-test-lead-id';

  console.log('=== Composing "new" stage email (Marketplace & Commerce lead) ===');
  const composed = await composeEmail({
    leadId,
    companyName: 'Ganga RiverFront Rooms & Banquet',
    contactName: 'Abhijeet Kumar',
    industry: 'Hospitality',
    primaryCategoryName: 'Marketplace & Commerce',
    primaryCategoryServices: ['E-commerce Marketplace Setup', 'Amazon, Flipkart, Meesho, Myntra'],
    stage: 'new',
    unsubscribeUrl: buildUnsubscribeUrl(leadId),
  });

  console.log(`Used AI copy: ${composed.usedAiCopy} (expected false — no AI key configured here)`);
  console.log(`Subject: ${composed.subject}`);
  console.log('\n--- Plain text body ---\n');
  console.log(composed.text);

  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = `${TMP_DIR}/smoke-test-email.html`;
  writeFileSync(outputPath, composed.html);
  console.log(`\nWrote ${outputPath} for manual inspection (Backend/tmp is gitignored).`);

  console.log('\n=== Unsubscribe token round-trip ===');
  const url = buildUnsubscribeUrl(leadId);
  const token = url.split('/').pop()!;
  const valid = verifyUnsubscribeToken(leadId, token);
  const invalid = verifyUnsubscribeToken(
    leadId,
    'wrong-token-00000000000000000000000000000000000000000000000000000000000000',
  );
  console.log(`URL: ${url}`);
  console.log(`Correct token verifies: ${valid} (expected true)`);
  console.log(`Wrong token verifies: ${invalid} (expected false)`);

  if (!composed.subject || composed.usedAiCopy || !valid || invalid) {
    throw new Error('Smoke test assertions failed');
  }

  console.log('\n✅ Email composer smoke test passed.');
}

main().catch((err) => {
  console.error('Email composer smoke test failed:', err);
  process.exit(1);
});
