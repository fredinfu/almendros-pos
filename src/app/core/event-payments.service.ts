import { Injectable, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { serverSession } from './server-connection';

import {
  BusinessProfile,
  LocalAccount,
  defaultProfile,
  profileSchema,
} from '../domain/communication';
export { PAYMENT_CHOICES, type LocalAccount } from '../domain/communication';
interface Sealed {
  id: string;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}
// Separate device-only vault: deliberately excluded from operational JSON backups.
@Injectable({ providedIn: 'root' })
export class EventPaymentsService {
  readonly request = signal<{ eventId: string; openAfter?: boolean } | undefined>(undefined);
  readonly revision = signal(0);
  private readonly db = new Dexie(serverSession() ? `almendros-vault-${serverSession()!.businessId}` : 'almendros-payment-vault');
  private readonly records: Table<Sealed, string>;
  private readonly keys: Table<{ id: string; key: CryptoKey }, string>;
  constructor() {
    this.db.version(1).stores({ records: 'id', keys: 'id' });
    this.records = this.db.table('records');
    this.keys = this.db.table('keys');
  }
  private async key(): Promise<CryptoKey> {
    const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    return this.db.transaction('rw', this.keys, async () => {
      const found = await this.keys.get('device');
      if (found) return found.key;
      await this.keys.put({ id: 'device', key: candidate });
      return candidate;
    });
  }
  async read(eventId: string): Promise<LocalAccount[] | undefined> {
    return (await this.readProfile(eventId))?.accounts;
  }
  async readProfile(eventId: string): Promise<BusinessProfile | undefined> {
    if (!eventId) return undefined;
    const sealed = await this.records.get(eventId);
    if (!sealed) return undefined;
    const key = await this.keys.get('device');
    if (!key) throw new Error('No se puede abrir la configuración local. Vuelve a configurarla.');
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: new TextEncoder().encode(eventId) },
      key.key,
      sealed.data,
    );
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return profileSchema.parse(
      Array.isArray(value) ? { ...defaultProfile(), accounts: value } : value,
    );
  }
  async save(eventId: string, accounts: LocalAccount[], details = defaultProfile()): Promise<void> {
    if (accounts.some((a) => !a.code.trim() || !a.holder.trim()))
      throw new Error('Completa cuenta o usuario y titular de cada método habilitado.');
    if (!/^[1-9][0-9]{7,14}$/.test(details.whatsapp))
      throw new Error('Indica el WhatsApp del negocio con código de país.');
    const profile = profileSchema.parse({ ...details, accounts });
    const key = await this.key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(eventId) },
      key,
      new TextEncoder().encode(JSON.stringify(profile)),
    );
    await this.records.put({ id: eventId, iv, data });
    this.revision.update((n) => n + 1);
  }
}
