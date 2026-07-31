import { Platform } from '@prisma/client';

export interface ExtractedSocial {
  platform: Platform;
  url: string;
  username?: string;
}

/**
 * Normaliza y mapea una URL a su plataforma correspondiente y nombre de usuario si aplica.
 */
export function parseSocialUrl(rawUrl: string): ExtractedSocial | null {
  if (!rawUrl) return null;

  let urlStr = rawUrl.trim();
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const urlObj = new URL(urlStr);
    const host = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;

    if (host.includes('instagram.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const username = parts[0] && !['p', 'reel', 'stories', 'explore'].includes(parts[0]) ? parts[0] : undefined;
      return {
        platform: Platform.INSTAGRAM,
        url: `https://www.instagram.com/${username || ''}`.replace(/\/$/, ''),
        username,
      };
    }

    if (host.includes('tiktok.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const userPart = parts.find(p => p.startsWith('@'));
      const username = userPart ? userPart.replace('@', '') : undefined;
      return {
        platform: Platform.TIKTOK,
        url: userPart ? `https://www.tiktok.com/${userPart}` : urlStr,
        username,
      };
    }

    if (host.includes('linkedin.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const username = parts.length >= 2 ? parts[1] : parts[0];
      return {
        platform: Platform.LINKEDIN,
        url: urlStr,
        username,
      };
    }

    if (host.includes('facebook.com') || host.includes('fb.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const username = parts[0] && !['sharer', 'share', 'groups'].includes(parts[0]) ? parts[0] : undefined;
      return {
        platform: Platform.FACEBOOK,
        url: urlStr,
        username,
      };
    }

    if (host.includes('google.com/maps') || host.includes('maps.google.com') || host.includes('goo.gl/maps')) {
      return {
        platform: Platform.GOOGLE_MAPS,
        url: urlStr,
      };
    }

  } catch (err) {
    return null;
  }

  return null;
}

/**
 * Filtra una lista de URLs y devuelve perfiles de redes sociales únicos.
 */
export function extractSocialProfiles(urls: string[]): ExtractedSocial[] {
  const profilesMap = new Map<string, ExtractedSocial>();

  for (const url of urls) {
    const parsed = parseSocialUrl(url);
    if (parsed) {
      const key = `${parsed.platform}:${parsed.url.toLowerCase()}`;
      if (!profilesMap.has(key)) {
        profilesMap.set(key, parsed);
      }
    }
  }

  return Array.from(profilesMap.values());
}
