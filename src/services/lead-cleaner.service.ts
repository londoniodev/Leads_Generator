import { LeadStatus } from '@prisma/client';
import { normalizePhoneE164 } from '../utils/phone.util.js';
import { sanitizeEmail } from '../utils/email.util.js';
import { extractSocialProfiles, ExtractedSocial } from '../utils/social.util.js';

export interface RawLeadData {
  companyName: string;
  niche: string;
  city?: string;
  country?: string;
  address?: string;
  website?: string;
  phone?: string;
  primaryEmail?: string;
  foundUrls?: string[];
  socials?: ExtractedSocial[];
}

export interface CleanedLeadData {
  companyName: string;
  niche: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  phoneE164: string | null;
  primaryEmail: string | null;
  socialProfiles: ExtractedSocial[];
  status: LeadStatus;
  score: number;
}

/**
 * Normaliza el dominio de un sitio web.
 */
export function normalizeWebsiteUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  let clean = rawUrl.trim().toLowerCase();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  try {
    const urlObj = new URL(clean);
    // Retornar formato estándar https://dominio.com sin slash final
    return `${urlObj.protocol}//${urlObj.hostname}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Limpia y normaliza la información de un Lead crudo.
 */
export function cleanLeadData(raw: RawLeadData): CleanedLeadData {
  const companyName = raw.companyName.trim();
  const niche = raw.niche.trim();
  const city = raw.city?.trim() || null;
  const country = raw.country?.trim() || null;
  const address = raw.address?.trim() || null;
  
  const website = normalizeWebsiteUrl(raw.website);
  const phoneE164 = normalizePhoneE164(raw.phone);
  const primaryEmail = sanitizeEmail(raw.primaryEmail);

  // Combinar redes sociales recibidas y encontradas en URLs escaneadas
  const allUrls = [...(raw.foundUrls || [])];
  if (raw.website) allUrls.push(raw.website);
  
  const socialProfiles = extractSocialProfiles(allUrls);
  if (raw.socials) {
    for (const soc of raw.socials) {
      if (!socialProfiles.some(s => s.platform === soc.platform && s.url === soc.url)) {
        socialProfiles.push(soc);
      }
    }
  }

  // Calcular puntuación del lead (Lead Scoring)
  let score = 0;
  if (companyName) score += 10;
  if (website) score += 20;
  if (phoneE164) score += 25;
  if (primaryEmail) score += 25;
  score += Math.min(socialProfiles.length * 10, 20); // Máximo 20 pts por redes sociales

  // Determinar status inicial
  let status: LeadStatus = LeadStatus.NEW;
  if (primaryEmail || phoneE164) {
    status = LeadStatus.ENRICHED;
  }

  return {
    companyName,
    niche,
    city,
    country,
    address,
    website,
    phoneE164,
    primaryEmail,
    socialProfiles,
    status,
    score
  };
}
