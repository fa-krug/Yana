/**
 * Reddit credential validation error handlers.
 *
 * Handles different error scenarios during Reddit credential testing
 * using a handler chain pattern.
 */

import type { AxiosError } from "axios";

export interface RedditCredentialErrors {
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
  general?: string;
}

/**
 * Handler for validating required fields.
 */
export function validateRequiredFields(credentials: {
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
}): RedditCredentialErrors | null {
  const errors: RedditCredentialErrors = {};

  if (!credentials.clientId || credentials.clientId.trim() === "") {
    errors.clientId = "Client ID is required";
  }

  if (!credentials.clientSecret || credentials.clientSecret.trim() === "") {
    errors.clientSecret = "Client Secret is required";
  }

  if (!credentials.userAgent || credentials.userAgent.trim() === "") {
    errors.userAgent = "User Agent is required";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Handler for Axios errors.
 */
export function handleAxiosError(error: AxiosError): RedditCredentialErrors {
  const errors: RedditCredentialErrors = {};

  if (error.response?.status === 401) {
    errors.general = "Invalid Client ID or Client Secret";
    errors.clientId = "Invalid Client ID or Client Secret";
    errors.clientSecret = "Invalid Client ID or Client Secret";
  } else if (error.response?.status === 403) {
    errors.general =
      "Reddit app configuration issue. Check app settings on Reddit.";
  } else if (error.response?.status === 429) {
    errors.general = "Rate limited by Reddit. Please try again later.";
  } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    errors.general =
      "Connection timeout. Please check your internet connection.";
  } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    errors.general =
      "Cannot connect to Reddit API. Please check your internet connection.";
  } else {
    const data = error.response?.data as { message?: string } | undefined;
    errors.general =
      data?.message ||
      `Reddit API error: ${error.response?.statusText || error.message}`;
  }

  return errors;
}

/**
 * Handler for non-Axios errors.
 */
export function handleUnexpectedError(error: unknown): RedditCredentialErrors {
  return {
    general: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
  };
}
