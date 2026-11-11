import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { requireServerSession } from './server-login';

requireServerSession().then(() => bootstrapApplication(App, appConfig)).catch((err) => console.error(err));
window.addEventListener('almendros-session-expired', () => location.reload());
