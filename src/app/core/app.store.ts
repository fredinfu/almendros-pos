import { OrdersService } from '../domain/orders.service';
import { Injectable, InjectionToken, inject, signal, computed, DestroyRef } from '@angular/core';
import { DataRepository } from '../domain/repository';
import {
  emptyState,
  stock,
  State,
  grindOptions,
  saleAvailability,
  inventoryKnown,
  newId,
  now,
  Settings,
  settingsSchema,
} from '../domain/models';
import { CatalogService } from '../domain/catalog.service';
import { InventoryService } from '../domain/inventory.service';
import { EventsService } from '../domain/events.service';
import { SalesService } from '../domain/sales.service';
import { BackupService, csvRows, toCsv } from '../domain/backups';
import { eventReport } from '../domain/reports';
import { seedDatabase } from '../infrastructure/seed/seed';
import { api, command, remoteService, serverMode, serverSession } from './server-connection';

export const DATA_REPOSITORY = new InjectionToken<DataRepository>('DATA_REPOSITORY');
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly serverMode = serverMode();
  readonly session = serverSession();
  private readonly repository = inject(DATA_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);
  readonly data = signal<State>(emptyState());
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly eventId = signal('');
  readonly online = signal(navigator.onLine);
  readonly event = computed(() => this.data().events.find((e) => e.id === this.eventId()));
  readonly report = computed(() => eventReport(this.data(), this.eventId()));
  readonly general = computed(() => this.data().locations.find((l) => l.type === 'general'));
  readonly backupDue = computed(() => {
    const settings = this.data().settings[0];
    return (
      !settings?.lastBackupAt ||
      Date.now() - Date.parse(settings.lastBackupAt) >= settings.backupReminderDays * 86400000
    );
  });
  readonly catalog = this.serverMode ? remoteService<CatalogService>('catalog') : new CatalogService(this.repository);
  readonly inventory = this.serverMode ? remoteService<InventoryService>('inventory') : new InventoryService(this.repository);
  readonly events = this.serverMode ? remoteService<EventsService>('events') : new EventsService(this.repository);
  readonly sales = this.serverMode ? remoteService<SalesService>('sales') : new SalesService(this.repository);
  readonly orders = this.serverMode ? remoteService<OrdersService>('orders') : new OrdersService(this.repository);
  readonly backups = this.serverMode ? {
    preview: (json:string) => new BackupService(this.repository).preview(json),
    export: () => api<Awaited<ReturnType<BackupService['export']>>>('/backups'),
    restore: (backup:Parameters<BackupService['restore']>[0]) => command<void>('imports','restore',[backup]),
  } : new BackupService(this.repository);
  readonly variants = computed(() =>
    this.data()
      .variants.map((variant) => {
        const product = this.data().products.find((p) => p.id === variant.productId)!;
        const brand = this.data().brands.find((b) => b.id === product.brandId)!;
        const category = this.data().categories.find((c) => c.id === product.categoryId)!;
        return {
          ...variant,
          product,
          brand,
          category,
          label: variant.name === 'Única' ? product.name : `${product.name} · ${variant.name}`,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.sortOrder - b.sortOrder),
  );
  constructor() {
    const connection = () => this.online.set(navigator.onLine);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    });
  }
  async initialize(): Promise<void> {
    try {
      if (!this.serverMode) await seedDatabase(this.repository);
      this.data.set(await this.repository.read());
      const selected = localStorage.getItem('almendros.event') ?? '';
      this.eventId.set(this.data().events.some((e) => e.id === selected) ? selected : '');
      const unsubscribe = this.repository.observe(
        (state) => this.data.set(state),
        (error) => this.error.set(String(error)),
      );
      this.destroyRef.onDestroy(unsubscribe);
      this.ready.set(true);
    } catch (error) {
      this.error.set(`No se pudo abrir el almacenamiento: ${this.errorText(error)}`);
    }
  }
  async run(operation: () => Promise<unknown>, message = 'Cambios guardados.'): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
      this.data.set(await this.repository.read());
      this.notice.set(message);
      return true;
    } catch (error) {
      this.error.set(this.errorText(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
  selectEvent(id: string): void {
    this.eventId.set(id);
    localStorage.setItem('almendros.event', id);
  }
  availability(id: string): number | undefined {
    return saleAvailability(this.data(), id, this.eventId());
  }
  known(id: string): boolean {
    return inventoryKnown(this.data(), id);
  }
  options(productId: string): string[] {
    const p = this.data().products.find((p) => p.id === productId);
    return p ? grindOptions(p, this.data().variants) : [];
  }
  readonly categories = computed(() =>
    [...this.data().categories].sort((a, b) => {
      const priority = ['Café empacado', 'Bebidas', 'Coffee Pods', 'Mercadería', 'Otros'];
      return priority.indexOf(a.name) - priority.indexOf(b.name);
    }),
  );
  stock(variantId: string, locationId = this.event()?.stockLocationId ?? ''): number {
    return stock(this.data(), variantId, locationId);
  }
  money(value: number | undefined): string {
    return value === undefined
      ? 'Sin configurar'
      : new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(value / 100);
  }
  date(value: string | undefined): string {
    return value
      ? new Intl.DateTimeFormat('es-HN', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: this.data().settings[0]?.timeZone ?? 'America/Tegucigalpa',
        }).format(new Date(value))
      : '—';
  }
  download(name: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async exportBackup(): Promise<void> {
    await this.run(async () => {
      const backup = await this.backups.export();
      this.download(
        `almendros-pos-backup-${now().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      );
      if (this.serverMode) await this.saveSettings({...this.data().settings[0],lastBackupAt:now()});
      else await this.repository.transact((state) => { state.settings[0].lastBackupAt = now(); });
    }, 'Respaldo generado. Compruebe que el archivo se haya guardado.');
  }
  exportCsv(kind: string, eventId = this.eventId()): void {
    this.download(
      `almendros-${kind}-${now().slice(0, 10)}.csv`,
      toCsv(csvRows(this.data(), kind, eventId)),
      'text/csv;charset=utf-8',
    );
  }
  async saveSettings(input: Settings): Promise<void> {
    const settings = settingsSchema.parse(input);
    if (this.serverMode) return command<void>('settings','save',[settings]);
    await this.repository.transact((state) => {
      Object.assign(state.settings[0], settings);
    });
  }
  newId = newId;
  async logout(): Promise<void> {
    await api('/auth/logout',{});
    delete window.__ALMENDROS_SESSION__;
    location.reload();
  }
}
