import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './lead.queue.js';
import { ExtractedSocial } from '../utils/social.util.js';
import { BatchBufferService } from '../services/batch-buffer.service.js';

export interface SocialEnrichmentProfileItem {
  leadId: string;
  username: string;
  url: string;
}

export interface SocialEnrichmentBatchData {
  batchId: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN';
  profiles: SocialEnrichmentProfileItem[];
}

export const SOCIAL_ENRICHMENT_QUEUE_NAME = 'social_enrichment_queue';
export const BATCH_TARGET_SIZE = 50;

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
 * Worker para procesar perfiles sociales y acumularlos en el búfer de Redis hasta completar 50 elementos.
 */
export const socialEnrichmentWorker = new Worker<SocialEnrichmentBatchData>(
  SOCIAL_ENRICHMENT_QUEUE_NAME,
  async (job: Job<SocialEnrichmentBatchData>) => {
    const { platform, profiles } = job.data;
    console.log(`\n[Social Enrichment Worker] ⚙️ Recibido elemento para búfer de ${platform}... (Lead ID: ${profiles[0]?.leadId}, Handle: @${profiles[0]?.username})`);

    for (const profileItem of profiles) {
      // 1. Acumular en el búfer atómico de Redis
      const readyBatch = await BatchBufferService.addToBatch<SocialEnrichmentProfileItem>(
        platform,
        profileItem,
        BATCH_TARGET_SIZE
      );

      // 2. Si el búfer acumuló 50 perfiles, se activa el lote completo para disparar Apify
      if (readyBatch && readyBatch.length >= BATCH_TARGET_SIZE) {
        console.log(`\n🔥 [BATCH READY] Disparando Apify para ${platform} con ${readyBatch.length} perfiles acumulados!`);
        console.log(`   └─ Primer handle: @${readyBatch[0]?.username} | Último handle: @${readyBatch[readyBatch.length - 1]?.username}\n`);
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

socialEnrichmentWorker.on('completed', (job) => {
  console.log(`[Social Enrichment Worker] ✅ Elemento #${job.id} procesado en búfer.`);
});

socialEnrichmentWorker.on('failed', (job, err) => {
  console.error(`[Social Enrichment Worker] ❌ Error procesando elemento #${job?.id}:`, err.message);
});
