const TOKEN_STORAGE_KEY = "auth_token";
const USER_STORAGE_KEY = "auth_user";

const configuredApiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? "";
const apiBaseUrl = configuredApiBaseUrl.replace(/\/$/, "");

export type UserRole = "user" | "admin";
export type PaymentStatus = "paid" | "unpaid" | "expired";

export interface UserPayment {
  paid_until: string | null;
  is_paid: boolean;
  status: PaymentStatus;
  days_left: number;
}

export interface VpnAccessSummary {
  id?: number;
  server?: string;
  server_type?: string;
  vpn_ip?: string | null;
  status?: string | null;
  access_state?: string | null;
  revoked?: boolean;
}

export interface VpnUser {
  id: number;
  login: string;
  account_user_id: number | null;
  paid_until: string | null;
  is_paid: boolean;
  payment_status: PaymentStatus;
  payment: UserPayment;
  status?: string | null;
  access_state?: string | null;
  accesses: VpnAccessSummary[];
}

export interface TelegramLinkState {
  is_linked: boolean;
  linked_at: string | null;
  can_link: boolean;
  can_unlink: boolean;
}

export interface AuthUser {
  id: number;
  name: string;
  login: string;
  role: UserRole;
  vpn_user: VpnUser | null;
  two_factor_enabled: boolean;
  telegram_linked: boolean;
  telegram: TelegramLinkState;
  created_at: string;
  updated_at: string;
}

interface LoginResponse {
  user: AuthUser;
  token: string;
  token_type: "Bearer";
}

interface TwoFactorRequired {
  two_factor_required: true;
}

interface ErrorResponse {
  message?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(status: number, data: ErrorResponse, fallbackMessage: string) {
    super(data.message || fallbackMessage);
    this.name = "ApiError";
    this.status = status;
    this.errors = data.errors ?? {};
  }
}

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser): void {
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // The current request can still use the token if user data cannot be cached.
  }
}

export function saveAuthSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  saveAuthUser(user);
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export async function loginUser(
  login: string,
  password: string,
  code?: string,
): Promise<LoginResponse | TwoFactorRequired> {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ login, password, code }),
  });

  const data = await readJson<Partial<LoginResponse> & Partial<TwoFactorRequired> & ErrorResponse>(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data ?? {},
      "Не удалось выполнить вход.",
    );
  }

  if (data?.two_factor_required === true) {
    return { two_factor_required: true };
  }

  if (!data?.token || !data.user) {
    throw new ApiError(500, {}, "Сервер вернул неполные данные авторизации.");
  }

  saveAuthSession(data.token, data.user);
  return data as LoginResponse;
}

export function authorizedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    credentials: "omit",
    headers,
  });
}
