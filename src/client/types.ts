import type { Audit, AppMetadata } from '../lib/schemas';

export type ChatMessage =
  | { id: string; role: 'assistant' | 'user'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'confirmation'; metadata: AppMetadata; sessionId: string }
  | { id: string; role: 'assistant'; kind: 'audit'; metadata: AppMetadata; audit: Audit };

export type UiStatus = 'Ready' | 'Fetching' | 'Confirm' | 'Auditing';

export type MetadataResponse = {
  sessionId: string;
  metadata: AppMetadata;
};

export type ApiErrorResponse = {
  error: string;
};

export type AuditDonePayload = {
  audit: Audit;
  metadata: AppMetadata;
};
