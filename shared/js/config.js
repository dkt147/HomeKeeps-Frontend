/*
 * HomeKeep frontend runtime configuration.
 *
 * VITE_API_BASE_URL comes from .env / deployment environment through
 * vite.config.js. Never put provider secrets in the frontend.
 */

const DEFAULT_API_BASE_URL = "http://localhost:5000";

window.HOMEKEEP_CONFIG = {
  apiBaseUrl:
    typeof __HOMEKEEP_API_BASE_URL__ !== "undefined"
      ? __HOMEKEEP_API_BASE_URL__
      : DEFAULT_API_BASE_URL
};

window.getHomeKeepRole = function () {
  try {
    const user = JSON.parse(
      localStorage.getItem("homekeep_staff_user") || "null"
    );
    return String((user && user.role) || "").toLowerCase();
  } catch (_) {
    return "";
  }
};

window.getHomeKeepRootPath = function () {
  const pathname = window.location.pathname || "/";
  const match = pathname.match(/\/(?:auth|admin|console)(?:\/|$)/);

  if (match) {
    return pathname.slice(0, match.index + 1);
  }

  return pathname.endsWith("/")
    ? pathname
    : pathname.slice(0, pathname.lastIndexOf("/") + 1) || "/";
};

window.getHomeKeepLoginPath = function () {
  return window.getHomeKeepRootPath() + "index.html";
};

window.getHomeKeepLandingPath = function () {
  const role = window.getHomeKeepRole();
  const root = window.getHomeKeepRootPath();

  if (role === "advisor" || role === "supervisor") {
    return root + "console/service-cases.html";
  }

  if (["ops_admin", "business_admin"].includes(role)) {
    return root + "admin/dashboard.html";
  }

  if (role === "system_admin") {
    return root + "admin/users.html";
  }

  return root + "index.html";
};
