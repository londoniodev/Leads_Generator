import crypto from 'crypto';

export interface NormalizedSocialLead {
  source: 'INSTAGRAM' | 'TIKTOK' | string;
  username: string;
  fullName?: string;
  bio?: string;
  followersCount?: number;
  externalUrl?: string;
  verified?: boolean;
  rawItem: any;
}

/**
 * Servicio de Normalización (Adapter Pattern) para procesar datos crudos de Instagram y TikTok.
 */
export class NormalizationService {
  /**
   * Mapea datos crudos de Apify (Instagram / TikTok) a un objeto NormalizedSocialLead estándar.
   */
  public static normalizeSocialSeed(actorIdOrPlatform: string, rawItem: any): NormalizedSocialLead | null {
    if (!rawItem || typeof rawItem !== 'object') return null;

    const sourceIdentifier = String(actorIdOrPlatform || '').toLowerCase();

    // 1. Mapeo para Instagram (apify/instagram-search-scraper o similar)
    if (sourceIdentifier.includes('instagram') || rawItem.biography !== undefined || rawItem.externalUrl !== undefined) {
      const username = String(rawItem.username || rawItem.handle || rawItem.user || '').replace(/^@/, '').trim();
      if (!username) return null;

      return {
        source: 'INSTAGRAM',
        username,
        fullName: rawItem.fullName || rawItem.full_name || rawItem.name || username,
        bio: rawItem.biography || rawItem.bio || rawItem.description || undefined,
        followersCount: typeof rawItem.followersCount === 'number' ? rawItem.followersCount : (typeof rawItem.followers === 'number' ? rawItem.followers : undefined),
        externalUrl: rawItem.externalUrl || rawItem.external_url || rawItem.website || undefined,
        verified: Boolean(rawItem.isVerified || rawItem.verified),
        rawItem,
      };
    }

    // 2. Mapeo para TikTok (clockworks/tiktok-scraper o similar)
    if (sourceIdentifier.includes('tiktok') || rawItem.uniqueId !== undefined || rawItem.authorMeta !== undefined) {
      const username = String(
        rawItem.uniqueId || rawItem.username || rawItem.authorMeta?.name || rawItem.handle || ''
      ).replace(/^@/, '').trim();

      if (!username) return null;

      return {
        source: 'TIKTOK',
        username,
        fullName: rawItem.nickname || rawItem.authorMeta?.nickName || rawItem.name || username,
        bio: rawItem.signature || rawItem.bio || rawItem.authorMeta?.signature || undefined,
        followersCount: typeof rawItem.followerCount === 'number' ? rawItem.followerCount : (typeof rawItem.stats?.followerCount === 'number' ? rawItem.stats.followerCount : undefined),
        externalUrl: rawItem.bioLink || rawItem.externalUrl || rawItem.website || undefined,
        verified: Boolean(rawItem.verified || rawItem.isVerified || rawItem.authorMeta?.verified),
        rawItem,
      };
    }

    // Fallback genérico si tiene username
    const genericUsername = String(rawItem.username || rawItem.uniqueId || rawItem.handle || '').replace(/^@/, '').trim();
    if (!genericUsername) return null;

    return {
      source: 'INSTAGRAM',
      username: genericUsername,
      fullName: rawItem.fullName || rawItem.nickname || genericUsername,
      bio: rawItem.bio || rawItem.biography || rawItem.signature || undefined,
      followersCount: rawItem.followersCount || rawItem.followerCount || undefined,
      externalUrl: rawItem.externalUrl || rawItem.website || undefined,
      verified: Boolean(rawItem.verified || rawItem.isVerified),
      rawItem,
    };
  }

  /**
   * Genera un hash determinista para un Lead creado a partir de redes sociales
   */
  public static generateSocialLeadHash(source: string, username: string, phoneE164?: string | null): string {
    const rawString = `${source.toLowerCase()}:${username.toLowerCase()}|${phoneE164 || ''}`;
    return crypto.createHash('md5').update(rawString).digest('hex');
  }
}
