import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { fetchAppMetadata, fetchCompetitors } from '../../lib/apple.js';
import { buildDeterministicAudit } from '../../lib/audit-engine.js';
import { appMetadataSchema, auditSchema, competitorSchema } from '../../lib/schemas.js';

const fetchMetadataStep = createStep({
  id: 'fetch-metadata',
  description: 'Fetch App Store listing metadata.',
  inputSchema: z.object({
    url: z.string().url()
  }),
  outputSchema: appMetadataSchema,
  execute: async ({ inputData }) => fetchAppMetadata(inputData.url)
});

const fetchCompetitorsStep = createStep({
  id: 'fetch-competitors',
  description: 'Fetch competitors from Apple Search.',
  inputSchema: appMetadataSchema,
  outputSchema: z.object({
    app: appMetadataSchema,
    competitors: z.array(competitorSchema)
  }),
  execute: async ({ inputData }) => ({
    app: inputData,
    competitors: await fetchCompetitors(inputData)
  })
});

const scoreAuditStep = createStep({
  id: 'score-audit',
  description: 'Score the ASO audit and create recommendations.',
  inputSchema: z.object({
    app: appMetadataSchema,
    competitors: z.array(competitorSchema)
  }),
  outputSchema: auditSchema,
  execute: async ({ inputData }) => buildDeterministicAudit(inputData.app, inputData.competitors)
});

export const asoAuditWorkflow = createWorkflow({
  id: 'aso-audit-workflow',
  description: 'Fetch listing data, collect competitors, and produce a structured ASO audit.',
  inputSchema: z.object({
    url: z.string().url()
  }),
  outputSchema: auditSchema
})
  .then(fetchMetadataStep)
  .then(fetchCompetitorsStep)
  .then(scoreAuditStep)
  .commit();
