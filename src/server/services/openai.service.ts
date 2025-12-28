/**
 * OpenAI service.
 *
 * Handles OpenAI API authentication and credential testing.
 */

import axios from "axios";

import { logger } from "../utils/logger";

export interface OpenAICredentials {
  apiUrl: string;
  apiKey: string;
}

export interface OpenAITestResult {
  success: boolean;
  errors?: {
    apiUrl?: string;
    apiKey?: string;
    general?: string;
  };
}

/**
 * Handle Axios error for OpenAI test.
 */
function handleAxiosTestError(error: import("axios").AxiosError, errors: OpenAITestResult["errors"]): void {
  if (!errors) return;
  const status = error.response?.status;
  if (status === 401) {
    errors.apiKey = errors.general = "Invalid API Key";
  } else if (status === 403) {
    errors.apiKey = errors.general = "API Key does not have required permissions";
  } else if (status === 404) {
    errors.apiUrl = errors.general = "API endpoint not found. Check if the API URL is correct.";
  } else if (status === 429) {
    errors.general = "Rate limited by API. Please try again later.";
  } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    errors.general = "Connection timeout. Please check your internet connection and API URL.";
  } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    errors.apiUrl = "Cannot connect to API. Please check the API URL.";
    errors.general = "Cannot connect to API. Please check the API URL and your internet connection.";
  } else {
    const errorData = error.response?.data as { error?: { message?: string }, message?: string };
    errors.general = errorData?.error?.message || errorData?.message || `API error: ${error.response?.statusText || error.message}`;
  }
}

/**
 * Test OpenAI credentials by attempting to make a simple API call.
 */
export async function testOpenAICredentials(
  credentials: OpenAICredentials,
): Promise<OpenAITestResult> {
  const errors: OpenAITestResult["errors"] = {};

  if (!credentials.apiUrl || credentials.apiUrl.trim() === "") errors.apiUrl = "API URL is required";
  if (!credentials.apiKey || credentials.apiKey.trim() === "") errors.apiKey = "API Key is required";
  if (Object.keys(errors).length > 0) return { success: false, errors };

  try {
    new URL(credentials.apiUrl);
  } catch {
    errors.apiUrl = "Invalid API URL format";
    return { success: false, errors };
  }

  try {
    const apiUrl = credentials.apiUrl.replace(/\/$/, "");
    const response = await axios.get(`${apiUrl}/models`, {
      headers: { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
      timeout: 15000,
    });

    if (response.status === 200) {
      logger.info("OpenAI credentials test successful");
      return { success: true };
    }
    errors.general = "Invalid response from API";
    return { success: false, errors };
  } catch (error) {
    logger.warn({ error }, "OpenAI credentials test failed");
    if (axios.isAxiosError(error)) {
      handleAxiosTestError(error, errors);
    } else {
      errors.general = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    }
    return { success: false, errors };
  }
}
