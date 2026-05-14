import Constants from 'expo-constants';
import { useAuthStore } from '../store/useAuthStore';

const API_PATH = '/api/v1';
const API_PORT = '8000';
const FALLBACK_API_URL = 'http://localhost:8000/api/v1';

function normalizeBaseUrl(url: string) {
  const raw = url.trim();
  if (!raw) return `${FALLBACK_API_URL}`;

  // Make env/app.json values resilient to common mistakes like:
  // - missing scheme: "116.202.210.102:20245"
  // - stray query: "http://host:port?api/v1"
  // - trailing slashes
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(withScheme);
    parsed.search = '';
    parsed.hash = '';

    const basePath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = basePath.endsWith(API_PATH) ? basePath : `${basePath}${API_PATH}`;

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    const trimmedUrl = withScheme.replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (trimmedUrl.endsWith(API_PATH)) return trimmedUrl;
    return `${trimmedUrl}${API_PATH}`;
  }
}

function getBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
  }

  const appConfigUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof appConfigUrl === 'string' && appConfigUrl.trim()) {
    return normalizeBaseUrl(appConfigUrl);
  }

  const expoHostUri = Constants.expoConfig?.hostUri;
  const expoHost = expoHostUri?.split(':')[0];
  if (expoHost) {
    return `http://${expoHost}:${API_PORT}${API_PATH}`;
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}${API_PATH}`;
  }

  return FALLBACK_API_URL;
}

const BASE_URL = getBaseUrl();
const IS_WEB_RUNTIME = typeof window !== 'undefined' && typeof document !== 'undefined';

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_METHODS = new Set(['GET']);
const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';
}

function isNetworkError(error: unknown): boolean {
  const message = (error as { message?: string } | undefined)?.message ?? '';
  return /Network request failed|Failed to fetch|TypeError: Network/i.test(message);
}

type FetchWithOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: boolean;
};

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  options: FetchWithOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: FetchWithOptions = {}
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const retryEnabled = options.retry ?? RETRY_METHODS.has(method);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init, options);
      if (retryEnabled && RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (isAbortError(error) && options.signal?.aborted) throw error;
      if (!retryEnabled || attempt >= MAX_RETRIES) throw error;
      if (!isNetworkError(error) && !isAbortError(error)) throw error;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

type ApiErrorMeta = Error & {
  status?: number;
  detail?: string;
  endpoint?: string;
  debugMessage?: string;
};

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function parseRawResponseBody(raw: string, contentType: string) {
  if ((contentType || '').includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function extractServerDetail(payload: unknown) {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return first.trim();
    if (first && typeof first === 'object' && typeof (first as { msg?: unknown }).msg === 'string') {
      return String((first as { msg?: unknown }).msg).trim();
    }
  }

  return '';
}

function attachApiMeta(error: Error, meta: Omit<ApiErrorMeta, keyof Error>) {
  return Object.assign(error, meta);
}

function getFriendlyErrorMessage(params: {
  status?: number;
  detail?: string;
  endpoint?: string;
  fallbackMessage?: string;
}) {
  const detail = (params.detail || '').trim();
  const normalized = detail.toLowerCase();
  const endpoint = params.endpoint || '';
  const status = params.status;

  if (endpoint === '/login/access-token') {
    return 'Incorrect email or password.';
  }
  if (normalized.includes('already exists') && normalized.includes('email')) {
    return 'This email is already in use.';
  }
  if (normalized.includes('already exists')) {
    return 'This information is already in use.';
  }
  if (normalized.includes('maximum of 4 dresses')) {
    return 'You can save up to 4 dresses.';
  }
  if (normalized.includes('incorrect verification code')) {
    return 'The verification code is incorrect.';
  }
  if (normalized.includes('invalid email') || normalized.includes('invalid')) {
    return 'Please check your details and try again.';
  }
  if (endpoint.includes('profile-image') || endpoint.includes('header-image') || endpoint.includes('logo-image') || endpoint.includes('interior-image')) {
    return 'We could not upload the image. Please try again.';
  }

  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 409) return 'This information is already in use.';
  if (status === 422) return 'Please check your details and try again.';
  if (status === 400) return 'Please review your details and try again.';
  if (typeof status === 'number' && status >= 500) {
    return 'Something went wrong. Please try again.';
  }

  return params.fallbackMessage || 'Something went wrong. Please try again.';
}

function createHttpError(status: number, payload: unknown, endpoint: string, fallbackMessage: string) {
  const detail = extractServerDetail(payload);
  return attachApiMeta(new Error(getFriendlyErrorMessage({ status, detail, endpoint, fallbackMessage })), {
    status,
    detail,
    endpoint,
    debugMessage: detail || fallbackMessage,
  });
}

function createApiError(error: any) {
  if (error instanceof Error && ('status' in error || 'detail' in error || 'endpoint' in error)) {
    return error as ApiErrorMeta;
  }

  const message = typeof error?.message === 'string' ? error.message : '';
  const name = typeof error?.name === 'string' ? error.name : '';

  if (name === 'AbortError' || /aborted/i.test(message)) {
    return attachApiMeta(new Error('The request took too long. Please check your connection and try again.'), {
      debugMessage: message || 'Aborted',
    });
  }

  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return attachApiMeta(new Error("We couldn't connect right now. Please try again."), {
      debugMessage: message || 'Network request failed',
    });
  }

  return attachApiMeta(new Error('Something went wrong. Please try again.'), {
    debugMessage: message || String(error ?? 'Unknown error'),
  });
}

function logApiError(method: string, endpoint: string, apiError: ApiErrorMeta, rawError: unknown) {
  const status = apiError.status;
  const isHandledClientError = typeof status === 'number' && status >= 400 && status < 500;
  const detail = apiError.detail || apiError.debugMessage || apiError.message;
  const summary = `[API ${method}] ${endpoint} → ${status ?? 'no-response'}: ${detail}`;

  if (isHandledClientError) {
    console.warn(summary);
  } else {
    console.error(summary, rawError);
  }
}

async function postMultipartNative(endpoint: string, formData: FormData, options: any = {}) {
  const authHeader = api.getHeaders()['Authorization'];

  return await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${endpoint}`);

    const headers = {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(options.headers || {}),
    } as Record<string, string>;

    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') ?? '';
      const payload = parseRawResponseBody(xhr.responseText ?? '', contentType);

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      reject(createHttpError(xhr.status, payload, endpoint, 'Upload failed.'));
    };

    xhr.onerror = () => {
      reject(new TypeError('Network request failed'));
    };

    xhr.ontimeout = () => {
      reject(new TypeError('Network request failed'));
    };

    xhr.send(formData);
  });
}

