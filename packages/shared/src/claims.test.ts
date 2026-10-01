import { describe, expect, it } from 'vitest';
import { leggiClaims, richiedeMfa } from './claims';

const b64url = (o: object) =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.firma`;

describe('leggiClaims', () => {
  it('legge ruolo, studio e livello MFA', () => {
    const c = leggiClaims(
      token({ sub: 'u1', aal: 'aal2', app_ruolo: 'pediatra', app_studio_id: 's1', email: 'a@b.it' }),
    );
    expect(c).toEqual({ sub: 'u1', email: 'a@b.it', aal: 'aal2', app_ruolo: 'pediatra', app_studio_id: 's1', app_admin: false });
  });

  it('tratta un ruolo sconosciuto come "nessuno"', () => {
    expect(leggiClaims(token({ sub: 'u1', app_ruolo: 'admin' }))?.app_ruolo).toBe('nessuno');
  });

  it('restituisce null per un token malformato', () => {
    expect(leggiClaims('non-un-token')).toBeNull();
  });
});

describe('richiedeMfa', () => {
  it('vale per tutto lo staff, non per i genitori', () => {
    expect(richiedeMfa('pediatra')).toBe(true);
    expect(richiedeMfa('segreteria')).toBe(true);
    expect(richiedeMfa('tutore')).toBe(false);
  });
  it('app_admin vale solo per il pediatra', () => {
    expect(leggiClaims(token({ sub: 'u1', app_ruolo: 'pediatra', app_admin: true }))?.app_admin).toBe(true);
    expect(leggiClaims(token({ sub: 'u1', app_ruolo: 'segreteria', app_admin: true }))?.app_admin).toBe(false);
  });
});
