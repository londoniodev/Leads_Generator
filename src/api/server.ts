import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ApifyClient } from 'apify-client';
import env from '../config/env.config.js';
import { enqueueLeads } from '../queue/lead.queue.js';
import { RawLeadData } from '../services/lead-cleaner.service.js';
import { startCronScheduler } from '../services/cron.service.js';
import { IdentityService } from '../services/identity.service.js';

export const app = Fastify({
  logger: true,
});

export const apifyClient = new ApifyClient({
  token: env.APIFY_API_TOKEN,
});

const BATCH_LIMIT = 2500;

/**
 * Función asíncrona de segundo plano para procesar datasets masivos de Apify en streaming/paginación
 * e inyectar los leads a la cola de BullMQ en lotes, evitando OOM y bloqueos HTTP.
 */
export async function processApifyDatasetInBackground(datasetId: string): Promise<void> {
  console.log(`\n📦 [Background Task] Iniciando descarga paginada/streaming del dataset Apify ID: ${datasetId}...`);

  let offset = 0;
  let hasMore = true;
  let totalEnqueued = 0;

  try {
    const datasetClient = apifyClient.dataset(datasetId);

    while (hasMore) {
      // Descargar trozo/lote de datos paginado
      const response = await datasetClient.listItems({
        offset,
        limit: BATCH_LIMIT,
      });

      const items = response.items || [];

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      // Mapear el lote actual
      const mappedBatch: RawLeadData[] = items.map((item: any) => ({
        companyName: item.title || item.companyName || item.name || 'Sin Nombre',
        niche: item.categoryName || item.niche || item.category || 'General',
        city: item.city || item.addressParsed?.city || item.location?.city || undefined,
        country: item.countryCode || item.country || item.addressParsed?.countryCode || undefined,
        address: item.address || item.street || undefined,
        website: item.website || item.url || item.domain || undefined,
        phone: item.phoneUnformatted || item.phone || item.phoneNumber || undefined,
        primaryEmail: item.email || item.primaryEmail || undefined,
        rating: typeof item.totalScore === 'number' ? item.totalScore : (typeof item.rating === 'number' ? item.rating : undefined),
        reviewsCount: typeof item.reviewsCount === 'number' ? item.reviewsCount : (typeof item.reviews === 'number' ? item.reviews : undefined),
        googleCategory: item.categoryName || item.category || undefined,
      }));

      console.log(`📦 [Background Task] Descargado lote [Offset: ${offset}] (${mappedBatch.length} leads). Encolando en Redis...`);
      await enqueueLeads(mappedBatch);

      totalEnqueued += mappedBatch.length;
      offset += items.length;

      // Si recibimos menos elementos que el límite, alcanzamos el final del dataset
      if (items.length < BATCH_LIMIT) {
        hasMore = false;
      }
    }

    console.log(`🎉 [Background Task] Proceso finalizado. Total de ${totalEnqueued} leads del dataset ${datasetId} encolados en BullMQ.\n`);

  } catch (err: any) {
    console.error(`❌ [Background Task Error] Error crítico procesando dataset de Apify [ID: ${datasetId}]:`, err.message);
  }
}

/**
 * Registra rutas y plugins de Fastify.
 */
