import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './lead.queue.js';

export interface SocialEnrichmentBatchData {
  batchId: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN';
  profiles: Array<{
    leadId: string;
    username: string;
    url: string;
  }>;
}

export const SOCIAL_ENRICHMENT_QUEUE_NAME = 'social_enrichment_queue';

/**
 * Instancia de la cola BullMQ conectada a Redis para el enriquecimiento multicanal en lotes.
 */
export const socialEnrichmentQueue = new Queue<SocialEnrichmentBatchData>(
  SOCIAL_ENRICHMENT_QUEUE_NAME,
  {
    connection: redisConnection,
  }
);

/**
 * Worker para procesar lotes de enriquecimiento de perfiles sociales (Instagram, TikTok, LinkedIn).
 */
export const socialEnrichmentWorker = new Worker<SocialEnrichmentBatchData>(
  SOCIAL_ENRICHMENT_QUEUE_NAME,
  async (job: Job<SocialEnrichmentBatchData>) => {
    console.log(`\n[Social Enrichment Queue] 🚀 Procesando lote de perfiles sociales... (Batch ID: ${job.data.batchId}, Plataforma: ${job.data.platform}, Items: ${job.data.profiles.length})`);
    
    // Log informativo básico (Próxima fase: agrupación y llamada asíncrona a Apify)
    for (const item of job.data.profiles) {
      console.log(`   └─ Lead ID: ${item.leadId} | Handle: @${item.username} | URL: ${item.url}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

socialEnrichmentWorker.on('completed', (job) => {
  console.log(`[Social Enrichment Queue] ✅ Lote #${job.id} procesado exitosamente.`);
});

socialEnrichmentWorker.on('failed', (job, err) => {
  console.error(`[Social Enrichment Queue] ❌ Error procesando lote #${job?.id}:`, err.message);
});
