import { z } from 'zod';

/** Email per il login con codice (OTP). */
export const schemaEmail = z.object({
  email: z.string().trim().toLowerCase().min(3, 'Inserisci la tua email').email('Email non valida'),
});

/** Codice a 6 cifre: usato sia per l'OTP via email sia per il TOTP dell'app di autenticazione. */
export const schemaCodice = z.object({
  codice: z.string().trim().regex(/^\d{6}$/, 'Il codice è di 6 cifre'),
});

/**
 * Codice fiscale: controllo solo di forma (16 caratteri alfanumerici).
 * Nel progetto portfolio i codici sono volutamente non validi, quindi niente checksum.
 */
export const schemaCodiceFiscale = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{16}$/, 'Il codice fiscale ha 16 caratteri');
