import { DAILY_PROFILE, normalizePhone } from '../../domain/communication';
import { Router } from '@angular/router';
import {
  EventPaymentsService,
  LocalAccount,
  PAYMENT_CHOICES,
} from '../../core/event-payments.service';
import { preparePaymentPhoto } from '../../shared/payment-photo';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
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
  pieceDescriptions?: string[];
  packUnits: number;
}
@Component({
  selector: 'app-pos',
  imports: UI_IMPORTS,
  templateUrl: './pos.html',
  styleUrl: './pos.scss',
})
export class PosPage {
  readonly store = inject(AppStore);
  private readonly router = inject(Router);
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
  readonly vault = inject(EventPaymentsService);
  readonly accounts = signal<LocalAccount[] | undefined>(undefined);
  readonly account = computed(() => {
    const a = this.accounts()?.find((a) => a.method === this.method());
    return a ? { ...a, name: PAYMENT_CHOICES.find((p) => p.method === a.method)!.name } : undefined;
  });
  accepts(method: string): boolean {
    return !!this.accounts()?.some((a) => a.method === method);
  }
  async beginPayment(): Promise<void> {
    {
      try {
        this.accounts.set(await this.vault.read(this.store.eventId() || DAILY_PROFILE));
      } catch {
        this.accounts.set(undefined);
      }
      if (!this.accounts()) {
        this.vault.request.set({ eventId: this.store.eventId() || DAILY_PROFILE });
        return;
      }
    }
    this.paying.set(true);
  }
  readonly pieceSuggestions = computed(() =>
    [
      ...new Set(
        [
          ...this.store.data().items.flatMap((i) => i.pieceDescriptions ?? []),
          ...this.cart().flatMap((i) => i.pieceDescriptions ?? []),
        ].filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );
  async copyAccount(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.account()!.code);
      this.store.notice.set('Cuenta copiada.');
    } catch {
      this.store.error.set('Mantén presionado el número de cuenta para copiarlo.');
    }
  }
  describePiece(id: string, index: number, value: string): void {
    this.cart.update((lines) =>
      lines.map((line) =>
        line.id !== id
          ? line
          : {
              ...line,
              pieceDescriptions: line.pieceDescriptions!.map((text, i) =>
                i === index ? value : text,
              ),
            },
      ),
    );
  }
  private resizePieces(line: CartLine, quantity: number): CartLine {
    return {
      ...line,
      quantity,
      ...(line.pieceDescriptions
        ? {
            pieceDescriptions: Array.from(
              { length: quantity * line.packUnits },
              (_, i) => line.pieceDescriptions![i] ?? '',
            ),
          }
        : {}),
    };
  }
  readonly orderMode = signal(false);
  readonly customerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    phone: ['', Validators.required],
    fulfillment: ['pickup'],
    address: [''],
    notes: [''],
  });
  async saveOrder(): Promise<void> {
    if (this.store.busy() || !this.cart().length || this.customerForm.invalid) return;
    const ok = await this.store.run(async () => {
      if (!(await this.vault.read(this.store.eventId() || DAILY_PROFILE))) {
        this.vault.request.set({ eventId: this.store.eventId() || DAILY_PROFILE });
        throw new Error('Configura primero el perfil y vuelve a guardar el pedido.');
      }
      const c = this.customerForm.getRawValue();
      await this.store.orders.create({
        id: this.commandId,
        ...(this.store.eventId() ? { eventId: this.store.eventId() } : {}),
        customer: {
          ...c,
          phone: normalizePhone(c.phone),
          fulfillment: c.fulfillment as 'pickup' | 'delivery',
        },
        lines: this.cart().map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          expectedPriceMinor: l.expectedPriceMinor,
          ...(l.coffee ? { grindOption: l.grindOption } : {}),
          ...(l.pieceDescriptions ? { pieceDescriptions: l.pieceDescriptions } : {}),
        })),
        discountMinor: parseMoney(this.form.controls.discount.value || '0'),
      });
    }, 'Pedido abierto guardado. Todavía no se ha cobrado.');
    if (ok) {
      this.cart.set([]);
      this.commandId = newId();
      this.customerForm.reset({ fulfillment: 'pickup' });
      this.orderMode.set(false);
      this.form.reset({ discount: '0', method: 'cash' });
      await this.router.navigate(['/orders']);
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
      const id = this.store.eventId();
      this.vault.revision();
      this.accounts.set(undefined);
      void this.vault
        .read(id || DAILY_PROFILE)
        .then((accounts) => {
          if (this.store.eventId() === id) this.accounts.set(accounts);
        })
        .catch(() => {
          if (this.store.eventId() === id) this.accounts.set(undefined);
        });
    });
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
          packUnits: v.packUnits ?? 1,
          ...(v.product.productType === 'merchandise'
            ? { pieceDescriptions: Array.from({ length: v.packUnits ?? 1 }, () => '') }
            : {}),
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
    if (line.pieceDescriptions && (line.quantity + increment) * line.packUnits > 1000) return;
    this.cart.update((lines) =>
      lines
        .map((row) => (row.id === id ? this.resizePieces(row, row.quantity + increment) : row))
        .filter((row) => row.quantity > 0),
    );
  }
  setQuantity(id: string, value: string): void {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const line = this.cart().find((row) => row.id === id)!;
    if (line.pieceDescriptions && quantity * line.packUnits > 1000) return;
    this.cart.update((lines) =>
      lines.map((row) => (row.id === id ? this.resizePieces(row, quantity) : row)),
    );
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
      {
        const accounts = await this.vault.read(this.store.eventId() || DAILY_PROFILE);
        if (!accounts || (v.method !== 'cash' && !accounts.some((a) => a.method === v.method)))
          throw new Error('Configura o selecciona un método habilitado para este evento.');
      }
      const sale = await this.store.sales.checkout({
        id: this.commandId,
        ...(this.store.eventId() ? { eventId: this.store.eventId() } : {}),
        lines: this.cart().map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          expectedPriceMinor: line.expectedPriceMinor,
          ...(line.pieceDescriptions ? { pieceDescriptions: line.pieceDescriptions } : {}),
          ...(line.coffee ? { grindOption: line.grindOption } : {}),
        })),
        discountMinor: parseMoney(v.discount || '0'),
        method: (['ficohsa', 'atlantida'].includes(v.method) ? 'other' : v.method) as PaymentMethod,
        ...(v.method === 'cash'
          ? { receivedMinor: parseMoney(v.received || (this.total() / 100).toFixed(2)) }
          : {}),
        ...(v.method !== 'cash' && this.evidence() ? { evidence: this.evidence() } : {}),
        reference: [PAYMENT_CHOICES.find((p) => p.method === v.method)?.name, v.reference]
          .filter(Boolean)
          .join(' · '),
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
