// File: src/lib/http.ts | Purpose: Safe Axios wrapper that enforces relative-path requests to prevent SSRF/credential leakage
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// Build baseURL from env; empty string falls back to same-origin in browser
const baseURL = process.env.NEXT_PUBLIC_API_URL || '';

// Create a single axios instance for the app
const client: AxiosInstance = axios.create({
  baseURL,
  // Add withCredentials only if you intend to use cookies; leaving false by default
  withCredentials: false,
});

// Reject absolute URLs to avoid SSRF/leakage when baseURL is set
function assertRelativePath(url: string) {
  if (!url) throw new Error('Empty URL');
  const trimmed = url.trim();
  // Disallow protocol and protocol-relative absolute URLs
  if (/^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed)) {
    throw new Error('Absolute URLs are not allowed in API client');
  }
  // Ensure it starts with a single slash path for clarity
  if (!trimmed.startsWith('/')) {
    // normalize to "/path"
    return `/${trimmed}`;
  }
  return trimmed;
}

export const http = {
  get: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    const safeUrl = assertRelativePath(url);
    return client.get<T>(safeUrl, config);
  },
  post: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    const safeUrl = assertRelativePath(url);
    return client.post<T>(safeUrl, data, config);
  },
  put: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    const safeUrl = assertRelativePath(url);
    return client.put<T>(safeUrl, data, config);
  },
  patch: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    const safeUrl = assertRelativePath(url);
    return client.patch<T>(safeUrl, data, config);
  },
  delete: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    const safeUrl = assertRelativePath(url);
    return client.delete<T>(safeUrl, config);
  },
};

export default http;
