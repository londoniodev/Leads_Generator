import { chromium, Browser } from 'playwright';

export interface DeepScrapedData {
  reviews: string[];
  popularTimes: string | null;
}

export class DeepScraperService {
  private static browserInstance: Browser | null = null;

  /**
   * Obtiene la instancia única compartida de Chromium Headless optimizado para bajo consumo de recursos.
   */
  private static async getBrowser(): Promise<Browser> {
    if (!this.browserInstance || !this.browserInstance.isConnected()) {
      console.log('🌐 [Deep Scraper] Inicializando instancia única de Chromium Headless...');
      this.browserInstance = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }
    return this.browserInstance;
  }

  /**
   * Extrae reseñas recientes y horas de mayor concurrencia desde la URL de Google Maps a costo cero.
   */
  public static async extractDeepData(url: string): Promise<DeepScrapedData> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    try {
      // Bloquear recursos pesados (imágenes, CSS, fuentes, media) para proteger RAM/CPU
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'media', 'font', 'other'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      console.log(`🔍 [Deep Scraper] Navegando a URL de Google Maps (Bloqueo de recursos activo)...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Esperar a que el contenedor principal o reseñas esté visible (Timeout máximo 10s)
      const mainSelector = 'div[role="main"], button[jsaction*="review"], .m6QEdf, h1';
      await page.waitForSelector(mainSelector, { timeout: 10000 }).catch(() => {
        console.warn('⚠️ [Deep Scraper] Selector principal no apareció en 10s, intentando extracción fallback...');
      });

      // Extraer texto de las últimas 3 reseñas
      const reviews = await page.$$eval(
        '.My5W2d, .wiWn18, span.wiWn18, .m6QEdf .fontBodyMedium',
        (els) =>
          els
            .map((e) => e.textContent?.trim() || '')
            .filter((text) => text.length > 10)
            .slice(0, 3)
      );

      // Extraer datos de horas de mayor concurrencia (Popular times / Busy times)
      const popularTimes = await page.evaluate(() => {
        const busyEl = document.querySelector('div[aria-label*="Popular times"], div[aria-label*="Concurrencia"], .t32esd');
        return busyEl ? busyEl.getAttribute('aria-label') || busyEl.textContent?.trim() || null : null;
      });

      console.log(`✅ [Deep Scraper] Extracción finalizada: ${reviews.length} reseñas obtenidas.`);

      return {
        reviews,
        popularTimes,
      };
    } catch (err: any) {
      console.error('❌ [Deep Scraper Error]:', err?.message || err);
      return {
        reviews: [],
        popularTimes: null,
      };
    } finally {
      // Cerrar la página y contexto, manteniendo abierta la instancia única del navegador
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  /**
   * Cierre limpio de Chromium al apagar el servidor o worker.
   */
  public static async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      console.log('🔌 [Deep Scraper] Cerrando instancia de Chromium Headless...');
      await this.browserInstance.close().catch(() => {});
      this.browserInstance = null;
    }
  }
}
