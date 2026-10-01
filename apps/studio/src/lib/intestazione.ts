import type { Pediatra, Studio } from '@pls/shared';
import { q, useDati } from './dati';
import { supabase } from './supabase';

/** Dati dello studio e del pediatra indicato, per intestazioni e firma dei documenti. */
export function useIntestazione(pediatraId: string | null | undefined) {
  const studio = useDati(() => q<Studio>(supabase.schema('anagrafica').from('studi').select('*').single()), []);
  const medico = useDati(
    async () => (pediatraId ? q<Pediatra>(supabase.schema('anagrafica').from('pediatri').select('*').eq('id', pediatraId).single()) : null),
    [pediatraId],
  );
  return { studio: studio.dati, medico: medico.dati };
}
