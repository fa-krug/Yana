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
 * Test OpenAI credentials by attempting to make a simple API call.
 */
export async function testOpenAICredentials(
  credentials: OpenAICredentials,
): Promise<OpenAITestResult> {
  const errors: OpenAITestResult["errors"] = {};

  // Validate required fields
  if (!credentials.apiUrl || credentials.apiUrl.trim() === "") {
    errors.apiUrl = "API URL is required";
  }

  if (!credentials.apiKey || credentials.apiKey.trim() === "") {
    errors.apiKey = "API Key is required";
  }

  // If basic validation fails, return early
  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  // Validate URL format
  try {
    new URL(credentials.apiUrl);
  } catch {
    errors.apiUrl = "Invalid API URL format";
    return { success: false, errors };
  }

  try {
    // Test credentials by attempting to list models (lightweight operation)
    // For OpenAI-compatible APIs, we'll try the models endpoint
    const apiUrl = credentials.apiUrl.replace(/\/$/, ""); // Remove trailing slash
    const modelsUrl = `${apiUrl}/models`;

    const response = await axios.get(modelsUrl, {
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000, // 15 second timeout (AI APIs can be slower)
    });

    // If we get a successful response, credentials are valid
    if (response.status === 200) {
      logger.info("OpenAI credentials test successful");
      return { success: true };
    }

    // Unexpected response
    errors.general = "Invalid response from API";
    return { success: false, errors };
  } catch (error) {
    logger.warn({ error }, "OpenAI credentials test failed");

    if (axios.isAxiosError(error)) {
      // Handle specific HTTP errors
      if (error.response?.status === 401) {
        errors.apiKey = "Invalid API Key";
        errors.general = "Invalid API Key";
      } else if (error.response?.status === 403) {
        errors.apiKey = "API Key does not have required permissions";
        errors.general = "API Key does not have required permissions";
      } else if (error.response?.status === 404) {
        // Some APIs might not have /models endpoint, try a simple chat completion instead
        // But for now, we'll just report it as an API URL issue
        errors.apiUrl =
          "API endpoint not found. Check if the API URL is correct.";
        errors.general =
          "API endpoint not found. Check if the API URL is correct.";
      } else if (error.response?.status === 429) {
        errors.general = "Rate limited by API. Please try again later.";
      } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        errors.general =
          "Connection timeout. Please check your internet connection and API URL.";
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        errors.apiUrl = "Cannot connect to API. Please check the API URL.";
        errors.general =
          "Cannot connect to API. Please check the API URL and your internet connection.";
      } else if (error.code === "ERR_INVALID_URL") {
        errors.apiUrl = "Invalid API URL format";
        errors.general = "Invalid API URL format";
      } else {
        // Other HTTP errors
        const errorData = error.response?.data;
        const errorMessage =
          errorData?.error?.message ||
          errorData?.message ||
          `API error: ${error.response?.statusText || error.message}`;
        errors.general = errorMessage;
      }
    } else {
      // Non-Axios errors
      errors.general = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return { success: false, errors };
  }
}
