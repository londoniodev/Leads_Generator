import { WebsiteEnricherCrawler } from '../crawlers/website-enricher.crawler.js';
import { cleanLeadData } from '../services/lead-cleaner.service.js';
import { saveOrUpdateLead } from '../services/lead-db.service.js';
import prisma from '../config/database.js';

async function main() {
  console.log('=== MOTOR B2B LEAD GENERATOR & ENRICHER (CLI) ===\n');

  // Datos de entrada de prueba (o pasados por CLI)
  const inputLeads = [
    {
      companyName: 'Acme Dental Studio',
      niche: 'Clínicas Odontológicas',
      city: 'Madrid',
      country: 'España',
      website: 'https://example.com',
      phone: '+34 912 34 56 78',
      primaryEmail: 'info@acmedental.com',
    },
    {
      companyName: 'Gourmet Bistro Bar',
      niche: 'Restaurantes',
      city: 'Bogotá',
      country: 'Colombia',
      website: 'https://httpbin.org/html', // URL estática para test de scraping
      phone: '300 123 4567',
    },
  ];

  console.log(`[1/3] Limpiando e iniciando enriquecimiento para ${inputLeads.length} leads iniciales...`);

  const urlsToScrape = inputLeads
    .map(l => l.website)
    .filter((w): w is string => Boolean(w));

  const crawler = new WebsiteEnricherCrawler();
  const scrapedResults = await crawler.enrichWebsites(urlsToScrape);

  console.log('\n[2/3] Procesando, normalizando datos y cruzando perfiles...');

  for (const raw of inputLeads) {
    const scraped = raw.website ? scrapedResults.get(raw.website) : null;

    const cleaned = cleanLeadData({
      ...raw,
      primaryEmail: raw.primaryEmail || scraped?.emails[0],
      phone: raw.phone || scraped?.phones[0],
      foundUrls: scraped?.socials.map(s => s.url) || [],
      socials: scraped?.socials || [],
    });

    console.log(`\n📌 Guardando Lead: "${cleaned.companyName}" (${cleaned.niche})`);
    console.log(`   Website:      ${cleaned.website || 'N/A'}`);
    console.log(`   Teléfono E164: ${cleaned.phoneE164 || 'N/A'}`);
    console.log(`   Email:        ${cleaned.primaryEmail || 'N/A'}`);
    console.log(`   Redes Soc.:   ${cleaned.socialProfiles.length} encontradas`);
    console.log(`   Score Lead:   ${cleaned.score}/100`);

    const savedLead = await saveOrUpdateLead(cleaned);
    console.log(`   ✅ ID Registrado en BD: ${savedLead.id}`);
  }

  console.log('\n[3/3] Proceso completado exitosamente.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error durante la ejecución del pipeline:', err);
  prisma.$disconnect();
  process.exit(1);
});
