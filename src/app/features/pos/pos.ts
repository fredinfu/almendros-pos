import { preparePaymentPhoto } from '../../shared/payment-photo';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS } from '../../shared/ui';
import {
  PaymentMethod,
  PaymentEvidence,
  Product,
  Variant,
  newId,
  now,
  parseMoney,
} from '../../domain/models';
interface CartLine {
  id: string;
  variantId: string;
  label: string;
  quantity: number;
  expectedPriceMinor: number;
  grindOption: string;
  coffee: boolean;
}
@Component({
  selector: 'app-pos',
  imports: UI_IMPORTS,
  templateUrl: './pos.html',
  styleUrl: './pos.scss',
})
export class PosPage {
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly search = signal('');
  readonly category = signal(
    localStorage.getItem('almendros.pos.category') ??
      this.store.categories().find((c) => c.name === 'Café empacado')?.id ??
      '',
  );
  readonly cart = signal<CartLine[]>([]);
  readonly evidence = signal<PaymentEvidence | undefined>(undefined);
  readonly photoBusy = signal(false);
  private photoSequence = 0;
  clearPhoto(): void {
    this.photoSequence++;
    this.evidence.set(undefined);
    this.photoBusy.set(false);
  }
  async attachPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const sequence = ++this.photoSequence;
    this.photoBusy.set(true);
    this.store.error.set('');
    try {
      const photo = await preparePaymentPhoto(file);
      if (sequence === this.photoSequence) this.evidence.set(photo);
    } catch (error) {
      if (sequence === this.photoSequence) this.store.error.set(this.store.errorText(error));
    } finally {
      if (sequence === this.photoSequence) this.photoBusy.set(false);
    }
  }
  readonly paying = signal(false);
  readonly lastReceipt = signal('');
  readonly form = this.fb.nonNullable.group({
    discount: ['0'],
    method: ['cash'],
    received: [''],
    reference: [''],
    notes: [''],
  });
  readonly discountValue = toSignal(this.form.controls.discount.valueChanges, {
    initialValue: '0',
  });
  readonly method = toSignal(this.form.controls.method.valueChanges, { initialValue: 'cash' });
  readonly received = toSignal(this.form.controls.received.valueChanges, { initialValue: '' });
  readonly subtotal = computed(() =>
    this.cart().reduce((n, line) => n + line.quantity * line.expectedPriceMinor, 0),
  );
  readonly discount = computed(() => {
    try {
      return parseMoney(this.discountValue() || '0');
    } catch {
      return -1;
    }
  });
  readonly total = computed(() => this.subtotal() - this.discount());
  readonly change = computed(() => {
    try {
      return this.method() === 'cash'
        ? parseMoney(this.received() || (this.total() / 100).toFixed(2)) - this.total()
        : 0;
    } catch {
      return -1;
    }
  });
  readonly products = computed(() =>
    this.store
      .variants()
      .filter(
        (v) =>
          v.isActive &&
          v.product.isActive &&
          v.brand.isActive &&
          v.category.isActive &&
          (!this.category() || v.product.categoryId === this.category()) &&
          `${v.label} ${v.brand.name} ${v.sku}`.toLowerCase().includes(this.search().toLowerCase()),
      ),
  );
  readonly grouped = computed(() =>
    this.store
      .data()
      .products.filter(
        (p) =>
          p.isActive &&
          this.store.data().brands.find((b) => b.id === p.brandId)?.isActive &&
          this.store.data().categories.find((c) => c.id === p.categoryId)?.isActive &&
          (this.search() || !this.category() || p.categoryId === this.category()) &&
          (
            p.name +
            ' ' +
            this.store.data().brands.find((b) => b.id === p.brandId)?.name +
            ' ' +
            this.store
              .data()
              .variants.filter((v) => v.productId === p.id)
              .map((v) => v.name)
              .join(' ')
          )
            .toLowerCase()
            .includes(this.search().toLowerCase()),
      )
      .map((p) => ({
        ...p,
        variants: this.store.variants().filter((v) => v.productId === p.id && v.isActive),
      })),
  );
  readonly selection = signal<Product | undefined>(undefined);
  readonly selectedVariant = signal('');
  readonly selectedGrind = signal('');
  readonly inlinePrice = signal('');
  readonly inlinePack = signal('');
  readonly options = computed(() =>
    this.selection() ? this.store.options(this.selection()!.id) : [],
  );
  readonly choices = computed(() =>
    this.store.variants().filter((v) => v.productId === this.selection()?.id && v.isActive),
  );
  readonly choice = computed(() => this.choices().find((v) => v.id === this.selectedVariant()));
  readonly pending = computed(() =>
    this.cart().some(
      (l) =>
        this.store.variants().find((v) => v.id === l.variantId)?.trackInventory &&
        !this.store.known(l.variantId),
    ),
  );
  setCategory(id: string): void {
    this.category.set(id);
    localStorage.setItem('almendros.pos.category', id);
  }
  needsPack(v?: Variant): boolean {
    return (
      !!v &&
      ['coffee_pod', 'merchandise'].includes(
        this.store.data().products.find((p) => p.id === v.productId)?.productType ?? '',
      ) &&
      /bolsa|paquete|pack/i.test(v.name) &&
      !v.packUnits
    );
  }
  select(product: Product): void {
    this.store.error.set('');
    const variants = this.store.variants().filter((v) => v.productId === product.id && v.isActive);
    const options = this.store.options(product.id);
    if (
      variants.length === 1 &&
      options.length <= 1 &&
      variants[0].priceMinor !== undefined &&
      !this.needsPack(variants[0])
    ) {
      this.add(variants[0].id, options[0] ?? '');
      return;
    }
    this.selection.set(product);
    this.selectedVariant.set(variants[0]?.id ?? '');
    this.selectedGrind.set(options[0] ?? '');
    this.inlinePrice.set('');
    this.inlinePack.set('');
  }
  async confirmSelection(): Promise<void> {
    const product = this.selection();
    if (!product || this.store.busy()) return;
    let variant = this.choice();
    if (!variant || variant.priceMinor === undefined || this.needsPack(variant)) {
      const id = variant?.id ?? newId();
      const ok = await this.store.run(
        () =>
          this.store.catalog.saveVariant({
            ...(this.store.data().variants.find((v) => v.id === variant?.id) ?? {
              id,
              productId: product.id,
              name:
                product.productType === 'beverage'
                  ? 'Vaso'
                  : ['merchandise', 'coffee_pod'].includes(product.productType)
                    ? 'Individual'
                    : 'Única',
              sku: '',
              trackInventory: product.productType !== 'beverage',
              isActive: true,
              sortOrder: 0,
              createdAt: now(),
              updatedAt: now(),
            }),
            priceMinor: variant?.priceMinor ?? parseMoney(this.inlinePrice()),
            ...(this.inlinePack() ? { packUnits: Number(this.inlinePack()) } : {}),
            updatedAt: now(),
          }),
        'Precio guardado.',
      );
      if (!ok) return;
      variant = this.store.variants().find((v) => v.id === id);
    }
    if (variant) {
      this.add(variant.id, this.selectedGrind());
      this.selection.set(undefined);
    }
  }
  private commandId = newId();
  constructor() {
    effect(() => {
      if (this.method() === 'cash') this.clearPhoto();
    });
    let previous = this.store.eventId();
    effect(() => {
      const id = this.store.eventId();
      if (id !== previous) {
        previous = id;
        this.clearPhoto();
        this.cart.set([]);
        this.paying.set(false);
        this.commandId = newId();
        this.store.notice.set('Evento cambiado. El carrito se ha vaciado.');
      }
    });
  }
  add(id: string, option?: string): void {
    const v = this.store.variants().find((v) => v.id === id)!;
    if (v.priceMinor === undefined || this.store.event()?.status === 'closed') return;
    const selected = option ?? this.store.options(v.productId)[0] ?? '';
    const available = this.store.availability(id);
    const current = this.cart().find(
      (line) => line.variantId === id && line.grindOption === selected,
    );
    if (available !== undefined && this.reserved(id) >= available) {
      this.store.error.set('Sin existencias verificadas disponibles para esta presentación.');
      return;
    }
    this.lastReceipt.set('');
    if (current) this.adjust(current.id, 1);
    else
      this.cart.update((lines) => [
        ...lines,
        {
          id: newId(),
          variantId: id,
          label: v.label,
          quantity: 1,
          expectedPriceMinor: v.priceMinor!,
          grindOption: selected,
          coffee: v.product.productType === 'packaged_coffee',
        },
      ]);
  }
  adjust(id: string, increment: number): void {
    const line = this.cart().find((line) => line.id === id)!;
    const v = this.store.variants().find((v) => v.id === line.variantId)!;
    if (
      increment > 0 &&
      this.store.availability(v.id) !== undefined &&
      this.reserved(v.id) >= this.store.availability(v.id)!
    ) {
      this.store.error.set('Stock insuficiente.');
      return;
    }
    this.cart.update((lines) =>
      lines
        .map((row) => (row.id === id ? { ...row, quantity: row.quantity + increment } : row))
        .filter((row) => row.quantity > 0),
    );
  }
  setQuantity(id: string, value: string): void {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    this.cart.update((lines) => lines.map((row) => (row.id === id ? { ...row, quantity } : row)));
  }
  remove(id: string): void {
    this.cart.update((lines) => lines.filter((row) => row.id !== id));
  }
  lineOptions(id: string): string[] {
    return this.store.options(this.store.variants().find((v) => v.id === id)!.productId);
  }
  grind(id: string, grindOption: string): void {
    this.cart.update((lines) =>
      lines.map((row) => (row.id === id ? { ...row, grindOption } : row)),
    );
  }
  private reserved(variantId: string): number {
    return this.cart()
      .filter((line) => line.variantId === variantId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }
  async checkout(): Promise<void> {
    if (
      this.store.busy() ||
      this.photoBusy() ||
      !this.cart().length ||
      this.discount() < 0 ||
      this.total() < 0 ||
      this.change() < 0
    )
      return;
    const ok = await this.store.run(async () => {
      const v = this.form.getRawValue();
      const sale = await this.store.sales.checkout({
        id: this.commandId,
        ...(this.store.eventId() ? { eventId: this.store.eventId() } : {}),
        lines: this.cart().map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          expectedPriceMinor: line.expectedPriceMinor,
          ...(line.coffee ? { grindOption: line.grindOption } : {}),
        })),
        discountMinor: parseMoney(v.discount || '0'),
        method: v.method as PaymentMethod,
        ...(v.method === 'cash'
          ? { receivedMinor: parseMoney(v.received || (this.total() / 100).toFixed(2)) }
          : {}),
        ...(v.method !== 'cash' && this.evidence() ? { evidence: this.evidence() } : {}),
        reference: v.reference,
        notes: v.notes,
      });
      this.lastReceipt.set(
        `Venta registrada · ${this.store.money(sale.totalMinor)} · Cambio ${this.store.money(sale.changeMinor)}`,
      );
    }, 'Venta guardada en este dispositivo.');
    if (ok) {
      this.clearPhoto();
      this.cart.set([]);
      this.commandId = newId();
      this.paying.set(false);
      this.form.reset({ discount: '0', method: 'cash' });
    }
  }
}
