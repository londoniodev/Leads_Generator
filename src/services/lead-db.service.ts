import { Lead } from '@prisma/client';
import prisma from '../config/database.js';
import { CleanedLeadData } from './lead-cleaner.service.js';

export async function saveOrUpdateLead(cleanedData: CleanedLeadData): Promise<Lead> {
  const { website, phoneE164, socialProfiles, ...leadBase } = cleanedData;

  let existingLead: Lead | null = null;

  // 1. Intentar buscar por la clave única compuesta si ambos campos existen
  if (website && phoneE164) {
    existingLead = await prisma.lead.findUnique({
      where: {
        website_phoneE164: {
          website,
          phoneE164,
        },
      },
    });
  }

  // 2. Si no se encontró por clave compuesta, buscar de forma blanda por website o teléfono E.164
  if (!existingLead && website) {
    existingLead = await prisma.lead.findFirst({
      where: { website },
    });
  }

  if (!existingLead && phoneE164) {
    existingLead = await prisma.lead.findFirst({
      where: { phoneE164 },
    });
  }

  let lead: Lead;

  if (existingLead) {
    // Actualizar Lead existente enriqueciendo campos si estaban vacíos
    lead = await prisma.lead.update({
      where: { id: existingLead.id },
      data: {
        companyName: leadBase.companyName || existingLead.companyName,
        niche: leadBase.niche || existingLead.niche,
        city: leadBase.city || existingLead.city,
        country: leadBase.country || existingLead.country,
        address: leadBase.address || existingLead.address,
        website: website || existingLead.website,
        phoneE164: phoneE164 || existingLead.phoneE164,
        primaryEmail: leadBase.primaryEmail || existingLead.primaryEmail,
        status: leadBase.status,
        score: Math.max(existingLead.score, leadBase.score),
      },
    });
  } else {
    // Crear nuevo Lead
    lead = await prisma.lead.create({
      data: {
        ...leadBase,
        website,
        phoneE164,
      },
    });
  }

  // 3. Insertar o vincular Perfiles de Redes Sociales
  for (const profile of socialProfiles) {
    const existingProfile = await prisma.socialProfile.findFirst({
      where: {
        leadId: lead.id,
        platform: profile.platform,
        url: profile.url,
      },
    });

    if (!existingProfile) {
      await prisma.socialProfile.create({
        data: {
          leadId: lead.id,
          platform: profile.platform,
          url: profile.url,
          username: profile.username || null,
        },
      });
    }
  }

  return lead;
}
