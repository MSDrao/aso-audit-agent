import { Mastra } from '@mastra/core';
import { asoAuditAgent } from './agents/aso-agent.js';
import { asoAuditWorkflow } from './workflows/aso-audit-workflow.js';

export const mastra = new Mastra({
  agents: {
    asoAuditAgent
  },
  workflows: {
    asoAuditWorkflow
  }
});
