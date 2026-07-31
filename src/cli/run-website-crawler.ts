import { WebsiteEnricherCrawler } from '../crawlers/website-enricher.crawler.js';
import { LeadCleanerService, RawLeadData } from '../services/lead-cleaner.service.js';
import { LeadDbService } from '../services/lead-db.service.js';
import prisma from '../config/database.js';

/**
 * Orquestador Central del Pipeline de Generación y Enriquecimiento de Leads (IoC).
 */
async function bootstrap() {
  console.log('==================================================');
  console.log('🚀 PIPELINE ORQUESTADOR B2B LEAD GENERATOR');
  console.log('==================================================\n');

  try {
    // 1. Mock de Entrada (Simulando respuesta de Google Maps / Apify)
    const rawLeads: RawLeadData[] = [
      {
        companyName: 'Acme Dental Studio',
        niche: 'Clínicas Odontológicas',
        city: 'Madrid',
        country: 'España',
        website: 'https://example.com',
        phone: '+34 912 34 56 78',
        primaryEmail: 'contacto@acmedental.com',
      },
      {
        companyName: 'HttpBin Test Bistro',
        niche: 'Restaurantes',
        city: 'Bogotá',
        country: 'Colombia',
        website: 'https://httpbin.org/html',
        phone: '300 123 4567',
      },
      {
        companyName: 'JSONPlaceholder Digital Agency',
        niche: 'Agencias de Marketing',
        city: 'Ciudad de México',
        country: 'México',
        website: 'https://jsonplaceholder.typicode.com',
        phone: '+52 55 1234 5678',
      },
    ];

    console.log(`[Paso 1/4] Entrada recibida: ${rawLeads.length} leads crudos.`);

    // 2. Extracción (WebsiteEnricherCrawler)
    const targetUrls = rawLeads
      .map(lead => lead.website)
      .filter((url): url is string => Boolean(url));

    console.log(`[Paso 2/4] Ejecutando extracción con Crawlee para ${targetUrls.length} sitios web...`);
    const crawler = new WebsiteEnricherCrawler();
    const scrapedDataMap = await crawler.enrichWebsites(targetUrls);

    // 3. Fusión y Limpieza (LeadCleanerService)
    console.log('\n[Paso 3/4] Aplicando fusión de datos, normalización E.164 y generación de leadHash...');
    const cleanedLeads = rawLeads.map(rawLead => {
      const scrapedData = rawLead.website ? scrapedDataMap.get(rawLead.website) : null;
      return LeadCleanerService.prepareLeadData(rawLead, scrapedData);
    });

    // 4. Persistencia en Base de Datos (LeadDbService)
    console.log(`\n[Paso 4/4] Guardando/Actualizando leads en PostgreSQL Dokploy...`);

    for (const leadData of cleanedLeads) {
      const savedLead = await LeadDbService.saveOrUpdateLead(leadData);
      console.log(`   ✅ Lead Procesado: "${savedLead.companyName}"`);
      console.log(`      ID:        ${savedLead.id}`);
      console.log(`      Hash:      ${savedLead.leadHash}`);
      console.log(`      Website:   ${savedLead.website || 'N/A'}`);
      console.log(`      Phone E164:${savedLead.phoneE164 || 'N/A'}`);
      console.log(`      Score:     ${savedLead.score}/100`);
      console.log(`      Status:    ${savedLead.status}\n`);
    }

    console.log('🎉 Pipeline completado con éxito sin errores.');

  } catch (error) {
    console.error('❌ Error crítico durante la ejecución del pipeline:', error);
    process.exitCode = 1;
  } finally {
    // Cierre seguro de conexiones Prisma
    console.log('🔌 Desconectando cliente Prisma...');
    await prisma.$disconnect();
    console.log('👋 Proceso finalizado.');
  }
}

bootstrap();
