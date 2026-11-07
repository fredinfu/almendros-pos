import { Injectable, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';

export const PAYMENT_CHOICES = [
  { method: 'bac', name: 'BAC' },
  { method: 'ficohsa', name: 'Ficohsa' },
  { method: 'atlantida', name: 'Banco Atlántida' },
  { method: 'kash', name: 'Kash' },
];
export interface LocalAccount {
  method: string;
  code: string;
  holder: string;
}
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
  private readonly db = new Dexie('almendros-payment-vault');
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
    return JSON.parse(new TextDecoder().decode(bytes)) as LocalAccount[];
  }
  async save(eventId: string, accounts: LocalAccount[]): Promise<void> {
    if (
      accounts.some(
        (a) =>
          !PAYMENT_CHOICES.some((p) => p.method === a.method) ||
          !a.code.trim() ||
          a.code.length > 100 ||
          !a.holder.trim() ||
          a.holder.length > 150,
      )
    )
      throw new Error('Completa cuenta o usuario y titular de cada método habilitado.');
    const key = await this.key();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(eventId) },
      key,
      new TextEncoder().encode(JSON.stringify(accounts)),
    );
    await this.records.put({ id: eventId, iv, data });
    this.revision.update((n) => n + 1);
  }
}
