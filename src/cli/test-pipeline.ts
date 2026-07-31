import { normalizePhoneE164 } from '../utils/phone.util.js';
import { extractEmails } from '../utils/email.util.js';
import { parseSocialUrl, extractSocialProfiles } from '../utils/social.util.js';
import { cleanLeadData } from '../services/lead-cleaner.service.js';
import { saveOrUpdateLead } from '../services/lead-db.service.js';
import prisma from '../config/database.js';

async function testPipeline() {
  console.log('==================================================');
  console.log('🧪 PRUEBAS UNITARIAS Y DE INTEGRACIÓN - PIPELINE');
  console.log('==================================================\n');

  // 1. Test E.164 Phone Normalization
  console.log('1. Probando Normalización de Teléfonos (E.164)...');
  const rawPhones = [
    { input: '+57 300 123 4567', expected: '+573001234567' },
    { input: '(912) 345-678', country: 'ES' as const, expected: '+34912345678' },
    { input: '300 999 8877', country: 'CO' as const, expected: '+573009998877' },
    { input: 'invalid-phone-string', expected: null },
  ];

  for (const item of rawPhones) {
    const res = normalizePhoneE164(item.input, item.country || 'CO');
    console.log(`   [Phone] "${item.input}" -> ${res} (Correcto: ${res === item.expected})`);
  }

  // 2. Test Email Extraction
  console.log('\n2. Probando Extracción de Emails...');
  const htmlSample = `
    <div>Contacto: info@empresa.com o soporte.ventas@sub.empresa.es</div>
    <img src="logo@2x.png" />
    <a href="mailto:ceo@empresa.com">Escríbenos</a>
  `;
  const emailsExtracted = extractEmails(htmlSample);
  console.log(`   [Emails Encontrados]:`, emailsExtracted);

  // 3. Test Social Profile Parsing
  console.log('\n3. Probando Detección de Redes Sociales...');
  const sampleUrls = [
    'https://www.instagram.com/clinica_dental_madrid/?hl=es',
    'https://tiktok.com/@estetica_advanced',
    'https://www.linkedin.com/company/acme-corp',
    'https://facebook.com/restaurante.bogota',
    'https://goo.gl/maps/xyz123abc',
  ];
  const socials = extractSocialProfiles(sampleUrls);
  console.log(`   [Social Profiles Parsed]:`, socials);

  // 4. Test DB Inserción & Deduplicación en Prisma
  console.log('\n4. Probando Inserción y Deduplicación en PostgreSQL vía Prisma...');
  try {
    const cleanedLead = cleanLeadData({
      companyName: 'Clínica Odontológica San Gabriel',
      niche: 'Salud y Odontología',
      city: 'Madrid',
      country: 'España',
      website: 'https://sangabriel-dental.es',
      phone: '+34 91 555 12 34',
      primaryEmail: 'contacto@sangabriel-dental.es',
      foundUrls: sampleUrls,
    });

    const lead1 = await saveOrUpdateLead(cleanedLead);
    console.log(`   ✅ Lead 1 Insertado con ID: ${lead1.id}`);

    // Re-insertar el mismo lead para verificar deduplicación/upsert por composite key [website, phoneE164]
    const lead2 = await saveOrUpdateLead(cleanedLead);
    console.log(`   ✅ Lead 2 Re-insertado (Deduplicado) con ID: ${lead2.id} (Igual a Lead 1: ${lead1.id === lead2.id})`);

    const totalLeads = await prisma.lead.count();
    console.log(`   📊 Total de Leads en Base de Datos: ${totalLeads}`);

  } catch (err: any) {
    console.error('   ❌ Error al conectar o escribir en PostgreSQL:', err.message);
    console.log('   💡 Asegúrate de ejecutar `docker compose up -d` y `npx prisma db push` antes de probar la BD.');
  }

  await prisma.$disconnect();
}

testPipeline();