export const api = {
  baseUrl: BASE_URL,
  getHeaders() {
    const token = useAuthStore.getState().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  },

  async post(endpoint: string, body: any, options: any = {}) {
    try {
      const response = await fetchWithRetry(
        `${BASE_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
          body: JSON.stringify(body),
        },
        { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Something went wrong. Please try again.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('POST', endpoint, apiError, error);
      throw apiError;
    }
  },

  async put(endpoint: string, body: any, options: any = {}) {
    try {
      const response = await fetchWithRetry(
        `${BASE_URL}${endpoint}`,
        {
          method: 'PUT',
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
          body: JSON.stringify(body),
        },
        { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Something went wrong. Please try again.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('PUT', endpoint, apiError, error);
      throw apiError;
    }
  },

  async postForm(endpoint: string, formData: URLSearchParams, options: any = {}) {
    try {
      const authHeader = this.getHeaders()['Authorization'];
      const response = await fetchWithRetry(
        `${BASE_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            ...options.headers,
          },
          body: formData.toString(),
        },
        { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Login failed.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('POST Form', endpoint, apiError, error);
      throw apiError;
    }
  },

  async postMultipart(endpoint: string, formData: FormData, options: any = {}) {
    try {
      if (!IS_WEB_RUNTIME && typeof XMLHttpRequest !== 'undefined') {
        return await postMultipartNative(endpoint, formData, options);
      }

      const authHeader = this.getHeaders()['Authorization'];
      const response = await fetchWithTimeout(
        `${BASE_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            ...options.headers,
          },
          body: formData,
        },
        { signal: options.signal, timeoutMs: options.timeoutMs ?? 60_000 }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Upload failed.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('POST Multipart', endpoint, apiError, error);
      throw apiError;
    }
  },

  async get(endpoint: string, options: any = {}) {
    try {
      const response = await fetchWithRetry(
        `${BASE_URL}${endpoint}`,
        {
          method: 'GET',
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
        },
        { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Failed to load data.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('GET', endpoint, apiError, error);
      throw apiError;
    }
  },

  async delete(endpoint: string, options: any = {}) {
    try {
      const response = await fetchWithRetry(
        `${BASE_URL}${endpoint}`,
        {
          method: 'DELETE',
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
          ...(options.body ? { body: options.body } : {}),
        },
        { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry }
      );

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw createHttpError(response.status, data, endpoint, 'Could not remove the item.');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      logApiError('DELETE', endpoint, apiError, error);
      throw apiError;
    }
  },
};

