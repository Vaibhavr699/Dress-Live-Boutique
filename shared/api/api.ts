import Constants from 'expo-constants';
import { useAuthStore } from '../store/useAuthStore';

const API_PATH = '/api/v1';
const API_PORT = '8000';
const FALLBACK_API_URL = 'http://192.168.29.254:8000/api/v1';

function normalizeBaseUrl(url: string) {
  const trimmedUrl = url.trim().replace(/\/+$/, '');

  if (trimmedUrl.endsWith(API_PATH)) {
    return trimmedUrl;
  }

  return `${trimmedUrl}${API_PATH}`;
}

function getBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
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

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function createApiError(error: any) {
  const message = typeof error?.message === 'string' ? error.message : '';

  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return new Error(
      `Cannot reach the API server at ${BASE_URL}. Make sure the phone and computer are on the same Wi-Fi and the backend is running on 0.0.0.0:${API_PORT}.`
    );
  }

  return error;
}

export const api = {
  getHeaders() {
    const token = useAuthStore.getState().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  },

  async post(endpoint: string, body: any, options: any = {}) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        body: JSON.stringify(body),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Something went wrong');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API POST Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },

  async put(endpoint: string, body: any, options: any = {}) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        body: JSON.stringify(body),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Something went wrong');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API PUT Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },

  async postForm(endpoint: string, formData: URLSearchParams, options: any = {}) {
    try {
      const authHeader = this.getHeaders()['Authorization'];
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(authHeader ? { 'Authorization': authHeader } : {}),
          ...options.headers,
        },
        body: formData.toString(),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Login failed');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API POST Form Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },

  async postMultipart(endpoint: string, formData: FormData, options: any = {}) {
    try {
      const authHeader = this.getHeaders()['Authorization'];
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          ...(authHeader ? { 'Authorization': authHeader } : {}),
          ...options.headers,
        },
        body: formData,
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Upload failed');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API POST Multipart Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },

  async get(endpoint: string, options: any = {}) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Failed to fetch data');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API GET Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },

  async delete(endpoint: string, options: any = {}) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        ...(options.body ? { body: options.body } : {}),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error((typeof data === 'object' && data?.detail) || 'Failed to delete data');
      }

      return data;
    } catch (error: any) {
      const apiError = createApiError(error);
      console.error(`API DELETE Error [${endpoint}] (${BASE_URL}):`, apiError);
      throw apiError;
    }
  },
};

