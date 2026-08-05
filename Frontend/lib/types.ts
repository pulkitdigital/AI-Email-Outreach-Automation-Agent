import type {
  CategorizationMethod,
  EmailProviderName,
  IngestionJobProgress,
  LeadReviewReason,
  LeadStatus,
  PitchDeckGenerationStatus,
  SentEmailStatus,
  SequenceStage,
  ServiceGroup,
  WhatsAppConversationCategory,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppOptInSource,
  WhatsAppTemplateApprovalStatus,
} from '@bebeyond/shared';

export type { IngestionJobProgress };

export interface Category {
  id: string;
  name: string;
  slug: string;
  serviceGroup: ServiceGroup | null;
  needsReview: boolean;
  reviewReason: string | null;
}

export interface Lead {
  id: string;
  email: string;
  emailNormalized: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  region: string | null;
  ingestionJobId: string | null;
  sourceFile: string | null;
  categoryId: string | null;
  categorizationMethod: CategorizationMethod | null;
  categorizationConfidence: number | null;
  status: LeadStatus;
  reviewReason: LeadReviewReason | null;
  extractionConfidence: number | null;
  rawData: Record<string, unknown>;
  deletedAt: string | null;
  whatsappNumber: string | null;
  whatsappOptedIn: boolean;
  whatsappOptInSource: WhatsAppOptInSource | null;
  whatsappOptInAt: string | null;
  whatsappLastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadListItem extends Lead {
  categoryName: string | null;
  sequenceStage: SequenceStage | null;
}

export interface LeadListResponse {
  leads: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailSequence {
  id: string;
  leadId: string;
  pitchDeckId: string | null;
  currentStage: SequenceStage;
  stageNewSentAt: string | null;
  stageFollowupScheduledAt: string | null;
  stageFollowupSentAt: string | null;
  stageFinalScheduledAt: string | null;
  stageFinalSentAt: string | null;
  stoppedReason: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PitchDeck {
  id: string;
  leadId: string;
  categoryId: string | null;
  generationStatus: PitchDeckGenerationStatus;
  generationError: string | null;
  generatedBy: string | null;
  templateVersion: string | null;
  fileKey: string | null;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SentEmailLog {
  id: string;
  leadId: string;
  emailSequenceId: string;
  categoryId: string | null;
  pitchDeckId: string | null;
  sequenceStage: 'new' | 'followup' | 'final';
  providerName: EmailProviderName;
  externalMessageId: string | null;
  subject: string;
  bodySnapshot: string | null;
  status: SentEmailStatus;
  errorMessage: string | null;
  retryCount: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SentEmailLogListItem extends SentEmailLog {
  leadEmail: string;
  companyName: string | null;
  categoryName: string | null;
}

export interface SentEmailLogListResponse {
  logs: SentEmailLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadDetail extends Lead {
  category: Category | null;
  sequence: EmailSequence | null;
  latestDeck: PitchDeck | null;
  sentLogs: SentEmailLog[];
}

export interface DailySummary {
  id: string;
  runDate: string;
  newQueued: number;
  followupQueued: number;
  finalQueued: number;
  newSent: number;
  followupSent: number;
  finalSent: number;
  failedCount: number;
  cancelledCount: number;
  skippedReply: number;
  skippedBounce: number;
  skippedOptout: number;
  dailyCap: number;
  priorityExceededCap: boolean;
  schedulerErrors: string[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Reply {
  id: string;
  leadId: string;
  emailSequenceId: string | null;
  sentEmailLogId: string | null;
  providerName: EmailProviderName;
  externalMessageId: string | null;
  fromEmail: string;
  subject: string | null;
  bodySnapshot: string | null;
  rawPayload: unknown;
  receivedAt: string;
  createdAt: string;
}

export interface ReplyListItem extends Reply {
  leadEmail: string;
  companyName: string | null;
}

export interface ReplyListResponse {
  replies: ReplyListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WhatsAppMessage {
  id: string;
  leadId: string | null;
  direction: WhatsAppMessageDirection;
  messageType: WhatsAppMessageType;
  templateName: string | null;
  fromPhoneNumber: string | null;
  bodyPreview: string | null;
  metaMessageId: string | null;
  conversationCategory: WhatsAppConversationCategory | null;
  status: WhatsAppMessageStatus;
  errorMessage: string | null;
  rawPayload: unknown;
  createdAt: string;
}

export interface WhatsAppMessageListItem extends WhatsAppMessage {
  leadEmail: string | null;
  companyName: string | null;
  leadOptedIn: boolean | null;
}

export interface WhatsAppMessageListResponse {
  messages: WhatsAppMessageListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  metaTemplateId: string | null;
  language: string;
  category: WhatsAppConversationCategory | null;
  approvalStatus: WhatsAppTemplateApprovalStatus;
  variables: unknown;
  createdAt: string;
}

export interface FailedPitchDeckItem extends PitchDeck {
  leadEmail: string;
  companyName: string | null;
}

export interface SystemStatus {
  emailProvider: EmailProviderName;
  aiProvider: 'gemini' | 'openai';
  failedSends: { count: number; recent: SentEmailLogListItem[] };
  failedDecks: { count: number; recent: FailedPitchDeckItem[] };
  failedIngestions: { count: number; recent: IngestionJobProgress[] };
  needsReviewLeads: { count: number; recent: LeadListItem[] };
}
