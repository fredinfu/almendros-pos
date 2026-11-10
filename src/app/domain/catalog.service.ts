import { DataRepository } from './repository';
import {
  Product,
  Variant,
  productSchema,
  variantSchema,
  mustFind,
  requireRule,
  now,
  newId,
} from './models';

export class CatalogService {
  setVariantActive(id: string, isActive: boolean): Promise<void> {
    return this.repository.transact((state) => {
      const variant = mustFind(state.variants, id);
      requireRule(
        !isActive || mustFind(state.products, variant.productId).isActive,
        'Activa primero el producto desde Editar.',
      );
      variant.isActive = isActive;
      variant.updatedAt = new Date().toISOString();
    });
  }
  deleteVariant(id: string): Promise<void> {
    return this.repository.transact((state) => {
      const variant = mustFind(state.variants, id);
      requireRule(
        !state.inventoryCounts.some((c) => c.variantId === id) &&
          !state.movements.some((m) => m.variantId === id) &&
          !state.orders.some((o) => o.lines.some((l) => l.variantId === id)) &&
          !state.items.some((i) => i.variantId === id),
        'Esta presentación tiene movimientos o ventas. Desactívala para conservar el historial.',
      );
      state.variants = state.variants.filter((v) => v.id !== id);
      if (!state.variants.some((v) => v.productId === variant.productId))
        state.products = state.products.filter((p) => p.id !== variant.productId);
    });
  }
  setProductActive(id: string, active: boolean): Promise<void> {
    return this.repository.transact((state) => {
      const p = mustFind(state.products, id);
      p.isActive = active;
      p.updatedAt = now();
    });
  }
  deleteProduct(id: string): Promise<void> {
    return this.repository.transact((state) => {
      mustFind(state.products, id);
      const ids = new Set(state.variants.filter((v) => v.productId === id).map((v) => v.id));
      requireRule(
        !state.movements.some((m) => ids.has(m.variantId)) &&
          !state.orders.some((o) => o.lines.some((l) => ids.has(l.variantId))) &&
          !state.items.some((i) => ids.has(i.variantId)) &&
          !state.inventoryCounts.some((c) => ids.has(c.variantId)),
        'Este producto tiene historial. Desactívalo para conservarlo.',
      );
      state.variants = state.variants.filter((v) => !ids.has(v.id));
      state.products = state.products.filter((p) => p.id !== id);
    });
  }
  constructor(private readonly repository: DataRepository) {}
  createSimple(
    input: Product,
    priceMinor?: number,
    presentation?: string,
    packUnits?: number,
  ): Promise<void> {
    const product = productSchema.parse({
      ...input,
      ...(input.productType === 'packaged_coffee'
        ? { grindOptions: input.grindOptions ?? ['Molido'] }
        : {}),
    });
    return this.repository.transact((state) => {
      requireRule(!state.products.some((p) => p.id === product.id), 'El producto ya existe.');
      mustFind(state.brands, product.brandId);
      mustFind(state.categories, product.categoryId);
      const id = newId();
      const variant = variantSchema.parse({
        id,
        productId: product.id,
        sku: 'AUTO-' + id.toUpperCase(),
        ...(packUnits ? { packUnits } : {}),
        name:
          presentation?.trim() ||
          (product.productType === 'beverage'
            ? 'Vaso'
            : ['coffee_pod', 'merchandise'].includes(product.productType)
              ? 'Individual'
              : 'Única'),
        ...(priceMinor !== undefined ? { priceMinor } : {}),
        trackInventory: product.productType !== 'beverage',
        isActive: true,
        sortOrder: 0,
        createdAt: now(),
        updatedAt: now(),
      });
      if (
        ['coffee_pod', 'merchandise'].includes(product.productType) &&
        /bolsa|paquete|pack/i.test(variant.name)
      )
        requireRule(variant.packUnits, 'Indique las unidades reales del paquete.');
      state.products.push(product);
      state.variants.push(variant);
    });
  }
  saveProduct(input: Product): Promise<void> {
    const product = productSchema.parse(input);
    return this.repository.transact((state) => {
      mustFind(state.brands, product.brandId);
      mustFind(state.categories, product.categoryId);
      const old = state.products.find((p) => p.id === product.id);
      if (old) Object.assign(old, product, { createdAt: old.createdAt });
      else
        state.products.push({
          ...product,
          ...(product.productType === 'packaged_coffee'
            ? { grindOptions: product.grindOptions ?? ['Molido'] }
            : {}),
        });
    });
  }
  saveVariant(input: Omit<Variant, 'sku'> & { sku?: string }): Promise<void> {
    // An optional operator code; a stable internal fallback keeps existing backups compatible.
    const variant = variantSchema.parse({
      ...input,
      sku: input.sku?.trim().toUpperCase() || `AUTO-${input.id.toUpperCase()}`,
    });
    return this.repository.transact((state) => {
      const product = mustFind(state.products, variant.productId);
      requireRule(
        !state.variants.some((v) => v.id !== variant.id && v.sku === variant.sku),
        'El SKU ya existe.',
      );
      if (
        ['coffee_pod', 'merchandise'].includes(product.productType) &&
        /bolsa|paquete|pack/i.test(variant.name) &&
        variant.priceMinor !== undefined
      )
        requireRule(variant.packUnits, 'Indique cuántos pods contiene el paquete.');
      const old = state.variants.find((v) => v.id === variant.id);
      if (old) {
        requireRule(
          old.productId === variant.productId,
          'No se puede cambiar el producto de una variante.',
        );
        requireRule(
          old.trackInventory === variant.trackInventory ||
            (!state.movements.some((m) => m.variantId === old.id) &&
              !state.orders.some((o) => o.lines.some((l) => l.variantId === old.id)) &&
              !state.items.some((i) => i.variantId === old.id) &&
              !state.inventoryCounts.some((c) => c.variantId === old.id)),
          'No cambie control de inventario después de registrar movimientos.',
        );
        Object.keys(old).forEach((key) => {
          if (!(key in variant)) Reflect.deleteProperty(old, key);
        });
        Object.assign(old, variant);
      } else state.variants.push(variant);
    });
  }
}
