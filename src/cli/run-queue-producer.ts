import { enqueueLeads, leadExtractionQueue, redisConnection } from '../queue/lead.queue.js';
import { RawLeadData } from '../services/lead-cleaner.service.js';

async function main() {
  console.log('==================================================');
  console.log('📦 PRODUCTOR DE COLA DE LEADS B2B (BULLMQ + REDIS)');
  console.log('==================================================\n');

  // Array masivo de prueba (12 Leads Crudos de distintos nichos)
  const mockLeads: RawLeadData[] = [
    {
      companyName: 'Clínica Dental Sonrisas',
      niche: 'Odontología',
      city: 'Madrid',
      country: 'España',
      website: 'https://example.com',
      phone: '+34 91 234 56 78',
      primaryEmail: 'info@dentalsonrisas.es',
    },
    {
      companyName: 'Bistro Gourmet Central',
      niche: 'Restaurantes',
      city: 'Bogotá',
      country: 'Colombia',
      website: 'https://httpbin.org/html',
      phone: '300 123 4567',
    },
    {
      companyName: 'Agencia Digital Nexus',
      niche: 'Marketing',
      city: 'Ciudad de México',
      country: 'México',
      website: 'https://jsonplaceholder.typicode.com',
      phone: '+52 55 1234 5678',
    },
    {
      companyName: 'Estética Avanzada Glow',
      niche: 'Clínica Estética',
      city: 'Barcelona',
      country: 'España',
      website: 'https://example.org',
      phone: '+34 93 456 78 90',
    },
    {
      companyName: 'CrossFit Power Box',
      niche: 'Gimnasios',
      city: 'Santiago',
      country: 'Chile',
      website: 'https://httpbin.org/get',
      phone: '+56 9 8765 4321',
    },
    {
      companyName: 'Veterinaria Mascotas Felices',
      niche: 'Veterinaria',
      city: 'Lima',
      country: 'Perú',
      website: 'https://example.net',
      phone: '+51 987 654 321',
    },
    {
      companyName: 'Abogados & Asociados Legal',
      niche: 'Servicios Legales',
      city: 'Buenos Aires',
      country: 'Argentina',
      website: 'https://httpbin.org/robots.txt',
      phone: '+54 11 4321 8765',
    },
    {
      companyName: 'Hotel Boutique Plaza',
      niche: 'Hotelería',
      city: 'Cartagena',
      country: 'Colombia',
      website: 'https://example.com',
      phone: '+57 310 987 6543',
    },
    {
      companyName: 'Spa & Wellness Relax',
      niche: 'Bienestar',
      city: 'Valencia',
      country: 'España',
      website: 'https://httpbin.org/xml',
      phone: '+34 96 111 22 33',
    },
    {
      companyName: 'Inmobiliaria Premium Homes',
      niche: 'Bienes Raíces',
      city: 'Medellín',
      country: 'Colombia',
      website: 'https://jsonplaceholder.typicode.com/posts',
      phone: '+57 301 555 4433',
    },
    {
      companyName: 'Taller Automotriz MotorTech',
      niche: 'Automotriz',
      city: 'Quito',
      country: 'Ecuador',
      website: 'https://example.org',
      phone: '+593 99 888 7766',
    },
    {
      companyName: 'Panadería Artesanal Masa Madre',
      niche: 'Gastronomía',
      city: 'Cali',
      country: 'Colombia',
      website: 'https://httpbin.org/headers',
      phone: '+57 315 222 3344',
    },
  ];

  try {
    console.log(`🚀 Generando y enviando ${mockLeads.length} leads a la cola de procesamiento en Redis...`);
    await enqueueLeads(mockLeads);

    console.log('\n✨ ¡Los leads han sido encolados exitosamente!');
    console.log('💡 Ejecuta en otra terminal: `npm run worker` para iniciar el procesamiento asíncrono.');
  } catch (error) {
    console.error('❌ Error al encolar los leads:', error);
  } finally {
    await leadExtractionQueue.close();
    await redisConnection.quit();
    console.log('🔌 Conexión del Productor cerrada.');
  }
}

main();
