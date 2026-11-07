import { Injectable, inject, signal, DestroyRef, isDevMode } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

interface Manifest {
  hashTable: Record<string, string>;
  index: string;
}
@Injectable({ providedIn: 'root' })
export class OfflineService {
  readonly ready = signal(false);
  readonly checking = signal(false);
  readonly updateAvailable = signal(false);
  readonly message = signal(
    isDevMode() ? 'Modo desarrollo · caché offline no habilitada' : 'Preparando uso sin internet…',
  );
  private readonly updates = inject(SwUpdate);
  private readonly destroy = inject(DestroyRef);
  constructor() {
    if (!this.updates.isEnabled || !('caches' in window)) return;
    const subscription = this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.updateAvailable.set(true);
      void this.check();
    });
    const refresh = () => void this.check();
    navigator.serviceWorker.addEventListener('controllerchange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    void navigator.serviceWorker.ready.then(refresh);
    const timer = setInterval(refresh, 30000);
    this.destroy.onDestroy(() => {
      clearInterval(timer);
      subscription.unsubscribe();
      navigator.serviceWorker.removeEventListener('controllerchange', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    });
  }
  async check(): Promise<void> {
    if (!this.updates.isEnabled || this.checking()) return;
    this.checking.set(true);
    try {
      if (!navigator.serviceWorker.controller) {
        this.ready.set(false);
        this.message.set('Preparando uso sin internet…');
        return;
      }
      const url = new URL('ngsw.json', document.baseURI);
      const metadata = await caches.open(
        'almendros-offline-manifest:' + new URL(document.baseURI).pathname,
      );
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          cache: 'no-store',
          headers: { 'ngsw-bypass': 'true' },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Manifest no disponible');
        await metadata.put(url, response.clone());
      } catch {
        response = await metadata.match(url);
      }
      if (!response) throw new Error('Caché pendiente');
      const manifest = (await response.json()) as Manifest;
      const entries = Object.entries(manifest.hashTable);
      if (!entries.length || !manifest.hashTable[manifest.index])
        throw new Error('Manifest incompleto');
      const stores = await Promise.all(
        (await caches.keys()).filter((k) => k.startsWith('ngsw:')).map((k) => caches.open(k)),
      );
      for (const [path, expected] of entries) {
        const asset = new URL(path, location.origin);
        if (asset.origin !== location.origin) throw new Error('Recurso externo');
        let verified = false;
        for (const cache of stores) {
          const cached = await cache.match(asset);
          if (!cached) continue;
          const digest = await crypto.subtle.digest('SHA-1', await cached.arrayBuffer());
          const hash = Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          if (hash === expected) {
            verified = true;
            break;
          }
        }
        if (!verified) throw new Error('Descarga de recursos pendiente');
      }
      this.ready.set(true);
      this.message.set('Lista para usar sin internet · Sin sincronización');
    } catch {
      this.ready.set(false);
      this.message.set('Uso sin internet aún no verificado. Conecta y vuelve a comprobar.');
    } finally {
      this.checking.set(false);
    }
  }
  reload(): void {
    if (
      window.confirm(
        'Termina o cancela el cobro actual antes de actualizar. Los registros guardados se conservan; el carrito sin cobrar se vaciará. ¿Actualizar ahora?',
      )
    )
      location.reload();
  }
}
