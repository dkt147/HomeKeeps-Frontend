/*
 * HomeKeep shared API client.
 *
 * Responsibilities:
 * - access/refresh token storage
 * - authenticated requests
 * - automatic one-time 401 refresh + retry
 * - refresh-token rotation
 * - JSON and FormData support
 * - standard HomeKeep error parsing
 * - role-aware navigation helpers
 */

const API_BASE_URL =
  (window.HOMEKEEP_CONFIG && window.HOMEKEEP_CONFIG.apiBaseUrl) ||
  "http://localhost:5000";

const ACCESS_TOKEN_KEY = "homekeep_auth_token";
const REFRESH_TOKEN_KEY = "homekeep_refresh_token";
const STAFF_USER_KEY = "homekeep_staff_user";
const MFA_CHALLENGE_KEY = "homekeep_mfa_challenge_token";
const MFA_EXPIRES_KEY = "homekeep_mfa_expires_in";
const MFA_SETUP_KEY = "homekeep_mfa_setup_token";

let refreshPromise = null;

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function getStaffUser() {
  try {
    return JSON.parse(localStorage.getItem(STAFF_USER_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function saveStaffUser(user) {
  if (!user || typeof user !== "object") return;
  localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
}

function saveAuthSession(data) {
  if (!data || typeof data !== "object") return;

  if (data.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  }

  if (data.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  }

  if (data.user || data.staff) {
    saveStaffUser(data.user || data.staff);
  }
}

function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(STAFF_USER_KEY);
  sessionStorage.removeItem(MFA_CHALLENGE_KEY);
  sessionStorage.removeItem(MFA_EXPIRES_KEY);
  sessionStorage.removeItem(MFA_SETUP_KEY);
}

function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function getStaffRole() {
  const user = getStaffUser() || {};
  return String(user.role || "").toLowerCase();
}

function resolveHomeKeepRootPath() {
  if (typeof window.getHomeKeepRootPath === "function") {
    return window.getHomeKeepRootPath();
  }

  return "/";
}
function getLoginPath() {
  if (typeof window.getHomeKeepLoginPath === "function") {
    return window.getHomeKeepLoginPath();
  }

  return resolveHomeKeepRootPath() + "index.html";
}

function getLandingPath() {
  if (typeof window.getHomeKeepLandingPath === "function") {
    return window.getHomeKeepLandingPath();
  }

  const role = getStaffRole();
  const root = resolveHomeKeepRootPath();

  if (role === "advisor" || role === "supervisor") {
    return root + "console/service-cases.html";
  }

  if (["ops_admin", "business_admin"].includes(role)) {
    return root + "admin/dashboard.html";
  }

  if (role === "system_admin") {
    return root + "admin/users.html";
  }

  return getLoginPath();
}

function requireAuth() {
  if (getAccessToken()) return true;

  window.location.href = getLoginPath();
  return false;
}

function requireRole(allowedRoles) {
  if (!requireAuth()) return false;

  const roles = Array.isArray(allowedRoles)
    ? allowedRoles
    : [allowedRoles];
  const role = getStaffRole();

  if (roles.includes(role)) return true;

  window.location.href = getLandingPath();
  return false;
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return API_BASE_URL.replace(/\/$/, "") + "/" + String(path).replace(/^\//, "");
}

async function readResponseBody(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function extractErrorMessage(body, status) {
  if (!body) return `Request failed (${status})`;

  const error = body.error;

  if (error && typeof error === "object") {
    if (error.message) return String(error.message);
  }

  if (typeof error === "string") return error;
  if (body.message) return String(body.message);
  if (body.data && body.data.message) return String(body.data.message);

  if (typeof body === "string") return body;

  return `Request failed (${status})`;
}

function createApiError(response, body) {
  const errorObject = body && body.error && typeof body.error === "object"
    ? body.error
    : null;

  const error = new Error(extractErrorMessage(body, response.status));
  error.status = response.status;
  error.code = errorObject?.code || null;
  error.details = errorObject?.details || [];
  error.requestId = errorObject?.request_id || null;
  error.body = body;
  error.isUnauthorized = response.status === 401;
  error.isForbidden = response.status === 403;
  error.isConflict = response.status === 409;

  return error;
}

function prepareRequest(options = {}, bearerToken) {
  const {
    body,
    headers: suppliedHeaders = {},
    ...fetchOptions
  } = options;

  const headers = {
    Accept: "application/json",
    ...suppliedHeaders
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  let requestBody = body;

  if (body !== undefined && body !== null) {
    if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) {
      // Browser must set multipart boundary automatically for FormData.
      delete headers["Content-Type"];
      delete headers["content-type"];
    } else if (typeof body === "object") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      requestBody = JSON.stringify(body);
    }
  }

  return {
    ...fetchOptions,
    headers,
    ...(requestBody !== undefined ? { body: requestBody } : {})
  };
}

async function request(path, options = {}, { authenticated = true, retry = true } = {}) {
  const token = authenticated ? getAccessToken() : null;

  if (authenticated && !token) {
    window.location.href = getLoginPath();
    throw new Error("Authentication required");
  }

  const response = await fetch(
    buildUrl(path),
    prepareRequest(options, token)
  );

  if (response.status === 401 && authenticated && retry) {
    const refreshed = await tryRefreshToken();

    if (refreshed) {
      return request(path, options, {
        authenticated: true,
        retry: false
      });
    }

    clearSession();
    window.location.href = getLoginPath();
    throw new Error("Your session has expired. Please sign in again.");
  }

  const body = await readResponseBody(response);

  if (!response.ok) {
    const error = createApiError(response, body);

    if (error.isForbidden) {
      window.dispatchEvent(
        new CustomEvent("homekeep:forbidden", {
          detail: error
        })
      );
    }

    throw error;
  }

  // HomeKeep success responses use { data: ... } where applicable.
  return body && typeof body === "object" && "data" in body
    ? body.data
    : body;
}

async function authFetch(path, options = {}) {
  return request(path, options, {
    authenticated: true,
    retry: true
  });
}

async function publicFetch(path, options = {}) {
  return request(path, options, {
    authenticated: false,
    retry: false
  });
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(
        buildUrl("/v1/auth/staff/refresh"),
        prepareRequest({
          method: "POST",
          body: { refresh_token: refreshToken }
        })
      );

      const body = await readResponseBody(response);

      if (!response.ok) return false;

      const data = body && typeof body === "object" && "data" in body
        ? body.data
        : body;

      if (!data || !data.access_token || !data.refresh_token) {
        return false;
      }

      // Refresh rotation returns BOTH new tokens. Store both atomically.
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      return true;
    } catch (_) {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function logout() {
  const refreshToken = getRefreshToken();

  try {
    if (refreshToken) {
      await publicFetch("/v1/auth/staff/logout", {
        method: "POST",
        body: { refresh_token: refreshToken }
      });
    }
  } catch (error) {
    // Logout must still clear local credentials if the server is unavailable.
    console.warn("HomeKeep logout request failed:", error);
  } finally {
    clearSession();
    window.location.href = getLoginPath();
  }
}

function handleApiError(error, fallback = "Something went wrong.") {
  if (!error) return fallback;
  return error.message || fallback;
}

const CONSOLE_NAV = [
  {
    label: "Operations",
    items: [
      { key: "service-cases", href: "service-cases.html", icon: "&#9776;", label: "Case queue", roles: ["advisor", "supervisor"] },
      { key: "customers", href: "customers.html", icon: "&#9906;", label: "Find a customer", roles: ["advisor", "supervisor"] },
      { key: "products", href: "products.html", icon: "&#9635;", label: "Products", roles: ["advisor", "supervisor"] },
      { key: "opportunities", href: "opportunities.html", icon: "&#9733;", label: "Opportunities", roles: ["advisor", "supervisor"] },
      { key: "supervisor", href: "supervisor.html", icon: "&#9873;", label: "Team &amp; SLA", roles: ["supervisor"] }
    ]
  },
  {
    label: "Account",
    items: [
      { key: "settings", href: "settings.html", icon: "&#9881;", label: "Settings", roles: ["advisor", "supervisor"] }
    ]
  }
];

const ADMIN_NAV = [
  {
    label: "Operations",
    items: [
      { key: "dashboard", href: "dashboard.html", icon: "&#9673;", label: "Dashboard", roles: ["ops_admin", "business_admin"] },
      { key: "service-cases", href: "../console/service-cases.html", icon: "&#9776;", label: "Service cases", roles: ["ops_admin", "business_admin"] },
      { key: "customers", href: "../console/customers.html", icon: "&#9906;", label: "Customers", roles: ["ops_admin", "business_admin"] },
      { key: "products", href: "../console/products.html", icon: "&#9635;", label: "Products", roles: ["ops_admin", "business_admin"] },
      { key: "opportunities", href: "../console/opportunities.html", icon: "&#9733;", label: "Opportunities", roles: ["ops_admin", "business_admin"] },
      { key: "reports", href: "reports.html", icon: "&#128202;", label: "Reports", roles: ["ops_admin", "business_admin"] }
    ]
  },
  {
    label: "Configuration",
    items: [
      { key: "warranty-plans", href: "warranty-plans.html", icon: "&#128196;", label: "Plans &amp; pricing", roles: ["business_admin"] },
      { key: "eligibility-rules", href: "eligibility-rules.html", icon: "&#9989;", label: "Eligibility rules", roles: ["business_admin"] },
      { key: "product-categories", href: "product-categories.html", icon: "&#9638;", label: "Categories", roles: ["ops_admin", "business_admin"] },
      { key: "manufacturers", href: "manufacturers.html", icon: "&#127970;", label: "Manufacturers", roles: ["ops_admin", "business_admin"] },
      { key: "service-providers", href: "service-providers.html", icon: "&#128295;", label: "Service providers", roles: ["ops_admin", "business_admin"] },
      { key: "stores", href: "stores.html", icon: "&#127978;", label: "Stores", roles: ["ops_admin", "business_admin"] }
    ]
  },
  {
    label: "Communication",
    items: [
      { key: "notifications", href: "notifications.html", icon: "&#128276;", label: "WhatsApp templates", roles: ["ops_admin", "business_admin"] },
      { key: "automations", href: "automations.html", icon: "&#9889;", label: "Automations", roles: ["ops_admin", "business_admin"] },
      { key: "message-log", href: "message-log.html", icon: "&#128172;", label: "Outbound message log", roles: ["ops_admin", "business_admin"] }
    ]
  },
  {
    label: "Data",
    items: [
      { key: "leads-import", href: "leads-import.html", icon: "&#128229;", label: "Lead import", roles: ["business_admin"] },
      { key: "lead-sources", href: "lead-sources.html", icon: "&#128279;", label: "Lead sources &amp; pricing", roles: ["business_admin"] },
      { key: "webhook-replay", href: "webhook-replay.html", icon: "&#8635;", label: "Webhook replay", roles: ["ops_admin"] }
    ]
  },
  {
    label: "System",
    items: [
      { key: "users", href: "users.html", icon: "&#128101;", label: "Users &amp; permissions", roles: ["system_admin"] },
      { key: "audit-log", href: "audit-log.html", icon: "&#128220;", label: "Audit log", roles: ["system_admin"] },
      { key: "settings", href: "settings.html", icon: "&#9881;", label: "Settings", roles: ["system_admin", "ops_admin", "business_admin"] }
    ]
  }
];

function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0] || "")[0] + (parts[1] || "")[0]).toUpperCase();
}

function renderSidebar(activeKey) {
  if (!requireAuth()) return;

  const mount = document.getElementById("sidebar");
  if (!mount) return;

  const user = getStaffUser() || {};
  const displayName = user.name || user.full_name || user.email || "Staff";
  const roleRaw = getStaffRole();
  const roleLabel = (roleRaw || "staff").replace(/_/g, " ");
  const area = document.body?.dataset.area === "admin" ? "admin" : "console";
  const navSections = area === "admin" ? ADMIN_NAV : CONSOLE_NAV;

  const allItems = navSections.flatMap((section) => section.items);
  const currentItem = allItems.find((item) => item.key === activeKey);

  if (currentItem && currentItem.roles && !currentItem.roles.includes(roleRaw)) {
    window.location.href = getLandingPath();
    return;
  }

  let navHtml = "";

  navSections.forEach((section) => {
    const visibleItems = section.items.filter((item) =>
      !item.roles || item.roles.includes(roleRaw)
    );

    if (!visibleItems.length) return;

    navHtml += `<div class="nav-section">${section.label}</div>`;

    visibleItems.forEach((item) => {
      navHtml += `
        <a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">
          <span aria-hidden="true">${item.icon}</span>
          <span>${item.label}</span>
        </a>`;
    });
  });

  const canOpenConsole = ["ops_admin", "business_admin"].includes(roleRaw);
  const canOpenAdmin = ["ops_admin", "business_admin", "system_admin"].includes(roleRaw);
  const switchHref = area === "admin"
    ? resolveHomeKeepRootPath() + "console/service-cases.html"
    : resolveHomeKeepRootPath() + "admin/dashboard.html";
  const showAreaSwitch = area === "admin" ? canOpenConsole : canOpenAdmin;
  const switchLabel = area === "admin" ? "Open Console" : "Open Admin";

  mount.innerHTML = `
    <div class="brand">
      <div class="brand-icon">HK</div>
      <div>
        <h1>HomeKeep</h1>
        <div class="role-tag">${area === "admin" ? "Admin" : "Console"}</div>
      </div>
    </div>
    <nav>${navHtml}</nav>
    <div class="sidebar-footer">
      ${showAreaSwitch ? `<a href="${switchHref}" class="btn ghost small" style="display:block;text-align:center;margin-bottom:10px">${switchLabel}</a>` : ""}
      <div class="user-chip">
        <div class="user-avatar">${initials(displayName)}</div>
        <div>
          <div class="user-name">${escapeHtml(displayName)}</div>
          <div class="user-role">${escapeHtml(roleLabel)}</div>
        </div>
      </div>
      <a href="#" class="logout" id="logoutLink">
        <span aria-hidden="true">&#8618;</span>
        <span>Sign out</span>
      </a>
    </div>
  `;

  const logoutLink = document.getElementById("logoutLink");
  if (logoutLink) {
    logoutLink.addEventListener("click", (event) => {
      event.preventDefault();
      logout();
    });
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(value) {
  if (!value) return "&mdash;";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function fmtDateTime(value) {
  if (!value) return "&mdash;";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toast(message, type = "ok") {
  const stack = document.getElementById("toastStack") || (() => {
    const element = document.createElement("div");
    element.id = "toastStack";
    element.style.position = "fixed";
    element.style.right = "20px";
    element.style.bottom = "20px";
    element.style.zIndex = "9999";
    document.body.appendChild(element);
    return element;
  })();

  const element = document.createElement("div");
  element.className = `toast ${type === "err" ? "danger" : ""}`;
  element.textContent = message;
  stack.appendChild(element);
  setTimeout(() => element.remove(), 3800);
}

function showBanner(id, message) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
}

function hideBanner(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.style.display = "none";
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function statusBadgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (["breached", "sla_breached", "cancelled", "rejected", "invalid"].includes(value)) return "b-danger";
  if (["closed", "active", "resolved", "fixed", "accepted"].includes(value)) return "b-success";
  if (["pending_parts", "pending", "duplicate", "watch"].includes(value)) return "b-warning";
  if (["new", "routed", "scheduled", "in_progress", "open"].includes(value)) return "b-accent";
  return "b-muted";
}
