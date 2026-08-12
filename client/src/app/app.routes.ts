import { Routes } from '@angular/router';
import { AuthComponent } from './auth/auth.component';
import { TravelBookingComponent } from './travel-booking/travel-booking.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'auth', component: AuthComponent },
  { path: '', component: TravelBookingComponent, canActivate: [authGuard] },
];
