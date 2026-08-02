import { parsePhoneNumberWithError, CountryCode } from 'libphonenumber-js';
import env from '../config/env.config.js';

/**
 * Normaliza cualquier número de teléfono al formato internacional E.164 (ej: +573001234567).
 * Forzado a usar 'CO' como país por defecto si no detecta código internacional.
 * Retorna null si la validación E.164 falla.
 */
export function normalizePhoneE164(
  rawPhone: string | null | undefined,
  defaultCountry: CountryCode = 'CO'
): string | null {
  if (!rawPhone) return null;

  // Limpiar caracteres ruidosos iniciales
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, ' ');
  if (!cleaned || cleaned.replace(/\D/g, '').length < 7) {
    return null;
  }

  const countryToUse: CountryCode = (defaultCountry || env.DEFAULT_REGION_CODE || 'CO').toUpperCase() as CountryCode;

  try {
    const phoneNumber = parsePhoneNumberWithError(rawPhone, countryToUse);
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
