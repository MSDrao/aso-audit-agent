import { z } from 'zod';

export const appMetadataSchema = z.object({
  appId: z.string(),
  url: z.string().url(),
  country: z.string().min(2).max(2),
  name: z.string(),
  developer: z.string(),
  iconUrl: z.string().url().optional(),
  category: z.string(),
  genres: z.array(z.string()).default([]),
  subtitle: z.string().nullable().default(null),
  description: z.string().default(''),
  releaseNotes: z.string().nullable().default(null),
  version: z.string().nullable().default(null),
  rating: z.number().nullable().default(null),
  ratingCount: z.number().nullable().default(null),
  screenshots: z.array(z.string().url()).default([]),
  ipadScreenshots: z.array(z.string().url()).default([]),
  previewVideos: z.array(z.string().url()).default([]),
  contentRating: z.string().nullable().default(null),
  price: z.number().nullable().default(null),
  currency: z.string().nullable().default(null)
});

export const competitorSchema = z.object({
  appId: z.string(),
  name: z.string(),
  developer: z.string(),
  category: z.string(),
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  screenshots: z.number(),
  iconUrl: z.string().url().optional(),
  url: z.string().url().optional()
});

export const scoreDimensionSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  score: z.number().min(0).max(10),
  evidence: z.array(z.string()),
  rationale: z.string()
});

export const recommendationSchema = z.object({
  title: z.string(),
  impact: z.enum(['High', 'Medium', 'Low']),
  effort: z.enum(['Low', 'Medium', 'High']),
  evidence: z.string(),
  action: z.string(),
  before: z.string().optional(),
  after: z.string().optional()
});

export const auditSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(scoreDimensionSchema),
  quickWins: z.array(recommendationSchema),
  highImpactChanges: z.array(recommendationSchema),
  strategicRecommendations: z.array(recommendationSchema),
  competitors: z.array(competitorSchema),
  competitorNotes: z.string()
});

export type AppMetadata = z.infer<typeof appMetadataSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type Audit = z.infer<typeof auditSchema>;
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
