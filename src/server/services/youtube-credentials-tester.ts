/**
 * YouTube credentials testing with error handling.
 *
 * Tests YouTube API credentials and provides detailed error categorization.
 * Handles both response body errors and Axios exceptions.
 */

import axios, { AxiosError, AxiosResponse } from "axios";

import { logger } from "../utils/logger";

export interface YouTubeCredentials {
  apiKey: string;
}

export interface YouTubeTestResult {
  success: boolean;
  errors?: {
    apiKey?: string;
    general?: string;
  };
}

/**
 * Validate YouTube API credentials by making a test API call.
 */
export async function testYouTubeCredentials(
  credentials: YouTubeCredentials,
): Promise<YouTubeTestResult> {
  // 1. Validate input
  const validationError = validateCredentialsInput(credentials);
  if (validationError) {
    return validationError;
  }

  // 2. Call YouTube API
  try {
    const response = await callYouTubeTestAPI(credentials.apiKey);

    // 3. Validate response
    const responseError = validateAPIResponse(response);
    if (responseError) {
      return responseError;
    }

    logger.info("YouTube credentials test successful");
    return { success: true };
  } catch (error) {
    logger.warn({ error }, "YouTube credentials test failed");
    return handleTestAPIError(error);
  }
}

/**
 * Validate credential input before making API call.
 */
function validateCredentialsInput(
  credentials: YouTubeCredentials,
): YouTubeTestResult | null {
  if (!credentials.apiKey || credentials.apiKey.trim() === "") {
    return {
      success: false,
      errors: {
        apiKey: "API Key is required",
      },
    };
  }
  return null;
}

/**
 * Make a test call to YouTube API.
 */
async function callYouTubeTestAPI(apiKey: string): Promise<AxiosResponse> {
  const testChannelId = "UCBR8-60-B28hp2BmDPdntcQ"; // YouTube's official channel
  return axios.get("https://www.googleapis.com/youtube/v3/channels", {
    params: {
      part: "id",
      id: testChannelId,
      key: apiKey,
    },
    timeout: 10000,
  });
}

/**
 * Validate API response for errors in response body.
 * Some YouTube API errors return 200 status with error in body.
 */
function validateAPIResponse(response: AxiosResponse): YouTubeTestResult | null {
  if (response.status !== 200) {
    return {
      success: false,
      errors: {
        general: "Invalid response from YouTube API",
      },
    };
  }

  // Check if API returned error in response body
  const apiError = response.data?.error;
  if (!apiError) {
    return null; // No error in response body
  }

  return classifyResponseBodyError(apiError);
}

/**
 * Classify error returned in API response body.
 */
function classifyResponseBodyError(apiError: any): YouTubeTestResult {
  const errorCode = apiError.code;

  if (errorCode === 400) {
    return {
      success: false,
      errors: {
        apiKey: "Invalid API Key",
        general: "Invalid API Key",
      },
    };
  }

  if (errorCode === 403) {
    return {
      success: false,
      errors: {
        apiKey: "API Key is restricted or quota exceeded",
        general:
          "API Key is restricted or quota exceeded. Check API restrictions in Google Cloud Console.",
      },
    };
  }

  return {
    success: false,
    errors: {
      general: apiError.message || "YouTube API error",
    },
  };
}

/**
 * Handle Axios exception or other errors from test API call.
 */
function handleTestAPIError(error: unknown): YouTubeTestResult {
  if (axios.isAxiosError(error)) {
    return handleAxiosError(error);
  }

  return {
    success: false,
    errors: {
      general: `Unexpected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    },
  };
}

/**
 * Handle Axios HTTP errors.
 */
function handleAxiosError(error: AxiosError): YouTubeTestResult {
  const status = error.response?.status;
  const code = error.code;
  const errorData = error.response?.data as any;

  // 400 Bad Request
  if (status === 400) {
    return {
      success: false,
      errors: {
        apiKey: "Invalid API Key",
        general: "Invalid API Key",
      },
    };
  }

  // 403 Forbidden - check reason
  if (status === 403) {
    const reason = errorData?.error?.errors?.[0]?.reason;
    return classify403Error(reason);
  }

  // 401 Unauthorized
  if (status === 401) {
    return {
      success: false,
      errors: {
        apiKey: "Invalid API Key",
        general: "Invalid API Key",
      },
    };
  }

  // Connection timeouts
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return {
      success: false,
      errors: {
        general:
          "Connection timeout. Please check your internet connection.",
      },
    };
  }

  // Connection errors
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
    return {
      success: false,
      errors: {
        general:
          "Cannot connect to YouTube API. Please check your internet connection.",
      },
    };
  }

  // Generic HTTP error
  return {
    success: false,
    errors: {
      general:
        errorData?.error?.message ||
        `YouTube API error: ${error.response?.statusText || error.message}`,
    },
  };
}

/**
 * Classify 403 Forbidden errors by specific reason.
 */
function classify403Error(reason?: string): YouTubeTestResult {
  if (reason === "quotaExceeded") {
    return {
      success: false,
      errors: {
        general: "YouTube API quota exceeded. Please try again later.",
      },
    };
  }

  if (reason === "accessNotConfigured") {
    return {
      success: false,
      errors: {
        general:
          "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.",
      },
    };
  }

  // Generic 403 error
  return {
    success: false,
    errors: {
      apiKey: "API Key is restricted or invalid",
      general:
        "API Key is restricted or invalid. Check API restrictions in Google Cloud Console.",
    },
  };
}
