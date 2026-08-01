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
        const note = `Teléfono ${extractedPhone} asociado a múltiples leads. Fusión automática abortada por ambigüedad.`;
        console.warn(`[WARNING] ${note}`);
        await this.saveConflictedProfile(socialData, note);
        return null;
      }
    }

    // 3. Buscar coincidencia por handle/username en SocialProfile
    const rawUsername = socialData.username || socialData.handle || socialData.user;
    if (rawUsername) {
      const cleanUsername = String(rawUsername).replace(/^@/, '').trim();
      const existingProfile = await prisma.socialProfile.findFirst({
        where: { username: cleanUsername, status: 'LINKED' },
        select: { leadId: true },
      });
      if (existingProfile && existingProfile.leadId) return existingProfile.leadId;
    }

    return null;
  }

  /**
   * Guarda un perfil social en estado de Cuarentena/Conflicto cuando resolveIdentity no logra vinculación segura.
   */
  public static async saveConflictedProfile(socialData: any, note: string): Promise<void> {
    const rawPlatform = String(socialData.platform || 'INSTAGRAM').toUpperCase();
    const platform = (Object.values(Platform).includes(rawPlatform as Platform)
      ? rawPlatform
      : 'INSTAGRAM') as Platform;

    const rawUsername = socialData.username || socialData.handle || socialData.user || '';
    const username = String(rawUsername).replace(/^@/, '').trim() || null;
    const url = socialData.url || (username ? `https://www.instagram.com/${username}` : 'https://social.com');
    const followers = typeof socialData.followersCount === 'number' ? socialData.followersCount : (typeof socialData.followers === 'number' ? socialData.followers : null);
    const bio = socialData.biography || socialData.bio || null;
    const emailInBio = socialData.email || socialData.emailInBio || null;
    const verified = Boolean(socialData.isVerified || socialData.verified);

    // Buscar si ya existe el perfil por plataforma y username
    const existing = username
      ? await prisma.socialProfile.findFirst({
          where: { platform, username },
        })
      : null;

    if (existing) {
      await prisma.socialProfile.update({
        where: { id: existing.id },
        data: {
          status: 'CONFLICTED',
          conflictNote: note,
          followers: followers || existing.followers,
          bio: bio || existing.bio,
          emailInBio: emailInBio || existing.emailInBio,
          verified: verified || existing.verified,
        },
      });
    } else {
      await prisma.socialProfile.create({
        data: {
          leadId: null,
          platform,
          url,
          username,
          followers,
          bio,
          emailInBio,
          verified,
          status: 'CONFLICTED',
          conflictNote: note,
        },
      });
    }
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

    // Buscar perfil existente por leadId y plataforma o por id único
    const existing = await prisma.socialProfile.findFirst({
      where: { leadId, platform },
    });

    if (existing) {
      await prisma.socialProfile.update({
        where: { id: existing.id },
        data: {
          url: url || existing.url,
          username: username || existing.username,
          followers: followers !== null ? followers : existing.followers,
          bio: bio || existing.bio,
          emailInBio: emailInBio || existing.emailInBio,
          verified: verified || existing.verified,
          status: 'LINKED',
          conflictNote: null,
        },
      });
    } else {
      await prisma.socialProfile.create({
        data: {
          leadId,
          platform,
          url: url || `https://social.com/${username || leadId}`,
          username,
          followers,
          bio,
          emailInBio,
          verified,
          status: 'LINKED',
        },
      });
    }

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
