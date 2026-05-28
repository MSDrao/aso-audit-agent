import { appMetadataSchema, auditSchema } from '../lib/schemas';
import type { ApiErrorResponse, AuditDonePayload, MetadataResponse } from './types';

const metadataResponseSchema = appMetadataSchema.transform((metadata) => metadata);

async function readJson<T extends object>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error('error' in payload ? payload.error : 'Request failed.');
  }
  return payload as T;
}

export async function fetchMetadata(url: string): Promise<MetadataResponse> {
  const payload = await readJson<MetadataResponse>(
    await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    })
  );

  return {
    sessionId: payload.sessionId,
    metadata: metadataResponseSchema.parse(payload.metadata)
  };
}

export function parseAuditDonePayload(raw: string): AuditDonePayload {
  const payload = JSON.parse(raw) as AuditDonePayload;
  return {
    metadata: appMetadataSchema.parse(payload.metadata),
    audit: auditSchema.parse(payload.audit)
  };
}
