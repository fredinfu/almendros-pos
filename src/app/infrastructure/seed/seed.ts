import { DataRepository } from '../../domain/repository';
import {
  State,
  newId,
  now,
  brandSchema,
  categorySchema,
  productSchema,
  variantSchema,
} from '../../domain/models';
import catalog from './catalog.public.json';
export const CATALOG_SEED_VERSION = catalog.catalogSeedVersion;
export async function seedDatabase(repository: DataRepository): Promise<void> {
  await repository.transact((state) => {
    if (state.settings.length) return; // Never reapply a seed to an existing installation.
    const timestamp = now();
    state.brands.push(
      ...catalog.brands.map((b) =>
        brandSchema.parse({ ...b, createdAt: timestamp, updatedAt: timestamp }),
      ),
    );
    state.categories.push(...catalog.categories.map((c) => categorySchema.parse(c)));
    state.products.push(
      ...catalog.products.map((p) =>
        productSchema.parse({ ...p, createdAt: timestamp, updatedAt: timestamp }),
      ),
    );
    state.variants.push(
      ...catalog.variants.map((v) =>
        variantSchema.parse({ ...v, createdAt: timestamp, updatedAt: timestamp }),
      ),
    );
    state.locations.push({
      id: newId(),
      name: 'Almacén General',
      type: 'general',
      isActive: true,
      createdAt: timestamp,
    });
    state.settings.push({
      id: newId(),
      businessName: 'Almendros Coffee Co.',
      currency: 'HNL',
      locale: 'es-HN',
      timeZone: 'America/Tegucigalpa',
      schemaVersion: 1,
      catalogSeedVersion: CATALOG_SEED_VERSION,
      deviceInstallId: newId(),
      compactDisplay: false,
      backupReminderDays: 7,
    });
  });
}
export function generalLocation(state: State): string {
  return state.locations.find((l) => l.type === 'general')!.id;
}
