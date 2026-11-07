import { it, expect } from 'vitest';
import { createDatabase } from '../src/app/infrastructure/indexeddb/database';
import { DexieRepository } from '../src/app/infrastructure/repositories/dexie.repository';
import { seedDatabase } from './fixtures/legacy-seed';
import { InventoryService } from '../src/app/domain/inventory.service';
import { EventsService } from '../src/app/domain/events.service';
import { SalesService } from '../src/app/domain/sales.service';
import { BackupService } from '../src/app/domain/backups';
import { newId } from '../src/app/domain/models';

it('rechaza respaldos que desvían el descuento de una venta a otra ubicación', async () => {
  const database = createDatabase(`integrity-${newId()}`);
  try {
    const repository = new DexieRepository(database);
    await seedDatabase(repository);
    const state = await repository.read();
    const pod = state.variants.find((v) => v.sku === 'AL-POD-1')!;
    const general = state.locations[0].id;
    const inventory = new InventoryService(repository);
    const events = new EventsService(repository);
    const eventId = await events.create({ id: newId(), name: 'Prueba' });
    await inventory.record({
      id: newId(),
      variantId: pod.id,
      locationId: general,
      type: 'restock',
      quantity: 60,
      note: 'Prueba',
    });
    await inventory.transfer({ id: newId(), variantId: pod.id, eventId, quantity: 30 });
    await events.open(eventId);
    await new SalesService(repository).checkout({
      id: newId(),
      eventId,
      lines: [{ variantId: pod.id, quantity: 1, expectedPriceMinor: 3500 }],
      discountMinor: 0,
      method: 'cash',
    });
    const backups = new BackupService(repository);
    const backup = await backups.export();
    backup.data.movements.find((m) => m.type === 'sale')!.fromLocationId = general;
    await expect(backups.restore(backup)).rejects.toThrow('Movimientos de venta');
    expect((await repository.read()).sales).toHaveLength(1);
  } finally {
    await database.delete();
  }
});

it('rechaza una salida histórica anterior a la entrada que la cubre', async () => {
  const database = createDatabase(`integrity-${newId()}`);
  try {
    const repository = new DexieRepository(database);
    await seedDatabase(repository);
    const state = await repository.read();
    const pod = state.variants.find((v) => v.sku === 'AL-POD-1')!;
    const general = state.locations[0].id;
    const inventory = new InventoryService(repository);
    await inventory.record({
      id: newId(),
      variantId: pod.id,
      locationId: general,
      type: 'restock',
      quantity: 2,
      note: 'Prueba',
    });
    await inventory.record({
      id: newId(),
      variantId: pod.id,
      locationId: general,
      type: 'waste',
      quantity: 1,
      note: 'Prueba',
    });
    const backups = new BackupService(repository);
    const backup = await backups.export();
    backup.data.movements.find((m) => m.type === 'restock')!.occurredAt =
      '2099-01-01T00:00:00.000Z';
    await expect(backups.restore(backup)).rejects.toThrow('históricas negativas');
  } finally {
    await database.delete();
  }
});
