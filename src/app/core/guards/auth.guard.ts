/**
 * Authentication guard to protect routes.
 * Waits for auth status check to complete, then redirects to login if not authenticated.
 */

import { inject, PLATFORM_ID } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { Router, CanActivateFn } from "@angular/router";
import { of } from "rxjs";
import { map, take, catchError, switchMap } from "rxjs/operators";
import { AuthService } from "../services/auth.service";

export const authGuard: CanActivateFn = (route, state) => {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);
  const authService = inject(AuthService);

  // If running on the server, allow access (client will handle auth after hydration)
  if (isPlatformServer(platformId)) {
    return true;
  }

  // If already authenticated, allow access immediately
  if (authService.authenticated()) {
    return true;
  }

  // Wait for auth check to complete, then check status
  return authService.checkAuthStatus().pipe(
    take(1),
    catchError(() => of({ authenticated: false, user: null })),
    map(() => {
      if (authService.authenticated()) {
        return true;
      }
      return router.createUrlTree(["/login"], {
        queryParams: { returnUrl: state.url },
      });
    }),
  );
};
