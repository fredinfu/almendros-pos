import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const id = z.uuid(),
  text = z.string().max(200),
  money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const brand = z.object({
  id,
  name: text,
  slug: text,
  description: z.string().max(2000).optional(),
  isActive: z.boolean(),
});
const category = z.object({ id, name: text, sortOrder: z.number().int(), isActive: z.boolean() });
const product = z.object({
  id,
  brandId: id,
  categoryId: id,
  name: text,
  description: z.string().max(2000),
  productType: z.enum(['packaged_coffee', 'coffee_pod', 'beverage', 'merchandise', 'other']),
  tags: z.array(text),
  grindOptions: z.array(text).optional(),
  isActive: z.boolean(),
});
const variant = z.object({
  id,
  productId: id,
  name: text,
  sku: text,
  weightValue: z.number().positive().optional(),
  weightUnit: z.enum(['g', 'lb', 'ml']).optional(),
  grindOption: text.optional(),
  process: text.optional(),
  priceMinor: money.optional(),
  compareAtPriceMinor: money.optional(),
  packUnits: z.number().int().positive().optional(),
  trackInventory: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
// Object schemas strip every field not explicitly approved here, including unitCostMinor,
// timestamps, settings, payment evidence and any operational data at every level.
export function sanitizeCatalog(backup, version = '2026-11-07.1') {
  const data = z
    .object({
      brands: z.array(brand),
      categories: z.array(category),
      products: z.array(product),
      variants: z.array(variant),
    })
    .parse(backup.data);
  for (const key of Object.keys(data))
    if (new Set(data[key].map((x) => x.id)).size !== data[key].length)
      throw new Error('IDs duplicados en catálogo.');
  for (const p of data.products)
    if (
      !data.brands.some((b) => b.id === p.brandId) ||
      !data.categories.some((c) => c.id === p.categoryId)
    )
      throw new Error('Producto sin marca/categoría.');
  for (const v of data.variants)
    if (!data.products.some((p) => p.id === v.productId))
      throw new Error('Presentación sin producto.');
  if (new Set(data.variants.map((v) => v.sku)).size !== data.variants.length)
    throw new Error('Códigos duplicados.');
  return { catalogSeedVersion: version, ...data };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, version] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      'Uso: node scripts/catalog-seed.mjs <respaldo-privado.json> <salida.json> [versión]',
    );
  const seed = sanitizeCatalog(JSON.parse(await readFile(input, 'utf8')), version);
  await writeFile(output, JSON.stringify(seed, null, 2) + '\n');
  console.log(
    `Catálogo público: ${seed.products.length} productos / ${seed.variants.length} presentaciones. Sin operaciones, costos ni configuración privada.`,
  );
}
