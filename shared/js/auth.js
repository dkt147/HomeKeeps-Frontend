/* HomeKeep staff authentication helpers. Load config.js before this file. */

const HOMEKEEP_AUTH_API_BASE_URL =
  (window.HOMEKEEP_CONFIG && window.HOMEKEEP_CONFIG.apiBaseUrl) ||
  "http://localhost:5000";

const HOMEKEEP_ACCESS_TOKEN_KEY = "homekeep_auth_token";
const HOMEKEEP_REFRESH_TOKEN_KEY = "homekeep_refresh_token";
const HOMEKEEP_STAFF_USER_KEY = "homekeep_staff_user";
const HOMEKEEP_MFA_CHALLENGE_KEY = "homekeep_mfa_challenge_token";
const HOMEKEEP_MFA_EXPIRES_KEY = "homekeep_mfa_expires_in";
const HOMEKEEP_MFA_SETUP_KEY = "homekeep_mfa_setup_token";

function authApiUrl(path) {
  return HOMEKEEP_AUTH_API_BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

async function authReadBody(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json().catch(() => null);
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

function authError(response, body, fallback) {
  const error = body && typeof body.error === "object" ? body.error : null;
  const message =
    error?.message ||
    (typeof body?.error === "string" ? body.error : null) ||
    body?.message ||
    body?.data?.message ||
    fallback ||
    `Request failed (${response.status})`;

  const err = new Error(message);
  err.status = response.status;
  err.code = error?.code || null;
  err.details = error?.details || [];
  err.requestId = error?.request_id || null;
  err.body = body;
  return err;
}

function saveStaffAuth(data) {
  if (!data) return;

  if (data.access_token) {
    localStorage.setItem(HOMEKEEP_ACCESS_TOKEN_KEY, data.access_token);
  }

  if (data.refresh_token) {
    localStorage.setItem(HOMEKEEP_REFRESH_TOKEN_KEY, data.refresh_token);
  }

  if (data.user || data.staff) {
    localStorage.setItem(
      HOMEKEEP_STAFF_USER_KEY,
      JSON.stringify(data.user || data.staff)
    );
  }
}

function clearStaffAuth() {
  localStorage.removeItem(HOMEKEEP_ACCESS_TOKEN_KEY);
  localStorage.removeItem(HOMEKEEP_REFRESH_TOKEN_KEY);
  localStorage.removeItem(HOMEKEEP_STAFF_USER_KEY);
  sessionStorage.removeItem(HOMEKEEP_MFA_CHALLENGE_KEY);
  sessionStorage.removeItem(HOMEKEEP_MFA_EXPIRES_KEY);
  sessionStorage.removeItem(HOMEKEEP_MFA_SETUP_KEY);
}

function getStaffAuthErrorMessage(error, fallback) {
  return error?.message || fallback || "Something went wrong.";
}

async function staffLogin(email, password) {
  const response = await fetch(
    authApiUrl("/v1/auth/staff/login"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email, password })
    }
  );

  const body = await authReadBody(response);

  if (!response.ok) {
    throw authError(response, body, "Login failed. Please check your credentials.");
  }

  return body && typeof body === "object" && "data" in body
    ? body.data
    : body;
}

async function enrollStaffMfa(setupToken) {
  if (!setupToken) throw new Error("MFA setup session is missing. Please sign in again.");

  const response = await fetch(
    authApiUrl("/v1/auth/staff/mfa/enroll"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ setup_token: setupToken })
    }
  );

  const body = await authReadBody(response);

  if (!response.ok) {
    throw authError(response, body, "Unable to initialize MFA setup.");
  }

  return body && typeof body === "object" && "data" in body
    ? body.data
    : body;
}

async function verifyStaffMfaEnrollment(setupToken, code) {
  const response = await fetch(
    authApiUrl("/v1/auth/staff/mfa/verify-enrollment"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ setup_token: setupToken, code })
    }
  );

  const body = await authReadBody(response);

  if (!response.ok) {
    throw authError(response, body, "Invalid authentication code. Please try again.");
  }

  return body && typeof body === "object" && "data" in body
    ? body.data
    : body;
}

async function verifyStaffMfa(challengeToken, code) {
  const response = await fetch(
    authApiUrl("/v1/auth/staff/mfa/verify"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ challenge_token: challengeToken, code })
    }
  );

  const body = await authReadBody(response);

  if (!response.ok) {
    throw authError(response, body, "Invalid authentication code. Please try again.");
  }

  const data = body && typeof body === "object" && "data" in body
    ? body.data
    : body;

  // Final MFA verification is the only point where access + refresh tokens
  // are issued. Save exactly what the backend returns.
  saveStaffAuth(data);
  return data;
}

function getStoredStaffRole() {
  try {
    const user = JSON.parse(localStorage.getItem(HOMEKEEP_STAFF_USER_KEY) || "null");
    return String(user?.role || "").toLowerCase();
  } catch (_) {
    return "";
  }
}

function getAuthRootPath() {
  return typeof window.getHomeKeepRootPath === "function"
    ? window.getHomeKeepRootPath()
    : "/";
}

function getAuthLandingPath() {
  if (typeof window.getHomeKeepLandingPath === "function") {
    return window.getHomeKeepLandingPath();
  }

  const root = getAuthRootPath();
  const role = getStoredStaffRole();
  if (["advisor", "supervisor"].includes(role)) return root + "console/service-cases.html";
  if (["ops_admin", "business_admin"].includes(role)) return root + "admin/dashboard.html";
  if (role === "system_admin") return root + "admin/users.html";
  return root + "index.html";
}