export async function setupApp() {
  await app.register(cors, {
    origin: '*',
  });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  /**
   * Endpoint de procesamiento manual de datasets de Apify por Dataset ID.
   */
  app.post('/api/datasets/process', async (request, reply) => {
    const body = (request.body || {}) as any;
    const datasetId = body.datasetId || body.id;

    if (!datasetId || typeof datasetId !== 'string') {
      return reply.status(400).send({
        error: 'El campo datasetId es requerido en el body.',
      });
    }

    processApifyDatasetInBackground(datasetId).catch(err => {
      console.error(`❌ Error no capturado en procesamiento manual de dataset ${datasetId}:`, err);
    });

    return reply.status(200).send({
      success: true,
      message: 'Procesamiento de dataset iniciado.',
      datasetId,
    });
  });

  /**
   * Webhook Endpoint protegido para recibir eventos de Apify Google Maps.
   */
  app.post('/webhooks/apify/leads', async (request, reply) => {
    const customSecretHeader = request.headers['x-webhook-secret'];
    const authHeader = request.headers['authorization'];
    const querySecret = (request.query as any)?.secret || (request.query as any)?.token || (request.query as any)?.['x-webhook-secret'];

    let providedToken: string | undefined = undefined;

    if (typeof customSecretHeader === 'string' && customSecretHeader.trim()) {
      providedToken = customSecretHeader.trim();
    } else if (typeof authHeader === 'string' && authHeader.trim()) {
      providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    } else if (typeof querySecret === 'string' && querySecret.trim()) {
      providedToken = querySecret.trim();
    }

    if (!providedToken || providedToken !== env.WEBHOOK_SECRET_TOKEN) {
      return reply.status(401).send({
        error: 'No autorizado: El token de autenticación del webhook es inválido o no fue provisto.',
      });
    }

    const body = (request.body || {}) as any;
    const datasetId = body.resource?.defaultDatasetId || body.defaultDatasetId || body.eventData?.defaultDatasetId;

    if (!datasetId || typeof datasetId !== 'string') {
      return reply.status(400).send({
        error: 'Payload de Apify inválido: falta resource.defaultDatasetId en la carga útil del evento.',
      });
    }

    processApifyDatasetInBackground(datasetId).catch(err => {
      console.error(`❌ Error no capturado en tarea en segundo plano para dataset ${datasetId}:`, err);
    });

    return reply.status(202).send({
      success: true,
      message: 'Procesamiento de dataset iniciado en segundo plano.',
      datasetId,
    });
  });

  /**
   * Webhook Endpoint para eventos de rascadores de redes sociales (Instagram, TikTok, LinkedIn).
   */
  app.post('/webhooks/apify/social', async (request, reply) => {
    const customSecretHeader = request.headers['x-webhook-secret'];
    const authHeader = request.headers['authorization'];
    const querySecret = (request.query as any)?.secret || (request.query as any)?.token || (request.query as any)?.['x-webhook-secret'];

    let providedToken: string | undefined = undefined;

    if (typeof customSecretHeader === 'string' && customSecretHeader.trim()) {
      providedToken = customSecretHeader.trim();
    } else if (typeof authHeader === 'string' && authHeader.trim()) {
      providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    } else if (typeof querySecret === 'string' && querySecret.trim()) {
      providedToken = querySecret.trim();
    }

    if (!providedToken || providedToken !== env.WEBHOOK_SECRET_TOKEN) {
      return reply.status(401).send({ error: 'No autorizado.' });
    }

    const body = (request.body || {}) as any;
    const datasetId = body.resource?.defaultDatasetId || body.defaultDatasetId || body.eventData?.defaultDatasetId;

    if (!datasetId || typeof datasetId !== 'string') {
      return reply.status(400).send({ error: 'Payload de Apify inválido: falta defaultDatasetId.' });
    }

    (async () => {
      console.log(`\n📲 [Social Webhook] Procesando dataset social de Apify ID: ${datasetId}...`);
      const datasetClient = apifyClient.dataset(datasetId);
      const itemsResponse = await datasetClient.listItems({ limit: 1000 });
      const items = itemsResponse.items || [];

      console.log(`📲 [Social Webhook] ${items.length} perfiles sociales recibidos. Resolviendo identidades...`);

      await Promise.all(
        items.map(async (profile: any) => {
          try {
            const leadId = await IdentityService.resolveIdentity(profile);
            if (leadId) {
              await IdentityService.mergeSocialProfile(leadId, profile);
              console.log(`   └─ ✅ Identidad resuelta y fusionada para Lead ID: ${leadId}`);
            } else {
              console.log(`   └─ ⚠️ No se pudo resolver identidad para perfil: @${profile.username || profile.handle || 'desconocido'}`);
            }
          } catch (err: any) {
            console.error(`❌ Error fusionando perfil social:`, err?.message || err);
          }
        })
      );

      console.log(`🎉 [Social Webhook] Dataset ${datasetId} procesado y fusionado en PostgreSQL.\n`);
    })().catch((err) => {
      console.error('❌ Error en segundo plano en Webhook Social:', err);
    });

    return reply.status(202).send({
      success: true,
      message: 'Procesamiento de perfiles sociales iniciado en segundo plano.',
      datasetId,
    });
  });
}

/**
 * Inicia el servidor HTTP de Fastify en el puerto definido por env.API_PORT y host 0.0.0.0.
 */
export async function startServer() {
  try {
    await setupApp();
    const address = await app.listen({
      port: env.API_PORT,
      host: '0.0.0.0', // Requerido para contenedores Docker / Dokploy
    });
    console.log(`\n🚀 [Fastify Server] Webhook API seguro escuchando en: ${address}`);
    console.log(`   📍 Endpoint Apify Event Webhook: POST http://0.0.0.0:${env.API_PORT}/webhooks/apify/leads`);
    console.log(`   📍 Endpoint Apify Social Webhook: POST http://0.0.0.0:${env.API_PORT}/webhooks/apify/social`);
    console.log(`   🔑 Header o Query Param de autenticación: x-webhook-secret / ?secret=${env.WEBHOOK_SECRET_TOKEN}\n`);

    // Inicializar Cronjob de vaciado de búfer de perfiles sociales cada 10 minutos
    startCronScheduler();

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Iniciar servidor incondicionalmente para evitar salida inmediata con exit status 0
startServer().catch((err) => {
  console.error('❌ Error fatal al iniciar el servidor Fastify:', err);
  process.exit(1);
});
