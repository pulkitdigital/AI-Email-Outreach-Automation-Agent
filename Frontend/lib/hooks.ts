'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api-client';
import type { LeadsQuery, RepliesQuery, SentEmailLogsQuery } from './api-client';

/**
 * Near-real-time updates via polling (Phase 6 requirement) — TanStack Query's refetchInterval is
 * the simplest correct tool for this; no need for websockets/SSE for an internal ops dashboard
 * where a few seconds of staleness is fine.
 */
const INGESTION_POLL_MS = 3_000;
const SYSTEM_STATUS_POLL_MS = 15_000;

const NON_TERMINAL_JOB_STATUSES = new Set(['pending', 'processing']);

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: api.getCategories, staleTime: 60_000 });
}

export function useLeads(query: LeadsQuery) {
  return useQuery({ queryKey: ['leads', query], queryFn: () => api.getLeads(query) });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.getLead(id!),
    enabled: !!id,
  });
}

export function useUpdateLead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.updateLead(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead', id] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useConfirmLead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.confirmLead(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead', id] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
    },
  });
}

export function useRecategorizeLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => api.recategorizeLead(leadId),
    onSuccess: (_data, leadId) => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useRegenerateDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => api.regenerateDeck(leadId),
    onSuccess: (_data, leadId) => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    },
  });
}

export function useSendNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, stage }: { leadId: string; stage: 'new' | 'followup' | 'final' }) =>
      api.sendNow(leadId, stage),
    onSuccess: (_data, { leadId }) => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['sentEmailLogs'] });
    },
  });
}

export function useIngestionJobs(limit = 50) {
  return useQuery({
    queryKey: ['ingestionJobs', limit],
    queryFn: () => api.getIngestionJobs(limit),
    refetchInterval: (query) => {
      const jobs = query.state.data;
      const hasActiveJob = jobs?.some((j) => NON_TERMINAL_JOB_STATUSES.has(j.status));
      return hasActiveJob ? INGESTION_POLL_MS : false;
    },
  });
}

export function useUploadIngestionFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadIngestionFile(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingestionJobs'] });
    },
  });
}

export function useSubmitDriveLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.submitDriveLink(url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingestionJobs'] });
    },
  });
}

export function useSentEmailLogs(query: SentEmailLogsQuery) {
  return useQuery({
    queryKey: ['sentEmailLogs', query],
    queryFn: () => api.getSentEmailLogs(query),
  });
}

export function useDailySummaries(days = 30) {
  return useQuery({
    queryKey: ['dailySummaries', days],
    queryFn: () => api.getDailySummaries(days),
  });
}

export function useRunSchedulerNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.runSchedulerNow(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dailySummaries'] });
      void queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
    },
  });
}

export function useReplies(query: RepliesQuery) {
  return useQuery({ queryKey: ['replies', query], queryFn: () => api.getReplies(query) });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['systemStatus'],
    queryFn: api.getSystemStatus,
    refetchInterval: SYSTEM_STATUS_POLL_MS,
  });
}
