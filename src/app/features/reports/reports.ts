import { Component, inject } from '@angular/core';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, paymentLabels } from '../../shared/ui';
@Component({
  selector: 'app-reports',
  imports: UI_IMPORTS,
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsPage {
  readonly store = inject(AppStore);
  readonly paymentLabels = paymentLabels;
}
