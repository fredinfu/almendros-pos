import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'catalog',
    loadComponent: () => import('./features/catalog/catalog').then((m) => m.CatalogPage),
  },
  {
    path: 'inventory',
    loadComponent: () => import('./features/inventory/inventory').then((m) => m.InventoryPage),
  },
  {
    path: 'events',
    loadComponent: () => import('./features/events/events').then((m) => m.EventsPage),
  },
  { path: 'pos', loadComponent: () => import('./features/pos/pos').then((m) => m.PosPage) },
  {
    path: 'orders',
    loadComponent: () => import('./features/orders/orders').then((m) => m.OrdersPage),
  },
  { path: 'sales', loadComponent: () => import('./features/sales/sales').then((m) => m.SalesPage) },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/backups/settings').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'pos' },
];
