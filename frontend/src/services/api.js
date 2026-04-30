import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const TOKEN_KEY = 'access_token';

// ── Token helpers ──────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);
export const isAuthenticated = () => Boolean(getToken());

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401: clear stale token and bounce to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ── Auth ───────────────────────────────────────────────────────────────────
export const login = async (username, password) => {
  const { data } = await api.post('/auth/login', { username, password });
  setToken(data.access_token);
  return data;
};

export const logout = () => {
  removeToken();
  window.location.href = '/login';
};

export const register = (username, password, role = 'operator') =>
  api.post('/auth/register', { username, password, role }).then((r) => r.data);

export const getMe = () => api.get('/auth/me').then((r) => r.data);

// ── Violations ─────────────────────────────────────────────────────────────
export const getViolations = (params = {}) =>
  api.get('/violations', { params }).then((r) => r.data);

export const getViolation = (id) =>
  api.get(`/violations/${id}`).then((r) => r.data);

export const createRedLight = (body) =>
  api.post('/violations/red-light', body).then((r) => r.data);

export const createHelmet = (body) =>
  api.post('/violations/helmet', body).then((r) => r.data);

export const createSpeed = (body) =>
  api.post('/violations/speed', body).then((r) => r.data);

export const deleteViolation = (id) =>
  api.delete(`/violations/${id}`).then((r) => r.data);

// ── ANPR ───────────────────────────────────────────────────────────────────
export const getPlateByTrack = (trackId) =>
  api.get(`/anpr/${trackId}`).then((r) => r.data);

export const searchPlate = (plate) =>
  api.get('/anpr/search', { params: { plate } }).then((r) => r.data);

// ── Vehicles / Analytics ───────────────────────────────────────────────────
export const getVehicles = (params = {}) =>
  api.get('/vehicles', { params }).then((r) => r.data);

export const getCounting = (date) =>
  api.get('/analytics/counting', { params: date ? { date } : {} }).then((r) => r.data);

export const postCounting = (body) =>
  api.post('/analytics/counting', body).then((r) => r.data);

// ── Congestion / Optimization ──────────────────────────────────────────────
export const updateCongestion = (body) =>
  api.post('/congestion/update', body).then((r) => r.data);

export const setSignalState = (road_id, state) =>
  api.post('/congestion/signal-state', { road_id, state }).then((r) => r.data);

export const getCongestionStatus = () =>
  api.get('/congestion/status').then((r) => r.data);

export const createCongestionWebSocket = () => {
  const wsBase = BACKEND_URL.replace(/^http/, 'ws');
  return new WebSocket(`${wsBase}/congestion/ws`);
};

// ── Accidents / Alerts ─────────────────────────────────────────────────────
export const getAccidents = (params = {}) =>
  api.get('/alerts/accident', { params }).then((r) => r.data);

export const reportAccident = (body) =>
  api.post('/alerts/accident', body).then((r) => r.data);

export const resolveAccident = (id) =>
  api.patch(`/alerts/accident/${id}/resolve`).then((r) => r.data);

// ── Settings ───────────────────────────────────────────────────────────────
export const getSettings = () => api.get('/settings').then((r) => r.data);

export const saveSettings = (body) =>
  api.post('/settings', body).then((r) => r.data);

// ── Health ─────────────────────────────────────────────────────────────────
export const healthCheck = () => api.get('/health').then((r) => r.data);

export default api;
