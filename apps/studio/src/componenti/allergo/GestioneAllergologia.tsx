import type { ClaimsApp } from '@pls/shared';
import GestioneModulo, { MODULO_ALLERGOLOGIA } from '../GestioneModulo';

/** Amministratore: attiva il modulo Allergologia e accetta chi può usarlo. */
export default function GestioneAllergologia({ claims }: { claims: ClaimsApp }) {
  return <GestioneModulo claims={claims} modulo={MODULO_ALLERGOLOGIA} />;
}
