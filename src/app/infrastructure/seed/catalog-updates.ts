import { Product, Variant, now } from '../../domain/models';

export const BLENDED_ONE_DESCRIPTION =
  'Café de especialidad: blend de Geisha proceso honey y Catimor proceso natural.';

/** One-time owner-requested catalog correction. Never merges stock or rewrites sales. */
export function updateBlendedOneCatalog(products: Product[], variants: Variant[]): void {
  for (const product of products) {
    const presentations = variants.filter((v) => v.productId === product.id);
    const current =
      presentations.find((v) => v.sku === 'AL-BO-2') ??
      (/^blended ones?$/i.test(product.name.trim())
        ? presentations.find((v) => v.name.trim() === '250 g')
        : undefined);
    if (!current) continue;
    const timestamp = now();
    product.name = 'Blended One';
    product.description = BLENDED_ONE_DESCRIPTION;
    product.updatedAt = timestamp;
    current.priceMinor = 24500;
    delete current.unitCostMinor;
    current.updatedAt = timestamp;
    for (const old of presentations.filter(
      (v) => v.id !== current.id && v.sku === 'AL-BO-1' && v.name === '227 g',
    )) {
      old.isActive = false;
      old.updatedAt = timestamp;
    }
  }
}
