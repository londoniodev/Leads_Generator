import { parsePhoneNumberWithError, CountryCode } from 'libphonenumber-js';
import env from '../config/env.config.js';

/**
 * Normaliza cualquier número de teléfono al formato internacional E.164 (ej: +573001234567).
 * Retorna null si el teléfono no es válido.
 */
export function normalizePhoneE164(
  rawPhone: string | null | undefined,
  defaultCountry: CountryCode = env.DEFAULT_REGION_CODE as CountryCode
): string | null {
  if (!rawPhone) return null;

  // Limpiar caracteres ruidosos iniciales
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, ' ');
  if (!cleaned || cleaned.replace(/\D/g, '').length < 7) {
    return null;
  }

  try {
    const phoneNumber = parsePhoneNumberWithError(rawPhone, defaultCountry);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch (error) {
    // Si falla con el país por defecto, reintentar buscando el '+' explícito
    if (rawPhone.includes('+')) {
      try {
        const altPhone = parsePhoneNumberWithError(rawPhone);
        if (altPhone && altPhone.isValid()) {
          return altPhone.format('E.164');
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}
