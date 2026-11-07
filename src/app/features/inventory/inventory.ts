import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, movementLabels } from '../../shared/ui';
import { newId } from '../../domain/models';
@Component({
  selector: 'app-inventory',
  imports: UI_IMPORTS,
  templateUrl: './inventory.html',
  styleUrl: './inventory.scss',
})
export class InventoryPage {
  readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  readonly labels = movementLabels;
  readonly locationId = signal(this.store.general()?.id ?? '');
  readonly movements = computed(() =>
    this.store
      .data()
      .movements.filter(
        (m) => m.fromLocationId === this.locationId() || m.toLocationId === this.locationId(),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  );
  readonly countForm = this.fb.nonNullable.group({
    variantId: ['', Validators.required],
    quantity: [0, [Validators.min(0), Validators.required]],
    mode: ['current'],
  });
  pending(id: string): number {
    return this.store
      .data()
      .items.filter((i) => i.variantId === id && i.inventoryStatus === 'pending')
      .reduce((n, i) => n + i.quantity, 0);
  }
  async reconcile(): Promise<void> {
    if (this.countForm.invalid) return;
    const value = this.countForm.getRawValue();
    const ids = this.store
      .data()
      .items.filter((i) => i.variantId === value.variantId && i.inventoryStatus === 'pending')
      .map((i) => i.id);
    if (
      !window.confirm(
        value.mode === 'current'
          ? '¿Registrar el conteo físico ACTUAL del Almacén General? Las ventas anteriores ya están excluidas y no se descontarán otra vez.'
          : '¿Registrar stock al INICIO del período? Se descontarán las ventas pendientes de esta cantidad.',
      )
    )
      return;
    await this.store.run(
      () =>
        this.store.inventory.reconcile({
          id: newId(),
          variantId: value.variantId,
          quantity: value.quantity,
          mode: value.mode as 'current' | 'beginning',
          expectedPendingIds: ids,
        }),
      'Inventario conciliado.',
    );
  }
  readonly form = this.fb.nonNullable.group({
    variantId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    type: ['restock', Validators.required],
    note: ['', Validators.required],
  });
  label(id: string): string {
    return this.store.variants().find((v) => v.id === id)?.label ?? id;
  }
  location(id?: string): string {
    return this.store.data().locations.find((l) => l.id === id)?.name ?? '—';
  }
  async record(): Promise<void> {
    if (this.form.invalid) return;
    const input = this.form.getRawValue();
    const ok = await this.store.run(
      () =>
        this.store.inventory.record({
          ...input,
          id: newId(),
          locationId: this.locationId(),
          type: input.type as
            'restock' | 'initial_stock' | 'sample' | 'waste' | 'adjustment_in' | 'adjustment_out',
        }),
      'Movimiento registrado.',
    );
    if (ok) this.form.patchValue({ quantity: 1, note: '' });
  }
}
