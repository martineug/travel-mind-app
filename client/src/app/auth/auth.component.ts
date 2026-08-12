import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class AuthComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  mode: 'sign-in' | 'sign-up' = 'sign-in';

  email = '';
  password = '';
  firstName = '';
  lastName = '';
  phoneNumber = '';
  bornOn = '';
  gender = 'm';
  title = 'mr';

  busy = signal(false);
  error = signal('');

  setMode(mode: 'sign-in' | 'sign-up'): void {
    this.mode = mode;
    this.error.set('');
  }

  submit(): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set('');

    const onSuccess = () => {
      this.busy.set(false);
      this.router.navigateByUrl('/');
    };

    const onError = (err: any) => {
      this.busy.set(false);
      this.error.set(err?.error?.error || 'Something went wrong — please try again.');
    };

    if (this.mode === 'sign-up') {
      this.auth.signUp({
        email: this.email,
        password: this.password,
        firstName: this.firstName,
        lastName: this.lastName,
        phoneNumber: this.phoneNumber,
        bornOn: this.bornOn,
        gender: this.gender,
        title: this.title,
      }).subscribe({ next: onSuccess, error: onError });
    } else {
      this.auth.signIn({ email: this.email, password: this.password }).subscribe({ next: onSuccess, error: onError });
    }
  }
}
