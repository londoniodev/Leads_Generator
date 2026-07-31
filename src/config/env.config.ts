import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const numericArraySchema = z.union([
  z.array(z.number()),
  z.string().transform((val, ctx) => {
    try {
      const clean = val.replace(/[\[\]]/g, '');
      if (!clean.trim()) return [401, 403, 429];
      return clean.split(',').map(item => {
        const num = Number(item.trim());
        if (isNaN(num)) throw new Error();
        return num;
      });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FALLBACK_HTTP_CODES debe ser una lista de números separados por coma o JSON array.',
      });
      return z.NEVER;
    }
  }),
]).default([401, 403, 429]);

/**
 * Esquema Zod de validación estricta para variables de entorno.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().positive().default(3000),
  DEFAULT_REGION_CODE: z.string().min(2).max(3).default('CO'),
  CRAWLER_MAX_CONCURRENCY: z.coerce.number().positive().default(5),
  CRAWLER_TIMEOUT_SECS: z.coerce.number().positive().default(15),
  PLAYWRIGHT_TIMEOUT_SECS: z.coerce.number().positive().default(30),
  FALLBACK_HTTP_CODES: numericArraySchema,
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Configuración de variables de entorno inválida:', _env.error.format());
  throw new Error('Variables de entorno no válidas');
}

export const env = _env.data;
export default env;
