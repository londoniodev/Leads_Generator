import { Lead } from '@prisma/client';
import prisma from '../config/database.js';
import { CleanedLeadData } from './lead-cleaner.service.js';

/**
 * Guarda o actualiza un Lead utilizando el leadHash determinista con Prisma upsert.
 */
export async function saveOrUpdateLead(cleanedData: CleanedLeadData): Promise<Lead> {
  const { leadHash, website, phoneE164, socialProfiles, ...leadBase } = cleanedData;

  // Realizar Upsert atómico por leadHash
  const lead = await prisma.lead.upsert({
    where: { leadHash },
    update: {
      companyName: leadBase.companyName,
      niche: leadBase.niche,
      city: leadBase.city,
      country: leadBase.country,
      address: leadBase.address,
      website,
      phoneE164,
      primaryEmail: leadBase.primaryEmail,
      status: leadBase.status,
      score: leadBase.score,
    },
    create: {
      leadHash,
      companyName: leadBase.companyName,
      niche: leadBase.niche,
      city: leadBase.city,
      country: leadBase.country,
      address: leadBase.address,
      website,
      phoneE164,
      primaryEmail: leadBase.primaryEmail,
      status: leadBase.status,
      score: leadBase.score,
    },
  });

  // Vincular Perfiles de Redes Sociales de forma segura
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

/**
 * Clase LeadDbService para Inversión de Control (IoC).
 */
export class LeadDbService {
  public static async saveOrUpdateLead(cleanedData: CleanedLeadData): Promise<Lead> {
    return saveOrUpdateLead(cleanedData);
  }
}
