import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent } from '@mastra/core/agent';
import { fetchAppMetadataTool, fetchCompetitorsTool } from '../tools/app-store-tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(__dirname, '../skills/aso-audit/SKILL.md'), 'utf8');

export const asoAuditAgent = new Agent({
  id: 'aso-audit-agent',
  name: 'ASO Audit Agent',
  description: 'Audits Apple App Store listings for ASO quality and conversion opportunities.',
  instructions: `
You are an expert App Store Optimization auditor.

Use the ASO audit skill below as your scoring and recommendation rubric.
Always cite evidence from the listing or competitor data. If a public data point is unavailable, say that explicitly and avoid inventing it.
For text changes, provide before and after examples that respect Apple character limits.

${skill}
`,
  model: process.env.ASO_AGENT_MODEL || 'openai/gpt-4o-mini',
  tools: {
    fetchAppMetadataTool,
    fetchCompetitorsTool
  }
});
