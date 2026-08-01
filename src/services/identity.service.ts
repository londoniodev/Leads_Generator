import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import prisma from '../config/database.js';
import { Platform } from '@prisma/client';

export class IdentityService {
  /**
   * Extrae y normaliza un número de teléfono E.164 desde un texto de biografía social.
   */
  public static extractAndNormalizePhone(
    bioText: string,
    defaultCountry: string = 'CO'
  ): string | null {
    if (!bioText || typeof bioText !== 'string') return null;

    // Buscar secuencias numéricas de 7 a 15 dígitos en la biografía
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
    const matches = bioText.match(phoneRegex);

    if (!matches || matches.length === 0) return null;

    for (const rawCandidate of matches) {
      try {
        const parsed = parsePhoneNumberFromString(
          rawCandidate.trim(),
          defaultCountry.toUpperCase() as CountryCode
        );
        if (parsed && parsed.isValid()) {
          return parsed.number; // Retorna formato E.164 (ej: +573104739592)
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Resuelve la identidad de un perfil social contra la base de datos PostgreSQL
   * aplicando un escudo de protección contra falsos positivos (números compartidos por agencias).
   */
  public static async resolveIdentity(socialData: any): Promise<string | null> {
    if (!socialData) return null;

    // 1. Coincidencia por leadId explícito de origen
    const explicitLeadId = socialData.leadId || socialData.customData?.leadId;
    if (explicitLeadId && typeof explicitLeadId === 'string') {
      const existingLead = await prisma.lead.findUnique({ where: { id: explicitLeadId } });
      if (existingLead) return existingLead.id;
    }

    // 2. Extraer teléfono de la biografía (ej. Instagram/TikTok bio) y evaluar ambigüedad
    const bioText = socialData.bio || socialData.biography || socialData.description || '';
    const extractedPhone = this.extractAndNormalizePhone(bioText, socialData.countryCode || 'CO');

    if (extractedPhone) {
      const matchingLeads = await prisma.lead.findMany({
        where: { phoneE164: extractedPhone },
        select: { id: true },
      });

      if (matchingLeads.length === 1) {
        return matchingLeads[0].id;
      } else if (matchingLeads.length > 1) {
        console.warn(
          `[WARNING] Teléfono ${extractedPhone} asociado a múltiples leads. Fusión automática abortada para evitar corrupción de datos.`
        );
        return null;
      }
    }

    // 3. Buscar coincidencia por handle/username en SocialProfile
    const rawUsername = socialData.username || socialData.handle || socialData.user;
    if (rawUsername) {
      const cleanUsername = String(rawUsername).replace(/^@/, '').trim();
      const existingProfile = await prisma.socialProfile.findFirst({
        where: { username: cleanUsername },
        select: { leadId: true },
      });
      if (existingProfile) return existingProfile.leadId;
    }

    return null;
  }

  /**
   * Ejecuta el UPSERT atómico en SocialProfile y actualiza el Lead score.
   */
  public static async mergeSocialProfile(leadId: string, socialData: any): Promise<void> {
    const rawPlatform = String(socialData.platform || 'INSTAGRAM').toUpperCase();
    const platform = (Object.values(Platform).includes(rawPlatform as Platform)
      ? rawPlatform
      : 'INSTAGRAM') as Platform;

    const rawUsername = socialData.username || socialData.handle || socialData.user || '';
    const username = String(rawUsername).replace(/^@/, '').trim() || null;
    const url = socialData.url || (username ? `https://www.instagram.com/${username}` : '');
    const followers = typeof socialData.followersCount === 'number' ? socialData.followersCount : (typeof socialData.followers === 'number' ? socialData.followers : null);
    const bio = socialData.biography || socialData.bio || null;
    const emailInBio = socialData.email || socialData.emailInBio || null;
    const verified = Boolean(socialData.isVerified || socialData.verified);

    // Upsert atómico en SocialProfile por [leadId, platform]
    await prisma.socialProfile.upsert({
      where: {
        leadId_platform: {
          leadId,
          platform,
        },
      },
      update: {
        url: url || undefined,
        username,
        followers,
        bio,
        emailInBio,
        verified,
      },
      create: {
        leadId,
        platform,
        url: url || `https://social.com/${username || leadId}`,
        username,
        followers,
        bio,
        emailInBio,
        verified,
      },
    });

    // Recalcular Lead Score y actualizar status
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { socialProfiles: true },
    });

    if (lead) {
      let score = 0;
      if (lead.companyName) score += 10;
      if (lead.website) score += 20;
      if (lead.phoneE164) score += 25;
      if (lead.primaryEmail || emailInBio) score += 25;
      score += Math.min(lead.socialProfiles.length * 10, 20);

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          score,
          primaryEmail: lead.primaryEmail || emailInBio || undefined,
          status: 'ENRICHED',
        },
      });
    }
  }
}
