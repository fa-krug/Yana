/**
 * Authentication service using Angular Signals for reactive state.
 * Manages user authentication state and provides login/logout methods.
 * Now uses tRPC for type-safe API calls.
 */

import { isPlatformBrowser } from "@angular/common";
import {
  Injectable,
  signal,
  computed,
  inject,
  PLATFORM_ID,
} from "@angular/core";
import { Router } from "@angular/router";
import { Observable, from, of, tap, catchError, map } from "rxjs";

import { LoginRequest, LoginResponse, User } from "../models";
import { TRPCService } from "../trpc/trpc.service";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private trpc = inject(TRPCService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  // Signals for reactive state
  private userSignal = signal<User | null>(null);
  private authenticatedSignal = signal<boolean>(false);
  private loadingSignal = signal<boolean>(false);

  // Public readonly signals
  readonly user = this.userSignal.asReadonly();
  readonly authenticated = this.authenticatedSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  // Computed values
  readonly isSuperuser = computed(
    () => this.userSignal()?.isSuperuser ?? false,
  );
  readonly isStaff = computed(() => this.userSignal()?.isStaff ?? false);

  constructor() {
    // Check auth status on initialization (only in browser, not during SSR)
    if (isPlatformBrowser(this.platformId)) {
      this.checkAuthStatus().subscribe();
    }
  }

  /**
   * Check current authentication status from server.
   * Only works in browser (not during SSR).
   */
  checkAuthStatus() {
    // Skip during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return of({ authenticated: false, user: null });
    }

    this.loadingSignal.set(true);
    return from(this.trpc.client.auth.status.query()).pipe(
      map((status) => ({
        authenticated: status.authenticated,
        user: status.user
          ? {
              id: status.user.id,
              username: status.user.username,
              email: status.user.email,
              isSuperuser: status.user.is_superuser,
              isStaff: status.user.is_staff,
            }
          : null,
      })),
      tap((status) => {
        this.userSignal.set(status.user);
        this.authenticatedSignal.set(status.authenticated);
        this.loadingSignal.set(false);
      }),
      catchError((error) => {
        // Only log errors in browser (SSR errors are expected and harmless)
        if (isPlatformBrowser(this.platformId)) {
          console.error("Auth status check failed:", error);
        }
        this.userSignal.set(null);
        this.authenticatedSignal.set(false);
        this.loadingSignal.set(false);
        return of({ authenticated: false, user: null });
      }),
    );
  }

  /**
   * Login with username and password.
   * Can be called with either separate parameters or a LoginRequest object.
   */
  login(
    credentialsOrUsername: LoginRequest | string,
    password?: string,
  ): Observable<LoginResponse | null> {
    const credentials: LoginRequest =
      typeof credentialsOrUsername === "string"
        ? {
            username: credentialsOrUsername,
            password: password ?? "",
          }
        : credentialsOrUsername;
    this.loadingSignal.set(true);
    return from(
      this.trpc.client.auth.login.mutate({
        username: credentials.username,
        password: credentials.password,
      }),
    ).pipe(
      map((response) => ({
        success: response.success,
        message: response.message,
        user: response.user
          ? {
              id: response.user.id,
              username: response.user.username,
              email: response.user.email,
              isSuperuser: response.user.is_superuser,
              isStaff: response.user.is_staff,
            }
          : null,
      })),
      tap((response) => {
        if (response.success && response.user) {
          this.userSignal.set(response.user);
          this.authenticatedSignal.set(true);
          this.router.navigate(["/"]);
        }
        this.loadingSignal.set(false);
      }),
      catchError((error) => {
        console.error("Login failed:", error);
        this.loadingSignal.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Logout current user.
   */
  logout() {
    this.loadingSignal.set(true);
    return from(this.trpc.client.auth.logout.mutate()).pipe(
      tap(() => {
        this.userSignal.set(null);
        this.authenticatedSignal.set(false);
        this.loadingSignal.set(false);
        this.router.navigate(["/login"]);
      }),
      catchError((error) => {
        console.error("Logout failed:", error);
        // Still clear local state even if server request fails
        this.userSignal.set(null);
        this.authenticatedSignal.set(false);
        this.loadingSignal.set(false);
        this.router.navigate(["/login"]);
        return of(null);
      }),
    );
  }
}
