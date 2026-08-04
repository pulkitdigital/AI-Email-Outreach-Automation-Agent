import type { SendableStage } from '../../db/repositories/emailSequencesRepository.js';

export interface ComposeEmailInput {
  leadId: string;
  companyName: string;
  contactName?: string | null;
  industry?: string | null;
  primaryCategoryName: string;
  primaryCategoryServices: string[];
  stage: SendableStage;
  unsubscribeUrl: string;
}

export interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
  /** Whether AI-generated copy was used, or the static fallback — logged, not exposed to the recipient. */
  usedAiCopy: boolean;
}
