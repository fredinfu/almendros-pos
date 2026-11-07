import { A11yModule } from '@angular/cdk/a11y';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
export const UI_IMPORTS = [
  A11yModule,
  ReactiveFormsModule,
  RouterLink,
  MatButtonModule,
  MatFormFieldModule,
  MatInputModule,
  MatSelectModule,
  MatCheckboxModule,
];
export const paymentLabels: Record<string, string> = {
  cash: 'Efectivo',
  bac: 'BAC · registro manual',
  kash: 'Kash · registro manual',
  other: 'Otro',
};
export { statusLabels } from './labels';
export const movementLabels: Record<string, string> = {
  initial_stock: 'Inventario inicial',
  restock: 'Reposición',
  transfer_to_event: 'Transferencia al evento',
  return_to_general: 'Devolución al almacén',
  sale: 'Venta',
  sale_void_reversal: 'Reversa de venta',
  sample: 'Muestra',
  waste: 'Merma',
  adjustment_in: 'Ajuste de entrada',
  adjustment_out: 'Ajuste de salida',
};
