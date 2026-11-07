import { Component, inject } from '@angular/core';
import { AppStore } from '../../core/app.store';
import { UI_IMPORTS, statusLabels } from '../../shared/ui';
@Component({
  selector: 'app-dashboard',
  imports: UI_IMPORTS,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  readonly store = inject(AppStore);
  readonly statusLabels = statusLabels;
}
