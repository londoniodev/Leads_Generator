import { CheerioCrawler, PlaywrightCrawler } from 'crawlee';
import env from '../config/env.config.js';
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
   * Método reutilizable (DRY) para extraer correos, redes sociales y números de teléfono de contenido HTML/Texto.
   */
  private extractDataFromHTML(html: string, text: string, links: string[]): {
    emails: string[];
    phones: string[];
    socials: ExtractedSocial[];
  } {
    // 1. Correos
    const emails = extractEmails(html);

    // 2. Redes Sociales
    const socials = extractSocialProfiles(links);

    // 3. Teléfonos vía expresión regular
    const phoneRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
    const rawPhones = text.match(phoneRegex) || [];
    const phones = Array.from(new Set(rawPhones.map(p => p.trim()))).slice(0, 5);

    return { emails, phones, socials };
  }

  /**
   * Extrae teléfonos, emails y redes sociales de una página o lista de URLs con fallback a Playwright.
   */
  public async enrichWebsites(urls: string[]): Promise<Map<string, ScrapedWebsiteData>> {
    const results = new Map<string, ScrapedWebsiteData>();
    const failedForPlaywrightFallback: string[] = [];
    const self = this;

    console.log(`[Crawler Engine] Iniciando CheerioCrawler (Max concurrency: ${env.CRAWLER_MAX_CONCURRENCY})...`);

    const cheerioCrawler = new CheerioCrawler({
      maxConcurrency: env.CRAWLER_MAX_CONCURRENCY,
      requestHandlerTimeoutSecs: env.CRAWLER_TIMEOUT_SECS,
      maxRequestRetries: 1,

      async requestHandler({ request, $, response }) {
        const statusCode = response.statusCode;

        // Evaluar códigos de estado para activar fallback leyendo de env
        if (statusCode && env.FALLBACK_HTTP_CODES.includes(statusCode)) {
          console.warn(`[CheerioCrawler] Bloqueo HTTP ${statusCode} en ${request.url}. Marcando para fallback Playwright...`);
          failedForPlaywrightFallback.push(request.url);
          return;
        }

        const html = $.html();
        const text = $('body').text();
        const title = $('title').text().trim();

        const pageLinks: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) pageLinks.push(href);
        });

        // Aplicar método DRY de extracción
        const extracted = self.extractDataFromHTML(html, text, pageLinks);

        results.set(request.url, {
          url: request.url,
          ...extracted,
          title,
          crawlerUsed: 'Cheerio',
        });
      },

      async failedRequestHandler({ request, error }) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[CheerioCrawler] Error accediendo a ${request.url}: ${errMsg}. Programando fallback a Playwright.`);
        if (!failedForPlaywrightFallback.includes(request.url)) {
          failedForPlaywrightFallback.push(request.url);
        }
      },
    });

    await cheerioCrawler.run(urls);

    // Fallback con Playwright para URLs bloqueadas o fallidas
    if (failedForPlaywrightFallback.length > 0) {
      console.log(`[Crawler Engine] ⚠️ Ejecutando PlaywrightCrawler (Timeout: ${env.PLAYWRIGHT_TIMEOUT_SECS}s) para ${failedForPlaywrightFallback.length} URLs...`);

      const playwrightCrawler = new PlaywrightCrawler({
        maxConcurrency: Math.max(1, Math.floor(env.CRAWLER_MAX_CONCURRENCY / 2)),
        requestHandlerTimeoutSecs: env.PLAYWRIGHT_TIMEOUT_SECS,
        headless: true,

        async requestHandler({ request, page }) {
          const title = await page.title();
          const content = await page.content();
          const bodyText = await page.locator('body').innerText().catch(() => '');

          const hrefs = await page.$$eval('a[href]', elements =>
            elements.map(e => e.getAttribute('href')).filter((h): h is string => Boolean(h))
          );

          // Aplicar método DRY de extracción
          const extracted = self.extractDataFromHTML(content, bodyText, hrefs);

          results.set(request.url, {
            url: request.url,
            ...extracted,
            title,
            crawlerUsed: 'Playwright',
          });

          console.log(`[PlaywrightCrawler] Éxito extrayendo con navegador completo: ${request.url}`);
        },

        async failedRequestHandler({ request, error }) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(`[PlaywrightCrawler] Error definitivo al extraer ${request.url}:`, errMsg);
        },
      });

      await playwrightCrawler.run(failedForPlaywrightFallback);
    }

    return results;
  }
}
