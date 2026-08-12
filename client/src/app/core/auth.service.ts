import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  userId: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  /** Traveller identity captured at registration, so bookings never ask for it again. */
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  readonly currentUser = signal<User | null>(null);

  signUp(request: SignUpRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/sign-up`, request, { withCredentials: true })
      .pipe(tap(({ user }) => this.currentUser.set(user)));
  }

  signIn(request: SignInRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/sign-in`, request, { withCredentials: true })
      .pipe(tap(({ user }) => this.currentUser.set(user)));
  }

  signOut(): Observable<void> {
    return this.http
      .post<void>(`${this.apiUrl}/sign-out`, {}, { withCredentials: true })
      .pipe(tap(() => this.currentUser.set(null)));
  }

  fetchCurrentUser(): Observable<AuthResponse> {
    return this.http
      .get<AuthResponse>(`${this.apiUrl}/me`, { withCredentials: true })
      .pipe(tap(({ user }) => this.currentUser.set(user)));
  }
}
