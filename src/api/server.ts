import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ApifyClient } from 'apify-client';
import env from '../config/env.config.js';
import { enqueueLeads } from '../queue/lead.queue.js';
import { RawLeadData } from '../services/lead-cleaner.service.js';

export const app = Fastify({
  logger: true,
});

// Instanciar cliente oficial de Apify
export const apifyClient = new ApifyClient({
  token: env.APIFY_API_TOKEN,
});

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
   * Webhook Endpoint protegido para recibir eventos de Apify y descargar datasets completos.
   */
  app.post('/webhooks/apify/leads', async (request, reply) => {
    // 1. Validar Token de Autenticación de Seguridad (Header x-webhook-secret o Authorization: Bearer <token>)
    const customSecretHeader = request.headers['x-webhook-secret'];
    const authHeader = request.headers['authorization'];

    let providedToken: string | undefined = undefined;

    if (typeof customSecretHeader === 'string') {
      providedToken = customSecretHeader.trim();
    } else if (typeof authHeader === 'string') {
      providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    }

    if (!providedToken || providedToken !== env.WEBHOOK_SECRET_TOKEN) {
      return reply.status(401).send({
        error: 'No autorizado: El token de autenticación del webhook es inválido o no fue provisto.',
      });
    }

    // 2. Validar Carga Útil del Evento de Apify y obtener defaultDatasetId
    const body = (request.body || {}) as any;
    const datasetId = body.resource?.defaultDatasetId || body.defaultDatasetId || body.eventData?.defaultDatasetId;

    if (!datasetId || typeof datasetId !== 'string') {
      return reply.status(400).send({
        error: 'Payload de Apify inválido: falta resource.defaultDatasetId en la carga útil del evento.',
      });
    }

    try {
      request.log.info(`Descargando dataset de Apify con ID: ${datasetId}...`);

      // 3. Descargar los resultados reales utilizando el SDK de ApifyClient
      const { items } = await apifyClient.dataset(datasetId).listItems();

      if (!items || items.length === 0) {
        return reply.status(200).send({
          success: true,
          message: 'El dataset descargado está vacío. Ningún lead fue encolado.',
          datasetId,
          queuedCount: 0,
        });
      }

      // 4. Mapeo robusto desde los ítems de Apify a RawLeadData interno
      const mappedLeads: RawLeadData[] = items.map((item: any) => ({
        companyName: item.title || item.companyName || item.name || 'Sin Nombre',
        niche: item.categoryName || item.niche || item.category || 'General',
        city: item.city || item.addressParsed?.city || item.location?.city || undefined,
        country: item.countryCode || item.country || item.addressParsed?.countryCode || undefined,
        address: item.address || item.street || undefined,
        website: item.website || item.url || item.domain || undefined,
        phone: item.phoneUnformatted || item.phone || item.phoneNumber || undefined,
        primaryEmail: item.email || item.primaryEmail || undefined,
      }));

      // 5. Inyección asíncrona a la cola de BullMQ en Redis
      await enqueueLeads(mappedLeads);

      // Respuesta HTTP 202 Accepted
      return reply.status(202).send({
        success: true,
        message: 'Dataset de Apify descargado y leads encolados exitosamente.',
        datasetId,
        queuedCount: mappedLeads.length,
      });

    } catch (err: any) {
      request.log.error(`Error descargando dataset de Apify [ID: ${datasetId}]:`, err.message);
      return reply.status(500).send({
        error: 'Error al conectar con la API de Apify para descargar el dataset.',
        details: err.message,
      });
    }
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
    console.log(`   🔑 Header de autenticación requerido: x-webhook-secret: ${env.WEBHOOK_SECRET_TOKEN}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Iniciar servidor si es el script principal
if (require.main === module) {
  startServer();
}
