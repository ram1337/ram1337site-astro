import { saveDownload } from "./download";
import {
  authorizedFetch,
  clearAuthSession,
  getAuthToken,
  type AuthUser,
} from "./auth";

type UserRole = "user" | "admin";

interface VpnAccess {
  id: number;
  login?: string | null;
  server: string;
  server_type?: string | null;
  vpn_ip?: string | null;
  remote_identifier?: string | null;
  public_key?: string | null;
  status?: "active" | "provisioning" | "sync_failed" | "revoked" | null;
  revoked?: boolean;
  revoked_at?: string | null;
  config_status?:
    | "available"
    | "revoked"
    | "incomplete"
    | "unavailable"
    | "credentials_issued"
    | null;
  config_available?: boolean;
  has_config_material?: boolean;
  latest_handshake_at?: string | null;
  latest_handshake?: number | string | null;
  transfer_rx?: number | string | null;
  transfer_tx?: number | string | null;
  remote_endpoint?: string | null;
  remote_synced_at?: string | number | null;
  remote_state_error?: string | null;
  credential_type?: "ikev2_login_password" | string | null;
  credentials_available?: boolean;
  ikev2_login?: string | null;
  ikev2_password?: string | null;
  ikev2_credentials?: {
    login?: string | null;
    password?: string | null;
  } | null;
}

interface AdminVpnUser {
  id: number;
  login: string;
  account_user_id?: number | null;
  status?: string | null;
  access_state?: string | null;
  paid_until?: string | null;
  is_paid?: boolean;
  payment_status?: "paid" | "unpaid" | "expired";
  payment?: {
    paid_until?: string | null;
    is_paid?: boolean;
    status?: "paid" | "unpaid" | "expired";
    days_left?: number;
  } | null;
  accesses: VpnAccess[];
}

interface AdminUser {
  type: "account" | "vpn_anonymous";
  is_anonymous: boolean;
  id: number | null;
  account_user_id?: number | null;
  vpn_user_id?: number | null;
  name?: string | null;
  login?: string | null;
  role?: UserRole | null;
  blocked?: boolean;
  blocked_at?: string | null;
  paid_until?: string | null;
  is_paid?: boolean;
  payment_status?: "paid" | "unpaid" | "expired";
  payment?: {
    paid_until?: string | null;
    is_paid?: boolean;
    status?: "paid" | "unpaid" | "expired";
    days_left?: number;
  } | null;
  vpn_user?: AdminVpnUser | null;
}

interface AdminVpnServer {
  id: number;
  slug: string;
  type: string;
  host?: string | null;
  ssh_port?: number | null;
  subnet?: string | null;
  endpoint?: string | null;
  country_name?: string | null;
  country?: string | null;
  country_flag_emoji?: string | null;
  emoji_flag?: string | null;
  city?: string | null;
  enabled: boolean;
  metadata?: Record<string, unknown> | null;
}

interface UnnamedAccess {
  server: string;
  server_id?: number | null;
  ok: boolean;
  remote_identifier?: string | null;
  vpn_ip?: string | null;
  paid_until?: string | null;
  login?: string | null;
  login_source?: "local" | "remote" | null;
  remote_login?: string | null;
  local_access_id?: number | null;
  local_login?: string | null;
  vpn_user_id?: number | null;
  account_user_id?: number | null;
  local_status?: string | null;
  matched_by?: "remote_identifier" | "vpn_ip" | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  error?: string | null;
}

interface ApiPayload {
  data?: unknown;
  user?: unknown;
  vpn_user?: unknown;
  server?: unknown;
  message?: string;
  error?: string | null;
  errors?: Record<string, string[]>;
  revoked?: boolean;
}

interface RevokeVpnUserAccessResult {
  server: string;
  revoked: boolean;
  access_id?: number | null;
  status?: string | null;
  remote_identifier?: string | null;
  error?: string | null;
}

interface RevokeVpnUserAccessesResponse {
  vpn_user_id: number;
  login: string;
  revoked: boolean;
  data: RevokeVpnUserAccessResult[];
}

class ApiRequestError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(
    status: number,
    message: string,
    errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errors = errors;
  }
}

class AdminAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAccessError";
  }
}

const byId = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const adminLoading = byId("admin-loading");
const adminAccessError = byId("admin-access-error");
const adminContent = byId("admin-content");
const adminNotice = byId("admin-notice");

const createUserToggle = byId<HTMLButtonElement>("create-user-toggle");
const createUserForm = byId<HTMLFormElement>("create-user-form");
const createUserCancel = byId<HTMLButtonElement>("create-user-cancel");
const createUserLogin = byId<HTMLInputElement>("create-user-login");
const createUserName = byId<HTMLInputElement>("create-user-name");
const createUserPassword = byId<HTMLInputElement>("create-user-password");
const createUserPaidUntil = byId<HTMLInputElement>("create-user-paid-until");
const createUserSubmit = byId<HTMLButtonElement>("create-user-submit");
const createUserError = byId("create-user-error");
const createUserFieldErrors = {
  login: byId("create-user-login-error"),
  name: byId("create-user-name-error"),
  password: byId("create-user-password-error"),
  paid_until: byId("create-user-paid-until-error"),
};
const createUserFields = {
  login: createUserLogin,
  name: createUserName,
  password: createUserPassword,
  paid_until: createUserPaidUntil,
};
const usersLoginSearch = byId<HTMLInputElement>("users-login-search");
const usersBlockFilter = byId<HTMLSelectElement>("users-block-filter");
const usersPaymentFilter = byId<HTMLSelectElement>("users-payment-filter");
const usersRoleFilter = byId<HTMLSelectElement>("users-role-filter");
const usersReload = byId<HTMLButtonElement>("users-reload");
const usersError = byId("users-error");
const usersLoading = byId("users-loading");
const usersEmpty = byId("users-empty");
const usersTableWrap = byId("users-table-wrap");
const usersTableBody = byId<HTMLTableSectionElement>("users-table-body");

const userDetail = byId("user-detail");
const userDetailTitle = byId("user-detail-title");
const userDetailType = byId("user-detail-type");
const userDetailClose = byId<HTMLButtonElement>("user-detail-close");
const userRevokeAllAccesses = byId<HTMLButtonElement>(
  "user-revoke-all-accesses",
);
const userRevokeAllResult = byId("user-revoke-all-result");
const userRevokeAllResultList = byId("user-revoke-all-result-list");
const userEditForm = byId<HTMLFormElement>("user-edit-form");
const userName = byId<HTMLInputElement>("user-name");
const userLogin = byId<HTMLInputElement>("user-login");
const userRole = byId<HTMLSelectElement>("user-role");
const userPaidUntil = byId<HTMLInputElement>("user-paid-until");
const userSave = byId<HTMLButtonElement>("user-save");
const userBlockToggle = byId<HTMLButtonElement>("user-block-toggle");
const userPasswordForm = byId<HTMLFormElement>("user-password-form");
const userPassword = byId<HTMLInputElement>("user-password");
const userPasswordConfirmation = byId<HTMLInputElement>(
  "user-password-confirmation",
);
const userPasswordSave = byId<HTMLButtonElement>("user-password-save");
const userIkev2Accesses = byId("user-ikev2-accesses");
const userAccesses = byId("user-accesses");

const serversReload = byId<HTMLButtonElement>("servers-reload");
const serversError = byId("admin-servers-error");
const serversLoading = byId("admin-servers-loading");
const serversEmpty = byId("admin-servers-empty");
const serversList = byId("admin-servers-list");
const serverEditForm = byId<HTMLFormElement>("server-edit-form");
const serverDetailTitle = byId("server-detail-title");
const serverDetailClose = byId<HTMLButtonElement>("server-detail-close");
const serverSlug = byId<HTMLInputElement>("server-slug");
const serverType = byId<HTMLInputElement>("server-type");
const serverHost = byId<HTMLInputElement>("server-host");
const serverSshPort = byId<HTMLInputElement>("server-ssh-port");
const serverSubnet = byId<HTMLInputElement>("server-subnet");
const serverEndpoint = byId<HTMLInputElement>("server-endpoint");
const serverCountry = byId<HTMLInputElement>("server-country");
const serverFlag = byId<HTMLInputElement>("server-flag");
const serverCity = byId<HTMLInputElement>("server-city");
const serverEnabled = byId<HTMLInputElement>("server-enabled");
const serverMetadata = byId<HTMLTextAreaElement>("server-metadata");
const serverSave = byId<HTMLButtonElement>("server-save");

const unnamedServerFilter = byId<HTMLSelectElement>("unnamed-server-filter");
const unnamedReasonFilter = byId<HTMLSelectElement>("unnamed-reason-filter");
const unnamedLoginFilter = byId<HTMLSelectElement>("unnamed-login-filter");
const unnamedMatchFilter = byId<HTMLSelectElement>("unnamed-match-filter");
const unnamedReload = byId<HTMLButtonElement>("unnamed-reload");
const unnamedError = byId("unnamed-error");
const unnamedLoading = byId("unnamed-loading");
const unnamedEmpty = byId("unnamed-empty");
const unnamedTableWrap = byId("unnamed-table-wrap");
const unnamedTableBody = byId<HTMLTableSectionElement>("unnamed-table-body");

