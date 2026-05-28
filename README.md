# ASO Audit Agent

TypeScript + React chat app for auditing Apple App Store listings with Mastra agents, tools, workflows, and a local ASO skill.

## Setup

Requires Node `>=22.13.0`, matching the current Mastra package engine requirement.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

`OPENAI_API_KEY` is optional. With it, the Mastra ASO agent refines the structured audit. Without it, the app still works end-to-end through the deterministic audit workflow so reviewers can run the demo without paid services.

## Flow

1. Paste an App Store URL.
2. The server fetches public listing metadata from Apple, creates a short-lived audit session, and asks for confirmation.
3. After confirmation, the React client opens a server-sent events stream for that session while the server collects competitors and scores the audit.
4. The UI renders a score card, prioritized recommendations, and competitor comparison.

## Decisions

- Apple data comes from the public iTunes Lookup/Search APIs, with a lightweight page scrape only for subtitle and preview-video hints. That keeps the app usable on arbitrary listings without scraping infrastructure.
- The ASO rubric lives in `src/mastra/skills/aso-audit/SKILL.md` and is loaded into the Mastra agent instructions.
- Tools are kept narrow: one tool fetches listing metadata and one fetches competitors.
- The workflow owns the predictable data path: metadata, competitors, scoring.
- The frontend is typed React. API responses are parsed with the same Zod schemas used by the server so rendering does not depend on loose JSON assumptions.
- Audit confirmation uses session ids instead of a global pending app, avoiding cross-user state overwrites during review.
- The app discloses unavailable public data, especially the private iOS keyword field, instead of inventing evidence.

## Mastra Studio

The app runs through the custom Express chat server with:

```bash
npm run dev
```

You can inspect the registered Mastra agent/workflow separately with:

```bash
npm run mastra:dev
```
