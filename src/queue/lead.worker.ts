import { Worker, Job } from 'bullmq';
import { redisConnection, LEAD_EXTRACTION_QUEUE_NAME } from './lead.queue.js';
import { RawLeadData, LeadCleanerService } from '../services/lead-cleaner.service.js';
import { LeadDbService } from '../services/lead-db.service.js';
import { WebsiteEnricherCrawler } from '../crawlers/website-enricher.crawler.js';
import { enqueueSocialEnrichment } from './social-enrichment.queue.js';
import { deepScrapingWorker } from './deep-scraping.worker.js';
import { DeepScraperService } from '../services/deep-scraper.service.js';
import prisma from '../config/database.js';

/**
 * Worker de BullMQ para procesar asíncronamente cada trabajo de extracción de lead.
 */
export const leadWorker = new Worker<RawLeadData>(
  LEAD_EXTRACTION_QUEUE_NAME,
  async (job: Job<RawLeadData>) => {
    const rawLead = job.data;
    console.log(`\n[Worker Job #${job.id}] ⚙️ Procesando Lead: "${rawLead.companyName}" (${rawLead.website || 'Sin Web'})`);

    let scrapedData = null;

    // 1. Extracción con Crawlee si tiene sitio web
    if (rawLead.website) {
      console.log(`[Worker Job #${job.id}] 🔍 Extrayendo datos web de: ${rawLead.website}...`);
      const crawler = new WebsiteEnricherCrawler();
      const resultMap = await crawler.enrichWebsites([rawLead.website]);
      scrapedData = resultMap.get(rawLead.website) || null;
    }

    // 2. Fusión y Limpieza (IoC)
    const cleanedData = LeadCleanerService.prepareLeadData(rawLead, scrapedData);

    // 3. Persistencia en Dokploy PostgreSQL
    const savedLead = await LeadDbService.saveOrUpdateLead(cleanedData);

    console.log(`[Worker Job #${job.id}] ✅ Lead Guardado con Exito!`);
    console.log(`   ID:        ${savedLead.id}`);
    console.log(`   Hash:      ${savedLead.leadHash}`);
    console.log(`   Phone:     ${savedLead.phoneE164 || 'N/A'}`);
    console.log(`   Score:     ${savedLead.score}/100`);

    // 4. Encolamiento concurrente (Promise.all) de perfiles sociales a social_enrichment_queue
    if (cleanedData.socialProfiles && cleanedData.socialProfiles.length > 0) {
      enqueueSocialEnrichment(savedLead.id, cleanedData.socialProfiles).catch((err) => {
        console.error(`[Worker Job #${job.id}] Error encolando perfiles sociales:`, err.message);
      });
    }

    return {
      leadId: savedLead.id,
      leadHash: savedLead.leadHash,
      score: savedLead.score,
    };
  },
  {
    connection: redisConnection,
    concurrency: 1, // 1 a la vez para control estricto de concurrencia de crawling
  }
);

// Event Listeners
leadWorker.on('completed', (job) => {
  console.log(`[Worker Status] 🎉 Job #${job.id} finalizado exitosamente.`);
});

leadWorker.on('failed', (job, err) => {
  console.error(`[Worker Status] ❌ Job #${job?.id} falló:`, err.message);
});

// Manejo de Cierre Limpio
process.on('SIGINT', async () => {
  console.log('\n🔌 Cerrando Workers y conexiones de BullMQ/Playwright/Prisma...');
  await leadWorker.close();
  await deepScrapingWorker.close();
  await DeepScraperService.closeBrowser();
  await prisma.$disconnect();
  process.exit(0);
});

console.log(`🚀 [Worker Engine] Escuchando trabajos en "${LEAD_EXTRACTION_QUEUE_NAME}" (Concurrencia: 1) y "deep_scraping_queue" (Concurrencia: 2)...`);