let users: AdminUser[] = [];
let servers: AdminVpnServer[] = [];
let unnamedAccesses: UnnamedAccess[] = [];
let selectedUser: AdminUser | null = null;
let selectedServer: AdminVpnServer | null = null;
let usersRequestSequence = 0;
let usersSearchTimer: number | undefined;

const collator = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function setVisible(element: HTMLElement | null, visible: boolean): void {
  element?.classList.toggle("hidden", !visible);
}

function setMessage(element: HTMLElement | null, message = ""): void {
  if (!element) return;
  element.textContent = message;
  setVisible(element, Boolean(message));
}

function showNotice(message: string, type: "success" | "error" = "success") {
  if (!adminNotice) return;

  adminNotice.className =
    type === "success"
      ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  adminNotice.textContent = message;
  adminNotice.classList.remove("hidden");
}

function setButtonLoading(
  button: HTMLButtonElement | null,
  loading: boolean,
  label = "Сохраняем...",
): void {
  if (!button) return;

  if (loading) {
    button.dataset.defaultLabel = button.textContent?.trim() || "Готово";
    button.textContent = label;
  } else {
    button.textContent = button.dataset.defaultLabel || button.textContent;
  }

  button.disabled = loading;
}

function redirectToLogin(): never {
  clearAuthSession();
  window.location.replace("/login/");
  throw new Error("Необходима авторизация.");
}

async function readPayload(response: Response): Promise<ApiPayload> {
  return response.json().catch(() => ({})) as Promise<ApiPayload>;
}

function getPayloadMessage(payload: ApiPayload, fallback: string): string {
  const validationMessage = payload.errors
    ? Object.values(payload.errors).flat().find(Boolean)
    : undefined;

  return payload.error || validationMessage || payload.message || fallback;
}

function showAccessDenied(sourceMessage = ""): void {
  const message = /блок/i.test(sourceMessage)
    ? "Пользователь заблокирован"
    : "Недостаточно прав";

  setVisible(adminLoading, false);
  setVisible(adminContent, false);
  setMessage(adminAccessError, message);
}

async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!getAuthToken()) {
    redirectToLogin();
  }

  const response = await authorizedFetch(path, init);

  if (response.status === 401) {
    redirectToLogin();
  }

  if (response.status === 403) {
    const payload = await readPayload(response.clone());
    const message = getPayloadMessage(payload, "Недостаточно прав");
    showAccessDenied(message);
    throw new AdminAccessError(message);
  }

  return response;
}

async function requestJson<T = ApiPayload>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await adminFetch(path, init);
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      getPayloadMessage(payload, "Не удалось выполнить запрос."),
      payload.errors ?? {},
    );
  }

  return payload as T;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isAccessError(error: unknown): boolean {
  return error instanceof AdminAccessError;
}

function unwrapList<T>(payload: ApiPayload): T[] {
  return Array.isArray(payload.data) ? (payload.data as T[]) : [];
}

function unwrapEntity<T>(payload: ApiPayload, key: "user" | "server"): T {
  const value = payload.data ?? payload[key] ?? payload;
  return value as T;
}

function badge(text: string, tone: "green" | "amber" | "red" | "neutral") {
  const classes = {
    green:
      "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    amber:
      "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    red: "inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    neutral:
      "inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return createElement("span", classes[tone], text);
}

function cell(text: string, className = "px-4 py-3 text-slate-700 dark:text-slate-200") {
  return createElement("td", className, text);
}

function getAccesses(user: AdminUser): VpnAccess[] {
  return Array.isArray(user.vpn_user?.accesses) ? user.vpn_user.accesses : [];
}

function isAnonymousUser(user: AdminUser): boolean {
  return user.type === "vpn_anonymous" || user.is_anonymous === true;
}

function getUserStableId(user: AdminUser): number | null {
  const value = isAnonymousUser(user)
    ? user.vpn_user_id ?? user.vpn_user?.id
    : user.id;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getUserLogin(user: AdminUser): string {
  return user.login?.trim() || user.vpn_user?.login?.trim() || "Без имени";
}

function getUserName(user: AdminUser): string {
  if (user.name?.trim()) return user.name.trim();
  return isAnonymousUser(user) ? "-" : getUserLogin(user);
}

function normalizeUser(row: Partial<AdminUser>): AdminUser {
  const anonymous = row.type === "vpn_anonymous" || row.is_anonymous === true;

  return {
    ...row,
    type: anonymous ? "vpn_anonymous" : "account",
    is_anonymous: anonymous,
    id: anonymous ? null : row.id ?? null,
    account_user_id: anonymous ? null : row.account_user_id ?? row.id ?? null,
    vpn_user_id: anonymous
      ? row.vpn_user_id ?? row.vpn_user?.id ?? null
      : row.vpn_user_id ?? null,
    role: anonymous ? null : row.role ?? "user",
    blocked: anonymous ? false : Boolean(row.blocked),
    paid_until: row.vpn_user?.paid_until ?? row.payment?.paid_until ?? row.paid_until ?? null,
    vpn_user: row.vpn_user ?? null,
  };
}

function getVpnPaidUntil(user: AdminUser): string | null {
  return (
    user.vpn_user?.paid_until ??
    user.vpn_user?.payment?.paid_until ??
    user.payment?.paid_until ??
    user.paid_until ??
    null
  );
}

function getTodayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateKey(value: string | null): string | null {
  if (!value) return null;
  const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch?.[1]) return dateMatch[1];

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getVpnPaymentStatus(user: AdminUser): "paid" | "unpaid" | "expired" {
  const vpnUser = user.vpn_user;
  if (
    user.payment?.is_paid === true ||
    user.is_paid === true ||
    vpnUser?.payment?.is_paid === true ||
    vpnUser?.is_paid === true
  ) {
    return "paid";
  }

  const paidUntil = getVpnPaidUntil(user);
  if (!paidUntil) return "unpaid";
  const paidUntilKey = getDateKey(paidUntil);
  if (!paidUntilKey) return "unpaid";
  return paidUntilKey > getTodayDateKey() ? "paid" : "expired";
}

function createVpnPaymentCell(user: AdminUser): HTMLTableCellElement {
  const paymentStatus = getVpnPaymentStatus(user);
  const paidUntil = getVpnPaidUntil(user);
  const paymentCell = cell("", "px-4 py-3");
  const content = createElement("div", "space-y-1");
  const labels = {
    paid: "Оплачено",
    expired: "Просрочено",
    unpaid: paidUntil ? "Не оплачено" : "Не указана дата",
  };
  const tones = {
    paid: "green",
    expired: "red",
    unpaid: "amber",
  } as const;

  content.append(badge(labels[paymentStatus], tones[paymentStatus]));
  content.append(
    createElement(
      "p",
      paymentStatus === "expired"
        ? "text-xs text-rose-600 dark:text-rose-300"
        : "text-xs text-slate-500 dark:text-slate-400",
      paidUntil
        ? paymentStatus === "paid"
          ? `Оплачен до ${paidUntil.slice(0, 10)}`
          : `Срок закончился ${paidUntil.slice(0, 10)}`
        : "Не указана дата",
    ),
  );
  paymentCell.append(content);
  return paymentCell;
}

function getFilteredUsers(): AdminUser[] {
  const blocked = usersBlockFilter?.value || "all";
  const payment = usersPaymentFilter?.value || "all";
  const role = usersRoleFilter?.value || "all";

  return users.filter((user) => {
    const anonymous = isAnonymousUser(user);
    if (blocked === "active" && user.blocked) return false;
    if (blocked === "blocked" && (anonymous || !user.blocked)) return false;
    if (role !== "all" && user.role !== role) return false;
    if (payment !== "all" && getVpnPaymentStatus(user) !== payment) return false;
    return true;
  });
}

function renderUsers(): void {
  if (!usersTableBody) return;

  usersTableBody.replaceChildren();
  const filteredUsers = getFilteredUsers();
  setVisible(usersEmpty, filteredUsers.length === 0);
  setVisible(usersTableWrap, filteredUsers.length > 0);

  filteredUsers.forEach((user) => {
    const anonymous = isAnonymousUser(user);
    const stableId = getUserStableId(user);
    const row = createElement("tr", "transition hover:bg-slate-50 dark:hover:bg-slate-900/70");
    const typeCell = cell("");
    const roleCell = cell("");
    const statusCell = cell("");
    const actionCell = cell("", "px-4 py-3 text-right");
    const action = createElement(
      "button",
      "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900",
      "Открыть",
    );

    row.dataset.userKey = `${anonymous ? "vpn" : "account"}:${stableId || "missing"}`;
    action.type = "button";
    action.dataset.userId = stableId ? String(stableId) : "";
    action.dataset.userType = anonymous ? "vpn_anonymous" : "account";
    action.disabled = stableId === null;
    typeCell.append(
      badge(anonymous ? "VPN без аккаунта" : "Аккаунт", anonymous ? "neutral" : "green"),
    );
    roleCell.append(badge(anonymous ? "-" : user.role || "user", "neutral"));
    statusCell.append(
      anonymous
        ? badge("VPN-only", "neutral")
        : badge(user.blocked ? "Заблокирован" : "Активен", user.blocked ? "red" : "green"),
    );
    actionCell.append(action);
    row.append(
      cell(getUserLogin(user), "px-4 py-3 font-medium text-slate-900 dark:text-slate-50"),
      cell(getUserName(user)),
      typeCell,
      roleCell,
      statusCell,
      createVpnPaymentCell(user),
      cell(String(getAccesses(user).length)),
      actionCell,
    );
    usersTableBody.append(row);
  });
}

async function loadUsers(): Promise<void> {
  const requestId = ++usersRequestSequence;
  const loginQuery = usersLoginSearch?.value.trim() || "";
  const query = new URLSearchParams();
  if (loginQuery) query.set("login", loginQuery);
  const path = loginQuery
    ? `/api/admin/users?${query.toString()}`
    : "/api/admin/users";

  setMessage(usersError);
  setVisible(usersLoading, true);
  setVisible(usersTableWrap, false);
  setVisible(usersEmpty, false);
  if (usersReload) usersReload.disabled = true;

  try {
    const payload = await requestJson<ApiPayload>(path);
    if (requestId !== usersRequestSequence) return;
    users = unwrapList<Partial<AdminUser>>(payload).map(normalizeUser);
    renderUsers();
  } catch (error) {
    if (requestId === usersRequestSequence && !isAccessError(error)) {
      setMessage(usersError, getErrorMessage(error, "Не удалось загрузить пользователей."));
    }
  } finally {
    if (requestId === usersRequestSequence) {
      setVisible(usersLoading, false);
      if (usersReload) usersReload.disabled = false;
    }
  }
}

type CreateUserField = keyof typeof createUserFieldErrors;
const createUserFieldNames: CreateUserField[] = [
  "login",
  "name",
  "password",
  "paid_until",
];

function setCreateUserFieldError(
  field: CreateUserField,
  message = "",
): void {
  const input = createUserFields[field];
  const error = createUserFieldErrors[field];

  input?.toggleAttribute("aria-invalid", Boolean(message));
  if (!error) return;
  error.textContent = message;
  setVisible(error, Boolean(message));
}

function clearCreateUserErrors(): void {
  createUserFieldNames.forEach((field) => setCreateUserFieldError(field));
  setMessage(createUserError);
}

function setCreateUserFormVisible(visible: boolean): void {
  setVisible(createUserForm, visible);
  createUserToggle?.classList.toggle("hidden", visible);

  if (visible) {
    clearCreateUserErrors();
    createUserLogin?.focus();
  }
}

function validateCreateUserForm(): boolean {
  let valid = true;
  const login = createUserLogin?.value.trim() || "";
  const password = createUserPassword?.value || "";
  const paidUntil = createUserPaidUntil?.value || "";

  if (!login) {
    setCreateUserFieldError("login", "Введите логин.");
    valid = false;
  }
  if (password.length < 8) {
    setCreateUserFieldError("password", "Пароль должен содержать минимум 8 символов.");
    valid = false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) {
    setCreateUserFieldError("paid_until", "Укажите дату в формате YYYY-MM-DD.");
    valid = false;
  }

  return valid;
}

async function createUser(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  clearCreateUserErrors();

  if (
    !createUserForm ||
    !createUserLogin ||
    !createUserName ||
    !createUserPassword ||
    !createUserPaidUntil ||
    !validateCreateUserForm()
  ) {
    return;
  }

  const login = createUserLogin.value.trim();
  const name = createUserName.value.trim();
  const body: Record<string, string> = {
    login,
    password: createUserPassword.value,
    paid_until: createUserPaidUntil.value,
  };
  if (name) body.name = name;

  setButtonLoading(createUserSubmit, true, "Создаём...");
  try {
    const payload = await requestJson<ApiPayload>(
      "/api/admin/users",
      jsonRequest("POST", body),
    );
    const raw = payload.data ?? payload.user ?? payload;
    const created = normalizeUser({
      ...(raw && typeof raw === "object" ? (raw as Partial<AdminUser>) : {}),
      type: "account",
      is_anonymous: false,
      login,
    });

    createUserForm.reset();
    setCreateUserFormVisible(false);
    if (usersLoginSearch) usersLoginSearch.value = getUserLogin(created);
    if (usersBlockFilter) usersBlockFilter.value = "all";
    if (usersPaymentFilter) usersPaymentFilter.value = "all";
    if (usersRoleFilter) usersRoleFilter.value = "all";
    await loadUsers();

    const createdId =
      getUserStableId(created) ||
      getUserStableId(
        users.find(
          (user) =>
            !isAnonymousUser(user) && getUserLogin(user) === getUserLogin(created),
        ) || created,
      );
    if (createdId) await loadUser("account", createdId);
    showNotice(`Пользователь ${getUserLogin(created)} создан.`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 422) {
      let hasFieldErrors = false;
      createUserFieldNames.forEach((field) => {
        const message = error.errors[field]?.[0] || "";
        setCreateUserFieldError(field, message);
        hasFieldErrors ||= Boolean(message);
      });
      if (!hasFieldErrors) setMessage(createUserError, error.message);
    } else if (!isAccessError(error)) {
      setMessage(
        createUserError,
        getErrorMessage(error, "Не удалось создать пользователя."),
      );
    }
  } finally {
    setButtonLoading(createUserSubmit, false);
  }
}

const handshakeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});
const REMOTE_STATE_STALE_AFTER_MS = 15 * 60 * 1000;

function parseStoredDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  const isUnixTimestamp =
    typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value));

  if (isUnixTimestamp && (!Number.isFinite(numericValue) || numericValue <= 0)) {
    return null;
  }

  const date = isUnixTimestamp
      ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHandshake(access: VpnAccess): string {
  const date =
    parseStoredDate(access.latest_handshake_at) ||
    parseStoredDate(access.latest_handshake);

  return date ? handshakeFormatter.format(date) : "Нет данных";
}

function getRemoteSyncState(access: VpnAccess): {
  label: string;
  tone: "green" | "amber" | "neutral";
  details: string;
} {
  const syncedAt = parseStoredDate(access.remote_synced_at);

  if (!syncedAt) {
    return {
      label: "Нет данных синхронизации",
      tone: "neutral",
      details: "Нет данных синхронизации",
    };
  }

  const formatted = handshakeFormatter.format(syncedAt);
  if (Date.now() - syncedAt.getTime() > REMOTE_STATE_STALE_AFTER_MS) {
    return {
      label: "Данные не синхронизированы",
      tone: "amber",
      details: `${formatted} (устарело)`,
    };
  }

  return {
    label: "Синхронизировано",
    tone: "green",
    details: formatted,
  };
}

function formatTraffic(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Нет данных";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return String(value);
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let amount = bytes;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || amount >= 10 ? 0 : 1;
  return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

function isRevokedAccess(access: VpnAccess): boolean {
  return (
    access.revoked === true ||
    access.status === "revoked" ||
    access.config_status === "revoked"
  );
}

function getAccessStatusState(access: VpnAccess): {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
} {
  if (isRevokedAccess(access)) return { label: "Отозвана", tone: "red" };
  if (access.status === "active") return { label: "Активна", tone: "green" };
  if (access.status === "provisioning") return { label: "Создаётся", tone: "amber" };
  if (access.status === "sync_failed") {
    return { label: "Ошибка синхронизации", tone: "red" };
  }
  return { label: "Без статуса", tone: "neutral" };
}

function getAccessConfigLabel(access: VpnAccess): string {
  if (
    access.server_type === "ikev2" ||
    access.credential_type === "ikev2_login_password"
  ) {
    return getIkev2AccessCredentials(access).available
      ? "IKEv2 credentials выданы"
      : "IKEv2 credentials не выданы";
  }

  const configIsActive =
    access.config_available === true && access.revoked !== true;

  if (isRevokedAccess(access) || access.config_status === "revoked") {
    return "Отозвана";
  }
  if (configIsActive) return "Доступна";
  if (access.config_status === "incomplete") return "Требуется перевыпуск";
  if (access.config_status === "unavailable") return "Недоступна";
  return "Недоступна";
}

function formatAccessDate(value: string | null | undefined): string {
  const date = parseStoredDate(value);
  return date ? handshakeFormatter.format(date) : "Дата не указана";
}

function appendAccessDetail(container: HTMLElement, label: string, value: string): void {
  const item = createElement("div", "min-w-0");
  const term = createElement(
    "dt",
    "text-xs font-medium uppercase text-slate-500 dark:text-slate-400",
    label,
  );
  const description = createElement(
    "dd",
    "mt-1 break-words text-sm text-slate-800 dark:text-slate-200",
    value,
  );
  item.append(term, description);
  container.append(item);
}

function createAccessCard(access: VpnAccess): HTMLElement {
    const syncState = getRemoteSyncState(access);
    const accessState = getAccessStatusState(access);
    const row = createElement(
      "article",
      "rounded-lg border border-slate-200 p-4 dark:border-slate-800",
    );
    const header = createElement("div", "flex items-start justify-between gap-3");
    const title = createElement(
      "h4",
      "font-medium text-slate-900 dark:text-slate-50",
      access.server || "Неизвестный сервер",
    );
    const details = createElement(
      "dl",
      "mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2",
    );
    const syncBadge = badge(syncState.label, syncState.tone);
    const statusBadge = badge(accessState.label, accessState.tone);
    const badges = createElement("div", "flex flex-wrap justify-end gap-2");
    syncBadge.title = `Последняя синхронизация: ${syncState.details}`;
    badges.append(statusBadge, syncBadge);
    header.append(title, badges);
    appendAccessDetail(details, "VPN IP", access.vpn_ip || "-");
    appendAccessDetail(details, "Тип", access.server_type || "-");
    appendAccessDetail(details, "Конфигурация", getAccessConfigLabel(access));
    const isIkev2Access =
      access.server_type === "ikev2" ||
      access.credential_type === "ikev2_login_password";
    if (isIkev2Access) {
      const credentials = getIkev2AccessCredentials(access);
      appendAccessDetail(details, "IKEv2 login", credentials.login || "Не указан");
      appendAccessDetail(
        details,
        "IKEv2 password",
        credentials.password || "Не указан",
      );
    } else {
      appendAccessDetail(
        details,
        "Материал конфигурации",
        access.has_config_material === true ? "Есть" : "Нет",
      );
    }
    appendAccessDetail(details, "Синхронизация данных", syncState.details);
    appendAccessDetail(details, "Последний handshake", formatHandshake(access));
    appendAccessDetail(details, "Получено", formatTraffic(access.transfer_rx));
    appendAccessDetail(details, "Отправлено", formatTraffic(access.transfer_tx));
    appendAccessDetail(details, "Remote endpoint", access.remote_endpoint || "Нет данных");
    if (access.config_status === "revoked") {
      appendAccessDetail(details, "Дата отзыва", formatAccessDate(access.revoked_at));
    }
    row.append(header, details);

    if (access.remote_state_error) {
      row.append(
        createElement(
          "p",
          "mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
          access.remote_state_error,
        ),
      );
    }

    if (access.id && !isRevokedAccess(access)) {
      const footer = createElement("div", "mt-4 flex justify-end");
      const revoke = createElement(
        "button",
        "rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40",
        "Отозвать",
      );
      revoke.type = "button";
      revoke.dataset.accessId = String(access.id);
      revoke.dataset.serverName = access.server;
      footer.append(revoke);
      row.append(footer);
    }

    return row;
}

function getIkev2AccessCredentials(access?: VpnAccess): {
  login: string;
  password: string;
  available: boolean;
} {
  const login = access?.ikev2_login || access?.ikev2_credentials?.login || "";
  const password =
    access?.ikev2_password || access?.ikev2_credentials?.password || "";

  return {
    login,
    password,
    available:
      access?.credentials_available === true ||
      (Boolean(login) && Boolean(password)),
  };
}

function renderIkev2CredentialForms(user: AdminUser): void {
  if (!userIkev2Accesses) return;
  userIkev2Accesses.replaceChildren();
  const ikev2Servers = servers.filter(
    (server) => server.type.toLowerCase() === "ikev2",
  );

  if (ikev2Servers.length === 0) return;

  const heading = createElement(
    "div",
    "border-b border-slate-200 pb-2 dark:border-slate-800",
  );
  heading.append(
    createElement(
      "h4",
      "font-semibold text-slate-900 dark:text-slate-50",
      "Учётные данные IKEv2",
    ),
    createElement(
      "p",
      "mt-1 text-sm text-slate-500 dark:text-slate-400",
      "Логин и пароль выдаются отдельно для каждого IKEv2-сервера.",
    ),
  );
  userIkev2Accesses.append(heading);

  const vpnUserId = Number(user.vpn_user_id);
  if (!Number.isFinite(vpnUserId) || vpnUserId <= 0) {
    userIkev2Accesses.append(
      createElement(
        "p",
        "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200",
        "Для выдачи IKEv2 нужно сначала создать VPN-профиль пользователя",
      ),
    );
    return;
  }

  ikev2Servers.forEach((server) => {
    const access = getAccesses(user).find(
      (item) =>
        item.server === server.slug &&
        (item.server_type === "ikev2" ||
          item.credential_type === "ikev2_login_password"),
    );
    const credentials = getIkev2AccessCredentials(access);
    const form = createElement(
      "form",
      "grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-950",
    );
    const header = createElement(
      "div",
      "flex flex-wrap items-start justify-between gap-2 sm:col-span-2",
    );
    const identity = createElement("div", "min-w-0");
    identity.append(
      createElement(
        "h5",
        "break-words font-medium text-slate-900 dark:text-slate-50",
        server.slug,
      ),
      createElement(
        "p",
        "mt-1 break-words text-xs text-slate-500 dark:text-slate-400",
        server.endpoint || "Endpoint не указан",
      ),
    );
    header.append(
      identity,
      badge(credentials.available ? "Выданы" : "Не выданы", credentials.available ? "green" : "neutral"),
    );

    const loginLabel = createElement(
      "label",
      "space-y-1 text-sm text-slate-600 dark:text-slate-300",
    );
    const loginTitle = createElement("span", "", "Login");
    const loginInput = createElement(
      "input",
      "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    );
    loginInput.type = "text";
    loginInput.name = "login";
    loginInput.value = credentials.login;
    loginInput.required = true;
    loginInput.autocomplete = "off";
    loginLabel.append(loginTitle, loginInput);

    const passwordLabel = createElement(
      "label",
      "space-y-1 text-sm text-slate-600 dark:text-slate-300",
    );
    const passwordTitle = createElement("span", "", "Password");
    const passwordInput = createElement(
      "input",
      "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    );
    passwordInput.type = "text";
    passwordInput.name = "password";
    passwordInput.value = credentials.password;
    passwordInput.required = true;
    passwordInput.autocomplete = "off";
    passwordLabel.append(passwordTitle, passwordInput);

    const footer = createElement(
      "div",
      "flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between",
    );
    const error = createElement(
      "p",
      "hidden text-sm text-rose-600 dark:text-rose-300",
    );
    const submit = createElement(
      "button",
      "inline-flex min-h-10 w-fit items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60",
      credentials.available ? "Обновить данные" : "Выдать данные",
    );
    submit.type = "submit";
    submit.dataset.defaultLabel = submit.textContent || "Сохранить";
    error.dataset.ikev2Error = "";
    error.setAttribute("role", "alert");
    footer.append(error, submit);

    form.dataset.vpnUserId = String(vpnUserId);
    form.dataset.serverSlug = server.slug;
    form.append(header, loginLabel, passwordLabel, footer);
    userIkev2Accesses.append(form);
  });
}

let configOperationBusy = false;

function configBasePath(user: AdminUser): string {
  const kind = user.type === "vpn_anonymous" ? "vpn-users" : "users";
  return `/api/admin/${kind}/${getUserStableId(user)}/vpn-configs`;
}

function configServers(): AdminVpnServer[] {
  return servers.filter((server) => ["amneziawg", "wireguard"].includes(server.type.toLowerCase()));
}

function configButton(label: string, action: string, slug?: string): HTMLButtonElement {
  const button = createElement("button", "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800", label);
  button.type = "button";
  button.dataset.configAction = action;
  if (slug) button.dataset.configServer = slug;
  button.disabled = configOperationBusy;
  return button;
}

function renderConfigControls(user: AdminUser): HTMLElement {
  const section = createElement("section", "space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800");
  section.append(createElement("h4", "font-semibold", "Файлы конфигурации VPN"));
  const supported = configServers();
  const accesses = getAccesses(user);
  const bulk = createElement("div", "flex flex-wrap gap-2");
  const createAll = configButton("Создать все", "create-all");
  createAll.disabled ||= !supported.some((server) => server.enabled);
  const reissueAll = configButton("Пересоздать все", "reissue-all");
  reissueAll.disabled ||= !supported.some((server) => server.enabled && accesses.some((access) => access.server === server.slug && !isRevokedAccess(access)));
  const downloadAll = configButton("Скачать все (.zip)", "download-all");
  downloadAll.disabled ||= !supported.some((server) => accesses.some((access) => access.server === server.slug && access.config_available && access.status === "active" && !isRevokedAccess(access)));
  bulk.append(createAll, reissueAll, downloadAll);
  section.append(bulk);
  if (!supported.length) section.append(createElement("p", "text-sm text-slate-500", "Нет серверов WireGuard или AmneziaWG."));
  for (const server of supported) {
    const access = accesses.find((item) => item.server === server.slug);
    const available = access?.config_available === true && access.status === "active" && !isRevokedAccess(access);
    const row = createElement("div", "flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950");
    row.append(createElement("p", "text-sm", `${server.slug} · ${server.type} · ${available ? "Готова" : "Нет готового файла"}${server.enabled ? "" : " · Сервер выключен"}`));
    const actions = createElement("div", "flex flex-wrap gap-2");
    if (available) actions.append(configButton("Скачать .conf", "download", server.slug));
    if (server.enabled) {
      if (access && !isRevokedAccess(access)) actions.append(configButton("Пересоздать", "reissue", server.slug));
      else actions.append(configButton("Создать", "create", server.slug));
    }
    row.append(actions);
    section.append(row);
  }
  return section;
}

async function handleConfigAction(button: HTMLButtonElement): Promise<void> {
  if (!selectedUser || configOperationBusy) return;
  // Capture the owner before asynchronous requests; changing selection must not change the target.
  const owner = selectedUser;
  const base = configBasePath(owner);
  const action = button.dataset.configAction || "";
  const slug = button.dataset.configServer;
  const supported = configServers();
  const targets = slug ? supported.filter((server) => server.slug === slug)
    : supported.filter((server) => server.enabled && (action === "create-all"
      || getAccesses(owner).some((access) => access.server === server.slug && !isRevokedAccess(access))));
  if (action.startsWith("reissue") && !window.confirm("Пересоздать конфигурации? Старые файлы перестанут работать. Пользователю потребуется установить новые.")) return;
  configOperationBusy = true;
  userAccesses?.querySelectorAll<HTMLButtonElement>("button").forEach((item) => { item.disabled = true; });
  try {
    if (action === "download" || action === "download-all") {
      const response = await adminFetch(slug ? `${base}/${encodeURIComponent(slug)}` : base);
      if (!response.ok) throw new Error(getPayloadMessage(await readPayload(response), "Не удалось скачать конфигурации."));
      await saveDownload(response, slug ? `vpn-${slug}.conf` : "vpn-configs.zip", slug ? ".conf" : ".zip");
      return;
    }
    let completed = 0;
    const failures: string[] = [];
    for (const server of targets) {
      if (selectedUser !== owner) break;
      try {
        await requestJson(`${base}/${encodeURIComponent(server.slug)}${action.startsWith("reissue") ? "/reissue" : ""}`, jsonRequest("POST"));
        completed++;
      } catch (error) {
        if (isAccessError(error)) throw error;
        failures.push(`${server.slug}: ${getErrorMessage(error, "Ошибка")}`);
      }
    }
    showNotice(`Готово: ${completed} из ${targets.length}.${failures.length ? " " + failures.join("; ") : ""}`, failures.length ? "error" : "success");
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось выполнить действие."), "error");
  } finally {
    configOperationBusy = false;
    if (selectedUser === owner) await refreshSelectedUser();
    else if (selectedUser) renderUserVpnUser(selectedUser);
    await loadUsers();
  }
}

function renderUserVpnUser(user: AdminUser): void {
  if (!userAccesses) return;
  userAccesses.replaceChildren();
  renderIkev2CredentialForms(user);
  userAccesses.append(renderConfigControls(user));
  const vpnUser = user.vpn_user;

  if (!vpnUser) {
    userAccesses.append(
      createElement("p", "text-sm text-slate-500 dark:text-slate-400", "VPN-профиль не привязан."),
    );
    return;
  }

    const paymentStatus = getVpnPaymentStatus(user);
    const paidUntil = getVpnPaidUntil(user);
    const paymentLabels = {
      paid: "Оплачено",
      expired: "Просрочено",
      unpaid: paidUntil ? "Не оплачено" : "Не указана дата",
    };
    const paymentTones = {
      paid: "green",
      expired: "red",
      unpaid: "amber",
    } as const;
    const section = createElement(
      "section",
      "rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50",
    );
    const header = createElement(
      "div",
      "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
    );
    const identity = createElement("div", "min-w-0");
    const badges = createElement("div", "flex flex-wrap items-center gap-2");
    const accesses = getAccesses(user);

    identity.append(
      createElement(
        "h4",
        "break-words font-semibold text-slate-900 dark:text-slate-50",
        vpnUser.login || "VPN-профиль без имени",
      ),
      createElement(
        "p",
        "mt-1 text-xs text-slate-500 dark:text-slate-400",
        `VPN-профиль #${vpnUser.id} · доступов: ${accesses.length}`,
      ),
    );
    badges.append(badge(paymentLabels[paymentStatus], paymentTones[paymentStatus]));
    if (vpnUser.access_state || vpnUser.status) {
      badges.append(badge(vpnUser.access_state || vpnUser.status || "", "neutral"));
    }
    if (paidUntil) {
      badges.append(
        createElement(
          "span",
          paymentStatus === "expired"
            ? "text-xs text-rose-600 dark:text-rose-300"
            : "text-xs text-slate-500 dark:text-slate-400",
          `до ${paidUntil.slice(0, 10)}`,
        ),
      );
    }
    header.append(identity, badges);
    section.append(header);

    const accessList = createElement("div", "mt-4 grid gap-3 xl:grid-cols-2");
    if (accesses.length === 0) {
      accessList.append(
        createElement(
          "p",
          "text-sm text-slate-500 dark:text-slate-400",
          "Доступов по серверам нет.",
        ),
      );
    } else {
      accesses.forEach((access) => accessList.append(createAccessCard(access)));
    }
    section.append(accessList);
    userAccesses.append(section);
}

function fillUserDetail(user: AdminUser): void {
  const anonymous = isAnonymousUser(user);
  const stableId = getUserStableId(user);
  selectedUser = user;
  userRevokeAllResultList?.replaceChildren();
  setVisible(userRevokeAllResult, false);
  if (userDetailTitle) userDetailTitle.textContent = `${getUserLogin(user)} · #${stableId || "-"}`;
  if (userDetailType) {
    const paymentStatus = getVpnPaymentStatus(user);
    const paidUntil = getVpnPaidUntil(user);
    const paymentLabels = {
      paid: "Оплачено",
      expired: "Просрочено",
      unpaid: paidUntil ? "Не оплачено" : "Не указана дата",
    };
    const paymentTones = {
      paid: "green",
      expired: "red",
      unpaid: "amber",
    } as const;
    userDetailType.className = "mt-2 flex flex-wrap items-center gap-2";
    userDetailType.replaceChildren(
      badge(anonymous ? "VPN без аккаунта" : "Аккаунт", anonymous ? "neutral" : "green"),
      badge(paymentLabels[paymentStatus], paymentTones[paymentStatus]),
    );
    if (paidUntil) {
      userDetailType.append(
        createElement(
          "span",
          paymentStatus === "expired"
            ? "text-xs text-rose-600 dark:text-rose-300"
            : "text-xs text-slate-500 dark:text-slate-400",
          `до ${paidUntil.slice(0, 10)}`,
        ),
      );
    }
  }
  setVisible(userRevokeAllAccesses, anonymous && stableId !== null);
  setVisible(userEditForm, !anonymous);
  setVisible(userPasswordForm, !anonymous);
  if (userName) userName.value = user.name || "";
  if (userLogin) userLogin.value = user.login || "";
  if (userRole) userRole.value = user.role || "user";
  if (userPaidUntil) {
    userPaidUntil.value = getVpnPaidUntil(user)?.slice(0, 10) || "";
  }
  if (userBlockToggle) {
    userBlockToggle.textContent = user.blocked ? "Разблокировать" : "Заблокировать";
  }
  renderUserVpnUser(user);
  setVisible(userDetail, true);
  userDetail?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeUserDetail(
  raw: unknown,
  type: AdminUser["type"],
  stableId: number,
): AdminUser {
  const fallback = users.find(
    (user) => user.type === type && getUserStableId(user) === stableId,
  );
  const detail = raw && typeof raw === "object" ? (raw as Partial<AdminUser>) : {};

  if (type === "account") {
    return normalizeUser({ ...fallback, ...detail, type: "account", is_anonymous: false });
  }

  if (detail.vpn_user) {
    return normalizeUser({
      ...fallback,
      ...detail,
      type: "vpn_anonymous",
      is_anonymous: true,
      id: null,
      vpn_user_id: stableId,
    });
  }

  const vpnUser = detail as unknown as AdminVpnUser;
  const normalizedVpnUser = {
    ...vpnUser,
    id: vpnUser.id || stableId,
    login: vpnUser.login || fallback?.login || "",
    account_user_id: null,
    accesses: Array.isArray(vpnUser.accesses) ? vpnUser.accesses : [],
  };
  return normalizeUser({
    ...fallback,
    type: "vpn_anonymous",
    is_anonymous: true,
    id: null,
    vpn_user_id: stableId,
    login: fallback?.login || vpnUser.login,
    vpn_user: normalizedVpnUser,
  });
}

async function loadUser(type: AdminUser["type"], id: number): Promise<void> {
  try {
    const path =
      type === "vpn_anonymous"
        ? `/api/admin/vpn-users/${id}`
        : `/api/admin/users/${id}`;
    const payload = await requestJson<ApiPayload>(path);
    const raw = payload.data ?? payload.user ?? payload.vpn_user ?? payload;
    fillUserDetail(normalizeUserDetail(raw, type, id));
  } catch (error) {
    if (!isAccessError(error)) {
      showNotice(getErrorMessage(error, "Не удалось загрузить пользователя."), "error");
    }
  }
}

async function refreshSelectedUser(): Promise<void> {
  if (!selectedUser) return;
  const stableId = getUserStableId(selectedUser);
  if (stableId) await loadUser(selectedUser.type, stableId);
}

async function saveIkev2Credentials(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  const vpnUserId = Number(form.dataset.vpnUserId);
  const serverSlug = form.dataset.serverSlug || "";
  const loginInput = form.elements.namedItem("login");
  const passwordInput = form.elements.namedItem("password");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const error = form.querySelector<HTMLElement>("[data-ikev2-error]");

  if (
    !Number.isFinite(vpnUserId) ||
    vpnUserId <= 0 ||
    !serverSlug ||
    !(loginInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement)
  ) return;

  const login = loginInput.value.trim();
  const password = passwordInput.value;
  setMessage(error, "");

  if (!login || !password) {
    setMessage(error, "Укажите login и password.");
    return;
  }

  setButtonLoading(submit, true, "Сохраняем...");
  try {
    await requestJson<{ data: VpnAccess }>(
      `/api/admin/vpn-users/${vpnUserId}/ikev2-accesses/${encodeURIComponent(serverSlug)}`,
      jsonRequest("PUT", { login, password }),
    );
    showNotice(`Учётные данные IKEv2 для ${serverSlug} сохранены.`);
    await Promise.all([loadUsers(), refreshSelectedUser()]);
  } catch (requestError) {
    if (!isAccessError(requestError)) {
      setMessage(
        error,
        getErrorMessage(requestError, "Не удалось сохранить учётные данные IKEv2."),
      );
    }
  } finally {
    setButtonLoading(submit, false);
  }
}

function renderRevokeAllResults(results: RevokeVpnUserAccessResult[]): void {
  if (!userRevokeAllResult || !userRevokeAllResultList) return;
  userRevokeAllResultList.replaceChildren();

  if (results.length === 0) {
    userRevokeAllResultList.append(
      createElement(
        "p",
        "text-sm text-slate-500 dark:text-slate-400",
        "Доступов для отзыва не найдено.",
      ),
    );
  } else {
    results.forEach((result) => {
      const row = createElement(
        "div",
        "flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950",
      );
      const details = createElement("div", "min-w-0");
      details.append(
        createElement(
          "p",
          "font-medium text-slate-900 dark:text-slate-50",
          result.server || "Неизвестный сервер",
        ),
      );
      if (result.error) {
        details.append(
          createElement(
            "p",
            "mt-1 break-words text-sm text-rose-600 dark:text-rose-300",
            result.error,
          ),
        );
      }
      row.append(
        details,
        badge(result.revoked ? "Отозван" : "Ошибка", result.revoked ? "green" : "red"),
      );
      userRevokeAllResultList.append(row);
    });
  }

  setVisible(userRevokeAllResult, true);
}

async function revokeAllVpnUserAccesses(): Promise<void> {
  if (!selectedUser || !isAnonymousUser(selectedUser)) return;
  const vpnUserId = getUserStableId(selectedUser);
  if (!vpnUserId || !userRevokeAllAccesses) return;

  const login = getUserLogin(selectedUser);
  if (
    !window.confirm(
      `Отозвать все VPN-сертификаты пользователя ${login}?`,
    )
  ) return;

  setButtonLoading(userRevokeAllAccesses, true, "Отзываем...");
  try {
    const payload = await requestJson<RevokeVpnUserAccessesResponse>(
      `/api/admin/vpn-users/${vpnUserId}/accesses/revoke`,
      jsonRequest("POST"),
    );
    const results = Array.isArray(payload.data) ? payload.data : [];
    await Promise.all([
      loadUsers(),
      refreshSelectedUser(),
      loadUnnamedAccesses(),
    ]);
    renderRevokeAllResults(results);

    const failed = results.filter((result) => !result.revoked);
    showNotice(
      failed.length === 0 && payload.revoked
        ? `Все VPN-сертификаты пользователя ${payload.login || login} отозваны.`
        : `Отзыв завершён: ошибок ${failed.length}.`,
      failed.length === 0 && payload.revoked ? "success" : "error",
    );
  } catch (error) {
    if (!isAccessError(error)) {
      showNotice(
        getErrorMessage(error, "Не удалось отозвать VPN-сертификаты."),
        "error",
      );
    }
  } finally {
    setButtonLoading(userRevokeAllAccesses, false);
  }
}

async function saveUser(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (
    !selectedUser ||
    isAnonymousUser(selectedUser) ||
    !selectedUser.id ||
    !userName ||
    !userLogin ||
    !userRole ||
    !userPaidUntil
  ) return;
  const accountId = selectedUser.id;

  setButtonLoading(userSave, true);
  try {
    await requestJson(
      `/api/admin/users/${accountId}`,
      jsonRequest("PATCH", {
        name: userName.value.trim(),
        login: userLogin.value.trim(),
        role: userRole.value,
        paid_until: userPaidUntil.value || null,
      }),
    );
    showNotice("Данные пользователя сохранены.");
    await loadUsers();
    await refreshSelectedUser();
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось сохранить пользователя."), "error");
  } finally {
    setButtonLoading(userSave, false);
  }
}

async function updateUserPassword(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (
    !selectedUser ||
    isAnonymousUser(selectedUser) ||
    !selectedUser.id ||
    !userPassword ||
    !userPasswordConfirmation
  ) return;
  const accountId = selectedUser.id;

  if (!userPassword.value || userPassword.value !== userPasswordConfirmation.value) {
    showNotice("Пароль и подтверждение должны совпадать.", "error");
    return;
  }

  setButtonLoading(userPasswordSave, true, "Обновляем...");
  try {
    await requestJson(
      `/api/admin/users/${accountId}/password`,
      jsonRequest("PATCH", {
        password: userPassword.value,
        password_confirmation: userPasswordConfirmation.value,
      }),
    );
    userPasswordForm?.reset();
    showNotice("Пароль пользователя обновлён.");
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось обновить пароль."), "error");
  } finally {
    setButtonLoading(userPasswordSave, false);
  }
}

async function toggleUserBlock(): Promise<void> {
  if (
    !selectedUser ||
    isAnonymousUser(selectedUser) ||
    !selectedUser.id ||
    !userBlockToggle
  ) return;
  const accountId = selectedUser.id;
  const willBlock = !selectedUser.blocked;
  const prompt = willBlock
    ? `Заблокировать пользователя ${selectedUser.login}?`
    : `Разблокировать пользователя ${selectedUser.login}?`;

  if (!window.confirm(prompt)) return;

  setButtonLoading(userBlockToggle, true, willBlock ? "Блокируем..." : "Разблокируем...");
  try {
    await requestJson(
      `/api/admin/users/${accountId}/block`,
      jsonRequest(willBlock ? "POST" : "DELETE"),
    );
    showNotice(willBlock ? "Пользователь заблокирован." : "Пользователь разблокирован.");
    await loadUsers();
    await refreshSelectedUser();
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось изменить статус пользователя."), "error");
  } finally {
    setButtonLoading(userBlockToggle, false);
  }
}

async function revokeLocalAccess(button: HTMLButtonElement): Promise<void> {
  const accessId = button.dataset.accessId;
  const serverName = button.dataset.serverName || "сервере";
  if (!accessId || !window.confirm(`Отозвать VPN-доступ на ${serverName}?`)) return;

  setButtonLoading(button, true, "Отзываем...");
  try {
    const payload = await requestJson<ApiPayload>(
      `/api/admin/vpn/accesses/${encodeURIComponent(accessId)}`,
      jsonRequest("DELETE"),
    );
    if (payload.revoked === false || payload.error) {
      throw new Error(payload.error || "Backend не подтвердил отзыв доступа.");
    }
    showNotice("VPN-доступ отозван.");
    await Promise.all([loadUsers(), refreshSelectedUser(), loadUnnamedAccesses()]);
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось отозвать VPN-доступ."), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function getServerCountry(server: AdminVpnServer): string {
  return server.country_name?.trim() || server.country?.trim() || "";
}

function getServerFlag(server: AdminVpnServer): string {
  return server.country_flag_emoji?.trim() || server.emoji_flag?.trim() || "📍";
}

function getServerLocation(server: AdminVpnServer): string {
  const country = getServerCountry(server);
  if (!country) return "Локация не указана";
  return server.city?.trim() ? `${server.city.trim()}, ${country}` : country;
}

function compareServers(left: AdminVpnServer, right: AdminVpnServer): number {
  for (const [leftValue, rightValue] of [
    [getServerCountry(left), getServerCountry(right)],
    [left.city || "", right.city || ""],
    [left.slug || "", right.slug || ""],
  ]) {
    const result = collator.compare(leftValue, rightValue);
    if (result !== 0) return result;
  }
  return 0;
}

function renderServerFilter(): void {
  if (!unnamedServerFilter) return;
  const previousValue = unnamedServerFilter.value;
  const serverNames = new Set([
    ...servers.map((server) => server.slug),
    ...unnamedAccesses.map((access) => access.server),
  ]);

  if (previousValue) serverNames.add(previousValue);
  unnamedServerFilter.replaceChildren(new Option("Все серверы", ""));
  [...serverNames]
    .filter(Boolean)
    .sort((left, right) => collator.compare(left, right))
    .forEach((serverName) => {
      unnamedServerFilter.append(new Option(serverName, serverName));
  });
  unnamedServerFilter.value = previousValue;
}

function renderServers(): void {
  if (!serversList) return;
  serversList.replaceChildren();
  setVisible(serversEmpty, servers.length === 0);

  [...servers].sort(compareServers).forEach((server) => {
    const card = createElement(
      "article",
      "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950",
    );
    const header = createElement("div", "flex items-start justify-between gap-3");
    const identity = createElement("div", "flex min-w-0 items-start gap-3");
    const flag = createElement("span", "text-3xl leading-none", getServerFlag(server));
    const text = createElement("div", "min-w-0");
    const title = createElement("h3", "break-words font-semibold text-slate-900 dark:text-slate-50", server.slug);
    const location = createElement("p", "mt-1 text-sm text-slate-500 dark:text-slate-400", getServerLocation(server));
    const edit = createElement(
      "button",
      "mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900",
      "Редактировать",
    );

    edit.type = "button";
    edit.dataset.serverId = String(server.id);
    flag.setAttribute("aria-hidden", "true");
    text.append(title, location);
    identity.append(flag, text);
    header.append(identity, badge(server.enabled ? "Включён" : "Выключен", server.enabled ? "green" : "neutral"));
    card.append(
      header,
      createElement("p", "mt-3 break-words text-sm text-slate-600 dark:text-slate-300", server.endpoint || server.host || "Endpoint не указан"),
      createElement("p", "mt-1 text-xs text-slate-500 dark:text-slate-400", server.type || "Тип не указан"),
      edit,
    );
    serversList.append(card);
  });

  renderServerFilter();
}

async function loadServers(): Promise<void> {
  setMessage(serversError);
  setVisible(serversLoading, true);
  setVisible(serversEmpty, false);
  if (serversReload) serversReload.disabled = true;

  try {
    const payload = await requestJson<ApiPayload>("/api/admin/vpn/servers");
    servers = unwrapList<AdminVpnServer>(payload);
    renderServers();
    if (selectedUser) renderUserVpnUser(selectedUser);
  } catch (error) {
    if (!isAccessError(error)) setMessage(serversError, getErrorMessage(error, "Не удалось загрузить серверы."));
  } finally {
    setVisible(serversLoading, false);
    if (serversReload) serversReload.disabled = false;
  }
}

function fillServerDetail(server: AdminVpnServer): void {
  selectedServer = server;
  if (serverDetailTitle) serverDetailTitle.textContent = `${server.slug} · #${server.id}`;
  if (serverSlug) serverSlug.value = server.slug || "";
  if (serverType) serverType.value = server.type || "";
  if (serverHost) serverHost.value = server.host || "";
  if (serverSshPort) serverSshPort.value = server.ssh_port ? String(server.ssh_port) : "";
  if (serverSubnet) serverSubnet.value = server.subnet || "";
  if (serverEndpoint) serverEndpoint.value = server.endpoint || "";
  if (serverCountry) serverCountry.value = getServerCountry(server);
  if (serverFlag) serverFlag.value = server.country_flag_emoji || server.emoji_flag || "";
  if (serverCity) serverCity.value = server.city || "";
  if (serverEnabled) serverEnabled.checked = server.enabled;
  if (serverMetadata) serverMetadata.value = JSON.stringify(server.metadata ?? {}, null, 2);
  setVisible(serverEditForm, true);
  serverEditForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadServer(id: number): Promise<void> {
  try {
    const payload = await requestJson<ApiPayload>(`/api/admin/vpn/servers/${id}`);
    fillServerDetail(unwrapEntity<AdminVpnServer>(payload, "server"));
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось загрузить сервер."), "error");
  }
}

function optionalValue(input: HTMLInputElement | null): string | undefined {
  return input?.value.trim() || undefined;
}

async function saveServer(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!selectedServer || !serverSlug || !serverType || !serverMetadata || !serverEnabled) return;

  let metadata: Record<string, unknown>;
  try {
    const parsed = JSON.parse(serverMetadata.value || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error();
    }
    metadata = parsed as Record<string, unknown>;
  } catch {
    showNotice("Metadata должна быть корректным JSON-объектом.", "error");
    return;
  }

  const payload: Record<string, unknown> = {
    slug: serverSlug.value.trim(),
    type: serverType.value.trim(),
    enabled: serverEnabled.checked,
    metadata,
  };
  const optionalFields: Array<[string, HTMLInputElement | null]> = [
    ["host", serverHost],
    ["subnet", serverSubnet],
    ["endpoint", serverEndpoint],
    ["country_name", serverCountry],
    ["country_flag_emoji", serverFlag],
    ["city", serverCity],
  ];
  optionalFields.forEach(([key, input]) => {
    const value = optionalValue(input);
    if (value !== undefined) payload[key] = value;
  });
  if (serverSshPort?.value) payload.ssh_port = Number(serverSshPort.value);

  setButtonLoading(serverSave, true);
  try {
    await requestJson(
      `/api/admin/vpn/servers/${selectedServer.id}`,
      jsonRequest("PATCH", payload),
    );
    showNotice("Настройки сервера сохранены.");
    await loadServers();
    await loadServer(selectedServer.id);
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось сохранить сервер."), "error");
  } finally {
    setButtonLoading(serverSave, false);
  }
}

const reasonLabels: Record<string, string> = {
  unmanaged: "Нет в локальной БД",
  missing_name: "Нет имени на сервере",
  identifier_mismatch: "Ключ не совпадает",
  missing_local_login: "Нет локального login",
};

function getReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Не указана";
  return reasonLabels[reason] || reason;
}

function renderReasonFilter(): void {
  if (!unnamedReasonFilter) return;
  const previousValue = unnamedReasonFilter.value;
  const reasons = new Set([
    ...Object.keys(reasonLabels),
    ...unnamedAccesses.map((access) => access.reason || "").filter(Boolean),
  ]);

  if (previousValue) reasons.add(previousValue);
  unnamedReasonFilter.replaceChildren(new Option("Все причины", ""));
  [...reasons]
    .sort((left, right) => collator.compare(getReasonLabel(left), getReasonLabel(right)))
    .forEach((reason) => {
      unnamedReasonFilter.append(new Option(getReasonLabel(reason), reason));
    });
  unnamedReasonFilter.value = previousValue;
}

function getFilteredUnnamedAccesses(): UnnamedAccess[] {
  const reason = unnamedReasonFilter?.value || "";
  const login = unnamedLoginFilter?.value || "all";
  const matchedBy = unnamedMatchFilter?.value || "all";

  return unnamedAccesses.filter((access) => {
    if (!access.ok) return true;
    if (reason && access.reason !== reason) return false;
    if (login === "with" && !access.login) return false;
    if (login === "without" && access.login) return false;
    if (matchedBy !== "all") {
      const accessMatch = access.matched_by || "none";
      if (accessMatch !== matchedBy) return false;
    }
    return true;
  });
}

function shortenedKey(key: string): string {
  if (key.length <= 24) return key;
  return `${key.slice(0, 12)}…${key.slice(-8)}`;
}

function loginSourceBadge(source: UnnamedAccess["login_source"]): HTMLElement {
  if (source === "local") return badge("из БД", "green");
  if (source === "remote") return badge("с сервера", "neutral");
  return badge("не найден", "red");
}

function localStatusBadge(status: string): HTMLElement {
  const normalized = status.toLowerCase();
  const tone = normalized === "active" ? "green" : normalized === "revoked" ? "red" : "neutral";
  return badge(status, tone);
}

function createUnnamedPaymentCell(paidUntil: string | null | undefined) {
  const paymentCell = cell("", "px-3 py-3");
  if (!paidUntil) {
    paymentCell.textContent = "Не указано";
    return paymentCell;
  }

  const expired = paidUntil.slice(0, 10) < new Date().toISOString().slice(0, 10);
  const content = createElement("div", "space-y-1");
  content.append(badge(expired ? "Просрочено" : "Активно", expired ? "red" : "green"));
  content.append(
    createElement(
      "p",
      expired
        ? "text-xs text-rose-600 dark:text-rose-300"
        : "text-xs text-slate-500 dark:text-slate-400",
      paidUntil.slice(0, 10),
    ),
  );
  paymentCell.append(content);
  return paymentCell;
}

function renderUnnamedAccesses(): void {
  if (!unnamedTableBody) return;
  const accesses = getFilteredUnnamedAccesses();
  unnamedTableBody.replaceChildren();
  setVisible(unnamedEmpty, accesses.length === 0);
  setVisible(unnamedTableWrap, accesses.length > 0);

  accesses.forEach((access) => {
    const row = createElement("tr", "align-top");

    if (!access.ok) {
      const alertCell = createElement(
        "td",
        "bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
      );
      const title = createElement("p", "font-semibold", access.server || "Неизвестный сервер");
      const message = createElement(
        "p",
        "mt-1",
        access.error || access.reason || "Ошибка подключения к серверу",
      );
      alertCell.colSpan = 8;
      alertCell.append(title, message);
      row.append(alertCell);
      unnamedTableBody.append(row);
      return;
    }

    const loginCell = cell("", "px-3 py-3");
    const loginHeader = createElement("div", "flex flex-wrap items-center gap-2");
    loginHeader.append(
      createElement(
        "span",
        "font-medium text-slate-900 dark:text-slate-50",
        access.login || "Без имени",
      ),
      loginSourceBadge(access.login_source),
    );
    loginCell.append(loginHeader);

    if (
      access.remote_login &&
      access.local_login &&
      access.remote_login !== access.local_login
    ) {
      loginCell.append(
        createElement(
          "p",
          "mt-1 max-w-52 break-words text-xs text-amber-700 dark:text-amber-300",
          `На сервере: ${access.remote_login}`,
        ),
      );
    }

    if (access.local_status) {
      const statusLine = createElement("div", "mt-2");
      statusLine.append(localStatusBadge(access.local_status));
      loginCell.append(statusLine);
    }

    const matchCell = cell("", "px-3 py-3");
    if (access.matched_by === "vpn_ip") {
      matchCell.append(
        createElement(
          "span",
          "inline-flex max-w-44 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
          "IP совпал, ключ отличается",
        ),
      );
    } else if (access.matched_by === "remote_identifier") {
      matchCell.append(badge("По ключу", "green"));
    } else {
      matchCell.append(badge("Нет", "neutral"));
    }

    const keyCell = cell("", "px-3 py-3");
    if (access.remote_identifier) {
      const key = createElement(
        "code",
        "block font-mono text-xs text-slate-600 dark:text-slate-300",
        shortenedKey(access.remote_identifier),
      );
      const copy = createElement(
        "button",
        "mt-2 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900",
        "Копировать",
      );
      key.title = access.remote_identifier;
      copy.type = "button";
      copy.dataset.copyKey = access.remote_identifier;
      copy.title = "Скопировать полный public key";
      keyCell.append(key, copy);
    } else {
      keyCell.textContent = "-";
    }

    const actionCell = cell("", "px-3 py-3 text-right");
    if (
      access.reason === "unmanaged" &&
      access.server &&
      access.remote_identifier
    ) {
      const revoke = createElement(
        "button",
        "rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40",
        "Отозвать на сервере",
      );
      revoke.type = "button";
      revoke.dataset.remoteServer = access.server;
      revoke.dataset.remoteIdentifier = access.remote_identifier;
      actionCell.append(revoke);
    } else {
      actionCell.textContent = "-";
    }

    row.append(
      cell(access.server || "-", "px-3 py-3 font-medium text-slate-900 dark:text-slate-50"),
      cell(access.vpn_ip || "-", "whitespace-nowrap px-3 py-3 text-slate-700 dark:text-slate-200"),
      loginCell,
      createUnnamedPaymentCell(access.paid_until),
      cell(getReasonLabel(access.reason)),
      matchCell,
      keyCell,
      actionCell,
    );
    unnamedTableBody.append(row);
  });
}

async function loadUnnamedAccesses(): Promise<void> {
  setMessage(unnamedError);
  setVisible(unnamedLoading, true);
  setVisible(unnamedEmpty, false);
  setVisible(unnamedTableWrap, false);
  if (unnamedReload) unnamedReload.disabled = true;

  const query = unnamedServerFilter?.value
    ? `?server=${encodeURIComponent(unnamedServerFilter.value)}`
    : "";

  try {
    const payload = await requestJson<ApiPayload>(`/api/admin/vpn/accesses/unnamed${query}`);
    unnamedAccesses = unwrapList<UnnamedAccess>(payload);
    renderServerFilter();
    renderReasonFilter();
    renderUnnamedAccesses();
  } catch (error) {
    if (!isAccessError(error)) setMessage(unnamedError, getErrorMessage(error, "Не удалось загрузить безымянные доступы."));
  } finally {
    setVisible(unnamedLoading, false);
    if (unnamedReload) unnamedReload.disabled = false;
  }
}

async function copyPublicKey(button: HTMLButtonElement): Promise<void> {
  const key = button.dataset.copyKey;
  if (!key) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(key);
    } else {
      const input = document.createElement("textarea");
      input.value = key;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }

    const originalLabel = button.textContent;
    button.textContent = "Скопировано";
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1500);
  } catch {
    showNotice("Не удалось скопировать public key.", "error");
  }
}

async function revokeRemoteAccess(button: HTMLButtonElement): Promise<void> {
  const server = button.dataset.remoteServer;
  const remoteIdentifier = button.dataset.remoteIdentifier;
  if (!server || !remoteIdentifier) return;
  if (!window.confirm(`Отозвать удалённый доступ на сервере ${server}?`)) return;

  setButtonLoading(button, true, "Отзываем...");
  try {
    const payload = await requestJson<ApiPayload>(
      "/api/admin/vpn/remote-accesses/revoke",
      jsonRequest("POST", { server, remote_identifier: remoteIdentifier }),
    );
    if (payload.revoked === false || payload.error) {
      throw new Error(payload.error || "Backend не подтвердил отзыв доступа.");
    }
    showNotice("Удалённый VPN-доступ отозван.");
    await Promise.all([loadUnnamedAccesses(), loadUsers(), refreshSelectedUser()]);
  } catch (error) {
    if (!isAccessError(error)) showNotice(getErrorMessage(error, "Не удалось отозвать удалённый доступ."), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function activateTab(tab: string): void {
  document.querySelectorAll<HTMLElement>("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.adminPanel !== tab);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach((button) => {
    const active = button.dataset.adminTab === tab;
    button.setAttribute("aria-selected", String(active));
    button.className = active
      ? "shrink-0 border-b-2 border-violet-500 px-4 py-3 text-sm font-semibold text-violet-700 dark:text-violet-300"
      : "shrink-0 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100";
  });
  window.history.replaceState(null, "", `#${tab}`);
}

document.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.adminTab || "users"));
});

