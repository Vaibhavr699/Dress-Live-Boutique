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

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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
    throw new Error(
      (typeof payload === "object" && payload && "detail" in payload
        ? String(payload.detail)
        : null) || "Something went wrong."
    );
  }

  return payload as T;
}
