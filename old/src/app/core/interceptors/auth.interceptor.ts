/**
 * HTTP interceptor to handle authentication errors.
 * Redirects to login on 401 Unauthorized responses.
 */

import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        // Redirect to login on unauthorized
        router.navigate(["/login"]);
      }
      return throwError(() => error);
    }),
  );
};
