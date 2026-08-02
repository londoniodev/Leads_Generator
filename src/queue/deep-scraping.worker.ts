import { Worker, Job } from 'bullmq';
import { redisConnection } from './lead.queue.js';
import { DEEP_SCRAPING_QUEUE_NAME, DeepScrapingJobData } from './deep-scraping.queue.js';
import { DeepScraperService } from '../services/deep-scraper.service.js';
import prisma from '../config/database.js';

/**
 * Worker de BullMQ con concurrencia estricta de 2 para Playwright.
 * Extrae reseñas profundas y horas de mayor concurrencia protegiendo los recursos de RAM/CPU del VPS.
 */
export const deepScrapingWorker = new Worker<DeepScrapingJobData>(
  DEEP_SCRAPING_QUEUE_NAME,
  async (job: Job<DeepScrapingJobData>) => {
    const { leadId, googleMapsUrl } = job.data;
    console.log(`\n[Deep Scraping Worker Job #${job.id}] ⚙️ Iniciando extracción Playwright para Lead ID: ${leadId}...`);

    const result = await DeepScraperService.extractDeepData(googleMapsUrl);

    if (result.reviews.length > 0 || result.popularTimes) {
      const existingLead = await prisma.lead.findUnique({ where: { id: leadId } });

      if (existingLead) {
        let updatedCategory = existingLead.googleCategory || '';
        if (result.popularTimes) {
          updatedCategory = updatedCategory ? `${updatedCategory} | ${result.popularTimes}` : result.popularTimes;
        }

        await prisma.lead.update({
          where: { id: leadId },
          data: {
            googleCategory: updatedCategory || undefined,
            score: existingLead.score + (result.reviews.length > 0 ? 10 : 0),
            status: 'ENRICHED',
          },
        });

        console.log(`   └─ ✅ Lead ID ${leadId} actualizado con ${result.reviews.length} reseñas y concurrencia.`);
      }
    } else {
      console.log(`   └─ ⚠️ No se obtuvieron datos adicionales en la extracción profunda para Lead ID: ${leadId}`);
    }

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2, // Concurrencia estricta de 2 procesos simultáneos
  }
);

deepScrapingWorker.on('completed', (job) => {
  console.log(`[Deep Scraping Worker] 🎉 Trabajo #${job.id} completado.`);
});

deepScrapingWorker.on('failed', (job, err) => {
  console.error(`[Deep Scraping Worker] ❌ Trabajo #${job?.id} falló:`, err.message);
});
