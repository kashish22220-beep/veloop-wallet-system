import axios from "axios";

// Only the JWT lives in localStorage. Balances ALWAYS come from the backend.
const TOKEN_KEY = "veloop_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });

http.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/")) {
      setToken(null);
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e.response?.data?.message || e.message || "Something went wrong. Please try again.";

export const api = async (path, options = {}) => {
  const requestPath = path.startsWith("/api/") ? path.slice(4) : path;
  const { body, ...config } = options;
  try {
    const response = await http.request({ url: requestPath, ...config, data: body });
    return response.data;
  } catch (error) {
    const normalized = new Error(errMsg(error));
    normalized.cause = error;
    throw normalized;
  }
};

export const login = (email, password) => http.post("/auth/login", { email, password }).then((r) => r.data);
export const register = (name, email, password) =>
  http.post("/auth/register", { name, email, password }).then((r) => r.data);
export const getMe = () => http.get("/auth/me").then((r) => r.data);
export const getWallet = () => http.get("/wallet").then((r) => r.data.wallet);
export const getTransactions = (page = 1, limit = 10) =>
  http.get("/wallet/transactions", { params: { page, limit } }).then((r) => r.data);
export const getPayoutMethods = () => http.get("/payout/methods").then((r) => r.data.methods);
export const getPayoutOptions = (method) => http.get(`/payout/options/${method}`).then((r) => r.data.options);

// Frontend sends ONLY method + optionId + details. Never an amount.
export const createWithdrawal = (body, idempotencyKey) =>
  http.post("/withdrawals", body, { headers: { "Idempotency-Key": idempotencyKey } }).then((r) => r.data);
