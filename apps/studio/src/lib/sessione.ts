import type { Session } from '@supabase/supabase-js';
import { leggiClaims, type ClaimsApp } from '@pls/shared';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface StatoSessione {
  caricamento: boolean;
  sessione: Session | null;
  claims: ClaimsApp | null;
}

/** Sessione corrente e claim del JWT, aggiornati a ogni login, MFA o refresh. */
export function useSessione(): StatoSessione {
  const [stato, setStato] = useState<StatoSessione>({ caricamento: true, sessione: null, claims: null });

  useEffect(() => {
    const aggiorna = (sessione: Session | null) =>
      setStato({
        caricamento: false,
        sessione,
        claims: sessione ? leggiClaims(sessione.access_token) : null,
      });

    void supabase.auth.getSession().then(({ data }) => aggiorna(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => aggiorna(sessione));
    return () => data.subscription.unsubscribe();
  }, []);

  return stato;
}

export const esci = () => supabase.auth.signOut();
