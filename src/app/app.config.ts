import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { DATA_REPOSITORY } from './core/app.store';
import { DexieRepository } from './infrastructure/repositories/dexie.repository';
import { createDatabase } from './infrastructure/indexeddb/database';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    { provide: DATA_REPOSITORY, useFactory: () => new DexieRepository(createDatabase()) },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
