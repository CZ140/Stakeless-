import axios from 'axios';

let accessToken: string | null = null;

export const setAccessToken = (t: string | null): void => { accessToken = t; };
export const getAccessToken = (): string | null => accessToken;

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // Required: sends httpOnly refresh cookie on POST /auth/refresh
});

// Attach Bearer token to every outgoing request
apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Silent refresh on 401 — queue concurrent requests behind a single refresh call
let refreshingPromise: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as { config?: { _retry?: boolean; headers?: Record<string, string> }; response?: { status: number } };
    const originalRequest = axiosError.config;

    if (axiosError.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshingPromise) {
        refreshingPromise = axios
          .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
          .then((r) => {
            accessToken = r.data.accessToken;
            return accessToken;
          })
          .catch(() => {
            accessToken = null;
            return null;
          })
          .finally(() => {
            refreshingPromise = null;
          });
      }

      const newToken = await refreshingPromise;

      if (newToken) {
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest as Parameters<typeof apiClient>[0]);
      }

      // Refresh failed — signal app to redirect to login
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }

    return Promise.reject(error);
  },
);
