import type {
  Category,
  DailySummary,
  IngestionJobProgress,
  LeadDetail,
  LeadListResponse,
  ReplyListResponse,
  SentEmailLogListResponse,
  SystemStatus,
  WhatsAppMessageListResponse,
  WhatsAppTemplate,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 202 || res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export async function uploadIngestionFile(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/ingestion/upload`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Upload failed (${res.status})`, res.status);
  }
  return res.json();
}

export function submitDriveLink(url: string): Promise<{ jobId: string }> {
  return request('/api/ingestion/drive', { method: 'POST', body: JSON.stringify({ url }) });
}

export function getIngestionJobs(limit = 50): Promise<IngestionJobProgress[]> {
  return request(`/api/ingestion/jobs${buildQuery({ limit })}`);
}

export function getIngestionJob(id: string): Promise<IngestionJobProgress> {
  return request(`/api/ingestion/jobs/${id}`);
}

// ---------------------------------------------------------------------------
// Categories / categorization
// ---------------------------------------------------------------------------

export function getCategories(): Promise<Category[]> {
  return request('/api/categorization/categories');
}

export function recategorizeLead(leadId: string): Promise<{ status: string }> {
  return request(`/api/categorization/leads/${leadId}/recategorize`, { method: 'POST' });
}

export interface CreateCategoryRuleInput {
  matchField: 'industry' | 'company_name' | 'website' | 'raw_data' | 'any';
  pattern: string;
  weight?: number;
}

export interface CreateCategoryInput {
  name: string;
  /**
   * Omit to let the backend's AI provider classify the category and propose starter rules (the
   * dashboard's "Add category" flow — see AddCategoryDialog). Accepted explicitly only for
   * backward compatibility with non-dashboard callers.
   */
  serviceGroup?: string;
  rules?: CreateCategoryRuleInput[];
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return request('/api/categorization/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface LeadsQuery {
  status?: string;
  categoryId?: string;
  sequenceStage?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getLeads(query: LeadsQuery): Promise<LeadListResponse> {
  return request(`/api/leads${buildQuery(query)}`);
}

export function getLead(id: string): Promise<LeadDetail> {
  return request(`/api/leads/${id}`);
}

export function updateLead(id: string, patch: Record<string, string | null>): Promise<LeadDetail> {
  return request(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function confirmLead(
  id: string,
  patch: Record<string, string | null>,
): Promise<{ leadId: string; status: string }> {
  return request(`/api/leads/${id}/confirm`, { method: 'POST', body: JSON.stringify(patch) });
}

export function deleteLead(id: string): Promise<{ id: string; deletedAt: string | null }> {
  return request(`/api/leads/${id}`, { method: 'DELETE' });
}

export function updateLeadStatus(id: string, status: string): Promise<LeadDetail> {
  return request(`/api/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export function regenerateDeck(leadId: string): Promise<{ pitchDeckId: string; status: string }> {
  return request(`/api/decks/leads/${leadId}/regenerate`, { method: 'POST' });
}

export function deckDownloadUrl(deckId: string): string {
  return `${API_BASE}/api/decks/${deckId}/download`;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendNowOverride {
  composedSubject: string;
  composedBody: string;
}

export function sendNow(
  leadId: string,
  stage: 'new' | 'followup' | 'final',
  override?: SendNowOverride,
): Promise<{ status: string }> {
  return request(`/api/sending/leads/${leadId}/send-now`, {
    method: 'POST',
    body: JSON.stringify({ stage, ...override }),
  });
}

export interface EmailPreview {
  subject: string;
  body: string;
}

export function previewSend(
  leadId: string,
  stage: 'new' | 'followup' | 'final',
): Promise<EmailPreview> {
  return request(`/api/sending/leads/${leadId}/preview${buildQuery({ stage })}`);
}

export interface SentEmailLogsQuery {
  status?: string;
  providerName?: string;
  categoryId?: string;
  stage?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getSentEmailLogs(query: SentEmailLogsQuery): Promise<SentEmailLogListResponse> {
  return request(`/api/sending/logs${buildQuery(query)}`);
}

// ---------------------------------------------------------------------------
// Scheduler / Daily summary
// ---------------------------------------------------------------------------

export function getDailySummaries(days = 30): Promise<DailySummary[]> {
  return request(`/api/scheduler/daily-summary${buildQuery({ days })}`);
}

export function runSchedulerNow(): Promise<{ status: string }> {
  return request('/api/scheduler/run-now', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export interface RepliesQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getReplies(query: RepliesQuery): Promise<ReplyListResponse> {
  return request(`/api/replies${buildQuery(query)}`);
}

// ---------------------------------------------------------------------------
// System status
// ---------------------------------------------------------------------------

export function getSystemStatus(): Promise<SystemStatus> {
  return request('/api/system/status');
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export interface WhatsAppMessagesQuery {
  matched?: boolean;
  optedIn?: boolean;
  page?: number;
  pageSize?: number;
}

export function getWhatsAppMessages(query: WhatsAppMessagesQuery): Promise<WhatsAppMessageListResponse> {
  return request(`/api/whatsapp/messages${buildQuery(query)}`);
}

export function getWhatsAppTemplates(approvalStatus?: string): Promise<WhatsAppTemplate[]> {
  return request(`/api/whatsapp/templates${buildQuery({ approvalStatus })}`);
}

export function optInLeadForWhatsApp(
  leadId: string,
  phoneNumber: string,
  source?: 'manual' | 'reply_offer',
): Promise<LeadDetail> {
  return request(`/api/leads/${leadId}/whatsapp/opt-in`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, source }),
  });
}

export type SendWhatsAppMessageInput =
  | { type: 'template'; templateName: string; language?: string; variables?: Record<string, string> }
  | { type: 'freeform'; body: string };

export function sendWhatsAppMessage(
  leadId: string,
  input: SendWhatsAppMessageInput,
): Promise<{ status: string }> {
  return request(`/api/leads/${leadId}/whatsapp/send`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
