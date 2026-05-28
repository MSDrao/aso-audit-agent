import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { fetchAppMetadata, fetchCompetitors } from '../../lib/apple.js';
import { appMetadataSchema, competitorSchema } from '../../lib/schemas.js';

export const fetchAppMetadataTool = createTool({
  id: 'fetch-app-metadata',
  description: 'Fetch public Apple App Store metadata for a listing URL.',
  inputSchema: z.object({
    url: z.string().url()
  }),
  outputSchema: appMetadataSchema,
  execute: async ({ url }) => fetchAppMetadata(url)
});

export const fetchCompetitorsTool = createTool({
  id: 'fetch-competitors',
  description: 'Fetch a small competitor set from Apple Search for the same category and country.',
  inputSchema: appMetadataSchema,
  outputSchema: z.array(competitorSchema),
  execute: async (app) => fetchCompetitors(appMetadataSchema.parse(app))
});
