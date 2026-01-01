/**
 * Authentication guard to protect routes.
 * Waits for auth status check to complete, then redirects to login if not authenticated.
 */

import { isPlatformServer } from "@angular/common";
import { inject, PLATFORM_ID } from "@angular/core";
import { Router, CanActivateFn, UrlTree } from "@angular/router";
import { Observable, of } from "rxjs";
import { catchError, map, take } from "rxjs/operators";

import { AuthService } from "../services/auth.service";

type GuardResult = boolean | UrlTree;

export const authGuard: CanActivateFn = (
  route,
  state,
): Observable<GuardResult> => {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);
  const authService = inject(AuthService);

  // If running on the server, allow access (client will handle auth after hydration)
  if (isPlatformServer(platformId)) {
    return of(true as GuardResult);
  }

  // If already authenticated, allow access immediately
  if (authService.authenticated()) {
    return of(true as GuardResult);
  }

  // Wait for auth check to complete, then check status
  return authService.checkAuthStatus().pipe(
    take(1),
    catchError(() => of({ authenticated: false, user: null })),
    // eslint-disable-next-line sonarjs/function-return-type
    map((): GuardResult => {
      if (authService.authenticated()) {
        return true;
      }
      return router.createUrlTree(["/login"], {
        queryParams: { returnUrl: state.url },
      });
    }),
  );
};
