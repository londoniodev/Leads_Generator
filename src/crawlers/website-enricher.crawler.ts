import { CheerioCrawler, PlaywrightCrawler, RequestQueue } from 'crawlee';
import { extractEmails } from '../utils/email.util.js';
import { extractSocialProfiles, ExtractedSocial } from '../utils/social.util.js';

export interface ScrapedWebsiteData {
  url: string;
  emails: string[];
  phones: string[];
  socials: ExtractedSocial[];
  title?: string;
  crawlerUsed: 'Cheerio' | 'Playwright';
}

export class WebsiteEnricherCrawler {
  /**
   * Extrae teléfonos, emails y redes sociales de una página o lista de URLs con fallback a Playwright.
   */
  public async enrichWebsites(urls: string[]): Promise<Map<string, ScrapedWebsiteData>> {
    const results = new Map<string, ScrapedWebsiteData>();
    const failedForPlaywrightFallback: string[] = [];

    console.log(`[Crawler Engine] Iniciando extracción estática con CheerioCrawler para ${urls.length} URLs...`);

    const cheerioCrawler = new CheerioCrawler({
      maxConcurrency: 5,
      requestHandlerTimeoutSecs: 15,
      maxRequestRetries: 1,

      async requestHandler({ request, $, response }) {
        const statusCode = response.statusCode;

        // Si la respuesta es 403 Forbidden o 401 Unauthorized, forzar fallback a Playwright
        if (statusCode === 403 || statusCode === 401) {
          console.warn(`[CheerioCrawler] Bloqueo HTTP ${statusCode} detectado en: ${request.url}. Marrando para fallback Playwright...`);
          failedForPlaywrightFallback.push(request.url);
          return;
        }

        const html = $.html();
        const text = $('body').text();
        const title = $('title').text().trim();

        // Extraer correos
        const emails = extractEmails(html);

        // Extraer enlaces a redes sociales
        const pageLinks: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) pageLinks.push(href);
        });

        const socials = extractSocialProfiles(pageLinks);

        // Extraer posibles teléfonos
        const phoneRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
        const rawPhones = text.match(phoneRegex) || [];
        const phones = Array.from(new Set(rawPhones.map(p => p.trim()))).slice(0, 5);

        results.set(request.url, {
          url: request.url,
          emails,
          phones,
          socials,
          title,
          crawlerUsed: 'Cheerio',
        });
      },

      async failedRequestHandler({ request, error }) {
        console.warn(`[CheerioCrawler] Error accediendo a ${request.url}: ${error.message}. Programando fallback a Playwright.`);
        if (!failedForPlaywrightFallback.includes(request.url)) {
          failedForPlaywrightFallback.push(request.url);
        }
      },
    });

    await cheerioCrawler.run(urls);

    // Fallback con Playwright para URLs que dieron 403/401 o fallaron
    if (failedForPlaywrightFallback.length > 0) {
      console.log(`[Crawler Engine] ⚠️ Ejecutando PlaywrightCrawler (Headless Browser) para ${failedForPlaywrightFallback.length} URLs con bloqueos...`);

      const playwrightCrawler = new PlaywrightCrawler({
        maxConcurrency: 2,
        requestHandlerTimeoutSecs: 30,
        headless: true,

        async requestHandler({ request, page }) {
          const title = await page.title();
          const content = await page.content();
          const bodyText = await page.locator('body').innerText().catch(() => '');

          const emails = extractEmails(content);

          const hrefs = await page.$$eval('a[href]', elements => elements.map(e => e.getAttribute('href')).filter((h): h is string => Boolean(h)));
          const socials = extractSocialProfiles(hrefs);

          const phoneRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
          const rawPhones = bodyText.match(phoneRegex) || [];
          const phones = Array.from(new Set(rawPhones.map(p => p.trim()))).slice(0, 5);

          results.set(request.url, {
            url: request.url,
            emails,
            phones,
            socials,
            title,
            crawlerUsed: 'Playwright',
          });

          console.log(`[PlaywrightCrawler] Exito extrayendo con navegador completo: ${request.url}`);
        },

        async failedRequestHandler({ request, error }) {
          console.error(`[PlaywrightCrawler] Error definitivo al extraer ${request.url}:`, error.message);
        },
      });

      await playwrightCrawler.run(failedForPlaywrightFallback);
    }

    return results;
  }
}
