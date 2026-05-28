import 'dotenv/config';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { fetchAppMetadata, fetchCompetitors } from './lib/apple.js';
import { buildDeterministicAudit } from './lib/audit-engine.js';
import { auditSchema, type AppMetadata, type Audit, type Competitor } from './lib/schemas.js';
import { mastra } from './mastra/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === 'production';
const metadataRequestSchema = z.object({
  url: z.string().url()
});

app.use(express.json({ limit: '1mb' }));

const auditSessions = new Map<string, { metadata: AppMetadata; createdAt: number }>();
const sessionTtlMs = 10 * 60 * 1000;

function pruneAuditSessions(): void {
  const cutoff = Date.now() - sessionTtlMs;
  for (const [sessionId, session] of auditSessions) {
    if (session.createdAt < cutoff) {
      auditSessions.delete(sessionId);
    }
  }
}

function sendEvent(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function maybeEnhanceWithAgent(appMetadata: AppMetadata, competitors: Competitor[], fallback: Audit): Promise<Audit> {
  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  const agent = mastra.getAgent('asoAuditAgent');
  const response = await agent.generate(
    `Audit this Apple App Store listing using only the provided JSON data.

Listing:
${JSON.stringify(appMetadata, null, 2)}

Competitors:
${JSON.stringify(competitors, null, 2)}

Return the complete audit object.`,
    {
      structuredOutput: {
        schema: auditSchema,
        jsonPromptInjection: true
      }
    }
  );

  return auditSchema.parse(response.object);
}

app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = metadataRequestSchema.parse(req.body);
    const metadata = await fetchAppMetadata(url);
    const sessionId = randomUUID();
    pruneAuditSessions();
    auditSessions.set(sessionId, { metadata, createdAt: Date.now() });
    res.json({ sessionId, metadata });
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Please paste a valid App Store URL.' : error instanceof Error ? error.message : 'Failed to fetch metadata.';
    res.status(400).json({ error: message });
  }
});

app.get('/api/audit/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
  const session = sessionId ? auditSessions.get(sessionId) : null;

  if (!sessionId || !session) {
    sendEvent(res, 'error', { message: 'No confirmed app session was found. Paste a URL and confirm the listing first.' });
    res.end();
    return;
  }

  try {
    const appMetadata = session.metadata;
    sendEvent(res, 'progress', { message: 'Confirmed listing. Collecting competitor context...' });
    const competitors = await fetchCompetitors(appMetadata);

    sendEvent(res, 'progress', { message: 'Scoring ASO dimensions against the audit rubric...' });
    const fallbackAudit = buildDeterministicAudit(appMetadata, competitors);

    sendEvent(res, 'progress', {
      message: process.env.OPENAI_API_KEY
        ? 'Asking the Mastra ASO agent to refine recommendations...'
        : 'No OPENAI_API_KEY found, using the deterministic audit engine...'
    });

    const audit = await maybeEnhanceWithAgent(appMetadata, competitors, fallbackAudit);
    sendEvent(res, 'done', { audit, metadata: appMetadata });
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Audit failed.' });
  } finally {
    auditSessions.delete(sessionId);
    res.end();
  }
});

if (isProduction) {
  const clientDist = path.join(__dirname, '../dist/client');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`ASO Audit Agent running at http://localhost:${port}`);
});
