import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import env from '../config/env.config.js';
import { RawLeadData } from '../services/lead-cleaner.service.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const LEAD_EXTRACTION_QUEUE_NAME = 'lead-extraction';

export const leadExtractionQueue = new Queue<RawLeadData>(LEAD_EXTRACTION_QUEUE_NAME, {
  connection: redisConnection,
});

/**
 * Encola un listado de leads crudos para su extracción y procesamiento asíncrono.
 */
export async function enqueueLeads(leads: RawLeadData[]) {
  console.log(`[Queue Producer] Encolando ${leads.length} leads en BullMQ...`);

  const jobs = leads.map(lead => ({
    name: 'extract-and-enrich-lead',
    data: lead,
    opts: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }));

  const result = await leadExtractionQueue.addBulk(jobs);
  console.log(`[Queue Producer] ✅ ${result.length} trabajos agregados a la cola "${LEAD_EXTRACTION_QUEUE_NAME}".`);
  return result;
}
