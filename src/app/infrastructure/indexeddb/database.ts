import Dexie from 'dexie';
import { Product, Variant } from '../../domain/models';
import { updateBlendedOneCatalog } from '../seed/catalog-updates';

export function createDatabase(name = 'almendros-pos'): Dexie {
  const database = new Dexie(name);
  database.version(1).stores({
    brands: 'id,&slug',
    categories: 'id,&name',
    products: 'id,brandId,categoryId',
    variants: 'id,&sku,productId',
    locations: 'id,type,eventId',
    movements: 'id,variantId,fromLocationId,toLocationId,eventId,saleId,referenceId',
    events: 'id,status',
    expenses: 'id,eventId',
    sales: 'id,&receiptNumber,eventId,status',
    items: 'id,saleId,variantId',
    payments: 'id,saleId',
    settings: 'id',
  });
  // Database version and backup format are independent: this changes data, not its shape.
  database
    .version(2)
    .stores({})
    .upgrade(async (transaction) => {
      const products = await transaction.table<Product>('products').toArray();
      const variants = await transaction.table<Variant>('variants').toArray();
      updateBlendedOneCatalog(products, variants);
      await transaction.table('products').bulkPut(products);
      await transaction.table('variants').bulkPut(variants);
    });
  // Additive only: preserve every existing catalog, sale and ledger record.
  database.version(3).stores({ inventoryCounts: 'id,variantId,locationId' });
  database.version(4).stores({ orders: 'id,eventId,status,saleId' });
  return database;
}
