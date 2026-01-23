import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

interface ApiRequestOptions {
  timeout?: number;
  retries?: number;
  enableLogging?: boolean;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 2;
const isDev = process.env.NODE_ENV === 'development';

function logRequest(method: string, url: string, data?: unknown): void {
  console.log(`[API Request] ${method} ${url}`, data ? { body: data } : '');
}

function logResponse(method: string, url: string, status: number, duration: number): void {
  console.log(`[API Response] ${method} ${url} - ${status} (${duration}ms)`);
}

function logError(method: string, url: string, error: unknown): void {
  console.error(`[API Error] ${method} ${url}`, error);
}

async function parseErrorResponse(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const json = await res.json();
      return {
        message: json.message || json.error || res.statusText,
        code: json.code,
      };
    }
    const text = await res.text();
    return { message: text || res.statusText };
  } catch {
    return { message: res.statusText };
  }
}

function isRetryableError(status: number): boolean {
  return status >= 500 && status < 600;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, `Request timeout after ${timeout}ms`, 'TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    enableLogging = isDev,
  } = options;

  const startTime = Date.now();
  
  if (enableLogging) {
    logRequest(method, url, data);
  }

  const fetchOptions: RequestInit = {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  };

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(url, fetchOptions, timeout);

      if (enableLogging) {
        logResponse(method, url, res.status, Date.now() - startTime);
      }

      if (!res.ok) {
        const { message, code } = await parseErrorResponse(res);
        const error = new ApiError(res.status, `${res.status}: ${message}`, code);

        if (isRetryableError(res.status) && attempt < retries) {
          lastError = error;
          attempt++;
          const backoffTime = Math.pow(2, attempt) * 1000;
          if (enableLogging) {
            console.log(`[API Retry] Attempt ${attempt + 1}/${retries + 1} after ${backoffTime}ms`);
          }
          await sleep(backoffTime);
          continue;
        }

        if (enableLogging) {
          logError(method, url, error);
        }
        throw error;
      }

      return res;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (enableLogging) {
        logError(method, url, error);
      }

      if (attempt < retries && !(error instanceof ApiError && !isRetryableError(error.status))) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        const backoffTime = Math.pow(2, attempt) * 1000;
        if (enableLogging) {
          console.log(`[API Retry] Attempt ${attempt + 1}/${retries + 1} after ${backoffTime}ms`);
        }
        await sleep(backoffTime);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new ApiError(500, 'Request failed after retries', 'MAX_RETRIES');
}

async function apiRequestJson<T>(
  method: string,
  url: string,
  data?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const res = await apiRequest(method, url, data, options);
  
  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return {} as T;
  }
  
  return res.json();
}

export const api = {
  get: <T>(url: string, options?: ApiRequestOptions): Promise<T> => 
    apiRequestJson<T>('GET', url, undefined, options),
  
  post: <T>(url: string, data: unknown, options?: ApiRequestOptions): Promise<T> => 
    apiRequestJson<T>('POST', url, data, options),
  
  put: <T>(url: string, data: unknown, options?: ApiRequestOptions): Promise<T> => 
    apiRequestJson<T>('PUT', url, data, options),
  
  patch: <T>(url: string, data: unknown, options?: ApiRequestOptions): Promise<T> => 
    apiRequestJson<T>('PATCH', url, data, options),
  
  delete: async (url: string, options?: ApiRequestOptions): Promise<void> => {
    await apiRequest('DELETE', url, undefined, options);
  },
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    try {
      const res = await fetchWithTimeout(
        url,
        { credentials: "include" },
        DEFAULT_TIMEOUT
      );

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      if (!res.ok) {
        const { message, code } = await parseErrorResponse(res);
        throw new ApiError(res.status, `${res.status}: ${message}`, code);
      }

      return await res.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout', 'TIMEOUT');
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export default api;
