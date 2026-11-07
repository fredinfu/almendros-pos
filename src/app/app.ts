import { OfflineService } from './core/offline.service';
import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AppStore } from './core/app.store';
import { statusLabels } from './shared/labels';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly offline = inject(OfflineService);
  readonly store = inject(AppStore);
  readonly menu = signal(false);
  readonly statusLabels = statusLabels;
  readonly links = [
    { path: '/pos', name: 'Punto de venta', code: '01' },
    { path: '/dashboard', name: 'Inicio', code: '02' },
    { path: '/catalog', name: 'Productos', code: '03' },
    { path: '/inventory', name: 'Inventario', code: '04' },
    { path: '/events', name: 'Eventos', code: '05' },
    { path: '/sales', name: 'Ventas', code: '06' },
    { path: '/reports', name: 'Reportes', code: '07' },
    { path: '/settings', name: 'Ajustes y respaldos', code: '08' },
  ];
  ngOnInit(): void {
    void this.store.initialize();
  }
}
