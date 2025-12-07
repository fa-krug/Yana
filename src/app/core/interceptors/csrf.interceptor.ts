/**
 * HTTP interceptor to handle CSRF tokens for Django backend.
 * Reads CSRF token from cookies and includes it in request headers.
 */

import { HttpInterceptorFn } from "@angular/common/http";
import { PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

/**
 * Get CSRF token from cookies.
 * Django sets the CSRF token in a cookie named 'csrftoken'.
 * Returns null on server-side (SSR).
 */
function getCsrfToken(): string | null {
  // Only access document.cookie in browser
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }

  const name = "csrftoken";
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  // Always ensure credentials are sent
  req = req.clone({
    withCredentials: true,
  });

  // Only add CSRF token for state-changing methods
  const stateChangingMethods = ["POST", "PUT", "PATCH", "DELETE"];

  if (stateChangingMethods.includes(req.method)) {
    const csrfToken = getCsrfToken();

    if (csrfToken) {
      // Clone the request and add CSRF token header
      req = req.clone({
        setHeaders: {
          "X-CSRFToken": csrfToken,
        },
      });
    } else {
      // Log warning if CSRF token is missing for state-changing requests
      // This helps debug CSRF issues
      console.warn("CSRF token not found in cookies for", req.method, req.url);
    }
  }

  return next(req);
};
