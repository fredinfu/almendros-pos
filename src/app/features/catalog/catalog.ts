import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS } from '../../shared/ui';
import { Product, Variant, newId, now, parseMoney } from '../../domain/models';
@Component({
  selector: 'app-catalog',
  imports: UI_IMPORTS,
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss',
})
export class CatalogPage {
  async toggleActive(variant: Variant): Promise<void> {
    const product = this.store.data().products.find((p) => p.id === variant.productId)!;
    const action = variant.isActive ? 'desactivar' : 'activar';
    if (
      !window.confirm(
        `¿Quieres ${action} ${product.name} · ${variant.name}? El inventario y el historial se conservarán.`,
      )
    )
      return;
    await this.store.run(
      () => this.store.catalog.setVariantActive(variant.id, !variant.isActive),
      'Estado actualizado.',
    );
  }
  async deletePresentation(variant: Variant): Promise<void> {
    const product = this.store.data().products.find((p) => p.id === variant.productId)!;
    if (
      !window.confirm(
        `¿Eliminar ${product.name} · ${variant.name}? No se puede deshacer. Si es la última presentación, también se eliminará el producto. Las presentaciones con historial no se pueden eliminar.`,
      )
    )
      return;
    const ok = await this.store.run(
      () => this.store.catalog.deleteVariant(variant.id),
      'Presentación eliminada.',
    );
    if (ok && this.variantId() === variant.id) this.editor.set(false);
  }
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly search = signal('');
  readonly productId = signal('');
  readonly variantId = signal('');
  readonly editor = signal(false);
  readonly showInactive = signal(localStorage.getItem('almendros.catalog.inactive') === 'true');
  readonly category = signal(localStorage.getItem('almendros.catalog.category') ?? '');
  setCategory(id: string): void {
    this.category.set(id);
    localStorage.setItem('almendros.catalog.category', id);
  }
  setInactive(value: boolean): void {
    this.showInactive.set(value);
    localStorage.setItem('almendros.catalog.inactive', String(value));
  }
  readonly groups = computed(() =>
    this.store
      .data()
      .products.filter(
        (p) =>
          (this.showInactive() || p.isActive) &&
          (this.search() || !this.category() || p.categoryId === this.category()),
      )
      .map((p) => ({
        ...p,
        brand: this.store.data().brands.find((b) => b.id === p.brandId)!,
        category: this.store.data().categories.find((c) => c.id === p.categoryId)!,
        variants: this.store.variants().filter((v) => v.productId === p.id),
      }))
      .filter((p) =>
        (p.name + ' ' + p.brand.name + ' ' + p.variants.map((v) => v.name).join(' '))
          .toLowerCase()
          .includes(this.search().toLowerCase()),
      )
      .sort(
        (a, b) =>
          this.store.categories().findIndex((c) => c.id === a.categoryId) -
            this.store.categories().findIndex((c) => c.id === b.categoryId) ||
          a.name.localeCompare(b.name),
      ),
  );
  priceRange(id: string): string {
    const prices = this.store
      .variants()
      .filter((v) => v.productId === id && v.isActive && v.priceMinor !== undefined)
      .map((v) => v.priceMinor!);
    if (!prices.length) return 'Sin configurar';
    return (
      this.store.money(Math.min(...prices)) +
      (Math.min(...prices) === Math.max(...prices)
        ? ''
        : ' – ' + this.store.money(Math.max(...prices)))
    );
  }
  async toggleProduct(p: Product): Promise<void> {
    if (
      window.confirm(
        `¿${p.isActive ? 'Desactivar' : 'Activar'} ${p.name}? Se conservará su historial.`,
      )
    )
      await this.store.run(() => this.store.catalog.setProductActive(p.id, !p.isActive));
  }
  async deleteProduct(p: Product): Promise<void> {
    if (
      window.confirm(
        `¿Eliminar ${p.name} y sus presentaciones? Solo se permite si no tienen historial. No se puede deshacer.`,
      )
    )
      await this.store.run(() => this.store.catalog.deleteProduct(p.id));
  }
  legacy(v: Variant): boolean {
    return /^(grano|molido)$/i.test(v.name);
  }
  async correctLegacy(v: Variant): Promise<void> {
    const name = window.prompt(
      'Esta presentación parece una preparación. Indica el tamaño real o Única. No se mezclarán existencias ni se cambiará el precio.',
      'Única',
    );
    if (!name?.trim()) return;
    if (
      !window.confirm(
        `¿Renombrar únicamente esta presentación de ${v.name} a ${name}? Sus existencias permanecerán separadas.`,
      )
    )
      return;
    await this.store.run(() =>
      this.store.catalog.saveVariant({
        ...this.store.data().variants.find((row) => row.id === v.id)!,
        name: name.trim(),
        updatedAt: now(),
      }),
    );
  }
  readonly rows = computed(() =>
    this.store
      .variants()
      .filter((v) => this.showInactive() || (v.isActive && v.product.isActive))
      .filter((v) =>
        `${v.label} ${v.sku} ${v.brand.name}`.toLowerCase().includes(this.search().toLowerCase()),
      ),
  );
  readonly withoutVariants = computed(() =>
    this.store
      .data()
      .products.filter((p) => !this.store.data().variants.some((v) => v.productId === p.id)),
  );
  readonly productForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    brandId: ['', Validators.required],
    categoryId: ['', Validators.required],
    productType: ['packaged_coffee', Validators.required],
    description: [''],
    price: [''],
    presentation: [''],
    packQuantity: [''],
    grano: [false],
    molido: [true],
    isActive: [true],
  });
  readonly variantForm = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    name: ['Única', Validators.required],
    sku: [''],
    price: [''],
    regularPrice: [''],
    cost: [''],
    trackInventory: [true],
    isActive: [true],
    lowStockThreshold: [3, [Validators.min(0)]],
    packUnits: [''],
    weightValue: [''],
    weightUnit: ['g'],
    process: [''],
  });
  typeChanged(type: string): void {
    const names: Record<string, string> = {
      packaged_coffee: 'Café empacado',
      coffee_pod: 'Coffee Pods',
      beverage: 'Bebidas',
      merchandise: 'Mercadería',
      other: 'Otros',
    };
    const category = this.store.data().categories.find((c) => c.name === names[type]);
    if (category) this.productForm.controls.categoryId.setValue(category.id);
  }
  newProduct(): void {
    this.productId.set('');
    this.variantId.set('');
    this.variantForm.reset({
      name: 'Única',
      trackInventory: true,
      isActive: true,
      lowStockThreshold: 3,
      weightUnit: 'g',
    });
    this.productForm.reset({
      brandId: this.store.data().brands.find((b) => b.slug === 'almendros')!.id,
      categoryId: this.store.data().categories.find((c) => c.name === 'Café empacado')!.id,
      productType: 'packaged_coffee',
      isActive: true,
      molido: true,
      grano: false,
    });
    this.editor.set(true);
  }
  editProduct(product: Product): void {
    this.editVariant(
      this.store.data().variants.find((v) => v.productId === product.id && v.isActive),
      product.id,
    );
  }
  editVariant(variant?: Variant, productId = this.productId()): void {
    const product = this.store
      .data()
      .products.find((p) => p.id === (variant?.productId ?? productId));
    if (product) {
      this.productId.set(product.id);
      this.productForm.reset({
        ...product,
        grano: this.store.options(product.id).includes('Grano'),
        molido: this.store.options(product.id).includes('Molido'),
      });
    }
    this.variantId.set(variant?.id ?? '');
    this.variantForm.reset({
      productId: variant?.productId ?? productId,
      name:
        variant?.name ??
        (product?.productType === 'beverage'
          ? 'Vaso'
          : ['coffee_pod', 'merchandise'].includes(product?.productType ?? '')
            ? 'Individual'
            : 'Única'),
      sku: variant?.sku.startsWith('AUTO-') ? '' : (variant?.sku ?? ''),
      price: variant?.priceMinor === undefined ? '' : (variant.priceMinor / 100).toFixed(2),
      regularPrice:
        variant?.compareAtPriceMinor === undefined
          ? ''
          : (variant.compareAtPriceMinor / 100).toFixed(2),
      cost: variant?.unitCostMinor === undefined ? '' : (variant.unitCostMinor / 100).toFixed(2),
      trackInventory: variant?.trackInventory ?? product?.productType !== 'beverage',
      isActive: variant?.isActive ?? true,
      lowStockThreshold: variant?.lowStockThreshold ?? 3,
      packUnits: variant?.packUnits?.toString() ?? '',
      weightValue: variant?.weightValue?.toString() ?? '',
      weightUnit: variant?.weightUnit ?? 'g',
      process: variant?.process ?? '',
    });
    this.editor.set(true);
  }
  async saveProduct(): Promise<void> {
    if (
      this.productForm.controls.productType.value === 'packaged_coffee' &&
      !this.productForm.controls.molido.value &&
      !this.productForm.controls.grano.value &&
      !this.store.options(this.productId()).some((o) => !['Molido', 'Grano'].includes(o))
    ) {
      this.store.error.set('Activa al menos una preparación: Molido o Grano.');
      return;
    }
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }
    const id = this.productId() || newId();
    const ok = await this.store.run(() => {
      const { price, presentation, packQuantity, grano, molido, ...value } =
        this.productForm.getRawValue();
      const old = this.store.data().products.find((p) => p.id === id);
      const input: Product = {
        ...old,
        ...value,
        id,
        productType: value.productType as Product['productType'],
        ...(value.productType === 'packaged_coffee'
          ? {
              grindOptions: [
                ...(molido ? ['Molido'] : []),
                ...(grano ? ['Grano'] : []),
                ...this.store.options(id).filter((o) => !['Molido', 'Grano'].includes(o)),
              ],
            }
          : {}),
        tags: old?.tags ?? [],
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
      };
      return old
        ? this.store.catalog.saveProduct(input)
        : this.store.catalog.createSimple(
            input,
            price.trim() ? parseMoney(price) : undefined,
            presentation,
            packQuantity ? Number(packQuantity) : undefined,
          );
    });
    if (ok) {
      this.productId.set(id);
      const variant = this.store
        .data()
        .variants.find((v) => v.id === this.variantId() && v.productId === id);
      if (!variant) this.editor.set(false);
    }
  }
  async saveVariant(): Promise<void> {
    if (this.variantForm.invalid) {
      this.variantForm.markAllAsTouched();
      return;
    }
    const ok = await this.store.run(() => {
      const v = this.variantForm.getRawValue();
      const id = this.variantId() || newId();
      const old = this.store.data().variants.find((row) => row.id === id);
      return this.store.catalog.saveVariant({
        id,
        productId: v.productId,
        name: v.name,
        sku: v.sku.trim().toUpperCase(),
        ...(old?.grindOption ? { grindOption: old.grindOption } : {}),
        ...(v.price.trim() ? { priceMinor: parseMoney(v.price) } : {}),
        ...(v.regularPrice.trim() ? { compareAtPriceMinor: parseMoney(v.regularPrice) } : {}),
        ...(v.cost.trim() ? { unitCostMinor: parseMoney(v.cost) } : {}),
        ...(v.packUnits ? { packUnits: Number(v.packUnits) } : {}),
        ...(v.weightValue
          ? { weightValue: Number(v.weightValue), weightUnit: v.weightUnit as 'g' | 'lb' | 'ml' }
          : {}),
        ...(v.process ? { process: v.process } : {}),
        trackInventory: v.trackInventory,
        isActive: v.isActive,
        lowStockThreshold: v.lowStockThreshold,
        sortOrder:
          old?.sortOrder ??
          this.store.data().variants.filter((row) => row.productId === v.productId).length,
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
      });
    });
    if (ok) this.editor.set(false);
  }
}
