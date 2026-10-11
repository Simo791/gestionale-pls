import type { RuoloApp, UUID } from './tipi';

/** Claim del JWT di Supabase che usiamo nell'interfaccia (aggiunti dall'Auth Hook). */
export interface ClaimsApp {
  sub: UUID;
  email?: string;
  aal: 'aal1' | 'aal2';
  app_ruolo: RuoloApp;
  app_studio_id?: UUID;
  /** Amministratore dello studio: può fare tutto (mai la segreteria). */
  app_admin: boolean;
  /** Vede la sezione Allergologia (modulo attivo + amministratore o allergologo accettato). */
  app_allergologia: boolean;
  /** Segreteria autorizzata da un pediatra a consultare le cartelle (sola lettura). */
  app_cartelle: boolean;
}

const RUOLI: readonly RuoloApp[] = ['pediatra', 'segreteria', 'sostituto', 'allergologo', 'tutore', 'nessuno'];

/**
 * Legge i claim dal token di accesso SENZA verificarne la firma.
 * Serve solo a decidere cosa mostrare: la sicurezza vera la fanno le policy RLS
 * nel database, che verificano il token a ogni richiesta.
 */
export function leggiClaims(accessToken: string): ClaimsApp | null {
  const parti = accessToken.split('.');
  const payload = parti[1];
  if (parti.length !== 3 || !payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0)),
    );
    const dati = JSON.parse(json) as Record<string, unknown>;
    const ruolo = RUOLI.includes(dati.app_ruolo as RuoloApp) ? (dati.app_ruolo as RuoloApp) : 'nessuno';
    if (typeof dati.sub !== 'string') return null;
    return {
      sub: dati.sub,
      email: typeof dati.email === 'string' ? dati.email : undefined,
      aal: dati.aal === 'aal2' ? 'aal2' : 'aal1',
      app_ruolo: ruolo,
      app_studio_id: typeof dati.app_studio_id === 'string' ? dati.app_studio_id : undefined,
      app_admin: dati.app_admin === true && (ruolo === 'pediatra' || ruolo === 'sostituto' || ruolo === 'allergologo'),
      app_allergologia: dati.app_allergologia === true && ruolo !== 'tutore' && ruolo !== 'segreteria',
      app_cartelle: dati.app_cartelle === true && ruolo === 'segreteria',
    };
  } catch {
    return null;
  }
}

export const isStaff = (ruolo: RuoloApp): boolean =>
  ruolo === 'pediatra' || ruolo === 'segreteria' || ruolo === 'sostituto';

/** Chi può usare l'app dello studio: lo staff e l'allergologo (solo modulo Allergologia). */
export const usaAppStudio = (ruolo: RuoloApp): boolean => isStaff(ruolo) || ruolo === 'allergologo';

/**
 * Tutto lo staff usa il secondo fattore (TOTP). Per i dati clinici è il database
 * a imporlo (aal2 nelle policy); qui lo chiediamo anche alla segreteria.
 */
export const richiedeMfa = (ruolo: RuoloApp): boolean => usaAppStudio(ruolo);
