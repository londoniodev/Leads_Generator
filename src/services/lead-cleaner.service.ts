import { createHash } from 'node:crypto';
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
  rating?: number;
  reviewsCount?: number;
  googleCategory?: string;
  foundUrls?: string[];
  socials?: ExtractedSocial[];
}

export interface CleanedLeadData {
  leadHash: string;
  companyName: string;
  niche: string;
  city: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  phoneE164: string | null;
  primaryEmail: string | null;
  rating: number | null;
  reviewsCount: number | null;
  googleCategory: string | null;
  socialProfiles: ExtractedSocial[];
  status: LeadStatus;
  score: number;
}

/**
 * Función pura que genera un Hash MD5 determinista a partir del website y teléfono E.164.
 */
export function generateLeadHash(website: string | null, phoneE164: string | null): string {
  const cleanWebsite = (website || '').trim().toLowerCase();
  const cleanPhone = (phoneE164 || '').trim();
  const rawString = `${cleanWebsite}|${cleanPhone}`;
  return createHash('md5').update(rawString).digest('hex');
}

/**
 * Dominios de redes sociales y motores de búsqueda que NO deben tratarse como el sitio web oficial de la empresa.
 */
const NON_OFFICIAL_WEBSITE_DOMAINS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'pinterest.com',
  'google.com',
  'google.es',
  'google.co',
];

/**
 * Normaliza el dominio de un sitio web omitiendo dominios de redes sociales y Google Maps.
 */
export function normalizeWebsiteUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  let clean = rawUrl.trim().toLowerCase();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  try {
    const urlObj = new URL(clean);
    const hostname = urlObj.hostname.replace(/^www\./, '');

    const isNonOfficialDomain = NON_OFFICIAL_WEBSITE_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith('.' + domain)
    );

    if (isNonOfficialDomain) {
      return null;
    }

    return `${urlObj.protocol}//${urlObj.hostname}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Limpia y normaliza la información de un Lead crudo generando su leadHash determinista.
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
  const rating = typeof raw.rating === 'number' ? raw.rating : null;
  const reviewsCount = typeof raw.reviewsCount === 'number' ? raw.reviewsCount : null;
  const googleCategory = raw.googleCategory?.trim() || null;

  // Generar Hash Determinista
  const leadHash = generateLeadHash(website || raw.website || companyName, phoneE164);

  // Extraer perfiles sociales de todas las URLs (incluyendo raw.website si era un link de Instagram/Facebook)
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
  if (rating && rating >= 4.0) score += 10;
  score += Math.min(socialProfiles.length * 10, 10);

  // Determinar status inicial
  let status: LeadStatus = LeadStatus.NEW;
  if (primaryEmail || phoneE164) {
    status = LeadStatus.ENRICHED;
  }

  return {
    leadHash,
    companyName,
    niche,
    city,
    country,
    address,
    website,
    phoneE164,
    primaryEmail,
    rating,
    reviewsCount,
    googleCategory,
    socialProfiles,
    status,
    score
  };
}

/**
 * Servicio de Limpieza con métodos estáticos para inversión de control.
 */
export class LeadCleanerService {
  public static prepareLeadData(
    raw: RawLeadData,
    scraped?: { emails?: string[]; phones?: string[]; socials?: ExtractedSocial[] } | null
  ): CleanedLeadData {
    return cleanLeadData({
      ...raw,
      primaryEmail: raw.primaryEmail || scraped?.emails?.[0],
      phone: raw.phone || scraped?.phones?.[0],
      foundUrls: scraped?.socials?.map(s => s.url) || [],
      socials: scraped?.socials || [],
    });
  }
}
