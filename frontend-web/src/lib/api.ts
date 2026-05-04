const API_PATH = "/api/v1";
const API_PORT = "8000";

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith(API_PATH) ? trimmed : `${trimmed}${API_PATH}`;
}

export function getApiBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}${API_PATH}`;
  }

  return `http://localhost:${API_PORT}${API_PATH}`;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function extractServerDetail(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string") return first.trim();
    if (first && typeof first === "object" && typeof (first as { msg?: unknown }).msg === "string") {
      return String((first as { msg?: unknown }).msg).trim();
    }
  }

  return "";
}

function getFriendlyErrorMessage(params: {
  status: number;
  endpoint: string;
  detail?: string;
  fallbackMessage: string;
}) {
  const detail = (params.detail || "").trim().toLowerCase();

  if (params.endpoint === "/login/access-token") {
    return "Incorrect email or password.";
  }
  if (detail.includes("already exists") && detail.includes("email")) {
    return "This email is already in use.";
  }
  if (detail.includes("already exists")) {
    return "This information is already in use.";
  }
  if (detail.includes("maximum of 4 dresses")) {
    return "You can save up to 4 dresses.";
  }
  if (params.status === 401) return "Your session has expired. Please log in again.";
  if (params.status === 403) return "You do not have permission to do this.";
  if (params.status === 404) return "We couldn't find what you were looking for.";
  if (params.status === 422) return "Please check your details and try again.";
  if (params.status === 400) return "Please review your details and try again.";
  if (params.status >= 500) return "Something went wrong. Please try again.";

  return params.fallbackMessage;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body instanceof URLSearchParams
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      const detail = extractServerDetail(payload);
      const friendlyMessage = getFriendlyErrorMessage({
        status: response.status,
        endpoint,
        detail,
        fallbackMessage: "Something went wrong. Please try again.",
      });

      console.error(`API Error [${endpoint}]`, {
        status: response.status,
        detail,
        payload,
      });

      throw new Error(friendlyMessage);
    }

    return payload as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Failed to fetch")) {
      console.error(`API Network Error [${endpoint}]`, error);
      throw new Error("We couldn't connect right now. Please try again.");
    }
    throw error;
  }
}
