import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './lead.queue.js';
import { ExtractedSocial } from '../utils/social.util.js';

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
 * Encola perfiles sociales descubiertos (Instagram, TikTok, LinkedIn) de forma concurrente (Promise.all).
 */
export async function enqueueSocialEnrichment(
  leadId: string,
  socialProfiles: ExtractedSocial[]
) {
  const eligibleProfiles = socialProfiles.filter(
    (p) => (p.platform === 'INSTAGRAM' || p.platform === 'TIKTOK' || p.platform === 'LINKEDIN') && (p.username || p.url)
  );

  if (eligibleProfiles.length === 0) return [];

  console.log(`[Social Producer] Encolando ${eligibleProfiles.length} perfiles sociales para Lead ID: ${leadId}...`);

  const jobs = eligibleProfiles.map((profile) => {
    const rawUsername = profile.username || profile.url.split('/').filter(Boolean).pop() || 'unknown';
    const cleanUsername = rawUsername.replace(/^@/, '').trim();

    return {
      name: `enrich-${profile.platform.toLowerCase()}`,
      data: {
        batchId: `batch_${Date.now()}_${leadId.slice(0, 8)}`,
        platform: profile.platform as 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN',
        profiles: [
          {
            leadId,
            username: cleanUsername,
            url: profile.url,
          },
        ],
      },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    };
  });

  const results = await Promise.all(
    jobs.map((job) => socialEnrichmentQueue.add(job.name, job.data, job.opts))
  );

  console.log(`[Social Producer] ✅ ${results.length} trabajos de enriquecimiento social encolados de forma concurrente.`);
  return results;
}

/**
 * Worker para procesar lotes de enriquecimiento de perfiles sociales.
 */
export const socialEnrichmentWorker = new Worker<SocialEnrichmentBatchData>(
  SOCIAL_ENRICHMENT_QUEUE_NAME,
  async (job: Job<SocialEnrichmentBatchData>) => {
    console.log(`\n[Social Enrichment Worker] 🚀 Procesando lote de perfiles sociales... (Batch ID: ${job.data.batchId}, Plataforma: ${job.data.platform}, Items: ${job.data.profiles.length})`);
    
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
  console.log(`[Social Enrichment Worker] ✅ Lote #${job.id} procesado exitosamente.`);
});

socialEnrichmentWorker.on('failed', (job, err) => {
  console.error(`[Social Enrichment Worker] ❌ Error procesando lote #${job?.id}:`, err.message);
});
