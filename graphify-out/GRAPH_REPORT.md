# Graph Report - .  (2026-08-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 118 nodes · 198 edges · 7 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0d44ec0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- lead-cleaner.service.ts
- server.ts
- compilerOptions
- package.json
- lead.worker.ts
- scripts

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `cleanLeadData()` - 9 edges
3. `scripts` - 8 edges
4. `ExtractedSocial` - 8 edges
5. `extractSocialProfiles()` - 8 edges
6. `RawLeadData` - 7 edges
7. `extractEmails()` - 7 edges
8. `testPipeline()` - 6 edges
9. `prisma` - 5 edges
10. `WebsiteEnricherCrawler` - 5 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `enqueueLeads()`  [EXTRACTED]
  src/cli/run-queue-producer.ts → src/queue/lead.queue.ts
- `ScrapedWebsiteData` --references--> `ExtractedSocial`  [EXTRACTED]
  src/crawlers/website-enricher.crawler.ts → src/utils/social.util.ts
- `RawLeadData` --references--> `ExtractedSocial`  [EXTRACTED]
  src/services/lead-cleaner.service.ts → src/utils/social.util.ts
- `processApifyDatasetInBackground()` --calls--> `enqueueLeads()`  [EXTRACTED]
  src/api/server.ts → src/queue/lead.queue.ts
- `testPipeline()` --calls--> `cleanLeadData()`  [EXTRACTED]
  src/cli/test-pipeline.ts → src/services/lead-cleaner.service.ts

## Import Cycles
- None detected.

## Communities (7 total, 0 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.07
Nodes (27): apify-client, bullmq, cheerio, crawlee, dotenv, fastify, @fastify/cors, ioredis (+19 more)

### Community 1 - "lead-cleaner.service.ts"
Cohesion: 0.23
Nodes (15): testPipeline(), ScrapedWebsiteData, WebsiteEnricherCrawler, CleanedLeadData, cleanLeadData(), generateLeadHash(), NON_OFFICIAL_WEBSITE_DOMAINS, normalizeWebsiteUrl() (+7 more)

### Community 2 - "server.ts"
Cohesion: 0.20
Nodes (13): apifyClient, app, processApifyDatasetInBackground(), setupApp(), startServer(), main(), _env, envSchema (+5 more)

### Community 3 - "compilerOptions"
Cohesion: 0.12
Nodes (15): ES2022, src/**/*, compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+7 more)

### Community 4 - "package.json"
Cohesion: 0.13
Nodes (14): author, description, devDependencies, prisma, @types/node, typescript, keywords, license (+6 more)

### Community 5 - "lead.worker.ts"
Cohesion: 0.30
Nodes (6): bootstrap(), prisma, leadWorker, LeadCleanerService, LeadDbService, saveOrUpdateLead()

### Community 6 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, api:start, build, crawl, db:push, enqueue, test:pipeline, worker

## Knowledge Gaps
- **48 isolated node(s):** `name`, `version`, `description`, `main`, `build` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _48 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._