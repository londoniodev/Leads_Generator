import { Queue } from 'bullmq';
import { redisConnection } from './lead.queue.js';

export interface DeepScrapingJobData {
  leadId: string;
  googleMapsUrl: string;
}

export const DEEP_SCRAPING_QUEUE_NAME = 'deep_scraping_queue';

/**
 * Cola BullMQ para extracción profunda en segundo plano con Playwright.
 */
export const deepScrapingQueue = new Queue<DeepScrapingJobData>(
  DEEP_SCRAPING_QUEUE_NAME,
  {
    connection: redisConnection,
  }
);

/**
 * Encola un trabajo de extracción profunda de reseñas y concurrencia.
 */
export async function enqueueDeepScraping(leadId: string, googleMapsUrl: string) {
  console.log(`[Deep Producer] Encolando extracción profunda para Lead ID: ${leadId}...`);

  return deepScrapingQueue.add(
    'deep-scrape-maps',
    {
      leadId,
      googleMapsUrl,
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  );
}