createUserToggle?.addEventListener("click", () => {
  setCreateUserFormVisible(true);
});
createUserCancel?.addEventListener("click", () => {
  createUserForm?.reset();
  setCreateUserFormVisible(false);
});
createUserForm?.addEventListener("submit", createUser);
usersLoginSearch?.addEventListener("input", () => {
  if (usersSearchTimer !== undefined) {
    window.clearTimeout(usersSearchTimer);
  }
  usersSearchTimer = window.setTimeout(() => {
    loadUsers();
  }, 400);
});
[usersBlockFilter, usersPaymentFilter, usersRoleFilter].forEach((filter) => {
  filter?.addEventListener("change", renderUsers);
});
usersReload?.addEventListener("click", loadUsers);
usersTableBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-user-id]");
  const id = Number(button?.dataset.userId);
  const type = button?.dataset.userType === "vpn_anonymous"
    ? "vpn_anonymous"
    : "account";
  if (button && Number.isFinite(id) && id > 0) loadUser(type, id);
});
userDetailClose?.addEventListener("click", () => {
  selectedUser = null;
  setVisible(userDetail, false);
});
userEditForm?.addEventListener("submit", saveUser);
userPasswordForm?.addEventListener("submit", updateUserPassword);
userBlockToggle?.addEventListener("click", toggleUserBlock);
userRevokeAllAccesses?.addEventListener("click", revokeAllVpnUserAccesses);
userIkev2Accesses?.addEventListener("submit", saveIkev2Credentials);
userAccesses?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const configAction = target.closest<HTMLButtonElement>("button[data-config-action]");
  if (configAction) { void handleConfigAction(configAction); return; }
  const button = target.closest<HTMLButtonElement>("button[data-access-id]");
  if (button && !configOperationBusy) revokeLocalAccess(button);
});

