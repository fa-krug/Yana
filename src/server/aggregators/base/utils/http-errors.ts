/**
 * HTTP error detection utilities.
 */

import axios from "axios";

/**
 * Check if an error is a 4xx HTTP client error.
 * @param error - The error to check
 * @returns The HTTP status code if it's a 4xx error, null otherwise
 */
export function is4xxError(error: unknown): number | null {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status && status >= 400 && status < 500) {
      return status;
    }
  }
  return null;
}
