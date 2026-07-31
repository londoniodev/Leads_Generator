import Fastify from 'fastify';
import cors from '@fastify/cors';
import env from '../config/env.config.js';
import { enqueueLeads } from '../queue/lead.queue.js';
import { RawLeadData } from '../services/lead-cleaner.service.js';

export const app = Fastify({
  logger: true,
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
   * Webhook Endpoint protegido para recibir los leads extraídos desde Apify.
   */
  app.post('/webhooks/apify/leads', async (request, reply) => {
    // 1. Validar Token de Autenticación (Header x-webhook-secret o Authorization: Bearer <token>)
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

    // 2. Validar que la carga útil sea un arreglo JSON
    const body = request.body;

    if (!Array.isArray(body)) {
      return reply.status(400).send({
        error: 'Payload inválido: el cuerpo de la petición debe ser un arreglo JSON de leads.',
      });
    }

    // 3. Mapeo robusto desde la estructura devuelta por Apify Google Maps Actor a RawLeadData interno
    const mappedLeads: RawLeadData[] = body.map((item: any) => ({
      companyName: item.title || item.companyName || item.name || 'Sin Nombre',
      niche: item.categoryName || item.niche || item.category || 'General',
      city: item.city || item.addressParsed?.city || item.location?.city || undefined,
      country: item.countryCode || item.country || item.addressParsed?.countryCode || undefined,
      address: item.address || item.street || undefined,
      website: item.website || item.url || item.domain || undefined,
      phone: item.phoneUnformatted || item.phone || item.phoneNumber || undefined,
      primaryEmail: item.email || item.primaryEmail || undefined,
    }));

    if (mappedLeads.length === 0) {
      return reply.status(200).send({
        success: true,
        message: 'Se recibió un arreglo vacío. Ningún lead fue encolado.',
        queuedCount: 0,
      });
    }

    // 4. Inyección asíncrona a la cola de BullMQ en Redis
    await enqueueLeads(mappedLeads);

    // Respuesta inmediata HTTP 202 Accepted
    return reply.status(202).send({
      success: true,
      message: 'Leads recibidos y encolados exitosamente.',
      queuedCount: mappedLeads.length,
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
    console.log(`   📍 Endpoint Apify: POST http://0.0.0.0:${env.API_PORT}/webhooks/apify/leads`);
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
