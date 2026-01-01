/**
 * HTTP interceptor to handle CSRF tokens.
 * Reads CSRF token from cookies and includes it in request headers.
 */

import { HttpInterceptorFn } from "@angular/common/http";

/**
 * Get CSRF token from cookies.
 * The CSRF token is set in a cookie named 'csrftoken'.
 * Returns null on server-side (SSR).
 */
function getCsrfToken(): string | null {
  // Only access document.cookie in browser
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }

  const name = "csrftoken";
  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
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
    }
  }

  return next(req);
};
