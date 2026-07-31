/**
 * Expresión regular para detectar direcciones de correo electrónico.
 */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Ignorar imágenes, assets y emails genéricos irrelevantes de desarrolladores o librerías.
 */
const IGNORED_DOMAINS_OR_EXT = [
  'sentry.io', 'wixpress.com', 'domain.com', 'example.com', 'schema.org',
  'png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'js', 'css'
];

/**
 * Extrae y valida correos electrónicos únicos a partir de un bloque de texto o HTML.
 */
export function extractEmails(text: string): string[] {
  if (!text) return [];

  const matches = text.match(EMAIL_REGEX) || [];
  const validEmails = new Set<string>();

  for (let email of matches) {
    const lower = email.toLowerCase().trim();

    // Comprobar extensiones falsas (ej: logo@2x.png)
    const ext = lower.split('.').pop() || '';
    if (IGNORED_DOMAINS_OR_EXT.includes(ext)) continue;

    // Comprobar dominios ignorados
    const domain = lower.split('@')[1] || '';
    if (IGNORED_DOMAINS_OR_EXT.some(ignored => domain.includes(ignored))) continue;

    validEmails.add(lower);
  }

  return Array.from(validEmails);
}

/**
 * Sanitiza un correo individual.
 */
export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const emails = extractEmails(email);
  return emails.length > 0 ? emails[0] : null;
}
