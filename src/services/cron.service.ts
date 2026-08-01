import { BatchBufferService } from './batch-buffer.service.js';

const ACTIVE_SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'linkedin'];
const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Ejecuta la verificación y vaciado atómico de perfiles sociales rezagados en el búfer Redis.
 */
export async function runBatchFlushCron() {
  console.log('⏰ [Cron Scheduler] Verificando búferes sociales rezagados en Redis...');

  for (const platform of ACTIVE_SOCIAL_PLATFORMS) {
    try {
      const flushedItems = await BatchBufferService.flushBatch(platform);
      if (flushedItems && flushedItems.length > 0) {
        console.log(
          `\n🔥 [CRON FLUSH READY] Disparando Apify para ${platform} con ${flushedItems.length} perfiles rezagados.`
        );
        console.log(
          `   └─ Primer handle: @${flushedItems[0]?.username} | Último handle: @${flushedItems[flushedItems.length - 1]?.username}\n`
        );
      }
    } catch (err: any) {
      console.error(`[Cron Scheduler] Error al procesar vaciado de ${platform}:`, err.message);
    }
  }
}

/**
 * Inicializa el Cronjob programado exactamente cada 10 minutos (600,000 ms).
 */
export function startCronScheduler() {
  console.log('⏱️ [Cron Scheduler] Iniciado cronjob de vaciado de búfer de perfiles sociales cada 10 minutos.');
  setInterval(runBatchFlushCron, TEN_MINUTES_MS);
}