serversReload?.addEventListener("click", loadServers);
serversList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-server-id]");
  const id = Number(button?.dataset.serverId);
  if (button && Number.isFinite(id)) loadServer(id);
});
serverDetailClose?.addEventListener("click", () => {
  selectedServer = null;
  setVisible(serverEditForm, false);
});
serverEditForm?.addEventListener("submit", saveServer);

unnamedReload?.addEventListener("click", loadUnnamedAccesses);
unnamedServerFilter?.addEventListener("change", loadUnnamedAccesses);
[unnamedReasonFilter, unnamedLoginFilter, unnamedMatchFilter].forEach((filter) => {
  filter?.addEventListener("change", renderUnnamedAccesses);
});
unnamedTableBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const copyButton = target.closest<HTMLButtonElement>("button[data-copy-key]");
  if (copyButton) {
    copyPublicKey(copyButton);
    return;
  }
  const button = target.closest<HTMLButtonElement>("button[data-remote-identifier]");
  if (button) revokeRemoteAccess(button);
});

async function initAdmin(): Promise<void> {
  setMessage(adminAccessError);
  setVisible(adminLoading, true);

  try {
    const payload = await requestJson<ApiPayload>("/api/auth/me");
    const currentUser = unwrapEntity<AuthUser>(payload, "user");

    if (!currentUser || currentUser.role !== "admin") {
      showAccessDenied();
      return;
    }

    setVisible(adminLoading, false);
    setVisible(adminContent, true);
    const initialTab = ["users", "servers", "unnamed"].includes(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : "users";
    activateTab(initialTab);
    await Promise.all([loadUsers(), loadServers(), loadUnnamedAccesses()]);
  } catch (error) {
    if (!isAccessError(error)) {
      setVisible(adminLoading, false);
      setMessage(adminAccessError, getErrorMessage(error, "Не удалось открыть админ-панель."));
    }
  }
}

initAdmin();
